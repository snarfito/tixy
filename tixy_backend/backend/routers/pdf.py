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
        topMargin=1.4 * cm,
        bottomMargin=1.8 * cm,
    )
    styles = getSampleStyleSheet()
    story  = []

    # -- Estilos de parrafo ---------------------------------------------------
    brand_style = ParagraphStyle(
        "brand",
        parent=styles["Normal"],
        textColor=PINK,
        fontName=LOGO_FONT,
        fontSize=LOGO_SIZE,
        leading=LOGO_SIZE + 2,
        spaceAfter=0,
    )
    tagline_style = ParagraphStyle(
        "tagline",
        parent=styles["Normal"],
        textColor=colors.HexColor("#E8A0C0"),
        fontName="Helvetica",
        fontSize=7.5,
        leading=10,
        spaceAfter=1,
    )
    meta_style = ParagraphStyle(
        "meta",
        parent=styles["Normal"],
        textColor=colors.HexColor("#C09090"),
        fontName="Helvetica",
        fontSize=7,
        leading=9.5,
    )
    header_title_style = ParagraphStyle(
        "header_title",
        parent=styles["Normal"],
        textColor=colors.HexColor("#E8B0C8"),
        fontName="Helvetica",
        fontSize=7.5,
        leading=10,
        alignment=2,
        spaceAfter=2,
    )
    header_order_style = ParagraphStyle(
        "header_order",
        parent=styles["Normal"],
        textColor=PINK,
        fontName="Helvetica-Bold",
        fontSize=28,
        leading=30,
        alignment=2,
    )
    header_date_style = ParagraphStyle(
        "header_date",
        parent=styles["Normal"],
        textColor=colors.HexColor("#C09090"),
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        alignment=2,
    )

    # -- Contenido interior del encabezado ------------------------------------
    # Columna izquierda: logo sube 4pt con spaceAfter negativo simulado via leading
    header_left = Table(
        [
            [Paragraph("Tixy", brand_style)],
            [Paragraph("es moda \u00b7 GLAMOUR", tagline_style)],
            [Paragraph("Transversal 49c #59-62, 4to piso", meta_style)],
            [Paragraph("Centro Mundial De La Moda", meta_style)],
            [Paragraph("319 680 0557 \u00b7 313 623 1499", meta_style)],
        ],
        colWidths=["100%"],
    )
    header_left.setStyle(TableStyle([
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
    ]))

    # Columna derecha: titulo + numero + fecha
    header_right = Table(
        [
            [Paragraph("ORDEN DE PEDIDO", header_title_style)],
            [Paragraph(f"#{order.order_number}", header_order_style)],
            [Paragraph(order.created_at.strftime("%d/%m/%Y"), header_date_style)],
        ],
        colWidths=["100%"],
    )
    header_right.setStyle(TableStyle([
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))

    # Tabla interior (transparente, solo layout de columnas)
    inner = Table([[header_left, header_right]], colWidths=[USABLE_W * 0.58, USABLE_W * 0.42])
    inner.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("LEFTPADDING",   (0, 0), (0, -1),  14),
        ("RIGHTPADDING",  (0, 0), (0, -1),  14),
        ("LEFTPADDING",   (1, 0), (1, -1),  14),
        ("RIGHTPADDING",  (1, 0), (1, -1),  18),
        ("LINEAFTER",     (0, 0), (0, -1),  0.5, colors.HexColor("#5A2040")),
    ]))

    # Calcular altura real de la tabla para el bloque redondeado
    inner.wrapOn(None, USABLE_W, 999)
    header_h = inner._height

    header_block = TopRoundedBlock(
        width=USABLE_W,
        height=header_h,
        radius=8,
        fill_color=DARK,
        inner_table=inner,
    )
    story.append(header_block)
    story.append(Spacer(1, 0.25 * cm))

    # -- Barra del vendedor (esquinas sup redondeadas) ------------------------
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

    doc.build(story)
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
