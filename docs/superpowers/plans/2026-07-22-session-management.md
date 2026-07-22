# Gestión de Sesiones Activas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the superuser view all active JWT sessions (per user/device) and
revoke one specific session, or all of a user's sessions at once, without
affecting anyone else's session — replacing the current "rotate SECRET_KEY
and log everyone out" workaround.

**Architecture:** Add a `user_sessions` table keyed by a new `jti` claim
embedded in each JWT at login. `get_current_user` (the dependency already
used on every authenticated request) additionally checks that the session
row for the token's `jti` exists, is not revoked, and is not expired. A new
superuser-only router exposes list/revoke endpoints; the existing "Usuarios"
tab pattern in `AdminPage.jsx` is cloned into a new "Sesiones" tab.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 (MySQL via `pymysql`), `python-jose`
for JWT, React + Zustand + axios on the frontend. No new dependencies.

## Global Constraints

- **DB is MySQL, not Postgres.** Any raw SQL uses MySQL syntax
  (`INT AUTO_INCREMENT`, `TINYINT(1)`, `DATETIME`), matching the existing
  `tixy_backend/migrate_production.sql` convention.
- **No Alembic in practice.** Despite being in `requirements.txt`, it's not
  wired up. Schema changes are hand-written idempotent `.sql` files run
  manually against local Docker MySQL and then Railway MySQL, **before**
  deploying the backend code that depends on the new table.
- **No automated test framework exists anywhere in this backend** (confirmed:
  zero `test_*.py`, no `pytest` in `requirements.txt`, no `conftest.py`).
  Introducing pytest from scratch is out of scope for this feature — every
  task below is verified with `curl`/`python3 -c`/manual DB queries against
  the local Docker stack instead of automated tests, matching how this
  project is actually operated today.
- **MySQL `DATETIME` does not retain timezone info.** Values written with
  `datetime.now(timezone.utc)` come back from the driver as naive
  datetimes. Any Python-side (not SQL-filter-side) comparison between a
  freshly-computed `datetime.now(timezone.utc)` and a value read back from
  the DB must strip `tzinfo` first, or it raises
  `TypeError: can't subtract offset-naive and offset-aware datetimes`.
- **Deploying this feature invalidates every currently-issued JWT** — old
  tokens have no `jti` claim, so `get_current_user` will reject them once
  the new code is live. This is a one-time, expected effect on deploy day
  (same as the emergency `SECRET_KEY` rotation on 2026-07-22) — after this
  deploy, revocation becomes granular and this side effect never needs to
  happen again.
- Superuser-only access is enforced with `core.deps.require_superuser`,
  which **already exists** in the codebase (`core/deps.py`) — no new guard
  needs to be written.
- Local Docker stack (from `tixy_backend/docker-compose.yml`): MySQL
  container `tixy_db` (user `tixy` / password `tixy_pass` / database
  `tixy`), backend container `tixy_backend` on `http://localhost:8000`.

---

### Task 1: SQL migration — `user_sessions` table

**Files:**
- Create: `tixy_backend/migrate_sessions_20260722.sql`

**Interfaces:**
- Produces: MySQL table `user_sessions` with columns `id, user_id, jti,
  user_agent, device_label, ip_address, created_at, last_seen_at,
  revoked_at, expires_at`, unique index on `jti`, index on `user_id`.

- [ ] **Step 1: Write the migration file**

```sql
-- =============================================================================
-- TIXY GLAMOUR — Migración de producción
-- Sesión: 22 julio 2026
-- Tabla user_sessions: permite ver y revocar sesiones JWT activas por
-- dispositivo (solo superusuario). Ver docs/superpowers/specs/2026-07-22-session-management-design.md
-- IDEMPOTENTE: se puede ejecutar varias veces sin romper nada.
-- Ejecutar ANTES de desplegar el nuevo código del backend.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_sessions (
    id           INT          AUTO_INCREMENT PRIMARY KEY,
    user_id      INT          NOT NULL,
    jti          VARCHAR(36)  NOT NULL,
    user_agent   VARCHAR(255) NOT NULL,
    device_label VARCHAR(120) NOT NULL,
    ip_address   VARCHAR(45)  NOT NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at   DATETIME     NULL,
    expires_at   DATETIME     NOT NULL,
    UNIQUE KEY uq_user_sessions_jti (jti),
    KEY ix_user_sessions_user_id (user_id)
);
```

