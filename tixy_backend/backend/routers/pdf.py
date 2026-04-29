"""
Generacion de PDFs para ordenes de pedido.
  - /pdf/{order_id}?show_total=true   -> incluye totales (solo gerencia/admin)
  - /pdf/{order_id}?show_total=false  -> sin totales ni subtotal por linea (vendedor/cliente)
Cambios abr-2026:
  - Header sin fondo oscuro (ahorro tinta): fondo blanco, logo rojo, textos oscuros.
  - Maximo 25 referencias por hoja (igual al talonario fisico).
  - Filas compactas (font 7pt, padding 3pt) para que 25 items + firmas quepan en una hoja.
  - Vendedor siempre recibe PDF sin totales (forzado en backend).
"""
import io
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.platypus.flowables import Flowable
from sqlalchemy.orm import Session, joinedload

from core.database import get_db
from core.deps import get_current_user
from models.client import Store
from models.order import Order, OrderLine, OrderStatus
from models.user import User, UserRole

# ---------------------------------------------------------------------------
# Rutas de assets
# ---------------------------------------------------------------------------
_ASSETS = Path(__file__).parent.parent / "assets"
_FONTS  = _ASSETS / "fonts"
_LOGO_W = _ASSETS / "logo-blanco.png"
_LOGO_R = _ASSETS / "logo-rojo.png"
_LOGO_P = _ASSETS / "logo-pink.png"

# ---------------------------------------------------------------------------
# Registro de fuentes (Sora, con fallback a Helvetica)
# ---------------------------------------------------------------------------
def _try_register(name: str, filename: str) -> bool:
    path = _FONTS / filename
    if path.exists() and path.stat().st_size > 10_000:
        try:
            pdfmetrics.registerFont(TTFont(name, str(path)))
            return True
        except Exception:
            pass
    return False

_sora_ok        = _try_register("Sora",          "Sora-Regular.ttf")
_sora_medium_ok = _try_register("Sora-Medium",   "Sora-Medium.ttf")
_sora_semi_ok   = _try_register("Sora-SemiBold", "Sora-SemiBold.ttf")
_sora_bold_ok   = _try_register("Sora-Bold",     "Sora-Bold.ttf")

F_BODY = "Sora"          if _sora_ok        else "Helvetica"
F_MED  = "Sora-Medium"   if _sora_medium_ok else "Helvetica"
F_SEMI = "Sora-SemiBold" if _sora_semi_ok   else "Helvetica-Bold"
F_BOLD = "Sora-Bold"     if _sora_bold_ok   else "Helvetica-Bold"

router = APIRouter(prefix="/pdf", tags=["pdf"])

# ---------------------------------------------------------------------------
# Paleta de marca Tixy
# ---------------------------------------------------------------------------
PINK      = colors.HexColor("#C0206A")
DARK      = colors.HexColor("#2B0A18")
PINK_LITE = colors.HexColor("#F9EAF0")
GRAY      = colors.HexColor("#F7F7F7")
LINE      = colors.HexColor("#E0C8D4")
WHITE     = colors.white
BLACK     = colors.HexColor("#111111")
TEXT_SOFT = colors.HexColor("#999999")

# Maximo de referencias por hoja (igual al talonario fisico)
ROWS_PER_PAGE = 25


# ---------------------------------------------------------------------------
# Canvas con numeracion de paginas
# ---------------------------------------------------------------------------
class NumberedCanvas(pdfcanvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states: list[dict] = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._saved_page_states)
        for i, state in enumerate(self._saved_page_states, 1):
            self.__dict__.update(state)
            if total > 1:
                self._stamp_page_label(i, total)
            super().showPage()
        super().save()

    def _stamp_page_label(self, page_num: int, total: int):
        self.saveState()
        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.HexColor("#BBBBBB"))
        self.drawCentredString(letter[0] / 2, 0.55 * cm, f"Hoja {page_num} de {total}")
        self.restoreState()


