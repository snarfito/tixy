# Catálogo de Imágenes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let vendors browse product photos by reference/collection in a new "Catálogo" tab, and let admins (Edison/Andrea) bulk-upload, associate, replace, and delete those photos from a new "Colección" section inside Administración.

**Architecture:** Two new MySQL tables (`catalog_images`, many-to-many join `catalog_image_references`) behind a new FastAPI router. Uploads are proxied through the backend: Pillow resizes/converts to WebP (full + thumbnail), then `boto3` pushes both to a Cloudflare R2 bucket; only the R2 object keys are stored in MySQL. Reads (vendor browsing) hit R2 directly by URL — never proxied through the backend. Frontend adds one vendor-facing page (grid + code search + full-screen viewer with arrow nav) and one admin section (drag-and-drop upload + association editor).

**Tech Stack:** FastAPI + SQLAlchemy + MySQL (existing), Pillow + boto3 (new backend deps), Cloudflare R2 (new external service), React + Tailwind (existing, no new frontend deps).

**Spec:** `docs/superpowers/specs/2026-09-24-catalog-images-design.md`

## Global Constraints

- Reads (`GET`) use `require_vendor` (admin+manager+vendor); writes use `require_admin` — exactly the pattern already used in `routers/references.py`/`routers/collections.py`. No new permission logic.
- No manual `ALTER TABLE` migration: the two new tables are created automatically by the existing `Base.metadata.create_all(bind=engine)` call in `main.py`, the same mechanism that created every other table in this project — confirmed by `OrderLine.reference_id = ForeignKey("references.id")` already working this way.
- `references` is a reserved-ish MySQL identifier; SQLAlchemy already quotes it correctly elsewhere in this codebase (`models/order.py`) — no special handling needed beyond using `ForeignKey("references.id")` as-is.
- No manual crop tool, no download/share button, no order-form preview — explicitly out of scope per the spec.
- Deleting a collection's catalog images never deletes the `Collection` or `Reference` rows.
- No new test framework: this repo has zero existing test files. Follow its actual verification convention (a small standalone script run against the live local docker-compose stack, per the precedent noted in project memory for the order-edit feature) plus `assert`-based self-checks for pure functions. Do not introduce pytest, moto, or a SQLite test-DB harness.

---

### Task 1: Image processing (Pillow)

**Files:**
- Create: `tixy_backend/backend/core/catalog_image_processing.py`
- Modify: `tixy_backend/backend/requirements.txt`

**Interfaces:**
- Produces: `process_image(raw_bytes: bytes) -> tuple[bytes, bytes]` — returns `(full_webp_bytes, thumb_webp_bytes)`. Used by Task 5.

- [ ] **Step 1: Add Pillow to requirements**

Add this line to `tixy_backend/backend/requirements.txt` (keep alphabetical-ish grouping consistent with the rest of the file, just append at the end):

```
Pillow==11.0.0
```

- [ ] **Step 2: Install it and confirm the import works**

