from typing import Optional
import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class UserRole(str, enum.Enum):
    ADMIN   = "admin"    # acceso total
    MANAGER = "manager"  # gerencia: ve todo, no edita catálogo
    VENDOR  = "vendor"   # solo crea pedidos propios


class User(Base):
    __tablename__ = "users"

    id:           Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    full_name:    Mapped[str]      = mapped_column(String(120))
    email:        Mapped[str]      = mapped_column(String(180), unique=True, index=True)
    phone:        Mapped[Optional[str]] = mapped_column(String(30))
    hashed_pw:    Mapped[str]      = mapped_column(String(255))
    role:         Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.VENDOR)
    is_active:    Mapped[bool]     = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool]     = mapped_column(Boolean, default=False)
    created_at:   Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # El número de contacto del vendedor aparece en cada PDF
    contact_info: Mapped[Optional[str]] = mapped_column(String(200))

    orders: Mapped[list["Order"]] = relationship(back_populates="vendor")  # type: ignore
