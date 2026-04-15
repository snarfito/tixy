from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from core.database import get_db
from core.deps import require_vendor, require_admin
from models.client import Client, Store
from models.user import User
from schemas.client import ClientCreate, ClientOut, ClientUpdate, StoreCreate, StoreOut

router = APIRouter(prefix="/clients", tags=["clients"])


# ── Clients ───────────────────────────────────────────────────────────────────

@router.get("/", response_model=list[ClientOut])
def list_clients(
    search: Optional[str] = Query(None, description="Busca por razón social o NIT"),
    db: Session = Depends(get_db),
    _:  User    = Depends(require_vendor),
):
    q = db.query(Client).options(joinedload(Client.stores))
    if search:
        like = f"%{search}%"
        q = q.filter(
            Client.business_name.ilike(like) | Client.nit.ilike(like)
        )
    return q.order_by(Client.business_name).all()


@router.get("/{client_id}", response_model=ClientOut)
def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_vendor),
):
    client = (
        db.query(Client)
        .options(joinedload(Client.stores))
        .filter(Client.id == client_id)
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return client


@router.post("/", response_model=ClientOut, status_code=201)
def create_client(
    payload: ClientCreate,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_vendor),
):
    client = Client(
        business_name=payload.business_name,
        nit=payload.nit,
        phone=payload.phone,
        email=payload.email,
        notes=payload.notes,
    )
    db.add(client)
    db.flush()  # obtener client.id antes de commit

    for s in payload.stores:
        db.add(Store(**s.model_dump(), client_id=client.id))

    db.commit()
    db.refresh(client)
    return client


@router.patch("/{client_id}", response_model=ClientOut)
def update_client(
    client_id: int,
    payload:   ClientUpdate,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_vendor),
):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(client, field, value)
    db.commit()
    db.refresh(client)
    return client


# ── Stores (almacenes bajo un cliente) ───────────────────────────────────────

@router.get("/{client_id}/stores", response_model=list[StoreOut])
def list_stores(
    client_id: int,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_vendor),
):
    client = db.get(Client, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    return client.stores


@router.post("/{client_id}/stores", response_model=StoreOut, status_code=201)
def add_store(
    client_id: int,
    payload:   StoreCreate,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_vendor),
):
    if not db.get(Client, client_id):
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    store = Store(**payload.model_dump(), client_id=client_id)
    db.add(store)
    db.commit()
    db.refresh(store)
    return store


@router.patch("/stores/{store_id}", response_model=StoreOut)
def update_store(
    store_id: int,
    payload:  StoreCreate,
    db: Session = Depends(get_db),
    _:  User    = Depends(require_vendor),
):
    store = db.get(Store, store_id)
    if not store:
        raise HTTPException(status_code=404, detail="Almacén no encontrado")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(store, field, value)
    db.commit()
    db.refresh(store)
    return store