Run (from `tixy_backend/backend`, using the project's existing venv or inside the backend container):

```bash
pip install -r requirements.txt
python3 -c "from PIL import Image; print(Image.__name__)"
```

Expected: prints `Image`, no `ModuleNotFoundError`.

- [ ] **Step 3: Write `core/catalog_image_processing.py`**

```python
"""
Redimensiona y convierte a WebP las imagenes del catalogo.
Full: max 1600px en el lado mas largo. Thumb: max 400px. Calidad 82.
"""
import io

from PIL import Image

_FULL_MAX_SIDE  = 1600
_THUMB_MAX_SIDE = 400
_QUALITY = 82


def _resize_to_webp(img: Image.Image, max_side: int) -> bytes:
    resized = img.copy()
    resized.thumbnail((max_side, max_side), Image.LANCZOS)
    if resized.mode not in ("RGB", "RGBA"):
        resized = resized.convert("RGB")
    buf = io.BytesIO()
    resized.save(buf, format="WEBP", quality=_QUALITY)
    return buf.getvalue()


def process_image(raw_bytes: bytes) -> tuple[bytes, bytes]:
    """Recibe los bytes originales de una imagen subida y devuelve
    (full_webp_bytes, thumb_webp_bytes). Lanza PIL.UnidentifiedImageError
    si `raw_bytes` no es una imagen valida (el router la traduce a 400)."""
    img = Image.open(io.BytesIO(raw_bytes))
    img.load()  # fuerza la lectura completa antes de que el buffer se cierre
    full  = _resize_to_webp(img, _FULL_MAX_SIDE)
    thumb = _resize_to_webp(img, _THUMB_MAX_SIDE)
    return full, thumb


def _demo():
    """Self-check: genera una imagen sintetica y valida el resize + formato."""
    src = Image.new("RGB", (3000, 2000), color=(200, 50, 100))
    buf = io.BytesIO()
    src.save(buf, format="PNG")

    full, thumb = process_image(buf.getvalue())

    full_img = Image.open(io.BytesIO(full))
    assert full_img.format == "WEBP", full_img.format
    assert max(full_img.size) == _FULL_MAX_SIDE, full_img.size

    thumb_img = Image.open(io.BytesIO(thumb))
    assert thumb_img.format == "WEBP", thumb_img.format
    assert max(thumb_img.size) == _THUMB_MAX_SIDE, thumb_img.size

    # una imagen ya mas chica que el max no debe agrandarse
    small_src = Image.new("RGB", (100, 150), color=(0, 0, 0))
    small_buf = io.BytesIO()
    small_src.save(small_buf, format="PNG")
    small_full, _ = process_image(small_buf.getvalue())
    small_full_img = Image.open(io.BytesIO(small_full))
    assert small_full_img.size == (100, 150), small_full_img.size

    print("OK: process_image redimensiona y convierte a WebP correctamente")


if __name__ == "__main__":
    _demo()
```

- [ ] **Step 4: Run the self-check**

```bash
cd tixy_backend/backend
python3 core/catalog_image_processing.py
```

Expected: `OK: process_image redimensiona y convierte a WebP correctamente`, no `AssertionError`.

- [ ] **Step 5: Commit**

```bash
git add tixy_backend/backend/requirements.txt tixy_backend/backend/core/catalog_image_processing.py
git commit -m "feat: add image resize/WebP conversion for catalog uploads"
```

---

### Task 2: Cloudflare R2 storage setup

**Files:**
- Create: `tixy_backend/backend/core/r2_storage.py`
- Modify: `tixy_backend/backend/core/config.py`
- Modify: `tixy_backend/backend/requirements.txt`
- Modify: `tixy_backend/backend/.env` (local only, not committed)

**Interfaces:**
- Produces: `upload_bytes(key: str, data: bytes, content_type: str = "image/webp") -> None`, `delete_object(key: str) -> None`, `public_url(key: str) -> str`. Used by Task 5.

- [ ] **Step 1 (human action): create the R2 bucket and API token**

1. Log into the Cloudflare dashboard → **R2** → **Create bucket**. Name it e.g. `tixy-catalog`.
2. Bucket **Settings** → **Public access** → enable it (use the `r2.dev` subdomain for now; a custom domain can be added later without any code change). Copy the public base URL it gives you (e.g. `https://pub-xxxxxxxx.r2.dev`).
3. **R2** → **Manage API tokens** → create a token scoped to this bucket with **Object Read & Write** permission. Copy the **Account ID**, **Access Key ID**, and **Secret Access Key** — the secret is shown only once.

- [ ] **Step 2: Add the env vars locally**

Add to `tixy_backend/backend/.env` (create the keys, do not commit this file — it's already gitignored):

```
R2_ACCOUNT_ID=<account id from step 1>
R2_ACCESS_KEY_ID=<access key id from step 1>
R2_SECRET_ACCESS_KEY=<secret from step 1>
R2_BUCKET=tixy-catalog
R2_PUBLIC_BASE_URL=<public base url from step 1>
```

- [ ] **Step 3: Add the settings fields**

In `tixy_backend/backend/core/config.py`, add inside the `Settings` class (after the `FRONTEND_URL` line):

```python
    # Cloudflare R2 — almacenamiento de imagenes del catalogo
    R2_ACCOUNT_ID:         str = ""
    R2_ACCESS_KEY_ID:      str = ""
    R2_SECRET_ACCESS_KEY:  str = ""
    R2_BUCKET:             str = ""
    R2_PUBLIC_BASE_URL:    str = ""
```

(Defaults to empty string, not required, so the app keeps booting locally for anyone who hasn't configured R2 yet — the catalog endpoints will just fail loudly if used without it.)

- [ ] **Step 4: Add boto3 to requirements**

Append to `tixy_backend/backend/requirements.txt`:

```
boto3==1.35.74
```

Run:

```bash
cd tixy_backend/backend
pip install -r requirements.txt
python3 -c "import boto3; print(boto3.__version__)"
```

Expected: prints a version, no `ModuleNotFoundError`.

- [ ] **Step 5: Write `core/r2_storage.py`**

```python
"""
Cliente S3-compatible para subir/borrar objetos en Cloudflare R2.
Requiere las variables R2_* en el .env (ver core/config.py) — ver
docs/superpowers/specs/2026-09-24-catalog-images-design.md para como
crear el bucket y el token de API.
"""
import boto3

from core.config import settings


def _client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )


def upload_bytes(key: str, data: bytes, content_type: str = "image/webp") -> None:
    _client().put_object(Bucket=settings.R2_BUCKET, Key=key, Body=data, ContentType=content_type)


def delete_object(key: str) -> None:
    _client().delete_object(Bucket=settings.R2_BUCKET, Key=key)


def public_url(key: str) -> str:
    return f"{settings.R2_PUBLIC_BASE_URL.rstrip('/')}/{key}"


if __name__ == "__main__":
    # Smoke test manual contra el bucket real — requiere las 5 variables
    # R2_* ya configuradas en .env. Uso: python3 core/r2_storage.py
    test_key = "catalog/_smoke_test/ping.txt"
    upload_bytes(test_key, b"ping", content_type="text/plain")
    print(f"OK: subido a {public_url(test_key)} (abrilo en el navegador para confirmar)")
    delete_object(test_key)
    print("OK: borrado")
```

- [ ] **Step 6: Run the smoke test against the real bucket**

```bash
cd tixy_backend/backend
python3 core/r2_storage.py
```

Expected: two `OK:` lines. Open the printed URL in a browser before the delete line would remove it — or comment out the last two lines temporarily to check it loads, then re-run to clean up. Confirm the object also disappears from the R2 dashboard after the script finishes.

- [ ] **Step 7: Commit**

```bash
git add tixy_backend/backend/requirements.txt tixy_backend/backend/core/config.py tixy_backend/backend/core/r2_storage.py
git commit -m "feat: add Cloudflare R2 storage client for catalog images"
```

(`.env` is gitignored and never committed — the 5 variables also need to be added to Railway's environment in Task 10.)

---

### Task 3: Data models

**Files:**
- Create: `tixy_backend/backend/models/catalog_image.py`
- Modify: `tixy_backend/backend/models/__init__.py`

**Interfaces:**
- Produces: `CatalogImage` (fields: `id`, `collection_id`, `storage_key`, `thumb_key`, `created_at`), `catalog_image_references` (SQLAlchemy `Table` with columns `image_id`, `reference_id`). Used by Task 5.

- [ ] **Step 1: Write `models/catalog_image.py`**

```python
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
```

- [ ] **Step 2: Register it in `models/__init__.py`**

Add this line to `tixy_backend/backend/models/__init__.py` (after the `Order` import line), for consistency with how every other model is listed there:

```python
from models.catalog_image import CatalogImage, catalog_image_references
```

- [ ] **Step 3: Verify it imports cleanly**

```bash
cd tixy_backend/backend
python3 -c "from models.catalog_image import CatalogImage, catalog_image_references; print(CatalogImage.__tablename__, catalog_image_references.name)"
```

Expected: `catalog_images catalog_image_references`, no error.

- [ ] **Step 4: Commit**

```bash
git add tixy_backend/backend/models/catalog_image.py tixy_backend/backend/models/__init__.py
git commit -m "feat: add CatalogImage model and image-reference join table"
```

---

### Task 4: Schemas

**Files:**
- Create: `tixy_backend/backend/schemas/catalog_image.py`

**Interfaces:**
- Produces: `CatalogImageOut`, `CatalogImageCoverOut`, `CatalogImageReferencesUpdate`. Used by Task 5.

- [ ] **Step 1: Write `schemas/catalog_image.py`**

```python
from pydantic import BaseModel


class CatalogImageOut(BaseModel):
    id:            int
    collection_id: int
    full_url:      str
    thumb_url:     str
    reference_ids: list[int]


class CatalogImageCoverOut(BaseModel):
    """Una portada por referencia, para la grilla del catalogo."""
    reference_id: int
    code:         str
    thumb_url:    str


class CatalogImageReferencesUpdate(BaseModel):
    """Reemplaza el set completo de referencias asociadas a una imagen."""
    reference_ids: list[int]
```

- [ ] **Step 2: Verify it imports cleanly**

```bash
cd tixy_backend/backend
python3 -c "from schemas.catalog_image import CatalogImageOut, CatalogImageCoverOut, CatalogImageReferencesUpdate; print('ok')"
```

Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add tixy_backend/backend/schemas/catalog_image.py
git commit -m "feat: add catalog image schemas"
```

---

### Task 5: API endpoints

**Files:**
- Create: `tixy_backend/backend/routers/catalog_images.py`
- Modify: `tixy_backend/backend/routers/collections.py`
- Modify: `tixy_backend/backend/main.py`

**Interfaces:**
- Consumes: `process_image(raw_bytes) -> (full_bytes, thumb_bytes)` (Task 1); `upload_bytes(key, data, content_type=...)`, `delete_object(key)`, `public_url(key) -> str` (Task 2); `CatalogImage`, `catalog_image_references` (Task 3); `CatalogImageOut`, `CatalogImageCoverOut`, `CatalogImageReferencesUpdate` (Task 4).
- Produces: the 7 HTTP endpoints listed below. Used by Task 6 (verification script) and Task 7 (frontend API client).

Endpoints:
- `GET /catalog-images/covers?collection_id=` *(require_vendor)*
- `GET /catalog-images/by-reference/{reference_id}` *(require_vendor)*
- `POST /catalog-images/` *(require_admin)* — multipart form: `collection_id`, `reference_ids` (CSV string, may be empty), `file`
- `PATCH /catalog-images/{image_id}/references` *(require_admin)* — JSON `{reference_ids: [...]}`
- `PUT /catalog-images/{image_id}` *(require_admin)* — multipart form: `file`
- `DELETE /catalog-images/{image_id}` *(require_admin)*
- `DELETE /collections/{collection_id}/catalog-images` *(require_admin)* — added to `routers/collections.py`, not `catalog_images.py`, since it's collection-scoped

- [ ] **Step 1: Write `routers/catalog_images.py`**

```python
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from PIL import UnidentifiedImageError
from sqlalchemy.orm import Session

from core.catalog_image_processing import process_image
from core.database import get_db
from core.deps import require_admin, require_vendor
from core.r2_storage import delete_object, public_url, upload_bytes
from models.catalog_image import CatalogImage, catalog_image_references
from models.collection import Collection
from models.reference import Reference
from models.user import User
from schemas.catalog_image import CatalogImageCoverOut, CatalogImageOut, CatalogImageReferencesUpdate

router = APIRouter(prefix="/catalog-images", tags=["catalog-images"])


def _serialize(image: CatalogImage, db: Session) -> CatalogImageOut:
    ref_ids = [
        row.reference_id for row in
        db.query(catalog_image_references.c.reference_id)
        .filter(catalog_image_references.c.image_id == image.id)
        .all()
    ]
    return CatalogImageOut(
        id=image.id,
        collection_id=image.collection_id,
        full_url=public_url(image.storage_key),
        thumb_url=public_url(image.thumb_key),
        reference_ids=ref_ids,
    )


def _validate_reference_ids(db: Session, reference_ids: list[int], collection_id: int) -> None:
    if not reference_ids:
        return
    found_ids = {
        r.id for r in
        db.query(Reference.id).filter(
            Reference.id.in_(reference_ids), Reference.collection_id == collection_id
        ).all()
    }
    missing = set(reference_ids) - found_ids
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Referencias no encontradas en esta colección: {sorted(missing)}",
        )


def _process_or_400(raw: bytes) -> tuple[bytes, bytes]:
    try:
        return process_image(raw)
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="El archivo no es una imagen válida")


@router.get("/covers", response_model=list[CatalogImageCoverOut])
def list_covers(
    collection_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_vendor),
):
    """Una portada (primera imagen) por cada referencia de la colección que
    tenga foto. No filtra por is_active: colecciones/referencias antiguas
    se mantienen navegables a propósito (pedido explícito del cliente)."""
    rows = (
        db.query(Reference.id, Reference.code, CatalogImage.id, CatalogImage.thumb_key)
        .join(catalog_image_references, catalog_image_references.c.reference_id == Reference.id)
        .join(CatalogImage, CatalogImage.id == catalog_image_references.c.image_id)
        .filter(Reference.collection_id == collection_id)
        .order_by(Reference.code, CatalogImage.id)
        .all()
    )
    covers: dict[int, CatalogImageCoverOut] = {}
    for ref_id, code, _image_id, thumb_key in rows:
        if ref_id not in covers:
            covers[ref_id] = CatalogImageCoverOut(reference_id=ref_id, code=code, thumb_url=public_url(thumb_key))
    return list(covers.values())


@router.get("/by-reference/{reference_id}", response_model=list[CatalogImageOut])
def list_by_reference(
    reference_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_vendor),
):
    images = (
        db.query(CatalogImage)
        .join(catalog_image_references, catalog_image_references.c.image_id == CatalogImage.id)
        .filter(catalog_image_references.c.reference_id == reference_id)
        .order_by(CatalogImage.id)
        .all()
    )
    return [_serialize(img, db) for img in images]


