from pydantic import BaseModel


class CatalogImageOut(BaseModel):
    id:            int
    collection_id: int
    full_url:      str
    thumb_url:     str
    reference_ids: list[int]


class CatalogImageCoverOut(BaseModel):
    """Una portada por referencia, para la grilla del catalogo."""
    reference_id: int
    code:         str
    thumb_url:    str


class CatalogImageReferencesUpdate(BaseModel):
    """Reemplaza el set completo de referencias asociadas a una imagen."""
    reference_ids: list[int]
