from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from core.deps import require_admin, require_vendor
from models.category import Category
from models.user import User
from schemas.category import CategoryCreate, CategoryOut, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("/", response_model=list[CategoryOut])
def list_categories(
    active_only: bool = True,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_vendor),
):
    """Lista categorias. Vendedores y admins pueden consultarlas."""
    q = db.query(Category)
    if active_only:
        q = q.filter(Category.is_active == True)
    return q.order_by(Category.name).all()


@router.post("/", response_model=CategoryOut, status_code=201)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_admin),
):
    existing = db.query(Category).filter(Category.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"La categoría '{payload.name}' ya existe")
    cat = Category(name=payload.name.strip())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.patch("/{cat_id}", response_model=CategoryOut)
def update_category(
    cat_id:  int,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_admin),
):
    cat = db.get(Category, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    if payload.name is not None:
        # verificar que el nuevo nombre no choque con otro existente
        dup = db.query(Category).filter(
            Category.name == payload.name.strip(),
            Category.id   != cat_id,
        ).first()
        if dup:
            raise HTTPException(status_code=400, detail=f"El nombre '{payload.name}' ya lo usa otra categoría")
        cat.name = payload.name.strip()

    if payload.is_active is not None:
        cat.is_active = payload.is_active

    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/{cat_id}", status_code=204)
def deactivate_category(
    cat_id: int,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_admin),
):
    """Soft-delete: desactiva la categoria sin eliminarla para preservar historico."""
    cat = db.get(Category, cat_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    cat.is_active = False
    db.commit()
