from typing import Optional
from pydantic import BaseModel


class CategoryCreate(BaseModel):
    name: str


class CategoryUpdate(BaseModel):
    name:      Optional[str]  = None
    is_active: Optional[bool] = None


class CategoryOut(BaseModel):
    model_config = {"from_attributes": True}

    id:        int
    name:      str
    is_active: bool