@router.post("/", response_model=CatalogImageOut, status_code=201)
async def upload_image(
    collection_id: int = Form(...),
    reference_ids: str = Form(""),  # CSV de ids, ej. "12,13" — puede venir vacio
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen")

    collection = db.get(Collection, collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Colección no encontrada")

    ref_ids = [int(x) for x in reference_ids.split(",") if x.strip()]
    _validate_reference_ids(db, ref_ids, collection_id)

    raw = await file.read()
    full_bytes, thumb_bytes = _process_or_400(raw)

    image = CatalogImage(collection_id=collection_id, storage_key="", thumb_key="")
    db.add(image)
    db.flush()  # asigna image.id sin comprometer la transaccion todavia

    full_key  = f"catalog/{collection_id}/{image.id}/full.webp"
    thumb_key = f"catalog/{collection_id}/{image.id}/thumb.webp"
    upload_bytes(full_key, full_bytes)
    upload_bytes(thumb_key, thumb_bytes)

    image.storage_key = full_key
    image.thumb_key   = thumb_key
    for ref_id in ref_ids:
        db.execute(catalog_image_references.insert().values(image_id=image.id, reference_id=ref_id))
    db.commit()
    db.refresh(image)
    return _serialize(image, db)


@router.patch("/{image_id}/references", response_model=CatalogImageOut)
def update_references(
    image_id: int,
    payload: CatalogImageReferencesUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    image = db.get(CatalogImage, image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Imagen no encontrada")

    _validate_reference_ids(db, payload.reference_ids, image.collection_id)

    db.execute(catalog_image_references.delete().where(catalog_image_references.c.image_id == image_id))
    for ref_id in payload.reference_ids:
        db.execute(catalog_image_references.insert().values(image_id=image_id, reference_id=ref_id))
    db.commit()
    db.refresh(image)
    return _serialize(image, db)


@router.put("/{image_id}", response_model=CatalogImageOut)
async def replace_image(
    image_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen")

    image = db.get(CatalogImage, image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Imagen no encontrada")

    raw = await file.read()
    full_bytes, thumb_bytes = _process_or_400(raw)
    upload_bytes(image.storage_key, full_bytes)
    upload_bytes(image.thumb_key, thumb_bytes)
    return _serialize(image, db)


@router.delete("/{image_id}", status_code=204)
def delete_image(
    image_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    image = db.get(CatalogImage, image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Imagen no encontrada")

    delete_object(image.storage_key)
    delete_object(image.thumb_key)
    db.delete(image)
    db.commit()
```

- [ ] **Step 2: Add the collection-scoped clear endpoint to `routers/collections.py`**

Add these two imports near the top of `tixy_backend/backend/routers/collections.py` (alongside the existing `from models...` imports):

```python
from core.r2_storage import delete_object
from models.catalog_image import CatalogImage
```

Then append this endpoint at the end of the file:

```python
@router.delete("/{col_id}/catalog-images", status_code=204)
def clear_catalog_images(
    col_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Vacia el catalogo de imagenes de esta coleccion para liberar espacio.
    No borra la coleccion ni sus referencias."""
    col = db.get(Collection, col_id)
    if not col:
        raise HTTPException(status_code=404, detail="Colección no encontrada")

    images = db.query(CatalogImage).filter(CatalogImage.collection_id == col_id).all()
    for image in images:
        delete_object(image.storage_key)
        delete_object(image.thumb_key)
        db.delete(image)
    db.commit()
```

- [ ] **Step 3: Wire the new router into `main.py`**

In `tixy_backend/backend/main.py`, change:

```python
from routers import auth, users, collections, references, clients, orders, pdf, categories, sessions
```

to:

```python
from routers import auth, users, collections, references, clients, orders, pdf, categories, sessions, catalog_images
```

And add, alongside the other `app.include_router(...)` lines:

```python
app.include_router(catalog_images.router)
```

- [ ] **Step 4: Start the backend and confirm the tables get created**

```bash
cd tixy_backend
docker compose up -d --build
docker compose exec db mysql -utixy -ptixy_pass tixy -e "SHOW TABLES LIKE 'catalog%';"
```

Expected: lists both `catalog_images` and `catalog_image_references`.

- [ ] **Step 5: Confirm the endpoints are registered**

```bash
curl -s http://localhost:8000/openapi.json | python3 -c "import json,sys; paths=json.load(sys.stdin)['paths']; print([p for p in paths if 'catalog' in p])"
```

Expected: a list containing `/catalog-images/covers`, `/catalog-images/by-reference/{reference_id}`, `/catalog-images/`, `/catalog-images/{image_id}/references`, `/catalog-images/{image_id}`, and `/collections/{col_id}/catalog-images`.

- [ ] **Step 6: Commit**

```bash
git add tixy_backend/backend/routers/catalog_images.py tixy_backend/backend/routers/collections.py tixy_backend/backend/main.py
git commit -m "feat: add catalog image endpoints"
```

---

### Task 6: Backend end-to-end verification script

**Files:**
- Create: `tixy_backend/backend/verify_catalog_images.py`

**Interfaces:**
- Consumes: all 7 endpoints from Task 5, real R2 credentials from Task 2, a real local ADMIN account.

This mirrors how the order-edit feature was verified in this project (a standalone script against the live local stack) rather than introducing a test framework this repo has never used.

- [ ] **Step 1: Write `verify_catalog_images.py`**

```python
"""
Verificacion manual end-to-end del catalogo de imagenes.
Requiere: backend corriendo (docker compose up), credenciales R2
configuradas (Task 2), y un usuario ADMIN local.

Uso:
  cd tixy_backend/backend
  python3 verify_catalog_images.py <admin_email> <admin_password>
"""
import io
import sys

import httpx
from PIL import Image

BASE_URL = "http://localhost:8000"


def _login(email: str, password: str) -> str:
    r = httpx.post(f"{BASE_URL}/auth/login", data={"username": email, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


def _synthetic_image_bytes() -> bytes:
    img = Image.new("RGB", (800, 1200), color=(120, 40, 90))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def main(email: str, password: str) -> None:
    token = _login(email, password)
    headers = {"Authorization": f"Bearer {token}"}

    col = httpx.post(
        f"{BASE_URL}/collections/",
        json={"name": "TEST catálogo", "year": 2099, "season": 1},
        headers=headers,
    )
    col.raise_for_status()
    collection_id = col.json()["id"]
    print(f"OK: colección de prueba creada (id={collection_id})")

    ref = httpx.post(
        f"{BASE_URL}/references/",
        json={"code": "TEST-001", "description": "Ref de prueba", "category": "Otro",
              "base_price": 1000, "collection_id": collection_id},
        headers=headers,
    )
    ref.raise_for_status()
    reference_id = ref.json()["id"]
    print(f"OK: referencia de prueba creada (id={reference_id})")

    files = {"file": ("test.png", _synthetic_image_bytes(), "image/png")}
    data = {"collection_id": str(collection_id), "reference_ids": ""}
    up = httpx.post(f"{BASE_URL}/catalog-images/", data=data, files=files, headers=headers, timeout=30)
    up.raise_for_status()
    image = up.json()
    image_id = image["id"]
    assert image["reference_ids"] == [], image
    print(f"OK: imagen subida a R2 (id={image_id}, full={image['full_url']})")

    patch = httpx.patch(
        f"{BASE_URL}/catalog-images/{image_id}/references",
        json={"reference_ids": [reference_id]}, headers=headers,
    )
    patch.raise_for_status()
    assert patch.json()["reference_ids"] == [reference_id], patch.json()
    print("OK: asociación imagen↔referencia")

    by_ref = httpx.get(f"{BASE_URL}/catalog-images/by-reference/{reference_id}", headers=headers)
    by_ref.raise_for_status()
    assert len(by_ref.json()) == 1, by_ref.json()
    print("OK: GET by-reference devuelve la imagen")

    covers = httpx.get(f"{BASE_URL}/catalog-images/covers", params={"collection_id": collection_id}, headers=headers)
    covers.raise_for_status()
    assert any(c["reference_id"] == reference_id for c in covers.json()), covers.json()
    print("OK: GET covers incluye la referencia")

    files2 = {"file": ("test2.png", _synthetic_image_bytes(), "image/png")}
    put = httpx.put(f"{BASE_URL}/catalog-images/{image_id}", files=files2, headers=headers, timeout=30)
    put.raise_for_status()
    print("OK: reemplazo de imagen")

    no_auth = httpx.post(f"{BASE_URL}/catalog-images/", data=data, files=files, timeout=30)
    assert no_auth.status_code == 401, no_auth.status_code
    print("OK: subir sin token devuelve 401")

    clear = httpx.delete(f"{BASE_URL}/collections/{collection_id}/catalog-images", headers=headers)
    clear.raise_for_status()
    by_ref_after = httpx.get(f"{BASE_URL}/catalog-images/by-reference/{reference_id}", headers=headers)
    assert by_ref_after.json() == [], by_ref_after.json()
    print("OK: vaciar catálogo de la colección borra las imágenes")

    print("\nTODO OK — borrá manualmente la colección/referencia TEST desde /admin si querés dejar todo limpio.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python3 verify_catalog_images.py <admin_email> <admin_password>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
```

- [ ] **Step 2: Run it against the local stack**

```bash
cd tixy_backend/backend
python3 verify_catalog_images.py <tu_email_admin_local> <tu_password_admin_local>
```

Expected: a sequence of `OK:` lines ending in `TODO OK`. If any `assert` fails, the traceback names exactly which behavior broke.

- [ ] **Step 3: Commit**

```bash
git add tixy_backend/backend/verify_catalog_images.py
git commit -m "test: add end-to-end verification script for catalog images"
```

---

### Task 7: Frontend API client

**Files:**
- Create: `tixy_frontend/src/api/catalog.js`
- Modify: `tixy_frontend/src/api/orders.js`

**Interfaces:**
- Produces: `getCatalogCovers(collectionId)`, `getCatalogImagesByReference(referenceId)`, `uploadCatalogImage({file, collectionId, referenceIds})`, `updateCatalogImageReferences(imageId, referenceIds)`, `replaceCatalogImage(imageId, file)`, `deleteCatalogImage(imageId)`, `clearCollectionCatalog(collectionId)`, plus `getAllCollections()` added to `api/orders.js`. Used by Task 8 (Task 9 instead reuses `api/admin.js`'s existing `getCollections(activeOnly = false)`, which already returns all collections by default).

- [ ] **Step 1: Write `api/catalog.js`**

```javascript
import api from './client'

export const getCatalogCovers = (collectionId) =>
  api.get('/catalog-images/covers', { params: { collection_id: collectionId } }).then(r => r.data)

export const getCatalogImagesByReference = (referenceId) =>
  api.get(`/catalog-images/by-reference/${referenceId}`).then(r => r.data)

export const uploadCatalogImage = ({ file, collectionId, referenceIds = [] }) => {
  const form = new FormData()
  form.append('file', file)
  form.append('collection_id', collectionId)
  form.append('reference_ids', referenceIds.join(','))
  return api.post('/catalog-images/', form).then(r => r.data)
}

export const updateCatalogImageReferences = (imageId, referenceIds) =>
  api.patch(`/catalog-images/${imageId}/references`, { reference_ids: referenceIds }).then(r => r.data)

export const replaceCatalogImage = (imageId, file) => {
  const form = new FormData()
  form.append('file', file)
  return api.put(`/catalog-images/${imageId}`, form).then(r => r.data)
}

export const deleteCatalogImage = (imageId) =>
  api.delete(`/catalog-images/${imageId}`)

export const clearCollectionCatalog = (collectionId) =>
  api.delete(`/collections/${collectionId}/catalog-images`)
```

- [ ] **Step 2: Add `getAllCollections` to `api/orders.js`**

The existing `getCollections()` in `api/orders.js` calls `/collections/` with no params, so the backend's `active_only=True` default hides old/inactive collections. The catalog tab must still show those (client explicitly wants old catalogs to stay browsable), so add a sibling export. Insert this right after the existing `getCollections` export in `tixy_frontend/src/api/orders.js`:

```javascript
export const getAllCollections = () =>
  api.get('/collections/', { params: { active_only: false } }).then(r => r.data)
```

- [ ] **Step 3: Verify the frontend still builds**

```bash
cd tixy_frontend
npm run build
```

Expected: build succeeds, no import errors.

- [ ] **Step 4: Commit**

```bash
git add tixy_frontend/src/api/catalog.js tixy_frontend/src/api/orders.js
git commit -m "feat: add frontend API client for catalog images"
```

---

### Task 8: Vendor-facing "Catálogo" page

**Files:**
- Create: `tixy_frontend/src/pages/CatalogPage.jsx`
- Modify: `tixy_frontend/src/App.jsx`
- Modify: `tixy_frontend/src/components/AppLayout.jsx`

**Interfaces:**
- Consumes: `getAllCollections()` (Task 7), `getReferences({collection_id})` (existing, `api/orders.js`), `getCatalogCovers(collectionId)`, `getCatalogImagesByReference(referenceId)` (Task 7).

- [ ] **Step 1: Write `pages/CatalogPage.jsx`**

```jsx
import { useState, useEffect, useMemo } from 'react'
import { getAllCollections, getReferences } from '../api/orders'
import { getCatalogCovers, getCatalogImagesByReference } from '../api/catalog'

export default function CatalogPage() {
  const [collections, setCollections] = useState([])
  const [collectionId, setCollectionId] = useState('')
  const [refs, setRefs] = useState([])       // todas las referencias de la colección, ordenadas por código
  const [covers, setCovers] = useState([])   // solo las que tienen imagen (para la grilla)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [viewerIndex, setViewerIndex] = useState(null)  // índice dentro de `refs`, o null si cerrado
  const [viewerImages, setViewerImages] = useState([])
  const [viewerLoading, setViewerLoading] = useState(false)

  useEffect(() => {
    getAllCollections().then(cols => {
      setCollections(cols)
      if (cols.length) setCollectionId(String(cols[0].id))
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!collectionId) return
    setViewerIndex(null)
    Promise.all([
      getReferences({ collection_id: collectionId }),
      getCatalogCovers(collectionId),
    ]).then(([refsData, coversData]) => {
      setRefs(refsData)
      setCovers(coversData)
    })
  }, [collectionId])

  useEffect(() => {
    if (viewerIndex === null) return
    const ref = refs[viewerIndex]
    if (!ref) return
    setViewerLoading(true)
    getCatalogImagesByReference(ref.id)
      .then(setViewerImages)
      .finally(() => setViewerLoading(false))
  }, [viewerIndex, refs])

  const filteredCovers = useMemo(() => {
    if (!search.trim()) return covers
    const q = search.trim().toLowerCase()
    return covers.filter(c => c.code.toLowerCase().includes(q))
  }, [covers, search])

  function openByReferenceId(referenceId) {
    const idx = refs.findIndex(r => r.id === referenceId)
    if (idx !== -1) setViewerIndex(idx)
  }

  function openBySearch() {
    const q = search.trim().toLowerCase()
    if (!q) return
    const match = refs.find(r => r.code.toLowerCase() === q) || refs.find(r => r.code.toLowerCase().includes(q))
    if (match) openByReferenceId(match.id)
  }

  const currentRef = viewerIndex !== null ? refs[viewerIndex] : null

  if (loading) return <p className="text-ink-3 text-sm">Cargando…</p>

  return (
    <div>
      <div className="mb-4 sm:mb-6">
        <h1 className="text-lg sm:text-xl font-semibold text-ink">Catálogo</h1>
        <p className="text-ink-3 text-sm">Explora las imágenes por colección y referencia.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <select value={collectionId} onChange={e => setCollectionId(e.target.value)}
          className="border border-line rounded-lg px-3 py-2 text-sm">
          {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div className="flex gap-2 flex-1">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && openBySearch()}
            placeholder="Buscar por código (ej. 110)"
            className="border border-line rounded-lg px-3 py-2 text-sm flex-1"
          />
          <button onClick={openBySearch} className="btn-secondary text-xs px-3">Buscar</button>
        </div>
      </div>

      {filteredCovers.length === 0 ? (
        <p className="text-ink-3 text-sm text-center py-10">No hay imágenes en esta colección todavía.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {filteredCovers.map(c => (
            <button key={c.reference_id} onClick={() => openByReferenceId(c.reference_id)}
              className="card overflow-hidden text-left">
              <img src={c.thumb_url} alt={c.code} className="w-full aspect-[2/3] object-cover" />
              <div className="px-2 py-1.5 text-xs font-medium text-ink">{c.code}</div>
            </button>
          ))}
        </div>
      )}

      {currentRef && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="text-sm font-semibold">{currentRef.code}</span>
            <button onClick={() => setViewerIndex(null)} className="text-2xl leading-none">×</button>
          </div>

          <div className="flex-1 flex items-center justify-center relative px-4">
            <button
              onClick={() => setViewerIndex(i => Math.max(0, i - 1))}
              disabled={viewerIndex === 0}
              className="absolute left-2 sm:left-6 text-white text-3xl disabled:opacity-20">‹</button>

            {viewerLoading ? (
              <p className="text-white/60 text-sm">Cargando…</p>
            ) : viewerImages.length === 0 ? (
              <p className="text-white/60 text-sm">Sin imágenes aún.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto max-w-full max-h-full">
                {viewerImages.map(img => (
                  <img key={img.id} src={img.full_url} alt={currentRef.code}
                    className="max-h-[80vh] object-contain rounded-lg" />
                ))}
              </div>
            )}

            <button
              onClick={() => setViewerIndex(i => Math.min(refs.length - 1, i + 1))}
              disabled={viewerIndex === refs.length - 1}
              className="absolute right-2 sm:right-6 text-white text-3xl disabled:opacity-20">›</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add the route in `App.jsx`**

Add the import:

```javascript
import CatalogPage from './pages/CatalogPage'
```

Add this route inside the protected `<Route element={...AppLayout}>` block, alongside `/pedido`/`/admin`/`/gerencia`:

```jsx
<Route path="/catalogo" element={
  <ProtectedRoute roles={['admin','vendor','manager']}>
    <CatalogPage />
  </ProtectedRoute>
}/>
```

- [ ] **Step 3: Add the nav entry in `AppLayout.jsx`**

Add `{ to: '/catalogo', label: 'Catálogo', icon: '🖼' }` to **all three** arrays in the `NAV` object (`admin`, `manager`, `vendor`), e.g.:

```javascript
const NAV = {
  admin:   [
    { to: '/pedido',   label: 'Orden de Pedido', icon: '📋' },
    { to: '/admin',    label: 'Administración',  icon: '⚙' },
    { to: '/gerencia', label: 'Gerencia',         icon: '📊' },
    { to: '/catalogo', label: 'Catálogo',         icon: '🖼' },
  ],
  manager: [
    { to: '/gerencia', label: 'Gerencia', icon: '📊' },
    { to: '/pedido',   label: 'Orden de Pedido', icon: '📋' },
    { to: '/catalogo', label: 'Catálogo', icon: '🖼' },
  ],
  vendor:  [
    { to: '/pedido',   label: 'Orden de Pedido', icon: '📋' },
    { to: '/catalogo', label: 'Catálogo', icon: '🖼' },
  ],
}
```

(Note: vendors currently have only 1 tab, so the nav bar is hidden for them today — `links.length > 1` in `AppLayout.jsx`. Adding this second entry makes the tab bar appear for vendors too, which is intended.)

- [ ] **Step 4: Manual check**

```bash
cd tixy_frontend
npm run dev
```

Log in as any role, confirm the "Catálogo" tab appears, the collection selector lists collections, and (once Task 9 has uploaded at least one image) the grid/search/viewer work. Until Task 9 ships, an empty collection is expected to show "No hay imágenes en esta colección todavía."

- [ ] **Step 5: Commit**

```bash
git add tixy_frontend/src/pages/CatalogPage.jsx tixy_frontend/src/App.jsx tixy_frontend/src/components/AppLayout.jsx
git commit -m "feat: add vendor-facing Catálogo tab"
```

---

### Task 9: Admin "Colección" section

**Files:**
- Create: `tixy_frontend/src/components/admin/CatalogSection.jsx`
- Modify: `tixy_frontend/src/pages/AdminPage.jsx`

**Interfaces:**
- Consumes: `getCollections(activeOnly = false)` (existing, `api/admin.js` — defaults to returning **all** collections, active and inactive, unlike the same-named function in `api/orders.js`), `getReferencesByCollection(collectionId)` (existing, `api/admin.js`), `uploadCatalogImage`, `updateCatalogImageReferences`, `replaceCatalogImage`, `deleteCatalogImage`, `clearCollectionCatalog` (Task 7), `getCatalogCovers`/`getCatalogImagesByReference` are not needed here — this section lists images by collection directly via a small local fetch loop described below.

Since there's no "list all images in a collection" endpoint (Task 5 only has "covers per reference" and "by reference"), this section builds its working list from the covers response is not enough either (it only has one image per reference, but a reference can have several, and unassociated images wouldn't show at all). Add one more endpoint before writing the frontend:

- [ ] **Step 1: Add `GET /catalog-images/by-collection/{collection_id}` to `routers/catalog_images.py`**

```python
@router.get("/by-collection/{collection_id}", response_model=list[CatalogImageOut])
def list_by_collection(
    collection_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Todas las imagenes de una coleccion, asociadas o no — para el panel
    de administracion (a diferencia de /covers, que es una por referencia)."""
    images = (
        db.query(CatalogImage)
        .filter(CatalogImage.collection_id == collection_id)
        .order_by(CatalogImage.id)
        .all()
    )
    return [_serialize(img, db) for img in images]
```

Run the openapi check again to confirm it registered:

```bash
cd tixy_backend/backend
docker compose restart backend
curl -s http://localhost:8000/openapi.json | python3 -c "import json,sys; print('/catalog-images/by-collection/{collection_id}' in json.load(sys.stdin)['paths'])"
```

Expected: `True`.

Commit this backend addition on its own before moving to the frontend:

```bash
git add tixy_backend/backend/routers/catalog_images.py
git commit -m "feat: add by-collection listing endpoint for catalog admin"
```

- [ ] **Step 2: Add the corresponding frontend call**

Add to `tixy_frontend/src/api/catalog.js`:

```javascript
export const getCatalogImagesByCollection = (collectionId) =>
  api.get(`/catalog-images/by-collection/${collectionId}`).then(r => r.data)
```

- [ ] **Step 3: Write `components/admin/CatalogSection.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react'
import { getCollections, getReferencesByCollection } from '../../api/admin'
import {
  getCatalogImagesByCollection, uploadCatalogImage, updateCatalogImageReferences,
  replaceCatalogImage, deleteCatalogImage, clearCollectionCatalog,
} from '../../api/catalog'

export default function CatalogSection() {
  const [collections,  setCollections]  = useState([])
  const [collectionId, setCollectionId] = useState('')
  const [refs,         setRefs]         = useState([])   // referencias de la coleccion, para resolver codigo -> id
  const [images,       setImages]       = useState([])
  const [uploading,    setUploading]    = useState(false)
  const [banner,       setBanner]       = useState(null)
  const [cacheBust,    setCacheBust]    = useState({})   // imageId -> contador, evita servir la foto vieja tras un reemplazo

  function flash(type, msg) { setBanner({ type, msg }); setTimeout(() => setBanner(null), 3000) }

  const refresh = useCallback(() => {
    if (!collectionId) return
    Promise.all([
      getReferencesByCollection(collectionId),
      getCatalogImagesByCollection(collectionId),
    ]).then(([refsData, imagesData]) => {
      setRefs(refsData)
      setImages(imagesData)
    })
  }, [collectionId])

  useEffect(() => {
    getCollections().then(cols => {
      setCollections(cols)
      if (cols.length) setCollectionId(String(cols[0].id))
    })
  }, [])

  useEffect(() => { refresh() }, [refresh])

  function codesToIds(text) {
    const codes = text.split(/[\s,]+/).map(c => c.trim()).filter(Boolean)
    const ids = []
    const unknown = []
    for (const code of codes) {
      const ref = refs.find(r => r.code.toLowerCase() === code.toLowerCase())
      if (ref) ids.push(ref.id)
      else unknown.push(code)
    }
    return { ids, unknown }
  }

  function idsToCodes(ids) {
    return ids.map(id => refs.find(r => r.id === id)?.code).filter(Boolean).join(' ')
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList)
    if (!files.length) return
    setUploading(true)
    const CONCURRENCY = 3
    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY)
      await Promise.allSettled(
        batch.map(file => uploadCatalogImage({ file, collectionId, referenceIds: [] }))
      )
    }
    setUploading(false)
    flash('ok', `✓ ${files.length} imagen(es) subida(s).`)
    refresh()
  }

  function handleDrop(e) {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  async function handleAssociate(imageId, text) {
    const { ids, unknown } = codesToIds(text)
    if (unknown.length) {
      flash('err', `Código(s) no encontrado(s) en esta colección: ${unknown.join(', ')}`)
      return
    }
    await updateCatalogImageReferences(imageId, ids)
    flash('ok', '✓ Asociación actualizada.')
    refresh()
  }

  async function handleReplace(imageId, file) {
    await replaceCatalogImage(imageId, file)
    setCacheBust(prev => ({ ...prev, [imageId]: (prev[imageId] || 0) + 1 }))
    flash('ok', '✓ Imagen reemplazada.')
  }

  async function handleDelete(imageId) {
    if (!confirm('¿Eliminar esta imagen? Esta acción no se puede deshacer.')) return
    await deleteCatalogImage(imageId)
    flash('ok', '✓ Imagen eliminada.')
    refresh()
  }

  async function handleClearCollection() {
    const col = collections.find(c => String(c.id) === collectionId)
    if (!confirm(`¿Vaciar TODO el catálogo de "${col?.name}"? Se eliminarán ${images.length} imagen(es). Esta acción no se puede deshacer.`)) return
    await clearCollectionCatalog(collectionId)
    flash('ok', '✓ Catálogo vaciado.')
    refresh()
  }

  function withCacheBust(url, imageId) {
    const v = cacheBust[imageId]
    if (!v) return url
    return `${url}${url.includes('?') ? '&' : '?'}v=${v}`
  }

  return (
    <div>
      {banner && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${banner.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {banner.msg}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select value={collectionId} onChange={e => setCollectionId(e.target.value)}
          className="border border-line rounded-lg px-3 py-2 text-sm">
          {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={handleClearCollection} className="btn-secondary text-xs px-3 py-1.5 text-red-600">
          🗑 Vaciar catálogo de esta colección
        </button>
      </div>

      <label
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        className="block border-2 border-dashed border-line rounded-xl p-8 text-center text-sm text-ink-3 cursor-pointer hover:border-pink mb-6"
      >
        {uploading ? 'Subiendo…' : 'Arrastra imágenes aquí, o haz clic para elegirlas'}
        <input type="file" accept="image/*" multiple className="hidden"
          onChange={e => handleFiles(e.target.files)} />
      </label>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {images.map(img => (
          <div key={img.id} className="card overflow-hidden">
            <img src={withCacheBust(img.thumb_url, img.id)} alt="" className="w-full aspect-[2/3] object-cover" />
            <div className="p-2 space-y-1.5">
              <input
                defaultValue={idsToCodes(img.reference_ids)}
                placeholder="códigos, ej. 110 111"
                onBlur={e => handleAssociate(img.id, e.target.value)}
                className="w-full border border-line rounded px-2 py-1 text-xs"
              />
              <div className="flex gap-1.5">
                <label className="btn-secondary text-[11px] px-2 py-1 flex-1 text-center cursor-pointer">
                  Reemplazar
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files[0] && handleReplace(img.id, e.target.files[0])} />
                </label>
                <button onClick={() => handleDelete(img.id)}
                  className="btn-secondary text-[11px] px-2 py-1 text-red-600">Eliminar</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {images.length === 0 && (
        <p className="text-ink-3 text-sm text-center py-10">Esta colección todavía no tiene imágenes.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wire it into `AdminPage.jsx`**

Add the import at the top of `tixy_frontend/src/pages/AdminPage.jsx`:

```javascript
import CatalogSection from '../components/admin/CatalogSection'
```

Add a new entry to `BASE_TABS`:

```javascript
const BASE_TABS = [
  { id: 'refs',    label: 'Referencias', short: 'Refs',    icon: '≡' },
  { id: 'cats',    label: 'Categorías',  short: 'Cats',    icon: '🏷' },
  { id: 'cols',    label: 'Colecciones', short: 'Cols',    icon: '📦' },
  { id: 'catalog', label: 'Colección',   short: 'Catálogo', icon: '🖼' },
  { id: 'clients', label: 'Clientes',    short: 'Clientes', icon: '🏪' },
  { id: 'users',   label: 'Usuarios',    short: 'Usuarios', icon: '👤' },
]
```

Add the render line next to the other `tab === '...'` lines:

```jsx
{tab === 'catalog'  && <CatalogSection />}
```

- [ ] **Step 5: Manual check**

```bash
cd tixy_frontend
npm run dev
```

Log in as an admin, go to Administración → Colección, drag in a couple of files from `CONJUNTOS DICIEMBRE/`, confirm they appear, type a real reference code from that collection into one image's association field and confirm it now shows up on the vendor-facing Catálogo tab (Task 8) for that reference. Try Reemplazar and confirm the thumbnail visibly updates without a hard refresh. Try Eliminar on one image. Finally try "Vaciar catálogo" and confirm all images disappear and the collection/references themselves are untouched (check the Colecciones/Referencias tabs still list them).

- [ ] **Step 6: Commit**

```bash
git add tixy_frontend/src/components/admin/CatalogSection.jsx tixy_frontend/src/pages/AdminPage.jsx tixy_frontend/src/api/catalog.js
git commit -m "feat: add admin Colección section for catalog image management"
```

---

### Task 10: Rollout

**Files:** none (ops/config only — Railway dashboard, no code)

- [ ] **Step 1: Add the 5 R2 env vars to Railway**

In the Railway project's backend service → **Variables**, add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` with the same values used locally in Task 2.

- [ ] **Step 2: Deploy**

Push to `main` (per this project's existing deploy flow — Vercel/Railway both auto-deploy on push, no staging). Confirm in the Railway deploy logs that the backend boots without errors.

- [ ] **Step 3: Confirm the tables exist in the prod DB**

```bash
railway connect mysql
```

then, inside the MySQL prompt:

```sql
SHOW TABLES LIKE 'catalog%';
```

Expected: both `catalog_images` and `catalog_image_references` — created automatically by `create_all` on boot, same as Task 5 confirmed locally.

- [ ] **Step 4: Real-data smoke test**

Log into the deployed app as admin, upload the actual images from `CONJUNTOS DICIEMBRE/` into a real collection, associate at least one to a real reference code, and confirm a vendor account can see it on `/catalogo`. Confirm the images load fast on a phone (this is the actual point of the WebP conversion — spot check the network tab shows KB-sized transfers, not the original ~1.7MB PNGs).

- [ ] **Step 5: Update project memory**

Note in the project's memory file that this feature shipped, R2 is now a dependency, and where the 5 env vars live (local `.env` + Railway) — following this project's existing habit of recording infra dependencies that aren't obvious from the code alone.