- [ ] **Step 2: Run it against the local Docker MySQL**

Run: `docker exec -i tixy_db mysql -utixy -ptixy_pass tixy < tixy_backend/migrate_sessions_20260722.sql`
Expected: no output (successful, silent `CREATE TABLE`).

- [ ] **Step 3: Verify the table exists with the right columns**

Run: `docker exec -i tixy_db mysql -utixy -ptixy_pass tixy -e "DESCRIBE user_sessions;"`
Expected output (order of rows matches column order above):
```
Field         Type          Null  Key  Default             Extra
id            int           NO    PRI  NULL                auto_increment
user_id       int           NO    MUL  NULL
jti           varchar(36)   NO    UNI  NULL
user_agent    varchar(255)  NO
device_label  varchar(120)  NO
ip_address    varchar(45)   NO
created_at    datetime      NO         CURRENT_TIMESTAMP
last_seen_at  datetime      NO         CURRENT_TIMESTAMP
revoked_at    datetime      YES
expires_at    datetime      NO
```

- [ ] **Step 4: Commit**

```bash
git add tixy_backend/migrate_sessions_20260722.sql
git commit -m "feat: add user_sessions migration for session management"
```

---

### Task 2: `UserSession` model

**Files:**
- Create: `tixy_backend/backend/models/session.py`
- Modify: `tixy_backend/backend/main.py:9-10` (add explicit model import so `Base.metadata.create_all` picks it up as a fallback)

**Interfaces:**
- Consumes: `core.database.Base` (from Task setup, already exists)
- Produces: `models.session.UserSession` class with attributes
  `id: int, user_id: int, jti: str, user_agent: str, device_label: str,
  ip_address: str, created_at: datetime, last_seen_at: datetime,
  revoked_at: datetime | None, expires_at: datetime`, `__tablename__ =
  "user_sessions"`.

- [ ] **Step 1: Write the model**

```python
# tixy_backend/backend/models/session.py
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
```

- [ ] **Step 2: Wire the model into `main.py` so `create_all` knows about it**

In `tixy_backend/backend/main.py`, current line 9:
```python
from models import password_reset  # noqa: F401 — necesario para que create_all cree la tabla
```
Change to:
```python
from models import password_reset, session  # noqa: F401 — necesario para que create_all cree la tabla
```

- [ ] **Step 3: Verify the model imports cleanly and matches the table**

Run: `docker compose -f tixy_backend/docker-compose.yml exec backend python3 -c "from models.session import UserSession; print(UserSession.__tablename__); print([c.name for c in UserSession.__table__.columns])"`
Expected:
```
user_sessions
['id', 'user_id', 'jti', 'user_agent', 'device_label', 'ip_address', 'created_at', 'last_seen_at', 'revoked_at', 'expires_at']
```

- [ ] **Step 4: Commit**

```bash
git add tixy_backend/backend/models/session.py tixy_backend/backend/main.py
git commit -m "feat: add UserSession model"
```

---

### Task 3: Device label helper

**Files:**
- Create: `tixy_backend/backend/core/device_label.py`

**Interfaces:**
- Produces: `core.device_label.parse_device_label(user_agent: str) -> str`
  — a human-readable "Browser en OS" string, no external dependency.

- [ ] **Step 1: Write the helper**

