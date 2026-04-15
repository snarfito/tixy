from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from models.order import OrderStatus
from schemas.reference import ReferenceOut
from schemas.user import UserOut


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


class OrderSummary(BaseModel):
    """Vista resumida para listados (sin líneas)."""
    model_config = {"from_attributes": True}

    id:           int
    order_number: str
    status:       OrderStatus
    created_at:   datetime
    vendor:       UserOut
    store_id:     int
    subtotal:     float
    total:        float
