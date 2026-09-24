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
