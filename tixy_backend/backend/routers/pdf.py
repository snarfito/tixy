"""
Generacion de PDFs para ordenes de pedido.
  - /pdf/{order_id}?show_total=true   -> incluye totales generales (vendedor)
  - /pdf/{order_id}?show_total=false  -> sin totales generales, si subtotal por linea (cliente)
"""
import io
from datetime import datetime
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
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.platypus.flowables import Flowable
from sqlalchemy.orm import Session, joinedload

from core.database import get_db
from core.deps import get_current_user
from models.client import Store
from models.order import Order, OrderLine, OrderStatus
from models.user import User, UserRole

# -- Registro de fuente Great Vibes (misma que el logo web) -------------------
# Descarga: https://fonts.google.com/specimen/Great+Vibes
# Coloca el .ttf en: tixy_backend/backend/assets/fonts/GreatVibes-Regular.ttf
_FONT_PATH = Path(__file__).parent.parent / "assets" / "fonts" / "GreatVibes-Regular.ttf"
if _FONT_PATH.exists() and _FONT_PATH.stat().st_size > 10_000:
    try:
        pdfmetrics.registerFont(TTFont("GreatVibes", str(_FONT_PATH)))
        LOGO_FONT = "GreatVibes"
        LOGO_SIZE = 38
    except Exception:
        LOGO_FONT = "Helvetica-BoldOblique"
        LOGO_SIZE = 30
else:
    LOGO_FONT = "Helvetica-BoldOblique"
    LOGO_SIZE = 30

router = APIRouter(prefix="/pdf", tags=["pdf"])

# -- Paleta de marca Tixy -----------------------------------------------------
PINK      = colors.HexColor("#C0206A")
DARK      = colors.HexColor("#2B0A18")
PINK_LITE = colors.HexColor("#F9EAF0")
GRAY      = colors.HexColor("#F7F7F7")
LINE      = colors.HexColor("#E0C8D4")
WHITE     = colors.white
BLACK     = colors.HexColor("#111111")
TEXT_SOFT = colors.HexColor("#999999")


# ── Canvas con número de páginas ──────────────────────────────────────────
class NumberedCanvas(pdfcanvas.Canvas):
    """
    Canvas personalizado que acumula el estado de cada página y,
    al guardar, dibuja 'Hoja X de N' en el pie de cada hoja.
    Esto requiere un doble pase: primero se construyen todas las páginas
    y después se estampa el total real de hojas.
    """
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
            if total > 1:          # solo mostrar si hay más de una página
                self._stamp_page_label(i, total)
            super().showPage()
        super().save()

    def _stamp_page_label(self, page_num: int, total: int):
        self.saveState()
        self.setFont("Helvetica", 7.5)
        self.setFillColor(colors.HexColor("#BBBBBB"))
        label = f"Hoja {page_num} de {total}"
        # Pie de página centrado
        self.drawCentredString(letter[0] / 2, 0.55 * cm, label)
        # Línea decorativa fina sobre el texto
        self.setStrokeColor(colors.HexColor("#E8D0DA"))
        self.setLineWidth(0.4)
        self.line(
            1.4 * cm,        0.85 * cm,
            letter[0] - 1.4 * cm, 0.85 * cm,
        )
        self.restoreState()


