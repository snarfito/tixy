import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class ProductCategory(str, enum.Enum):
    VESTIDO_CORTO = "Vestido corto"
    VESTIDO_LARGO = "Vestido largo"
    CONJUNTO      = "Conjunto"
    BLUSA         = "Blusa"
    BODY          = "Body"
    CAMISETA      = "Camiseta"
    CHALECO       = "Chaleco"
    OTRO          = "Otro"


class Reference(Base):
    """
    Prenda del catálogo. Pertenece a una colección.
    El código (ej. '3366') es único dentro de la colección.
    """
    __tablename__ = "references"

    id:            Mapped[int]             = mapped_column(Integer, primary_key=True, index=True)
    code:          Mapped[str]             = mapped_column(String(30), index=True)
    description:   Mapped[str]             = mapped_column(String(255))
    category:      Mapped[ProductCategory] = mapped_column(Enum(ProductCategory))
    base_price:    Mapped[float]           = mapped_column(Numeric(12, 2))
    is_active:     Mapped[bool]            = mapped_column(Boolean, default=True)
    collection_id: Mapped[int]             = mapped_column(ForeignKey("collections.id"))
    created_at:    Mapped[datetime]        = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    collection:  Mapped["Collection"]   = relationship(back_populates="references")  # type: ignore
    order_lines: Mapped[list["OrderLine"]] = relationship(back_populates="reference")  # type: ignore
