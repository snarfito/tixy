"""
Modelo para tokens de restablecimiento de contraseña.
Cada token: se genera una vez, expira en 1 hora y se marca como usado al consumirlo.
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    email:      Mapped[str]      = mapped_column(String(180), index=True, nullable=False)
    # Guardamos el hash SHA-256 del token, nunca el token en claro
    token_hash: Mapped[str]      = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used:       Mapped[bool]     = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
