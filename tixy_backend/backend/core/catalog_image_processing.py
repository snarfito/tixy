"""
Redimensiona y convierte a WebP las imagenes del catalogo.
Full: max 1600px en el lado mas largo. Thumb: max 400px. Calidad 82.
"""
import io

from PIL import Image

_FULL_MAX_SIDE  = 1600
_THUMB_MAX_SIDE = 400
_QUALITY = 82


def _resize_to_webp(img: Image.Image, max_side: int) -> bytes:
    resized = img.copy()
    resized.thumbnail((max_side, max_side), Image.LANCZOS)
    if resized.mode not in ("RGB", "RGBA"):
        resized = resized.convert("RGB")
    buf = io.BytesIO()
    resized.save(buf, format="WEBP", quality=_QUALITY)
    return buf.getvalue()


def process_image(raw_bytes: bytes) -> tuple[bytes, bytes]:
    """Recibe los bytes originales de una imagen subida y devuelve
    (full_webp_bytes, thumb_webp_bytes). Lanza PIL.UnidentifiedImageError
    si `raw_bytes` no es una imagen valida (el router la traduce a 400)."""
    img = Image.open(io.BytesIO(raw_bytes))
    img.load()  # fuerza la lectura completa antes de que el buffer se cierre
    full  = _resize_to_webp(img, _FULL_MAX_SIDE)
    thumb = _resize_to_webp(img, _THUMB_MAX_SIDE)
    return full, thumb


def _demo():
    """Self-check: genera una imagen sintetica y valida el resize + formato."""
    src = Image.new("RGB", (3000, 2000), color=(200, 50, 100))
    buf = io.BytesIO()
    src.save(buf, format="PNG")

    full, thumb = process_image(buf.getvalue())

    full_img = Image.open(io.BytesIO(full))
    assert full_img.format == "WEBP", full_img.format
    assert max(full_img.size) == _FULL_MAX_SIDE, full_img.size

    thumb_img = Image.open(io.BytesIO(thumb))
    assert thumb_img.format == "WEBP", thumb_img.format
    assert max(thumb_img.size) == _THUMB_MAX_SIDE, thumb_img.size

    # una imagen ya mas chica que el max no debe agrandarse
    small_src = Image.new("RGB", (100, 150), color=(0, 0, 0))
    small_buf = io.BytesIO()
    small_src.save(small_buf, format="PNG")
    small_full, _ = process_image(small_buf.getvalue())
    small_full_img = Image.open(io.BytesIO(small_full))
    assert small_full_img.size == (100, 150), small_full_img.size

    print("OK: process_image redimensiona y convierte a WebP correctamente")


if __name__ == "__main__":
    _demo()
