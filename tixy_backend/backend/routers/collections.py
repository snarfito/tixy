from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import require_admin, require_vendor
from models.collection import Collection
from models.user import User
from schemas.collection import CollectionCreate, CollectionOut

router = APIRouter(prefix="/collections", tags=["collections"])


@router.get("/", response_model=list[CollectionOut])
def list_collections(
    active_only: bool = True,
    db: Session = Depends(get_db),
    _: User = Depends(require_vendor),
):
    q = db.query(Collection)
    if active_only:
        q = q.filter(Collection.is_active == True)
    return q.order_by(Collection.year.desc(), Collection.season.desc()).all()


@router.post("/", response_model=CollectionOut, status_code=201)
def create_collection(
    payload: CollectionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not (1 <= payload.season <= 4):
        raise HTTPException(status_code=400, detail="La temporada debe ser 1, 2, 3 o 4")
    col = Collection(**payload.model_dump())
    db.add(col)
    db.commit()
    db.refresh(col)
    return col


@router.patch("/{col_id}", response_model=CollectionOut)
def update_collection(
    col_id: int,
    payload: CollectionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    col = db.get(Collection, col_id)
    if not col:
        raise HTTPException(status_code=404, detail="Colección no encontrada")
    col.name = payload.name
    db.commit()
    db.refresh(col)
    return col


@router.patch("/{col_id}/activate", response_model=CollectionOut)
def activate_collection(
    col_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    col = db.get(Collection, col_id)
    if not col:
        raise HTTPException(status_code=404, detail="Colección no encontrada")
    col.is_active = True
    db.commit()
    db.refresh(col)
    return col


@router.patch("/{col_id}/deactivate", response_model=CollectionOut)
def deactivate_collection(
    col_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    col = db.get(Collection, col_id)
    if not col:
        raise HTTPException(status_code=404, detail="Colección no encontrada")
    col.is_active = False
    db.commit()
    db.refresh(col)
    return col
