from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class UserSession(Base):
    __tablename__ = "user_sessions"

    id:           Mapped[int]      = mapped_column(Integer, primary_key=True, index=True)
    user_id:      Mapped[int]      = mapped_column(Integer, index=True)
    jti:          Mapped[str]      = mapped_column(String(36), unique=True, index=True)
    user_agent:   Mapped[str]      = mapped_column(String(255))
    device_label: Mapped[str]      = mapped_column(String(120))
    ip_address:   Mapped[str]      = mapped_column(String(45))
    created_at:   Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    revoked_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True))