# ── Encabezado dibujado directamente en el canvas ──────────────────────────
def _draw_page_header(canv, order: "Order", full: bool) -> None:
    """
    Dibuja el encabezado de marca sobre el canvas de cada página.

    full=True  → encabezado grande con logo, dirección y número de orden (página 1)
    full=False → franja compacta solo con logo y número de orden (páginas 2+)
    """
    PAGE_W, PAGE_H = letter
    L  = 1.4 * cm
    R  = 1.4 * cm
    W  = PAGE_W - L - R
    TOP_Y = PAGE_H - 0.3 * cm
    H     = 2.8 * cm if full else 1.6 * cm
    BOT_Y = TOP_Y - H

    canv.saveState()

    # Fondo oscuro con esquinas superiores redondeadas
    canv.setFillColor(DARK)
    canv.roundRect(L, BOT_Y, W, H, radius=7, fill=1, stroke=0)

    # ── Columna izquierda (logo + info) ──────────────────────────────
    x_left = L + 0.5 * cm
    if full:
        canv.setFillColor(PINK)
        canv.setFont(LOGO_FONT, LOGO_SIZE)
        canv.drawString(x_left, TOP_Y - 1.2 * cm, "Tixy")

        canv.setFillColor(colors.HexColor("#E8A0C0"))
        canv.setFont("Helvetica", 7.5)
        canv.drawString(x_left, TOP_Y - 1.75 * cm, "es moda \u00b7 GLAMOUR")

        canv.setFillColor(colors.HexColor("#C09090"))
        canv.setFont("Helvetica", 7)
        canv.drawString(x_left, TOP_Y - 2.15 * cm, "Transversal 49c #59-62, 4to piso")
        canv.drawString(x_left, TOP_Y - 2.43 * cm, "Centro Mundial De La Moda")
        canv.drawString(x_left, TOP_Y - 2.68 * cm, "319 680 0557  \u00b7  313 623 1499")
    else:
        canv.setFillColor(PINK)
        canv.setFont(LOGO_FONT, 22)
        canv.drawString(x_left, TOP_Y - 1.05 * cm, "Tixy")

        canv.setFillColor(colors.HexColor("#E8A0C0"))
        canv.setFont("Helvetica", 7)
        canv.drawString(x_left, TOP_Y - 1.4 * cm, "es moda \u00b7 GLAMOUR")

    # Separador vertical entre columnas
    mid_x = L + W * 0.56
    canv.setStrokeColor(colors.HexColor("#5A2040"))
    canv.setLineWidth(0.5)
    canv.line(mid_x, BOT_Y + 0.25 * cm, mid_x, TOP_Y - 0.25 * cm)

    # ── Columna derecha (título + número + fecha) ────────────────────────
    x_right = PAGE_W - R - 0.5 * cm
    if full:
        canv.setFillColor(colors.HexColor("#E8B0C8"))
        canv.setFont("Helvetica", 7.5)
        canv.drawRightString(x_right, TOP_Y - 0.6 * cm, "ORDEN DE PEDIDO")

        canv.setFillColor(PINK)
        canv.setFont("Helvetica-Bold", 26)
        canv.drawRightString(x_right, TOP_Y - 1.85 * cm, f"#{order.order_number}")

        canv.setFillColor(colors.HexColor("#C09090"))
        canv.setFont("Helvetica", 8)
        canv.drawRightString(x_right, TOP_Y - 2.55 * cm, order.created_at.strftime("%d/%m/%Y"))
    else:
        canv.setFillColor(colors.HexColor("#E8B0C8"))
        canv.setFont("Helvetica", 7)
        canv.drawRightString(x_right, TOP_Y - 0.52 * cm, "ORDEN DE PEDIDO")

        canv.setFillColor(PINK)
        canv.setFont("Helvetica-Bold", 18)
        canv.drawRightString(x_right, TOP_Y - 1.25 * cm, f"#{order.order_number}")

        canv.setFillColor(colors.HexColor("#C09090"))
        canv.setFont("Helvetica", 7)
        canv.drawRightString(x_right, TOP_Y - 1.52 * cm, order.created_at.strftime("%d/%m/%Y"))

    canv.restoreState()


# -- Flowable con esquinas superiores redondeadas -----------------------------
class TopRoundedBlock(Flowable):
    """
    Dibuja un bloque de fondo con las dos esquinas superiores redondeadas
    y las dos inferiores rectas, luego renderiza una tabla de contenido encima.
    """
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
        r = self.radius
        w = self.width
        h = self.height

        # Fondo: esquinas sup redondeadas, inf rectas
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

        # Renderizar tabla encima del fondo
        self.inner_table.wrapOn(c, w, h)
        self.inner_table.drawOn(c, 0, h - self.inner_table._height)


