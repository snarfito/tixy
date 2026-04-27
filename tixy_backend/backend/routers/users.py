import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import require_admin
from core.email import send_invitation_email
from core.security import hash_password
from models.password_reset import PasswordResetToken
from models.user import User
from schemas.user import UserCreate, UserOut, UserUpdate, PasswordReset

router = APIRouter(prefix="/users", tags=["users"])

# Expiración del token de invitación: 48 horas
_INVITATION_EXPIRY_HOURS = 48


def _generate_invitation_token(email: str, db: Session) -> str:
    """
    Invalida tokens previos del email, genera uno nuevo y lo persiste.
    Retorna el token en claro (para incluirlo en el email).
    """
    # Invalidar tokens anteriores no usados
    db.query(PasswordResetToken).filter(
        PasswordResetToken.email == email,
        PasswordResetToken.used  == False,   # noqa: E712
    ).delete()

    raw_token  = secrets.token_urlsafe(32)          # 256 bits de entropía
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=_INVITATION_EXPIRY_HOURS)

    db.add(PasswordResetToken(
        email=email,
        token_hash=token_hash,
        expires_at=expires_at,
    ))
    db.commit()
    return raw_token


@router.get("/", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(User).all()


@router.post("/", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    Crea un usuario nuevo.
    - Si se provee 'password': se usa directamente (compatibilidad con seed/tests).
    - Si no se provee 'password': la cuenta queda inactiva y se envía un email
      de invitación para que el usuario cree su propia contraseña.
    """
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email ya registrado")

    if payload.password:
        # Flujo directo (seed, admin que prefiere asignar contraseña)
        user = User(
            full_name=payload.full_name,
            email=payload.email,
            hashed_pw=hash_password(payload.password),
            role=payload.role,
            phone=payload.phone,
            contact_info=payload.contact_info,
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Flujo de invitación: cuenta inactiva hasta que el usuario active con el link
        placeholder_pw = hash_password(secrets.token_hex(32))   # hash irrepetible, nadie lo sabe
        user = User(
            full_name=payload.full_name,
            email=payload.email,
            hashed_pw=placeholder_pw,
            role=payload.role,
            phone=payload.phone,
            contact_info=payload.contact_info,
            is_active=False,   # se activa cuando el usuario crea su contraseña
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # Generar token de invitación y enviar email
        raw_token = _generate_invitation_token(user.email, db)
        activation_link = f"https://app.tixyglamour.com/activate?token={raw_token}"
        try:
            send_invitation_email(
                to_email=user.email,
                to_name=user.full_name,
                activation_link=activation_link,
            )
        except Exception as exc:
            # El usuario ya fue creado; loguear el error pero no bloquear la respuesta
            print(f"[Tixy] ⚠️  Error enviando invitación a {user.email}: {exc}")

    return user


@router.post("/{user_id}/send-invitation", status_code=200)
def send_user_invitation(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """
    Reenvía (o genera por primera vez) el email de invitación/activación para un usuario.
    Usado cuando el admin quiere 'restablecer la contraseña' de forma segura:
    el usuario recibirá un link único para crear su nueva contraseña.
    """
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.is_superuser:
        raise HTTPException(status_code=403, detail="No se puede enviar invitación al superusuario")

    raw_token = _generate_invitation_token(user.email, db)
    activation_link = f"https://app.tixyglamour.com/activate?token={raw_token}"

    try:
        send_invitation_email(
            to_email=user.email,
            to_name=user.full_name,
            activation_link=activation_link,
        )
    except Exception as exc:
        print(f"[Tixy] ⚠️  Error enviando invitación a {user.email}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo enviar el email. Verifica la configuración de Resend.",
        ) from exc

    return {"message": f"Email de invitación enviado a {user.email}"}


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    # Proteger al superusuario
    if user.is_superuser and user.id != current_user.id:
        raise HTTPException(status_code=403, detail="No se puede modificar el superusuario")
    if user.is_superuser:
        if payload.is_active is False:
            raise HTTPException(status_code=403, detail="El superusuario no puede ser desactivado")
        if payload.role and payload.role != user.role:
            raise HTTPException(status_code=403, detail="No se puede cambiar el rol del superusuario")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user
