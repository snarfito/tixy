import enum
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class OrderStatus(str, enum.Enum):
    DRAFT     = "DRAFT"      # borrador, el vendedor aun no envio
    SENT      = "SENT"       # enviado por el vendedor, listo para trabajar
    CONFIRMED = "CONFIRMED"  # confirmado (legado, no se usa en la UI)
    CANCELLED = "CANCELLED"  # cancelado por gerencia


class Order(Base):
    __tablename__ = "orders"

    id:            Mapped[int]         = mapped_column(Integer, primary_key=True, index=True)
    order_number:  Mapped[str]         = mapped_column(String(20), unique=True, index=True)  # "0753"
    status:        Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.DRAFT)
    notes:         Mapped[Optional[str]]  = mapped_column(Text)
    created_at:    Mapped[datetime]    = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    sent_at:       Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    deleted_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # Último correo al que se envió el PDF; si existe, una edición autorizada lo re-envía
    client_email:  Mapped[Optional[str]] = mapped_column(String(180))

    vendor_id:     Mapped[int]         = mapped_column(ForeignKey("users.id"))
    store_id:      Mapped[int]         = mapped_column(ForeignKey("stores.id"))
    collection_id: Mapped[int]         = mapped_column(ForeignKey("collections.id"))

    vendor:     Mapped["User"]         = relationship(back_populates="orders")        # type: ignore
    store:      Mapped["Store"]        = relationship(back_populates="orders")
    collection: Mapped["Collection"]   = relationship(back_populates="orders")        # type: ignore
    lines:      Mapped[list["OrderLine"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    edits:      Mapped[list["OrderEdit"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderEdit.id.desc()"
    )

    @property
    def units(self) -> int:
        return sum(ln.quantity for ln in self.lines)

    @property
    def subtotal(self) -> float:
        return sum(ln.unit_price * ln.quantity for ln in self.lines)

    @property
    def total(self) -> float:
        return self.subtotal  # aquí se podrían agregar descuentos en el futuro


class OrderLine(Base):
    __tablename__ = "order_lines"

    id:           Mapped[int]   = mapped_column(Integer, primary_key=True, index=True)
    order_id:     Mapped[int]   = mapped_column(ForeignKey("orders.id"))
    reference_id: Mapped[int]   = mapped_column(ForeignKey("references.id"))
    quantity:     Mapped[int]   = mapped_column(Integer)
    unit_price:   Mapped[float] = mapped_column(Numeric(12, 2))  # precio al momento del pedido

    order:     Mapped["Order"]     = relationship(back_populates="lines")
    reference: Mapped["Reference"] = relationship(back_populates="order_lines")

    @property
    def line_total(self) -> float:
        return self.unit_price * self.quantity


class OrderEdit(Base):
    """Bitácora de ediciones: quién editó, cuándo, qué cambió y por qué."""
    __tablename__ = "order_edits"

    id:         Mapped[int]           = mapped_column(Integer, primary_key=True, index=True)
    order_id:   Mapped[int]           = mapped_column(ForeignKey("orders.id"), index=True)
    user_id:    Mapped[int]           = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime]      = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    summary:    Mapped[str]           = mapped_column(Text)            # generado automáticamente
    reason:     Mapped[Optional[str]] = mapped_column(Text)            # motivo escrito por el editor

    order: Mapped["Order"] = relationship(back_populates="edits")
    user:  Mapped["User"]  = relationship()                            # type: ignore
