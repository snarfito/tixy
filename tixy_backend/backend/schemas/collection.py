from pydantic import BaseModel


class CollectionCreate(BaseModel):
    name:   str
    year:   int
    season: int  # 1..4


class CollectionOut(BaseModel):
    model_config = {"from_attributes": True}

    id:        int
    name:      str
    year:      int
    season:    int
    is_active: bool
