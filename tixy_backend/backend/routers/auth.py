import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from core.config import settings
from core.database import get_db
from core.deps import get_current_user
from core.email import send_password_reset_email
from core.security import create_access_token, hash_password, verify_password
from models.password_reset import PasswordResetToken
from models.user import User
from schemas.user import TokenOut, UserCreate, UserOut

router   = APIRouter(prefix="/auth", tags=["auth"])
_limiter = Limiter(key_func=get_remote_address)


# ── Schemas locales (simples, no necesitan archivo propio) ────────────────────

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token:        str
    new_password: str


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenOut)
@_limiter.limit("5/minute")
def login(
    request: Request,
    form:    OAuth2PasswordRequestForm = Depends(),
    db:      Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_pw):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo")

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


# ── Registro (solo primer admin) ──────────────────────────────────────────────

@router.post("/register", response_model=UserOut, status_code=201)
def register_first_admin(payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).count() > 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registro público deshabilitado. Usa el panel de administración.",
        )
    user = User(
        full_name=payload.full_name,
        email=payload.email,
        hashed_pw=hash_password(payload.password),
        role=payload.role,
        phone=payload.phone,
        contact_info=payload.contact_info,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


# ── Olvidé mi contraseña ──────────────────────────────────────────────────────

@router.post("/forgot-password", status_code=200)
@_limiter.limit("3/minute")
def forgot_password(
    request:  Request,
    payload:  ForgotPasswordRequest,
    db:       Session = Depends(get_db),
):
    """
    Genera un token de reset y envía el correo al usuario.
    Siempre responde 200 para no revelar si el email existe o no.
    """
    user = db.query(User).filter(User.email == payload.email).first()

    if user and user.is_active:
        # Invalidar tokens anteriores no usados del mismo email
        db.query(PasswordResetToken).filter(
            PasswordResetToken.email == payload.email,
            PasswordResetToken.used  == False,  # noqa: E712
        ).delete()

        # Generar token seguro
        raw_token  = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

        db_token = PasswordResetToken(
            email=payload.email,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        db.add(db_token)
        db.commit()

        # Construir link y enviar correo
        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
        try:
            send_password_reset_email(
                to_email=user.email,
                to_name=user.full_name,
                reset_link=reset_link,
            )
        except Exception as exc:
            # Loguear pero no exponer al cliente
            print(f"[Tixy] Error enviando correo de reset a {user.email}: {exc}")

    # Siempre retornamos el mismo mensaje (seguridad: no revelar si el email existe)
    return {"message": "Si el correo está registrado, recibirás un enlace en los próximos minutos."}


# ── Reset de contraseña ───────────────────────────────────────────────────────

@router.post("/reset-password", status_code=200)
def reset_password(
    payload: ResetPasswordRequest,
    db:      Session = Depends(get_db),
):
    """
    Valida el token y actualiza la contraseña del usuario.
    """
    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="La contraseña debe tener al menos 8 caracteres.",
        )

    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    ahora      = datetime.now(timezone.utc)

    db_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == token_hash,
        PasswordResetToken.used       == False,  # noqa: E712
        PasswordResetToken.expires_at >  ahora,
    ).first()

    if not db_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El enlace es inválido o ya expiró. Solicita uno nuevo.",
        )

    user = db.query(User).filter(User.email == db_token.email).first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El enlace es inválido o ya expiró. Solicita uno nuevo.",
        )

    # Actualizar contraseña y marcar token como usado
    user.hashed_pw  = hash_password(payload.new_password)
    db_token.used   = True
    db.commit()

    return {"message": "Contraseña actualizada correctamente. Ya puedes iniciar sesión."}