```python
# tixy_backend/backend/core/device_label.py
def parse_device_label(user_agent: str) -> str:
    """Heurística simple browser + OS a partir del header User-Agent crudo,
    sin depender de una librería externa de parsing."""
    ua = (user_agent or "").lower()

    if "edg/" in ua:
        browser = "Edge"
    elif "chrome/" in ua and "chromium" not in ua:
        browser = "Chrome"
    elif "firefox/" in ua:
        browser = "Firefox"
    elif "safari/" in ua and "chrome/" not in ua:
        browser = "Safari"
    else:
        browser = "Navegador desconocido"

    if "windows" in ua:
        os_name = "Windows"
    elif "iphone" in ua or "ipad" in ua:
        os_name = "iOS"
    elif "android" in ua:
        os_name = "Android"
    elif "mac os" in ua:
        os_name = "macOS"
    elif "linux" in ua:
        os_name = "Linux"
    else:
        os_name = "SO desconocido"

    return f"{browser} en {os_name}"
```

- [ ] **Step 2: Verify with representative User-Agent strings**

Run:
```bash
cd tixy_backend/backend && python3 -c "
from core.device_label import parse_device_label
print(parse_device_label('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'))
print(parse_device_label('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'))
print(parse_device_label('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'))
print(parse_device_label(''))
"
```
Expected:
```
Chrome en Windows
Safari en iOS
Chrome en macOS
Navegador desconocido en SO desconocido
```

- [ ] **Step 3: Commit**

```bash
git add tixy_backend/backend/core/device_label.py
git commit -m "feat: add device label parser for session display"
```

---

### Task 4: `SessionOut` schema

**Files:**
- Create: `tixy_backend/backend/schemas/session.py`

**Interfaces:**
- Produces: `schemas.session.SessionOut` (Pydantic `BaseModel`) with fields
  `id: int, user_id: int, user_full_name: str, user_email: str,
  device_label: str, ip_address: str, created_at: datetime, last_seen_at:
  datetime`.

- [ ] **Step 1: Write the schema**

```python
# tixy_backend/backend/schemas/session.py
from datetime import datetime

from pydantic import BaseModel


class SessionOut(BaseModel):
    id:             int
    user_id:        int
    user_full_name: str
    user_email:     str
    device_label:   str
    ip_address:     str
    created_at:     datetime
    last_seen_at:   datetime
```

- [ ] **Step 2: Verify it constructs and serializes correctly**

Run:
```bash
cd tixy_backend/backend && python3 -c "
from datetime import datetime, timezone
from schemas.session import SessionOut
s = SessionOut(id=1, user_id=2, user_full_name='José Miguel Serna', user_email='j@x.com',
               device_label='Chrome en Windows', ip_address='190.0.0.1',
               created_at=datetime.now(timezone.utc), last_seen_at=datetime.now(timezone.utc))
print(s.model_dump_json())
"
```
Expected: a single line of JSON with all 8 fields populated, no errors.

- [ ] **Step 3: Commit**

```bash
git add tixy_backend/backend/schemas/session.py
git commit -m "feat: add SessionOut schema"
```

---

### Task 5: Embed `jti` and create a session row at login

**Files:**
- Modify: `tixy_backend/backend/routers/auth.py:1-10` (imports), `:505-522` (`login` function)

**Interfaces:**
- Consumes: `models.session.UserSession` (Task 2), `core.device_label.parse_device_label` (Task 3)
- Produces: every successful login creates one `UserSession` row and embeds
  its `jti` in the returned JWT payload — consumed by Task 6.

- [ ] **Step 1: Add new imports to `routers/auth.py`**

Current top-of-file imports (lines 1-13):
```python
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
from models.user import User, UserRole
from schemas.user import TokenOut, UserCreate, UserOut
```

Change to:
```python
import hashlib
import secrets
import uuid
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
from core.device_label import parse_device_label
from core.email import send_password_reset_email
from core.security import create_access_token, hash_password, verify_password
from models.password_reset import PasswordResetToken
from models.session import UserSession
from models.user import User, UserRole
from schemas.user import TokenOut, UserCreate, UserOut
```

- [ ] **Step 2: Update the `login` function**

