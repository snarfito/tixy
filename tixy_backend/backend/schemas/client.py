from typing import Optional

from pydantic import BaseModel


class StoreCreate(BaseModel):
    name:    str
    address: Optional[str] = None
    city:    Optional[str] = None
    phone:   Optional[str] = None
    contact: Optional[str] = None


class ClientBasic(BaseModel):
    """Vista mínima de cliente para incluir dentro del store en OrderOut."""
    model_config = {"from_attributes": True}

    id:            int
    business_name: str
    nit:           Optional[str]


class StoreWithClientOut(BaseModel):
    """Store con el cliente incluido, para usar en detalle de órdenes."""
    model_config = {"from_attributes": True}

    id:        int
    name:      str
    address:   Optional[str]
    city:      Optional[str]
    phone:     Optional[str]
    contact:   Optional[str]
    client_id: int
    client:    Optional[ClientBasic] = None


class StoreOut(BaseModel):
    model_config = {"from_attributes": True}

    id:        int
    name:      str
    address:   Optional[str]
    city:      Optional[str]
    phone:     Optional[str]
    contact:   Optional[str]
    client_id: int


class ClientCreate(BaseModel):
    business_name: str
    nit:           Optional[str] = None
    phone:         Optional[str] = None
    email:         Optional[str] = None
    notes:         Optional[str] = None
    stores:        list[StoreCreate] = []


class ClientUpdate(BaseModel):
    business_name: Optional[str] = None
    nit:           Optional[str] = None
    phone:         Optional[str] = None
    email:         Optional[str] = None
    notes:         Optional[str] = None


class ClientOut(BaseModel):
    model_config = {"from_attributes": True}

    id:            int
    business_name: str
    nit:           Optional[str]
    phone:         Optional[str]
    email:         Optional[str]
    stores:        list[StoreOut] = []