# ---------------------------------------------------------------------------
# Banda decorativa de estrellas al pie de pagina
# ---------------------------------------------------------------------------
def _draw_star_band(canv, y: float, width: float, height: float,
                    bg_color, star_color) -> None:
    canv.saveState()
    canv.setFillColor(bg_color)
    canv.rect(0, y, width, height, fill=1, stroke=0)

    star_size = height * 0.52
    half      = star_size / 2
    thin      = star_size * 0.13
    spacing   = height * 1.55
    center_y  = y + height / 2

    canv.setFillColor(star_color)
    x = spacing * 0.5
    while x < width:
        cx, cy = x, center_y
        p = canv.beginPath()
        p.moveTo(cx,         cy + half)
        p.curveTo(cx + thin, cy + thin, cx + thin, cy + thin, cx + half, cy)
        p.curveTo(cx + thin, cy - thin, cx + thin, cy - thin, cx,        cy - half)
        p.curveTo(cx - thin, cy - thin, cx - thin, cy - thin, cx - half, cy)
        p.curveTo(cx - thin, cy + thin, cx - thin, cy + thin, cx,        cy + half)
        p.close()
        canv.drawPath(p, fill=1, stroke=0)
        x += spacing

    canv.restoreState()


# ---------------------------------------------------------------------------
# Encabezado de pagina - fondo blanco, logo rojo (ahorro tinta abr-2026)
# ---------------------------------------------------------------------------
def _draw_page_header(canv, order: "Order", full: bool) -> None:
    PAGE_W, PAGE_H = letter
    L = 1.4 * cm
    R = 1.4 * cm
    W = PAGE_W - L - R

    TOP_Y = PAGE_H - 0.3 * cm
    H     = 2.8 * cm if full else 1.6 * cm
    BOT_Y = TOP_Y - H

    canv.saveState()

    # Fondo blanco + linea pink en la base del header
    canv.setFillColor(WHITE)
    canv.rect(L, BOT_Y, W, H, fill=1, stroke=0)
    canv.setStrokeColor(PINK)
    canv.setLineWidth(0.8)
    canv.line(L, BOT_Y, L + W, BOT_Y)

    # Logo rojo sobre fondo blanco
    logo_path = _LOGO_R if _LOGO_R.exists() else (_LOGO_P if _LOGO_P.exists() else None)
    if logo_path:
        if full:
            logo_h = 1.45 * cm
            logo_y = TOP_Y - 0.45 * cm - logo_h
        else:
            logo_h = 0.9 * cm
            logo_y = BOT_Y + (H - logo_h) / 2

        logo_w = logo_h * (480 / 199)
        logo_x = L + 0.4 * cm

        canv.drawImage(str(logo_path), logo_x, logo_y,
                       width=logo_w, height=logo_h,
                       mask="auto", preserveAspectRatio=True)

        if full:
            canv.setFillColor(colors.HexColor("#777777"))
            canv.setFont(F_BODY, 6.5)
            txt_y = logo_y - 0.28 * cm
            canv.drawString(logo_x, txt_y,
                "Transversal 49c #59-62, 4to piso  \u00b7  Centro Mundial De La Moda")
            canv.drawString(logo_x, txt_y - 0.28 * cm,
                "319 680 0557  \u00b7  313 623 1499")
    else:
        canv.setFillColor(PINK)
        canv.setFont("Helvetica-BoldOblique", 28 if full else 18)
        canv.drawString(L + 0.5 * cm, BOT_Y + H * 0.5, "Tixy Glamour")

    # Separador vertical gris claro
    mid_x = L + W * 0.56
    canv.setStrokeColor(colors.HexColor("#E0D0D8"))
    canv.setLineWidth(0.5)
    canv.line(mid_x, BOT_Y + 0.2 * cm, mid_x, TOP_Y - 0.45 * cm)

    # Columna derecha: titulo + numero + fecha en oscuro
    x_right = PAGE_W - R - 0.4 * cm
    if full:
        canv.setFillColor(colors.HexColor("#888888"))
        canv.setFont(F_BODY, 7)
        canv.drawRightString(x_right, TOP_Y - 0.75 * cm, "ORDEN DE PEDIDO")
        canv.setFillColor(PINK)
        canv.setFont(F_BOLD, 26)
        canv.drawRightString(x_right, TOP_Y - 1.9 * cm, f"#{order.order_number}")
        canv.setFillColor(colors.HexColor("#666666"))
        canv.setFont(F_BODY, 7.5)
        canv.drawRightString(x_right, TOP_Y - 2.55 * cm,
                             order.created_at.strftime("%d/%m/%Y"))
    else:
        canv.setFillColor(colors.HexColor("#888888"))
        canv.setFont(F_BODY, 6.5)
        canv.drawRightString(x_right, TOP_Y - 0.52 * cm, "ORDEN DE PEDIDO")
        canv.setFillColor(PINK)
        canv.setFont(F_BOLD, 18)
        canv.drawRightString(x_right, TOP_Y - 1.25 * cm, f"#{order.order_number}")
        canv.setFillColor(colors.HexColor("#666666"))
        canv.setFont(F_BODY, 7)
        canv.drawRightString(x_right, TOP_Y - 1.5 * cm,
                             order.created_at.strftime("%d/%m/%Y"))

    canv.restoreState()

    _draw_star_band(canv, y=0.3 * cm, width=PAGE_W, height=0.45 * cm,
                    bg_color=PINK, star_color=WHITE)


