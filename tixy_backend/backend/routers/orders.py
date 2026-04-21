from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from core.database import get_db
from core.deps import get_current_user, require_manager, require_vendor
from models.order import Order, OrderLine, OrderStatus
from models.reference import Reference
from models.user import User, UserRole
from schemas.order import OrderCreate, OrderOut, OrderSummary

router = APIRouter(prefix="/orders", tags=["orders"])


# ── helpers ──────────────────────────────────────────────────────────────────

from models.client import Store


def _load_order(db: Session, order_id: int) -> Order:
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
    return order


def _next_order_number(db: Session) -> str:
    last = db.query(func.max(Order.id)).scalar() or 752
    return str(last + 1).zfill(4)


# ── CRUD ─────────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[OrderSummary])
def list_orders(
    vendor_id:     Optional[int] = None,
    collection_id: Optional[int] = None,
    status:        Optional[OrderStatus] = None,
    city:          Optional[str] = None,
    db:  Session = Depends(get_db),
    me:  User    = Depends(get_current_user),
):
    q = db.query(Order).options(
        joinedload(Order.vendor),
        joinedload(Order.store),
        joinedload(Order.lines),
    )

    # vendedor solo ve sus propios pedidos
    if me.role == UserRole.VENDOR:
        q = q.filter(Order.vendor_id == me.id)
    elif vendor_id:
        q = q.filter(Order.vendor_id == vendor_id)

    if collection_id:
        q = q.filter(Order.collection_id == collection_id)
    if status:
        q = q.filter(Order.status == status)
    if city:
        from models.client import Store
        store_ids = db.query(Store.id).filter(Store.city.ilike(f"%{city}%")).subquery()
        q = q.filter(Order.store_id.in_(store_ids))

    return q.order_by(Order.created_at.desc()).all()


@router.get("/{order_id}", response_model=OrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    order = _load_order(db, order_id)
    if me.role == UserRole.VENDOR and order.vendor_id != me.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return order


@router.post("/", response_model=OrderOut, status_code=201)
def create_order(
    payload: OrderCreate,
    db:  Session = Depends(get_db),
    me:  User    = Depends(require_vendor),
):
    order = Order(
        order_number=_next_order_number(db),
        vendor_id=me.id,
        store_id=payload.store_id,
        collection_id=payload.collection_id,
        notes=payload.notes,
        status=OrderStatus.DRAFT,
    )
    db.add(order)
    db.flush()

    for ln in payload.lines:
        ref = db.get(Reference, ln.reference_id)
        if not ref:
            raise HTTPException(status_code=400, detail=f"Referencia {ln.reference_id} no existe")
        db.add(OrderLine(
            order_id=order.id,
            reference_id=ln.reference_id,
            quantity=ln.quantity,
            unit_price=ln.unit_price,
        ))

    db.commit()
    return _load_order(db, order.id)


@router.post("/{order_id}/send", response_model=OrderOut)
def send_order(
    order_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(require_vendor),
):
    """Vendedor marca el pedido como enviado."""
    order = _load_order(db, order_id)
    if me.role == UserRole.VENDOR and order.vendor_id != me.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    if order.status != OrderStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Solo se pueden enviar pedidos en borrador")
    order.status  = OrderStatus.SENT
    order.sent_at = datetime.now(timezone.utc)
    db.commit()
    return _load_order(db, order_id)


@router.post("/{order_id}/confirm", response_model=OrderOut)
def confirm_order(
    order_id: int,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_manager),
):
    """Gerencia confirma el pedido."""
    order = _load_order(db, order_id)
    if order.status != OrderStatus.SENT:
        raise HTTPException(status_code=400, detail="Solo se pueden confirmar pedidos enviados")
    order.status = OrderStatus.CONFIRMED
    db.commit()
    return _load_order(db, order_id)


@router.post("/{order_id}/cancel", response_model=OrderOut)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    me: User    = Depends(get_current_user),
):
    order = _load_order(db, order_id)
    if me.role == UserRole.VENDOR and order.vendor_id != me.id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    if order.status == OrderStatus.CONFIRMED:
        raise HTTPException(status_code=400, detail="No se puede cancelar un pedido ya confirmado")
    order.status = OrderStatus.CANCELLED
    db.commit()
    return _load_order(db, order_id)


# ── Sales summary (gerencia) ─────────────────────────────────────────────────