def _build_pdf(order: Order, show_total: bool) -> bytes:
    buf = io.BytesIO()

    # Ancho util disponible (carta - margenes)
    PAGE_W = letter[0]
    L_MARGIN = 1.4 * cm
    R_MARGIN = 1.4 * cm
    USABLE_W = PAGE_W - L_MARGIN - R_MARGIN

    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=L_MARGIN,
        rightMargin=R_MARGIN,
        topMargin=3.3 * cm,   # espacio para el encabezado en todas las páginas
        bottomMargin=1.8 * cm,
    )
    styles = getSampleStyleSheet()
    story  = []

    # El encabezado se dibuja vía callbacks onFirstPage / onLaterPages.
    # (ver doc.build al final de esta función)

    # ── Barra del vendedor (esquinas sup redondeadas) ------------------------
    vendor  = order.vendor
    contact = vendor.contact_info or vendor.phone or ""

    vendor_label_style = ParagraphStyle(
        "vendor_label",
        parent=styles["Normal"],
        textColor=DARK,
        fontName="Helvetica",
        fontSize=8,
        leading=14,
        leftIndent=6,
    )
    vendor_inner = Table(
        [[Paragraph(
            f'<font name="Helvetica-Bold" color="#C0206A">Vendedor:</font>'
            f'  <font name="Helvetica" color="#3D0E22">{vendor.full_name}</font>'
            f'<font color="#999999">  \u00b7  {contact}</font>',
            vendor_label_style,
        )]],
        colWidths=[USABLE_W],
    )
    vendor_inner.setStyle(TableStyle([
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
    ]))
    vendor_inner.wrapOn(None, USABLE_W, 999)
    vendor_h = vendor_inner._height

    vendor_block = TopRoundedBlock(
        width=USABLE_W,
        height=vendor_h,
        radius=6,
        fill_color=PINK_LITE,
        inner_table=vendor_inner,
    )
    story.append(vendor_block)
    story.append(Spacer(1, 0.22 * cm))

    # -- Info de cliente / almacen --------------------------------------------
    store  = order.store
    client = store.client

    label_style = ParagraphStyle(
        "cell_label",
        parent=styles["Normal"],
        textColor=PINK,
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=11,
    )
    cell_style = ParagraphStyle(
        "cell_val",
        parent=styles["Normal"],
        textColor=BLACK,
        fontName="Helvetica",
        fontSize=8,
        leading=11,
    )
    cell_subtle = ParagraphStyle(
        "cell_subtle",
        parent=styles["Normal"],
        textColor=TEXT_SOFT,
        fontName="Helvetica",
        fontSize=8,
        leading=11,
    )

    client_data = [
        [Paragraph("Cliente:",   label_style), Paragraph(client.business_name, cell_style),
         Paragraph("NIT/CC:",    label_style), Paragraph(client.nit or "\u2014",  cell_style)],
        [Paragraph("Almac\u00e9n:",  label_style), Paragraph(store.name,            cell_style),
         Paragraph("Ciudad:",    label_style), Paragraph(store.city or "\u2014",    cell_style)],
        [Paragraph("Direcci\u00f3n:", label_style), Paragraph(store.address or "\u2014", cell_style),
         Paragraph("Tel:",       label_style), Paragraph(store.phone or "\u2014",   cell_subtle)],
    ]
    ct = Table(client_data, colWidths=[2.1*cm, 8.2*cm, 2.1*cm, 5.1*cm])
    ct.setStyle(TableStyle([
        ("FONTSIZE",      (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS",(0, 0), (-1, -1), [WHITE, GRAY]),
        ("GRID",          (0, 0), (-1, -1), 0.3, LINE),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 7),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 7),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(ct)
    story.append(Spacer(1, 0.28 * cm))

    # -- Tabla de productos ---------------------------------------------------
    col_headers = ["Referencia", "Descripcion", "Categoria", "Cant.", "Vlr. unit.", "Subtotal"]

    rows = [col_headers]
    for ln in order.lines:
        row = [
            ln.reference.code,
            Paragraph(
                ln.reference.description,
                ParagraphStyle("desc", fontName="Helvetica", fontSize=8, leading=10),
            ),
            ln.reference.category.value
                if hasattr(ln.reference.category, "value")
                else str(ln.reference.category),
            str(ln.quantity),
            f"${ln.unit_price:,.0f}".replace(",", "."),
            f"${ln.line_total:,.0f}".replace(",", "."),
        ]
        rows.append(row)

    col_w = [2.2*cm, 6.8*cm, 2.9*cm, 1.4*cm, 2.2*cm, 2.2*cm]

    pt = Table(rows, colWidths=col_w, repeatRows=1)
    pt.setStyle(TableStyle([
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0),  8),
        ("BACKGROUND",    (0, 0), (-1, 0),  PINK),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  WHITE),
        ("TOPPADDING",    (0, 0), (-1, 0),  6),
        ("BOTTOMPADDING", (0, 0), (-1, 0),  6),
        ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -1), 8),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, GRAY]),
        ("GRID",          (0, 0), (-1, -1), 0.3, LINE),
        ("ALIGN",         (3, 0), (-1, -1), "RIGHT"),
        ("ALIGN",         (0, 0), (0, -1),  "LEFT"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 1), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
    ]))
    story.append(pt)
    story.append(Spacer(1, 0.3 * cm))

    # -- Bloque de totales finales (solo si show_total=True) ------------------
    if show_total:
        totals_data = [
            ["", "", "", "", "Sub-total:", f"${order.subtotal:,.0f}".replace(",", ".")],
            ["", "", "", "", "TOTAL:",     f"${order.total:,.0f}".replace(",", ".")],
        ]
        tt = Table(totals_data, colWidths=col_w)
        tt.setStyle(TableStyle([
            ("FONTNAME",     (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE",     (0, 0), (-1, -1), 9),
            ("FONTNAME",     (4, 1), (5, 1),   "Helvetica-Bold"),
            ("FONTSIZE",     (4, 1), (5, 1),   11),
            ("TEXTCOLOR",    (4, 0), (4, -1),  PINK),
            ("TEXTCOLOR",    (5, 0), (5, -1),  BLACK),
            ("ALIGN",        (4, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING",   (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
            ("LEFTPADDING",  (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("LINEABOVE",    (4, 0), (5, 0),   0.5, LINE),
            ("LINEBELOW",    (4, 1), (5, 1),   1.2, PINK),
        ]))
        story.append(tt)
        story.append(Spacer(1, 0.3 * cm))

    # -- Firmas ---------------------------------------------------------------
    story.append(Spacer(1, 1.2 * cm))
    firma_line_style = ParagraphStyle(
        "firma_line", parent=styles["Normal"],
        fontName="Helvetica", fontSize=8,
        textColor=colors.HexColor("#BBBBBB"), alignment=1,
    )
    firma_label_style = ParagraphStyle(
        "firma_label", parent=styles["Normal"],
        fontName="Helvetica", fontSize=8,
        textColor=TEXT_SOFT, alignment=1,
    )
    for row_data in (
        [[Paragraph("_________________________", firma_line_style),
          Paragraph("_________________________", firma_line_style)]],
        [[Paragraph("Firma Vendedor",  firma_label_style),
          Paragraph("Firma Comprador", firma_label_style)]],
    ):
        t = Table(row_data, colWidths=["50%", "50%"])
        t.setStyle(TableStyle([
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("TOPPADDING",    (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))
        story.append(t)

    doc.build(
        story,
        onFirstPage  = lambda c, d: _draw_page_header(c, order, full=True),
        onLaterPages = lambda c, d: _draw_page_header(c, order, full=False),
        canvasmaker  = NumberedCanvas,
    )
    return buf.getvalue()


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

    pdf_bytes = _build_pdf(order, show_total=show_total)
    suffix    = "con-total" if show_total else "sin-total"
    filename  = f"tixy-orden-{order.order_number}-{suffix}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
