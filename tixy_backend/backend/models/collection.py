from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, SmallInteger, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class Collection(Base):
    """
    Tixy maneja 4 colecciones por año.
    Una colección agrupa referencias y pedidos de esa temporada.
    """
    __tablename__ = "collections"

    id:         Mapped[int]  = mapped_column(Integer, primary_key=True, index=True)
    name:       Mapped[str]  = mapped_column(String(100))          # "Colección 1 - 2026"
    year:       Mapped[int]  = mapped_column(SmallInteger)         # 2026
    season:     Mapped[int]  = mapped_column(SmallInteger)         # 1..4
    is_active:  Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    references: Mapped[list["Reference"]] = relationship(back_populates="collection")  # type: ignore
    orders:     Mapped[list["Order"]]     = relationship(back_populates="collection")  # type: ignore