@router.get("/summary/by-reference", tags=["reports"])
def sales_by_reference(
    collection_id: Optional[int] = None,
    vendor_id:     Optional[int] = None,
    category:      Optional[str] = None,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_manager),
):
    """
    Retorna ventas agrupadas por referencia.
    Filtra opcionalmente por colección, vendedor y categoría.
    """
    from models.reference import Reference
    q = (
        db.query(
            Reference.code,
            Reference.description,
            Reference.category,
            func.sum(OrderLine.quantity).label("total_units"),
            func.sum(OrderLine.quantity * OrderLine.unit_price).label("total_value"),
        )
        .join(OrderLine, OrderLine.reference_id == Reference.id)
        .join(Order, Order.id == OrderLine.order_id)
        .filter(Order.status != OrderStatus.CANCELLED)
    )
    if collection_id:
        q = q.filter(Order.collection_id == collection_id)
    if vendor_id:
        q = q.filter(Order.vendor_id == vendor_id)
    if category:
        q = q.filter(Reference.category == category)

    rows = q.group_by(Reference.id).order_by(func.sum(OrderLine.quantity).desc()).all()
    return [
        {
            "code":        r.code,
            "description": r.description,
            "category":    r.category,
            "total_units": int(r.total_units),
            "total_value": float(r.total_value),
        }
        for r in rows
    ]


@router.get("/summary/by-collection", tags=["reports"])
def sales_by_collection(
    db: Session = Depends(get_db),
    _:  User    = Depends(require_manager),
):
    """
    Métricas consolidadas por colección para el panel de comparativas.
    Retorna, por cada colección que tenga al menos un pedido no cancelado:
      - total de pedidos, unidades vendidas, valor total
      - desglose de unidades por categoría de prenda
      - nombre y año/temporada de la colección
    """
    from models.collection import Collection
    from models.reference import Reference

    # ── Totales por colección ────────────────────────────────────────────────
    totals_q = (
        db.query(
            Collection.id,
            Collection.name,
            Collection.year,
            Collection.season,
            func.count(Order.id.distinct()).label("order_count"),
            func.sum(OrderLine.quantity).label("total_units"),
            func.sum(OrderLine.quantity * OrderLine.unit_price).label("total_value"),
        )
        .join(Order, Order.collection_id == Collection.id)
        .join(OrderLine, OrderLine.order_id == Order.id)
        .filter(Order.status != OrderStatus.CANCELLED)
        .group_by(Collection.id)
        .order_by(Collection.year.desc(), Collection.season.desc())
        .all()
    )

    # ── Desglose por categoría (todas las colecciones de una vez) ────────────
    cat_q = (
        db.query(
            Order.collection_id,
            Reference.category,
            func.sum(OrderLine.quantity).label("units"),
            func.sum(OrderLine.quantity * OrderLine.unit_price).label("value"),
        )
        .join(OrderLine, OrderLine.order_id == Order.id)
        .join(Reference, Reference.id == OrderLine.reference_id)
        .filter(Order.status != OrderStatus.CANCELLED)
        .group_by(Order.collection_id, Reference.category)
        .all()
    )

    # Indexar por collection_id
    cat_by_col: dict[int, list] = {}
    for row in cat_q:
        cat_by_col.setdefault(row.collection_id, []).append({
            "category":    row.category.value if hasattr(row.category, "value") else str(row.category),
            "total_units": int(row.units),
            "total_value": float(row.value),
        })

    return [
        {
            "collection_id":   r.id,
            "collection_name": r.name,
            "year":            r.year,
            "season":          r.season,
            "order_count":     int(r.order_count),
            "total_units":     int(r.total_units),
            "total_value":     float(r.total_value),
            "by_category":     sorted(
                cat_by_col.get(r.id, []),
                key=lambda x: x["total_units"],
                reverse=True,
            ),
        }
        for r in totals_q
    ]


@router.get("/summary/by-vendor", tags=["reports"])
def sales_by_vendor(
    collection_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_manager),
):
    """Ventas totales por vendedor en una colección."""
    q = (
        db.query(
            User.id,
            User.full_name,
            func.count(Order.id).label("order_count"),
            func.sum(OrderLine.quantity).label("total_units"),
            func.sum(OrderLine.quantity * OrderLine.unit_price).label("total_value"),
        )
        .join(Order, Order.vendor_id == User.id)
        .join(OrderLine, OrderLine.order_id == Order.id)
        .filter(Order.status != OrderStatus.CANCELLED)
    )
    if collection_id:
        q = q.filter(Order.collection_id == collection_id)

    rows = q.group_by(User.id).all()
    return [
        {
            "vendor_id":   r.id,
            "vendor_name": r.full_name,
            "order_count": int(r.order_count),
            "total_units": int(r.total_units),
            "total_value": float(r.total_value),
        }
        for r in rows
    ]
