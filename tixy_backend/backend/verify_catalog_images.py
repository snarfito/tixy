"""
Verificacion manual end-to-end del catalogo de imagenes.
Requiere: backend corriendo (docker compose up), credenciales R2
configuradas (Task 2), y un usuario ADMIN local.

Uso:
  cd tixy_backend/backend
  python3 verify_catalog_images.py <admin_email> <admin_password>
"""
import io
import sys

import httpx
from PIL import Image

BASE_URL = "http://localhost:8000"


def _login(email: str, password: str) -> str:
    r = httpx.post(f"{BASE_URL}/auth/login", data={"username": email, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


def _synthetic_image_bytes() -> bytes:
    img = Image.new("RGB", (800, 1200), color=(120, 40, 90))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def main(email: str, password: str) -> None:
    token = _login(email, password)
    headers = {"Authorization": f"Bearer {token}"}

    col = httpx.post(
        f"{BASE_URL}/collections/",
        json={"name": "TEST catálogo", "year": 2099, "season": 1},
        headers=headers,
    )
    col.raise_for_status()
    collection_id = col.json()["id"]
    print(f"OK: colección de prueba creada (id={collection_id})")

    ref = httpx.post(
        f"{BASE_URL}/references/",
        json={"code": "TEST-001", "description": "Ref de prueba", "category": "Otro",
              "base_price": 1000, "collection_id": collection_id},
        headers=headers,
    )
    ref.raise_for_status()
    reference_id = ref.json()["id"]
    print(f"OK: referencia de prueba creada (id={reference_id})")

    files = {"file": ("test.png", _synthetic_image_bytes(), "image/png")}
    data = {"collection_id": str(collection_id), "reference_ids": ""}
    up = httpx.post(f"{BASE_URL}/catalog-images/", data=data, files=files, headers=headers, timeout=30)
    up.raise_for_status()
    image = up.json()
    image_id = image["id"]
    assert image["reference_ids"] == [], image
    print(f"OK: imagen subida a R2 (id={image_id}, full={image['full_url']})")

    patch = httpx.patch(
        f"{BASE_URL}/catalog-images/{image_id}/references",
        json={"reference_ids": [reference_id]}, headers=headers,
    )
    patch.raise_for_status()
    assert patch.json()["reference_ids"] == [reference_id], patch.json()
    print("OK: asociación imagen↔referencia")

    by_ref = httpx.get(f"{BASE_URL}/catalog-images/by-reference/{reference_id}", headers=headers)
    by_ref.raise_for_status()
    assert len(by_ref.json()) == 1, by_ref.json()
    print("OK: GET by-reference devuelve la imagen")

    covers = httpx.get(f"{BASE_URL}/catalog-images/covers", params={"collection_id": collection_id}, headers=headers)
    covers.raise_for_status()
    assert any(c["reference_id"] == reference_id for c in covers.json()), covers.json()
    print("OK: GET covers incluye la referencia")

    by_col = httpx.get(f"{BASE_URL}/catalog-images/by-collection/{collection_id}", headers=headers)
    by_col.raise_for_status()
    assert len(by_col.json()) == 1, by_col.json()
    print("OK: GET by-collection incluye la imagen")

    files2 = {"file": ("test2.png", _synthetic_image_bytes(), "image/png")}
    put = httpx.put(f"{BASE_URL}/catalog-images/{image_id}", files=files2, headers=headers, timeout=30)
    put.raise_for_status()
    print("OK: reemplazo de imagen")

    no_auth = httpx.post(f"{BASE_URL}/catalog-images/", data=data, files=files, timeout=30)
    assert no_auth.status_code == 401, no_auth.status_code
    print("OK: subir sin token devuelve 401")

    clear = httpx.delete(f"{BASE_URL}/collections/{collection_id}/catalog-images", headers=headers)
    clear.raise_for_status()
    by_ref_after = httpx.get(f"{BASE_URL}/catalog-images/by-reference/{reference_id}", headers=headers)
    assert by_ref_after.json() == [], by_ref_after.json()
    print("OK: vaciar catálogo de la colección borra las imágenes")

    print("\nTODO OK — borrá manualmente la colección/referencia TEST desde /admin si querés dejar todo limpio.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python3 verify_catalog_images.py <admin_email> <admin_password>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
