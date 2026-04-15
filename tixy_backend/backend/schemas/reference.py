from typing import Optional

from pydantic import BaseModel
from models.reference import ProductCategory


class ReferenceCreate(BaseModel):
    code:          str
    description:   str
    category:      ProductCategory
    base_price:    float
    collection_id: int


class ReferenceUpdate(BaseModel):
    description: Optional[str] = None
    category:    Optional[ProductCategory] = None
    base_price:  Optional[float] = None
    is_active:   Optional[bool] = None


class ReferenceOut(BaseModel):
    model_config = {"from_attributes": True}

    id:            int
    code:          str
    description:   str
    category:      ProductCategory
    base_price:    float
    is_active:     bool
    collection_id: int
