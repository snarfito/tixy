from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator
from models.order import OrderStatus
from schemas.reference import ReferenceOut
from schemas.user import UserOut
from schemas.client import StoreOut, StoreWithClientOut


class OrderLineCreate(BaseModel):
    reference_id: int
    quantity:     int
    unit_price:   float

    @field_validator("quantity")
    @classmethod
    def quantity_debe_ser_positiva(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("La cantidad debe ser mayor a 0")
        return v

    @field_validator("unit_price")
    @classmethod
    def precio_no_puede_ser_negativo(cls, v: float) -> float:
        if v < 0:
            raise ValueError("El precio unitario no puede ser negativo")
        return v


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

    @field_validator("lines")
    @classmethod
    def pedido_requiere_al_menos_una_linea(cls, v: list) -> list:
        if not v:
            raise ValueError("El pedido debe tener al menos una línea")
        return v


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