Current (lines 505-522):
```python
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
```

Change to:
```python
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

    jti   = str(uuid.uuid4())
    token = create_access_token({"sub": str(user.id), "role": user.role, "jti": jti})

    now        = datetime.now(timezone.utc)
    user_agent = request.headers.get("user-agent", "")
    db.add(UserSession(
        user_id=user.id,
        jti=jti,
        user_agent=user_agent,
        device_label=parse_device_label(user_agent),
        ip_address=request.client.host if request.client else "",
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    ))
    db.commit()

    return TokenOut(access_token=token, user=UserOut.model_validate(user))
```

- [ ] **Step 3: Verify login creates a session row with a `jti` in the token**

Run (replace `admin@example.com` / password with real local credentials):
```bash
curl -s -X POST http://localhost:8000/auth/login \
  -d "username=admin@example.com&password=YOUR_PASSWORD" \
  -H "Content-Type: application/x-www-form-urlencoded" | tee /tmp/login_response.json
```
Expected: JSON with `access_token`, `token_type: "bearer"`, `user: {...}`.

Then decode the token's claims (no signature check needed, just reading the payload):
```bash
python3 -c "
import json
token = json.load(open('/tmp/login_response.json'))['access_token']
payload_b64 = token.split('.')[1] + '=='
import base64
print(json.loads(base64.urlsafe_b64decode(payload_b64)))
"
```
Expected: a dict containing `sub`, `role`, `exp`, and a `jti` key with a UUID string.

Then confirm the row exists:
```bash
docker exec -i tixy_db mysql -utixy -ptixy_pass tixy -e "SELECT id, user_id, jti, device_label, ip_address FROM user_sessions ORDER BY id DESC LIMIT 1;"
```
Expected: one row whose `jti` matches the value decoded above.

- [ ] **Step 4: Commit**

```bash
git add tixy_backend/backend/routers/auth.py
git commit -m "feat: embed jti and record session on login"
```

---

### Task 6: Validate sessions in `get_current_user`

**Files:**
- Modify: `tixy_backend/backend/core/deps.py` (full file rewrite, 63 → ~90 lines)

**Interfaces:**
- Consumes: `models.session.UserSession` (Task 2), token payload's `jti`
  claim (Task 5)
- Produces: `get_current_user` now raises 401 for a token whose session was
  revoked, expired, or never existed — this is what makes `DELETE
  /sessions/{id}` (Task 7) actually take effect. `require_superuser` and
  `require_admin`/`require_manager`/`require_vendor` keep their existing
  names and behavior (used by every other router unchanged).

- [ ] **Step 1: Rewrite `core/deps.py`**

```python
# tixy_backend/backend/core/deps.py
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
```

- [ ] **Step 2: Verify a fresh token still works**

Using the `access_token` from Task 5's verification:
```bash
TOKEN=$(python3 -c "import json; print(json.load(open('/tmp/login_response.json'))['access_token'])")
curl -s http://localhost:8000/auth/me -H "Authorization: Bearer $TOKEN"
```
Expected: 200 with the logged-in user's JSON (`id`, `full_name`, `email`, ...).

- [ ] **Step 3: Verify a revoked session is rejected**

```bash
docker exec -i tixy_db mysql -utixy -ptixy_pass tixy -e "
UPDATE user_sessions SET revoked_at = NOW()
WHERE jti = (SELECT jti FROM (SELECT jti FROM user_sessions ORDER BY id DESC LIMIT 1) t);"

curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/auth/me -H "Authorization: Bearer $TOKEN"
```
Expected: `401`.

- [ ] **Step 4: Commit**

```bash
git add tixy_backend/backend/core/deps.py
git commit -m "feat: validate session revocation and expiry in get_current_user"
```

---

### Task 7: Sessions router (list / revoke)

**Files:**
- Create: `tixy_backend/backend/routers/sessions.py`
- Modify: `tixy_backend/backend/main.py:12` (router import), `:36-43` (`include_router` calls)

