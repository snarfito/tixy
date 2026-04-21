from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import require_admin, require_vendor
from models.reference import Reference
from models.user import User
from schemas.reference import (
    ReferenceCreate,
    ReferenceOut,
    ReferenceUpdate,
    ReferenceBulkUpdate,
    ReferenceBulkResult,
)

router = APIRouter(prefix="/references", tags=["references"])


@router.get("/", response_model=list[ReferenceOut])
def list_references(
    collection_id: Optional[int] = None,
    category:      Optional[str] = None,
    search:        Optional[str] = Query(None, description="Busca en código y descripción"),
    active_only:   bool = True,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_vendor),
):
    q = db.query(Reference)
    if active_only:
        q = q.filter(Reference.is_active == True)
    if collection_id:
        q = q.filter(Reference.collection_id == collection_id)
    if category:
        q = q.filter(Reference.category == category)
    if search:
        like = f"%{search}%"
        q = q.filter(
            Reference.code.ilike(like) | Reference.description.ilike(like)
        )
    return q.order_by(Reference.code).all()


@router.post("/copy", response_model=list[ReferenceOut], status_code=201)
def copy_references(
    from_collection_id: int,
    to_collection_id:   int,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_admin),
):
    """Copia todas las referencias activas de una colección a otra.
    Omite las que ya existen (mismo código) en el destino.
    """
    if from_collection_id == to_collection_id:
        raise HTTPException(status_code=400, detail="Origen y destino deben ser distintos")

    sources = (
        db.query(Reference)
        .filter(Reference.collection_id == from_collection_id, Reference.is_active == True)
        .all()
    )
    if not sources:
        raise HTTPException(status_code=404, detail="No hay referencias activas en la colección origen")

    existing_codes = {
        r.code for r in
        db.query(Reference.code)
        .filter(Reference.collection_id == to_collection_id)
        .all()
    }

    created = []
    for src in sources:
        if src.code in existing_codes:
            continue
        new_ref = Reference(
            code=src.code,
            description=src.description,
            category=src.category,
            base_price=src.base_price,
            collection_id=to_collection_id,
        )
        db.add(new_ref)
        created.append(new_ref)

    db.commit()
    for r in created:
        db.refresh(r)
    return created


@router.patch("/bulk", response_model=ReferenceBulkResult)
def bulk_update_references(
    payload: ReferenceBulkUpdate,
    db:      Session = Depends(get_db),
    _:       User    = Depends(require_admin),
):
    """Actualización / copia masiva de referencias por lista de IDs.

    - Si se envían campos (is_active, base_price, category) → se actualizan in-place.
    - Si se envía copy_to_collection_id → se copian a esa colección (omite códigos duplicados).
    - Ambas operaciones pueden combinarse en la misma llamada.
    """
    if not payload.ids:
        raise HTTPException(status_code=400, detail="Se requiere al menos un ID")

    refs = db.query(Reference).filter(Reference.id.in_(payload.ids)).all()
    if not refs:
        raise HTTPException(status_code=404, detail="No se encontraron referencias con esos IDs")

    # Campos a actualizar in-place (excluimos ids y copy_to_collection_id)
    update_fields = payload.model_dump(
        exclude_none=True,
        exclude={"ids", "copy_to_collection_id"},
    )

    updated_count = 0
    copied_count  = 0
    errors: list[str] = []

    # ── Actualización in-place ───────────────────────────────────────────────
    if update_fields:
        for ref in refs:
            for field, value in update_fields.items():
                setattr(ref, field, value)
        updated_count = len(refs)

    # ── Copia a otra colección ───────────────────────────────────────────────
    if payload.copy_to_collection_id is not None:
        existing_codes = {
            r.code for r in
            db.query(Reference.code)
            .filter(Reference.collection_id == payload.copy_to_collection_id)
            .all()
        }
        for src in refs:
            if src.code in existing_codes:
                errors.append(f"Código '{src.code}' ya existe en la colección destino — omitido")
                continue
            new_ref = Reference(
                code=src.code,
                description=src.description,
                category=src.category,
                base_price=src.base_price,
                collection_id=payload.copy_to_collection_id,
            )
            db.add(new_ref)
            copied_count += 1

    db.commit()
    return ReferenceBulkResult(updated=updated_count, copied=copied_count, errors=errors)


@router.get("/{ref_id}", response_model=ReferenceOut)
def get_reference(
    ref_id: int,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_vendor),
):
    ref = db.get(Reference, ref_id)
    if not ref:
        raise HTTPException(status_code=404, detail="Referencia no encontrada")
    return ref


@router.post("/", response_model=ReferenceOut, status_code=201)
def create_reference(
    payload: ReferenceCreate,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_admin),
):
    # código único por colección
    exists = (
        db.query(Reference)
        .filter(
            Reference.code == payload.code,
            Reference.collection_id == payload.collection_id,
        )
        .first()
    )
    if exists:
        raise HTTPException(
            status_code=400,
            detail=f"El código '{payload.code}' ya existe en esta colección",
        )
    ref = Reference(**payload.model_dump())
    db.add(ref)
    db.commit()
    db.refresh(ref)
    return ref


@router.patch("/{ref_id}", response_model=ReferenceOut)
def update_reference(
    ref_id:  int,
    payload: ReferenceUpdate,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_admin),
):
    ref = db.get(Reference, ref_id)
    if not ref:
        raise HTTPException(status_code=404, detail="Referencia no encontrada")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(ref, field, value)
    db.commit()
    db.refresh(ref)
    return ref


@router.delete("/{ref_id}", status_code=204)
def deactivate_reference(
    ref_id: int,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_admin),
):
    """Soft delete: desactiva en lugar de borrar para no romper histórico."""
    ref = db.get(Reference, ref_id)
    if not ref:
        raise HTTPException(status_code=404, detail="Referencia no encontrada")
    ref.is_active = False
    db.commit()
