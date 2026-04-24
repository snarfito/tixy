from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from models.order import OrderStatus
from schemas.reference import ReferenceOut
from schemas.user import UserOut
from schemas.client import StoreOut, StoreWithClientOut


class OrderLineCreate(BaseModel):
    reference_id: int
    quantity:     int
    unit_price:   float


class OrderLineOut(BaseModel):
    model_config = {"from_attributes": True}

    id:           int
    reference_id: int
    quantity:     int
    unit_price:   float
    line_total:   float
    reference:    ReferenceOut


class OrderCreate(BaseModel):
    store_id:      int
    collection_id: int
    notes:         Optional[str] = None
    lines:         list[OrderLineCreate]


class OrderUpdate(BaseModel):
    """Actualización parcial de un pedido en estado DRAFT o SENT."""
    store_id:      Optional[int]                   = None
    collection_id: Optional[int]                   = None
    notes:         Optional[str]                   = None
    lines:         Optional[list[OrderLineCreate]] = None


class OrderOut(BaseModel):
    model_config = {"from_attributes": True}

    id:           int
    order_number: str
    status:       OrderStatus
    created_at:   datetime
    sent_at:      Optional[datetime]
    vendor_id:    int
    store_id:     int
    collection_id: int
    subtotal:     float
    total:        float
    lines:        list[OrderLineOut] = []
    vendor:       UserOut
    store:        Optional[StoreWithClientOut] = None


class OrderSummary(BaseModel):
    """Vista resumida para listados (sin líneas)."""
    model_config = {"from_attributes": True}

    id:           int
    order_number: str
    status:       OrderStatus
    created_at:   datetime
    vendor:       UserOut
    store_id:     int
    store:        StoreOut
    units:        int
    subtotal:     float
    total:        float