**Interfaces:**
- Consumes: `models.session.UserSession` (Task 2), `schemas.session.SessionOut`
  (Task 4), `core.deps.require_superuser` (already exists)
- Produces: `GET /sessions/` (optional `?user_id=`), `DELETE
  /sessions/{session_id}`, `DELETE /sessions/user/{user_id}` — all
  superuser-only, consumed by the frontend in Task 8/9.

- [ ] **Step 1: Write the router**

```python
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
```

- [ ] **Step 2: Register the router in `main.py`**

Current (line 12):
```python
from routers import auth, users, collections, references, clients, orders, pdf, categories
```
Change to:
```python
from routers import auth, users, collections, references, clients, orders, pdf, categories, sessions
```

Current (lines 36-43):
```python
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(collections.router)
app.include_router(categories.router)
app.include_router(references.router)
app.include_router(clients.router)
app.include_router(orders.router)
app.include_router(pdf.router)
```
Change to:
```python
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(collections.router)
app.include_router(categories.router)
app.include_router(references.router)
app.include_router(clients.router)
app.include_router(orders.router)
app.include_router(pdf.router)
app.include_router(sessions.router)
```

- [ ] **Step 3: Log in again (previous token was revoked in Task 6) and verify the endpoints**

```bash
curl -s -X POST http://localhost:8000/auth/login \
  -d "username=admin@example.com&password=YOUR_PASSWORD" \
  -H "Content-Type: application/x-www-form-urlencoded" | tee /tmp/login_response2.json

TOKEN2=$(python3 -c "import json; print(json.load(open('/tmp/login_response2.json'))['access_token'])")

curl -s http://localhost:8000/sessions/ -H "Authorization: Bearer $TOKEN2"
```
Expected: 200 with a JSON list containing at least one session (the one just
created), with `user_full_name`, `device_label`, `ip_address`, etc.

```bash
SESSION_ID=$(curl -s http://localhost:8000/sessions/ -H "Authorization: Bearer $TOKEN2" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:8000/sessions/$SESSION_ID -H "Authorization: Bearer $TOKEN2"
```
Expected: `200`. **Note:** this revokes the superuser's own current session
(the only one that exists at this point), so the next call with `$TOKEN2`
should now 401 — confirm with:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/sessions/ -H "Authorization: Bearer $TOKEN2"
```
Expected: `401` (proves revocation is enforced end-to-end).

If you have a second, non-superuser account's credentials handy, also
verify 403:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/sessions/ -H "Authorization: Bearer $NON_SUPERUSER_TOKEN"
```
Expected: `403`.

- [ ] **Step 4: Commit**

```bash
git add tixy_backend/backend/routers/sessions.py tixy_backend/backend/main.py
git commit -m "feat: add superuser-only sessions router (list/revoke)"
```

---

### Task 8: Frontend API wrappers

**Files:**
- Modify: `tixy_frontend/src/api/admin.js` (append new exports)

**Interfaces:**
- Consumes: `GET /sessions/`, `DELETE /sessions/{id}`, `DELETE
  /sessions/user/{id}` (Task 7)
- Produces: `getSessions(userId?: number) => Promise<Session[]>`,
  `revokeSession(sessionId: number) => Promise<{message: string}>`,
  `revokeUserSessions(userId: number) => Promise<{message: string}>` —
  consumed by Task 9's `SessionsSection`.

- [ ] **Step 1: Add the functions**

Append to `tixy_frontend/src/api/admin.js` (matching the existing export
style, e.g. right after the `updateUser` export shown below for context):
```js
export const updateUser = (id, payload) =>
  api.patch(`/users/${id}`, payload).then(r => r.data)

// Sesiones (solo superusuario)
export const getSessions = (userId) =>
  api.get('/sessions/', { params: userId ? { user_id: userId } : {} }).then(r => r.data)

export const revokeSession = (sessionId) =>
  api.delete(`/sessions/${sessionId}`).then(r => r.data)

export const revokeUserSessions = (userId) =>
  api.delete(`/sessions/user/${userId}`).then(r => r.data)
```