# ---------------------------------------------------------------------------
# Flowable con esquinas superiores redondeadas
# ---------------------------------------------------------------------------
class TopRoundedBlock(Flowable):
    def __init__(self, width, height, radius, fill_color, inner_table):
        super().__init__()
        self.width       = width
        self.height      = height
        self.radius      = radius
        self.fill_color  = fill_color
        self.inner_table = inner_table

    def wrap(self, availW, availH):
        return self.width, self.height

    def draw(self):
        c = self.canv
        r, w, h = self.radius, self.width, self.height
        c.setFillColor(self.fill_color)
        p = c.beginPath()
        p.moveTo(0, 0)
        p.lineTo(w, 0)
        p.lineTo(w, h - r)
        p.arcTo(w - 2*r, h - 2*r, w,   h, startAng=0,  extent=90)
        p.lineTo(r, h)
        p.arcTo(0,       h - 2*r, 2*r, h, startAng=90, extent=90)
        p.lineTo(0, 0)
        p.close()
        c.drawPath(p, fill=1, stroke=0)
        self.inner_table.wrapOn(c, w, h)
        self.inner_table.drawOn(c, 0, h - self.inner_table._height)


# ---------------------------------------------------------------------------
# Construccion del PDF
# ---------------------------------------------------------------------------
def _build_pdf(order: Order, show_total: bool) -> bytes:
    buf      = io.BytesIO()
    PAGE_W   = letter[0]
    L_MARGIN = 1.4 * cm
    R_MARGIN = 1.4 * cm
    USABLE_W = PAGE_W - L_MARGIN - R_MARGIN

    doc = SimpleDocTemplate(
        buf,
        pagesize     = letter,
        leftMargin   = L_MARGIN,
        rightMargin  = R_MARGIN,
        topMargin    = 3.3 * cm,
        bottomMargin = 1.4 * cm,
    )
    styles = getSampleStyleSheet()
    story  = []

    # Barra de vendedor
    vendor  = order.vendor
    contact = vendor.contact_info or vendor.phone or ""

    vendor_inner = Table(
        [[Paragraph(
            f'<font name="{F_SEMI}" color="#C0206A">Vendedor:</font>'
            f'  <font name="{F_BODY}" color="#3D0E22">{vendor.full_name}</font>'
            f'<font color="#999999">  \u00b7  {contact}</font>',
            ParagraphStyle("vl", parent=styles["Normal"],
                           fontName=F_BODY, fontSize=8, leading=14, leftIndent=6),
        )]],
        colWidths=[USABLE_W],
    )
    vendor_inner.setStyle(TableStyle([
        ("TOPPADDING",    (0,0),(-1,-1), 5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 5),
        ("LEFTPADDING",   (0,0),(-1,-1), 4),
        ("RIGHTPADDING",  (0,0),(-1,-1), 4),
    ]))
    vendor_inner.wrapOn(None, USABLE_W, 999)

    story.append(TopRoundedBlock(
        width=USABLE_W, height=vendor_inner._height,
        radius=6, fill_color=PINK_LITE, inner_table=vendor_inner,
    ))
    story.append(Spacer(1, 0.18 * cm))

    # Datos del cliente / almacen
    store  = order.store
    client = store.client

    lbl = ParagraphStyle("lbl", parent=styles["Normal"],
                         textColor=PINK, fontName=F_SEMI, fontSize=7.5, leading=10)
    val = ParagraphStyle("val", parent=styles["Normal"],
                         textColor=BLACK, fontName=F_BODY, fontSize=7.5, leading=10)
    sub = ParagraphStyle("sub", parent=styles["Normal"],
                         textColor=TEXT_SOFT, fontName=F_BODY, fontSize=7.5, leading=10)

    ct = Table([
        [Paragraph("Cliente:",      lbl), Paragraph(client.business_name,    val),
         Paragraph("NIT/CC:",       lbl), Paragraph(client.nit or "\u2014",  val)],
        [Paragraph("Almac\u00e9n:", lbl), Paragraph(store.name,              val),
         Paragraph("Ciudad:",       lbl), Paragraph(store.city or "\u2014",  val)],
        [Paragraph("Direcci\u00f3n:", lbl), Paragraph(store.address or "\u2014", val),
         Paragraph("Tel:",          lbl), Paragraph(store.phone or "\u2014", sub)],
    ], colWidths=[2.1*cm, 8.2*cm, 2.1*cm, 5.1*cm])

    ct.setStyle(TableStyle([
        ("FONTSIZE",      (0,0),(-1,-1), 7.5),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, GRAY]),
        ("GRID",          (0,0),(-1,-1), 0.3, LINE),
        ("TOPPADDING",    (0,0),(-1,-1), 3),
        ("BOTTOMPADDING", (0,0),(-1,-1), 3),
        ("LEFTPADDING",   (0,0),(-1,-1), 6),
        ("RIGHTPADDING",  (0,0),(-1,-1), 6),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ]))
    story.append(ct)
    story.append(Spacer(1, 0.2 * cm))

    # Estilo de Paragraph para descripciones (compacto)
    desc_style = ParagraphStyle("desc", fontName=F_BODY, fontSize=7, leading=9)

    # Preparar filas segun visibilidad de totales
    if show_total:
        header_row = ["Referencia", "Descripci\u00f3n", "Categor\u00eda",
                      "Cant.", "Vlr. unit.", "Subtotal"]
        data_rows = []
        for ln in order.lines:
            data_rows.append([
                ln.reference.code,
                Paragraph(ln.reference.description, desc_style),
                ln.reference.category.value
                    if hasattr(ln.reference.category, "value")
                    else str(ln.reference.category),
                str(ln.quantity),
                f"${ln.unit_price:,.0f}".replace(",", "."),
                f"${ln.line_total:,.0f}".replace(",", "."),
            ])
        col_widths       = [2.2*cm, 6.8*cm, 2.9*cm, 1.4*cm, 2.2*cm, 2.2*cm]
        align_right_from = 3
    else:
        header_row = ["Referencia", "Descripci\u00f3n", "Categor\u00eda", "Cant.", "Vlr. unit."]
        data_rows = []
        for ln in order.lines:
            data_rows.append([
                ln.reference.code,
                Paragraph(ln.reference.description, desc_style),
                ln.reference.category.value
                    if hasattr(ln.reference.category, "value")
                    else str(ln.reference.category),
                str(ln.quantity),
                f"${ln.unit_price:,.0f}".replace(",", "."),
            ])
        col_widths       = [2.2*cm, 7.9*cm, 2.9*cm, 1.4*cm, 3.3*cm]
        align_right_from = 3

    # Estilo de tabla compacto: 7pt datos, padding 3pt -> ~0.54cm por fila
    # 25 filas * 0.54cm = 13.5cm + header(0.55cm) + elementos fijos (~7cm) = ~21cm < 23.2cm disponibles
    table_style = TableStyle([
        ("FONTNAME",      (0,0),(-1,0),  F_SEMI),
        ("FONTSIZE",      (0,0),(-1,0),  7.5),
        ("BACKGROUND",    (0,0),(-1,0),  PINK),
        ("TEXTCOLOR",     (0,0),(-1,0),  WHITE),
        ("TOPPADDING",    (0,0),(-1,0),  4),
        ("BOTTOMPADDING", (0,0),(-1,0),  4),
        ("FONTNAME",      (0,1),(-1,-1), F_BODY),
        ("FONTSIZE",      (0,1),(-1,-1), 7),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, GRAY]),
        ("GRID",          (0,0),(-1,-1), 0.3, LINE),
        ("ALIGN",         (align_right_from,0),(-1,-1), "RIGHT"),
        ("ALIGN",         (0,0),(0,-1),  "LEFT"),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,1),(-1,-1), 3),
        ("BOTTOMPADDING", (0,1),(-1,-1), 3),
        ("LEFTPADDING",   (0,0),(-1,-1), 5),
        ("RIGHTPADDING",  (0,0),(-1,-1), 5),
    ])

    # Partir en chunks de ROWS_PER_PAGE con PageBreak entre cada bloque
    chunks = [data_rows[i:i + ROWS_PER_PAGE]
              for i in range(0, max(len(data_rows), 1), ROWS_PER_PAGE)]

    for idx, chunk in enumerate(chunks):
        if idx > 0:
            story.append(PageBreak())
        pt = Table([header_row] + chunk, colWidths=col_widths, repeatRows=1)
        pt.setStyle(table_style)
        story.append(pt)
        story.append(Spacer(1, 0.2 * cm))

    # Totales (solo gerencia/admin)
    if show_total:
        col_w = [2.2*cm, 6.8*cm, 2.9*cm, 1.4*cm, 2.2*cm, 2.2*cm]
        tt = Table([
            ["","","","", "Sub-total:", f"${order.subtotal:,.0f}".replace(",",".")],
            ["","","","", "TOTAL:",     f"${order.total:,.0f}".replace(",",".")],
        ], colWidths=col_w)
        tt.setStyle(TableStyle([
            ("FONTNAME",      (0,0),(-1,-1), F_BODY),
            ("FONTSIZE",      (0,0),(-1,-1), 9),
            ("FONTNAME",      (4,1),(5,1),   F_BOLD),
            ("FONTSIZE",      (4,1),(5,1),   11),
            ("TEXTCOLOR",     (4,0),(4,-1),  PINK),
            ("TEXTCOLOR",     (5,0),(5,-1),  BLACK),
            ("ALIGN",         (4,0),(-1,-1), "RIGHT"),
            ("TOPPADDING",    (0,0),(-1,-1), 4),
            ("BOTTOMPADDING", (0,0),(-1,-1), 4),
            ("LEFTPADDING",   (0,0),(-1,-1), 5),
            ("RIGHTPADDING",  (0,0),(-1,-1), 5),
            ("LINEABOVE",     (4,0),(5,0),   0.5, LINE),
            ("LINEBELOW",     (4,1),(5,1),   1.2, PINK),
        ]))
        story.append(tt)
        story.append(Spacer(1, 0.2 * cm))

    # Firmas
    story.append(Spacer(1, 0.8 * cm))
    f_line  = ParagraphStyle("fl",  parent=styles["Normal"], fontName=F_BODY, fontSize=8,
                              textColor=colors.HexColor("#BBBBBB"), alignment=1)
    f_label = ParagraphStyle("fla", parent=styles["Normal"], fontName=F_BODY, fontSize=8,
                              textColor=TEXT_SOFT, alignment=1)
    for row_data in (
        [[Paragraph("_________________________", f_line),
          Paragraph("_________________________", f_line)]],
        [[Paragraph("Firma Vendedor",  f_label),
          Paragraph("Firma Comprador", f_label)]],
    ):
        t = Table(row_data, colWidths=["50%","50%"])
        t.setStyle(TableStyle([
            ("LEFTPADDING",   (0,0),(-1,-1), 0),
            ("RIGHTPADDING",  (0,0),(-1,-1), 0),
            ("TOPPADDING",    (0,0),(-1,-1), 2),
            ("BOTTOMPADDING", (0,0),(-1,-1), 2),
        ]))
        story.append(t)

    doc.build(
        story,
        onFirstPage  = lambda c, d: _draw_page_header(c, order, full=True),
        onLaterPages = lambda c, d: _draw_page_header(c, order, full=False),
        canvasmaker  = NumberedCanvas,
    )
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
@router.get("/{order_id}")
def download_order_pdf(
    order_id:   int,
    show_total: bool = True,
    db:  Session = Depends(get_db),
    me:  User    = Depends(get_current_user),
):
    order = (
        db.query(Order)
        .options(
            joinedload(Order.lines).joinedload(OrderLine.reference),
            joinedload(Order.vendor),
            joinedload(Order.store).joinedload(Store.client),
        )
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    if me.role == UserRole.VENDOR and order.vendor_id != me.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    # Vendedores siempre reciben PDF sin totales
    if me.role == UserRole.VENDOR:
        show_total = False

    pdf_bytes = _build_pdf(order, show_total=show_total)
    suffix    = "con-total" if show_total else "sin-total"
    filename  = f"tixy-orden-{order.order_number}-{suffix}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type = "application/pdf",
        headers    = {"Content-Disposition": f'inline; filename="{filename}"'},
    )
