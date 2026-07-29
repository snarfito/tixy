from fastapi import Request


def get_client_ip(request: Request) -> str:
    """IP real del cliente detrás del proxy de Railway.

    request.client.host es la IP del proxy interno de Railway, no la del
    usuario, porque Uvicorn corre sin --proxy-headers. Railway sí agrega la
    IP real del cliente como primer valor en X-Forwarded-For.
    """
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()

    return request.client.host if request.client else ""