- [ ] **Step 2: Verify the file has no syntax errors**

Run: `cd tixy_frontend && npx eslint src/api/admin.js`
Expected: no output (no lint errors) — or only pre-existing warnings
unrelated to the new lines.

- [ ] **Step 3: Commit**

```bash
git add tixy_frontend/src/api/admin.js
git commit -m "feat: add sessions API wrappers"
```

---

### Task 9: "Sesiones" tab in the admin panel

**Files:**
- Modify: `tixy_frontend/src/pages/AdminPage.jsx` (imports, `TABS`, main
  component body, new `SessionsSection` function)

**Interfaces:**
- Consumes: `getSessions, revokeSession, revokeUserSessions` (Task 8),
  `useAuthStore` (existing, `tixy_frontend/src/store/authStore.js`)
- Produces: a "Sesiones" tab, visible only when the logged-in user's
  `is_superuser` is `true`, rendering `SessionsSection`.

- [ ] **Step 1: Add the `useAuthStore` import and the new API imports**

Current top of file (lines 1-12):
```jsx
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  getReferencesByCollection, createReference, updateReference, deleteReference,
  getCollections, createCollection, updateCollection, activateCollection, deactivateCollection,
  getUsers, createUser, updateUser, sendUserInvitation, copyReferences, bulkUpdateReferences,
  listClients, createClient, updateClient, addStore, updateStore,
  inactivateClient, activateClient, inactivateStore, activateStore,
  getCategories, createCategory, updateCategory, deactivateCategory,
  setUserPassword,
} from '../api/admin'
import fmt from '../utils/fmt'
import CityCombobox from '../components/CityCombobox'
```

Change to:
```jsx
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  getReferencesByCollection, createReference, updateReference, deleteReference,
  getCollections, createCollection, updateCollection, activateCollection, deactivateCollection,
  getUsers, createUser, updateUser, sendUserInvitation, copyReferences, bulkUpdateReferences,
  listClients, createClient, updateClient, addStore, updateStore,
  inactivateClient, activateClient, inactivateStore, activateStore,
  getCategories, createCategory, updateCategory, deactivateCategory,
  setUserPassword,
  getSessions, revokeSession, revokeUserSessions,
} from '../api/admin'
import fmt from '../utils/fmt'
import CityCombobox from '../components/CityCombobox'
import { useAuthStore } from '../store/authStore'
```

- [ ] **Step 2: Add the `SessionsSection` component**

