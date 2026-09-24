from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base

# Tabla puente muchos-a-muchos: una imagen puede compartirse entre varias
# referencias (mismo diseno, color distinto), y una referencia puede tener
# varias imagenes (frente, espalda, lado).
catalog_image_references = Table(
    "catalog_image_references",
    Base.metadata,
    Column("image_id", Integer, ForeignKey("catalog_images.id", ondelete="CASCADE"), primary_key=True),
    Column("reference_id", Integer, ForeignKey("references.id"), primary_key=True),
)


class CatalogImage(Base):
    """
    Imagen del catalogo (fotos generadas por el disenador/IA para mostrar
    a clientes). Pertenece a una coleccion; sus asociaciones a referencias
    viven en `catalog_image_references`.
    """
    __tablename__ = "catalog_images"

    id:            Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    collection_id: Mapped[int]      = mapped_column(ForeignKey("collections.id"), index=True)
    storage_key:   Mapped[str]      = mapped_column(String(255))  # key en R2, version completa WebP
    thumb_key:     Mapped[str]      = mapped_column(String(255))  # key en R2, miniatura WebP
    created_at:    Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
