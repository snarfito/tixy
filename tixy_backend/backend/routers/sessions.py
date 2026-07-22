# tixy_backend/backend/routers/sessions.py
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import require_superuser
from models.session import UserSession
from models.user import User
from schemas.session import SessionOut

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/", response_model=list[SessionOut])
def list_sessions(
    user_id: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),
):
    now = datetime.now(timezone.utc)
    query = db.query(UserSession).filter(
        UserSession.revoked_at.is_(None),
        UserSession.expires_at > now,
    )
    if user_id is not None:
        query = query.filter(UserSession.user_id == user_id)
    sessions = query.order_by(UserSession.last_seen_at.desc()).all()

    user_ids = {s.user_id for s in sessions}
    users_by_id = {
        u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}

    result = []
    for s in sessions:
        user = users_by_id.get(s.user_id)
        result.append(SessionOut(
            id=s.id,
            user_id=s.user_id,
            user_full_name=user.full_name if user else "Usuario eliminado",
            user_email=user.email if user else "",
            device_label=s.device_label,
            ip_address=s.ip_address,
            created_at=s.created_at,
            last_seen_at=s.last_seen_at,
        ))
    return result


@router.delete("/{session_id}", status_code=200)
def revoke_session(
    session_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),
):
    session = db.get(UserSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return {"message": "Sesión cerrada."}


@router.delete("/user/{user_id}", status_code=200)
def revoke_user_sessions(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_superuser),
):
    now = datetime.now(timezone.utc)
    sessions = db.query(UserSession).filter(
        UserSession.user_id == user_id,
        UserSession.revoked_at.is_(None),
    ).all()
    for s in sessions:
        s.revoked_at = now
    db.commit()
    return {"message": f"{len(sessions)} sesión(es) cerrada(s)."}