Add this new function anywhere among the other `*Section` components (e.g.
right after `UsersSection`'s closing brace):
```jsx
function fmtRelativeTime(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return 'hace unos segundos'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `hace ${diffH}h`
  const diffD = Math.round(diffH / 24)
  return `hace ${diffD}d`
}

function SessionsSection() {
  const { user: currentUser }   = useAuthStore()
  const [sessions, setSessions] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [banner,   setBanner]   = useState(null)

  function flash(type, msg) { setBanner({ type, msg }); setTimeout(() => setBanner(null), 3500) }

  function loadSessions() {
    setLoading(true)
    getSessions().then(setSessions).finally(() => setLoading(false))
  }

  useEffect(() => { loadSessions() }, [])

  async function handleRevoke(session) {
    const isOwnSession = session.user_id === currentUser?.id
    const confirmMsg = isOwnSession
      ? 'Esto cerrará tu propia sesión actual y tendrás que volver a iniciar sesión. ¿Continuar?'
      : `¿Cerrar la sesión de ${session.user_full_name} en "${session.device_label}"?`
    if (!window.confirm(confirmMsg)) return
    try {
      await revokeSession(session.id)
      flash('ok', 'Sesión cerrada.')
      loadSessions()
    } catch (err) {
      flash('err', err.response?.data?.detail || 'Error al cerrar la sesión.')
    }
  }

  async function handleRevokeAllForUser(session) {
    const isOwnUser = session.user_id === currentUser?.id
    const confirmMsg = isOwnUser
      ? 'Esto cerrará TODAS tus sesiones, incluida esta. ¿Continuar?'
      : `¿Cerrar TODAS las sesiones de ${session.user_full_name}?`
    if (!window.confirm(confirmMsg)) return
    try {
      await revokeUserSessions(session.user_id)
      flash('ok', `Sesiones de ${session.user_full_name} cerradas.`)
      loadSessions()
    } catch (err) {
      flash('err', err.response?.data?.detail || 'Error al cerrar las sesiones.')
    }
  }

  return (
    <div>
      {banner && (
        <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm font-medium border
          ${banner.type === 'ok' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
          {banner.msg}
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-xs text-ink-3">
          {sessions.length} sesión{sessions.length !== 1 ? 'es' : ''} activa{sessions.length !== 1 ? 's' : ''}
        </span>
        <button onClick={loadSessions} className="btn-secondary text-xs px-3 py-1.5">↻ Actualizar</button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-pink-light border-b border-line">
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Usuario</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Dispositivo</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pink-dark">IP</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Inició sesión</th>
              <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pink-dark">Última actividad</th>
              <th className="px-4 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-pink-dark w-32">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-10 text-ink-3 text-sm">Cargando…</td></tr>
            ) : sessions.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-ink-3 text-sm">No hay sesiones activas.</td></tr>
            ) : sessions.map(s => (
              <tr key={s.id} className="border-b border-line hover:bg-surface">
                <td className="px-4 py-2.5 text-sm font-medium text-ink">
                  {s.user_full_name}<br /><span className="text-ink-3 text-xs">{s.user_email}</span>
                </td>
                <td className="px-4 py-2.5 text-sm text-ink-2">{s.device_label}</td>
                <td className="px-4 py-2.5 text-sm text-ink-3">{s.ip_address}</td>
                <td className="px-4 py-2.5 text-sm text-ink-3">{fmtRelativeTime(s.created_at)}</td>
                <td className="px-4 py-2.5 text-sm text-ink-3">{fmtRelativeTime(s.last_seen_at)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-center gap-1">
                    <ActionBtn onClick={() => handleRevoke(s)} title="Cerrar esta sesión" danger>🗑</ActionBtn>
                    <ActionBtn onClick={() => handleRevokeAllForUser(s)} title="Cerrar todas las sesiones de este usuario" danger>⛔</ActionBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Gate the tab to superusers and render the section**

Current (lines 1228-1266):
```jsx
const TABS = [
  { id: 'refs',    label: 'Referencias', short: 'Refs',    icon: '≡' },
  { id: 'cats',    label: 'Categorías',  short: 'Cats',    icon: '🏷' },
  { id: 'cols',    label: 'Colecciones', short: 'Cols',    icon: '📦' },
  { id: 'clients', label: 'Clientes',    short: 'Clientes', icon: '🏪' },
  { id: 'users',   label: 'Usuarios',    short: 'Usuarios', icon: '👤' },
]

export default function AdminPage() {
  const [tab, setTab] = useState('refs')

  return (
    <div>
      <div className="mb-4 sm:mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-ink">Administración</h1>
        <p className="text-ink-3 text-sm">Gestiona referencias, colecciones y usuarios.</p>
      </div>

      <div className="flex gap-0 border-b border-line mb-4 sm:mb-6 overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1 px-3 sm:px-5 py-2.5 sm:py-3
              text-[11px] sm:text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap flex-1 sm:flex-none justify-center sm:justify-start
              ${tab === t.id ? 'text-pink-dark border-pink bg-pink-light/40 sm:bg-transparent' : 'text-ink-3 border-transparent hover:text-ink-2'}`}>
            <span className="text-sm sm:text-base">{t.icon}</span>
            <span className="hidden xs:inline sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'refs'    && <RefsSection />}
      {tab === 'cats'    && <CatsSection />}
      {tab === 'cols'    && <ColsSection />}
      {tab === 'clients' && <ClientsSection />}
      {tab === 'users'   && <UsersSection />}
    </div>
  )
}
```

Change to:
```jsx
const BASE_TABS = [
  { id: 'refs',    label: 'Referencias', short: 'Refs',    icon: '≡' },
  { id: 'cats',    label: 'Categorías',  short: 'Cats',    icon: '🏷' },
  { id: 'cols',    label: 'Colecciones', short: 'Cols',    icon: '📦' },
  { id: 'clients', label: 'Clientes',    short: 'Clientes', icon: '🏪' },
  { id: 'users',   label: 'Usuarios',    short: 'Usuarios', icon: '👤' },
]

export default function AdminPage() {
  const [tab, setTab] = useState('refs')
  const { user: currentUser } = useAuthStore()

  const tabs = currentUser?.is_superuser
    ? [...BASE_TABS, { id: 'sessions', label: 'Sesiones', short: 'Sesiones', icon: '🔐' }]
    : BASE_TABS

  return (
    <div>
      <div className="mb-4 sm:mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-ink">Administración</h1>
        <p className="text-ink-3 text-sm">Gestiona referencias, colecciones y usuarios.</p>
      </div>

      <div className="flex gap-0 border-b border-line mb-4 sm:mb-6 overflow-x-auto scrollbar-none">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1 px-3 sm:px-5 py-2.5 sm:py-3
              text-[11px] sm:text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap flex-1 sm:flex-none justify-center sm:justify-start
              ${tab === t.id ? 'text-pink-dark border-pink bg-pink-light/40 sm:bg-transparent' : 'text-ink-3 border-transparent hover:text-ink-2'}`}>
            <span className="text-sm sm:text-base">{t.icon}</span>
            <span className="hidden xs:inline sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab === 'refs'     && <RefsSection />}
      {tab === 'cats'     && <CatsSection />}
      {tab === 'cols'     && <ColsSection />}
      {tab === 'clients'  && <ClientsSection />}
      {tab === 'users'    && <UsersSection />}
      {tab === 'sessions' && currentUser?.is_superuser && <SessionsSection />}
    </div>
  )
}
```

- [ ] **Step 4: Verify in the browser**

Run: `cd tixy_frontend && npm run dev`, log in as the superuser
(`fredy.hortua@gmail.com`), open **Administración**.
Expected:
- The "Sesiones" tab appears (it would not appear for a non-superuser
  admin — if you have a second admin account, confirm it's hidden there).
- Clicking it shows a table with at least the current browser's session
  (device label matching your browser/OS, e.g. "Chrome en macOS").
- Clicking 🗑 on that row, after confirming the dialog, removes it from the
  list and (per Task 6/7) immediately logs you out on the next API call —
  confirm you're redirected to `/login` (the existing 401 interceptor in
  `tixy_frontend/src/api/client.js` already handles this with no new code).

- [ ] **Step 5: Commit**

```bash
git add tixy_frontend/src/pages/AdminPage.jsx
git commit -m "feat: add superuser-only Sesiones tab to admin panel"
```

---

## Deployment checklist (not a code task — do this when shipping)

1. Run `tixy_backend/migrate_sessions_20260722.sql` against the **Railway**
   MySQL instance (same file used in Task 1, same idempotent
   `CREATE TABLE IF NOT EXISTS`) — **before** deploying the new backend
   code, matching the existing `migrate_production.sql` convention.
2. Deploy backend + frontend as usual (push to `main`, Railway + Vercel
   auto-deploy).
3. **Expect every currently logged-in user to be logged out once** — old
   tokens have no `jti`. Give the team (Andrea, Edison, Carlos, yourself)
   a heads-up before deploying, same as after the `SECRET_KEY` rotation.
4. After deploy, confirm the "Sesiones" tab is reachable in production as
   the superuser and shows your own fresh session.
