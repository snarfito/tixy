from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class Client(Base):
    """
    Entidad principal del comprador (persona o empresa).
    Un mismo NIT/cédula puede tener varios almacenes (Store).
    Se busca por razón social, no solo por código.
    """
    __tablename__ = "clients"

    id:            Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    business_name: Mapped[str]      = mapped_column(String(200), index=True)   # razón social
    nit:           Mapped[Optional[str]] = mapped_column(String(30), index=True)  # NIT o cédula
    phone:         Mapped[Optional[str]] = mapped_column(String(30))
    email:         Mapped[Optional[str]] = mapped_column(String(180))
    notes:         Mapped[Optional[str]] = mapped_column(Text)
    created_at:    Mapped[datetime]  = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    stores: Mapped[list["Store"]] = relationship(back_populates="client", cascade="all, delete-orphan")


class Store(Base):
    """
    Almacén físico asociado a un Client.
    Ej: 'Supermoda Riohacha', 'Supermoda Sabaneta' → mismo NIT, distintos almacenes.
    """
    __tablename__ = "stores"

    id:        Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    name:      Mapped[str]      = mapped_column(String(200), index=True)  # nombre del almacén
    address:   Mapped[Optional[str]] = mapped_column(String(300))
    city:      Mapped[Optional[str]] = mapped_column(String(100), index=True)
    phone:     Mapped[Optional[str]] = mapped_column(String(30))
    contact:   Mapped[Optional[str]] = mapped_column(String(120))  # persona de contacto en el almacén
    client_id: Mapped[int]      = mapped_column(ForeignKey("clients.id"))

    client: Mapped["Client"]    = relationship(back_populates="stores")
    orders: Mapped[list["Order"]] = relationship(back_populates="store")  # type: ignore
