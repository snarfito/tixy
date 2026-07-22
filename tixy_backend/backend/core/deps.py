from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import decode_token
from models.session import UserSession
from models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

_LAST_SEEN_THROTTLE_SECONDS = 60


def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado o token inválido",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        jti = payload.get("jti")
        if user_id is None or jti is None:
            raise credentials_exc
        user_id = int(user_id)  # sub viene como string, convertir a int
    except JWTError:
        raise credentials_exc
    except Exception:
        raise credentials_exc

    now = datetime.now(timezone.utc)
    session = db.query(UserSession).filter(
        UserSession.jti == jti,
        UserSession.revoked_at.is_(None),
        UserSession.expires_at > now,
    ).first()
    if not session:
        raise credentials_exc

    # MySQL DATETIME no conserva tzinfo: lo que devuelve el driver es naive,
    # así que comparamos en naive-UTC para no mezclar aware/naive.
    last_seen_naive = (
        session.last_seen_at.replace(tzinfo=None)
        if session.last_seen_at.tzinfo else session.last_seen_at
    )
    if now.replace(tzinfo=None) - last_seen_naive > timedelta(seconds=_LAST_SEEN_THROTTLE_SECONDS):
        session.last_seen_at = now
        current_ip = request.client.host if request.client else ""
        if current_ip and current_ip != session.ip_address:
            session.ip_address = current_ip
        db.commit()

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise credentials_exc
    return user


def require_role(*roles: UserRole):
    def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para esta acción",
            )
        return current_user
    return _check


def require_superuser(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el superusuario puede realizar esta acción",
        )
    return current_user


# Shortcuts
require_admin   = require_role(UserRole.ADMIN)
require_manager = require_role(UserRole.ADMIN, UserRole.MANAGER)
require_vendor  = require_role(UserRole.ADMIN, UserRole.MANAGER, UserRole.VENDOR)
