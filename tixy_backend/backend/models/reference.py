from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class Reference(Base):
    """
    Prenda del catalogo. Pertenece a una coleccion.
    El codigo (ej. '3366') es unico dentro de la coleccion.
    La categoria es ahora un String libre sincronizado con la tabla 'categories'.
    """
    __tablename__ = "references"

    id:            Mapped[int]           = mapped_column(Integer, primary_key=True, index=True)
    code:          Mapped[str]           = mapped_column(String(30), index=True)
    description:   Mapped[str]           = mapped_column(String(255))
    category:      Mapped[str]           = mapped_column(String(100), index=True)
    base_price:    Mapped[float]         = mapped_column(Numeric(12, 2))
    is_active:     Mapped[bool]          = mapped_column(Boolean, default=True)
    collection_id: Mapped[int]           = mapped_column(ForeignKey("collections.id"))
    created_at:    Mapped[datetime]      = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    collection:  Mapped["Collection"]      = relationship(back_populates="references")  # type: ignore
    order_lines: Mapped[list["OrderLine"]] = relationship(back_populates="reference")   # type: ignore
