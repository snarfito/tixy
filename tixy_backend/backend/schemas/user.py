from typing import Optional

from pydantic import BaseModel, EmailStr
from models.user import UserRole


class UserCreate(BaseModel):
    full_name:    str
    email:        EmailStr
    password:     str
    role:         UserRole = UserRole.VENDOR
    phone:        Optional[str] = None
    contact_info: Optional[str] = None  # texto libre para el PDF


class UserUpdate(BaseModel):
    full_name:    Optional[str] = None
    phone:        Optional[str] = None
    contact_info: Optional[str] = None
    is_active:    Optional[bool] = None
    role:         Optional[UserRole] = None


class UserOut(BaseModel):
    model_config = {"from_attributes": True}

    id:           int
    full_name:    str
    email:        str
    role:         UserRole
    phone:        Optional[str]
    contact_info: Optional[str]
    is_active:    bool


class TokenOut(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserOut
