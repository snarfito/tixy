from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class Category(Base):
    """
    Categoría de referencia administrable por el admin.
    Reemplaza el enum estatico ProductCategory de models/reference.py
    """
    __tablename__ = "categories"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    name:       Mapped[str]      = mapped_column(String(100), unique=True, index=True)
    is_active:  Mapped[bool]     = mapped_column(Boolean, default=True, server_default="1")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
