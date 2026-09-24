"""
Cliente S3-compatible para subir/borrar objetos en Cloudflare R2.
Requiere las variables R2_* en el .env (ver core/config.py) — ver
docs/superpowers/specs/2026-09-24-catalog-images-design.md para como
crear el bucket y el token de API.
"""
import boto3

from core.config import settings


def _client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )


def upload_bytes(key: str, data: bytes, content_type: str = "image/webp") -> None:
    _client().put_object(Bucket=settings.R2_BUCKET, Key=key, Body=data, ContentType=content_type)


def delete_object(key: str) -> None:
    _client().delete_object(Bucket=settings.R2_BUCKET, Key=key)


def public_url(key: str) -> str:
    return f"{settings.R2_PUBLIC_BASE_URL.rstrip('/')}/{key}"


if __name__ == "__main__":
    # Smoke test manual contra el bucket real — requiere las 5 variables
    # R2_* ya configuradas en .env. Uso: python3 core/r2_storage.py
    test_key = "catalog/_smoke_test/ping.txt"
    upload_bytes(test_key, b"ping", content_type="text/plain")
    print(f"OK: subido a {public_url(test_key)} (abrilo en el navegador para confirmar)")
    delete_object(test_key)
    print("OK: borrado")
