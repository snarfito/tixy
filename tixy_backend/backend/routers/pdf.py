"""
Generación de PDFs para órdenes de pedido.
Produce dos versiones:
  - /pdf/{order_id}?show_total=true   → incluye totales (para el vendedor)
  - /pdf/{order_id}?show_total=false  → sin totales    (para el cliente)
"""
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
)
from sqlalchemy.orm import Session, joinedload

from core.database import get_db
from core.deps import get_current_user
from models.client import Store
from models.order import Order, OrderLine, OrderStatus
from models.user import User, UserRole

router = APIRouter(prefix="/pdf", tags=["pdf"])

# ── Tixy brand colors ─────────────────────────────────────────────────────────
PINK      = colors.HexColor("#C0206A")
PINK_LITE = colors.HexColor("#FAE0EE")
DARK      = colors.HexColor("#1A0D14")
GRAY      = colors.HexColor("#F5F5F5")
LINE      = colors.HexColor("#CCCCCC")
WHITE     = colors.white
BLACK     = colors.HexColor("#111111")


def _build_pdf(order: Order, show_total: bool) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
    )
    styles = getSampleStyleSheet()
    story  = []
    header_brand_style = ParagraphStyle(
        "header_brand",
        parent=styles["Normal"],
        textColor=PINK,
        fontName="Helvetica-Bold",
        fontSize=26,
        leading=28,
    )
    header_meta_style = ParagraphStyle(
        "header_meta",
        parent=styles["Normal"],
        textColor=colors.HexColor("#aaaaaa"),
        fontSize=7,
        leading=9,
    )
    header_title_style = ParagraphStyle(
        "header_title",
        parent=styles["Normal"],
        textColor=colors.HexColor("#888888"),
        fontSize=8,
        leading=10,
        alignment=2,
    )
    header_order_style = ParagraphStyle(
        "header_order",
        parent=styles["Normal"],
        textColor=PINK,
        fontName="Helvetica-Bold",
        fontSize=24,
        leading=26,
        alignment=2,
    )
    header_date_style = ParagraphStyle(
        "header_date",
        parent=styles["Normal"],
        textColor=colors.HexColor("#888888"),
        fontSize=8,
        leading=10,
        alignment=2,
    )

    # ── Header ────────────────────────────────────────────────────────────────
    header_left = Table(
        [
            [Paragraph("Tixy", header_brand_style)],
            [Paragraph("es moda · GLAMOUR", ParagraphStyle(
                "header_tagline",
                parent=styles["Normal"],
                textColor=colors.HexColor("#888888"),
                fontSize=8,
                leading=10,
            ))],
            [Paragraph("Transversal 49c #59-62, 4to piso", header_meta_style)],
            [Paragraph("Centro Mundial De La Moda", header_meta_style)],
            [Paragraph("319 680 0557 · 313 623 1499", header_meta_style)],
        ],
        colWidths=["100%"],
    )
    header_left.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    header_right = Table(
        [
            [Paragraph("ORDEN DE PEDIDO", header_title_style)],
            [Paragraph(f"#{order.order_number}", header_order_style)],
            [Paragraph(order.created_at.strftime("%d/%m/%Y"), header_date_style)],
        ],
        colWidths=["100%"],
    )
    header_right.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))

    header_data = [[
        header_left,
        header_right,
    ]]
    header_table = Table(header_data, colWidths=["60%", "40%"])
    header_table.setStyle(TableStyle([
        ("VALIGN",      (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND",  (0, 0), (-1, -1), DARK),
        ("TOPPADDING",  (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("LEFTPADDING", (0, 0), (0, -1),  12),
        ("RIGHTPADDING", (0, 0), (0, -1), 12),
        ("LEFTPADDING", (1, 0), (1, -1), 12),
        ("RIGHTPADDING", (1, 0), (1, -1), 16),
        ("ROUNDEDCORNERS", [6]),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 0.3 * cm))

    # ── Vendor contact info ───────────────────────────────────────────────────
    vendor = order.vendor
    contact = vendor.contact_info or f"{vendor.phone or ''}"
    story.append(Paragraph(
        f'<font name="Helvetica-Bold" size="8">Vendedor:</font> '
        f'<font name="Helvetica" size="8">{vendor.full_name}  ·  {contact}</font>',
        ParagraphStyle("vendor_info", parent=styles["Normal"],
                       backColor=PINK_LITE, borderPad=5,
                       leading=14, spaceAfter=4),
    ))
    story.append(Spacer(1, 0.2 * cm))

    # ── Client / Store info ───────────────────────────────────────────────────
    store  = order.store
    client = store.client
    client_data = [
        ["Cliente:",      client.business_name,  "NIT/CC:", client.nit or "—"],
        ["Almacén:",      store.name,             "Ciudad:", store.city or "—"],
        ["Dirección:",    store.address or "—",   "Tel:",    store.phone or "—"],
    ]
    ct = Table(client_data, colWidths=[2 * cm, 8 * cm, 2 * cm, 5.5 * cm])
    ct.setStyle(TableStyle([
        ("FONTNAME",    (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE",    (0, 0), (-1, -1), 8),
        ("FONTNAME",    (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME",    (2, 0), (2, -1), "Helvetica-Bold"),
        ("TEXTCOLOR",   (0, 0), (0, -1), PINK),
        ("TEXTCOLOR",   (2, 0), (2, -1), PINK),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [WHITE, GRAY]),
        ("GRID",        (0, 0), (-1, -1), 0.3, LINE),
        ("TOPPADDING",  (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(ct)
    story.append(Spacer(1, 0.3 * cm))

    # ── Products table ────────────────────────────────────────────────────────
    col_headers = ["Referencia", "Descripción", "Categoría", "Cant.", "Vlr. unit."]
    if show_total:
        col_headers.append("Subtotal")

    rows = [col_headers]
    for ln in order.lines:
        row = [
            ln.reference.code,
            Paragraph(ln.reference.description, ParagraphStyle("desc", fontName="Helvetica", fontSize=8, leading=10)),
            ln.reference.category.value if hasattr(ln.reference.category, "value") else str(ln.reference.category),
            str(ln.quantity),
            f"${ln.unit_price:,.0f}".replace(",", "."),
        ]
        if show_total:
            row.append(f"${ln.line_total:,.0f}".replace(",", "."))
        rows.append(row)

    col_w = [2.2*cm, 7*cm, 3*cm, 1.5*cm, 2.2*cm]
    if show_total:
        col_w.append(2.5*cm)

    pt = Table(rows, colWidths=col_w, repeatRows=1)
    ts = [
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0),  8),
        ("BACKGROUND",    (0, 0), (-1, 0),  PINK),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  WHITE),
        ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -1), 8),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, GRAY]),
        ("GRID",          (0, 0), (-1, -1), 0.3, LINE),
        ("ALIGN",         (3, 0), (-1, -1), "RIGHT"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
    ]
    pt.setStyle(TableStyle(ts))
    story.append(pt)
    story.append(Spacer(1, 0.3 * cm))

    # ── Totals ────────────────────────────────────────────────────────────────
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
            ("TEXTCOLOR",    (5, 0), (5, -1),  DARK),
            ("ALIGN",        (4, 0), (-1, -1), "RIGHT"),
            ("TOPPADDING",   (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
            ("LINEABOVE",    (4, 0), (5, 0),   0.5, LINE),
            ("LINEBELOW",    (4, 1), (5, 1),   1,   PINK),
        ]))
        story.append(tt)
        story.append(Spacer(1, 0.3 * cm))

    # ── Signatures ────────────────────────────────────────────────────────────
    story.append(Spacer(1, 1 * cm))
    sig_data = [["_______________________________", "_______________________________"]]
    sig_labels = [["Firma Vendedor", "Firma Comprador"]]
    st = Table(sig_data, colWidths=["50%", "50%"])
    sl = Table(sig_labels, colWidths=["50%", "50%"])
    for t in (st, sl):
        t.setStyle(TableStyle([
            ("ALIGN",    (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TEXTCOLOR",(0, 0), (-1, -1), colors.grey),
        ]))
    story.append(st)
    story.append(sl)

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
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
