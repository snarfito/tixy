def parse_device_label(user_agent: str) -> str:
    """Heurística simple browser + OS a partir del header User-Agent crudo,
    sin depender de una librería externa de parsing."""
    ua = (user_agent or "").lower()

    if "edg/" in ua:
        browser = "Edge"
    elif "chrome/" in ua and "chromium" not in ua:
        browser = "Chrome"
    elif "firefox/" in ua:
        browser = "Firefox"
    elif "safari/" in ua and "chrome/" not in ua:
        browser = "Safari"
    else:
        browser = "Navegador desconocido"

    if "windows" in ua:
        os_name = "Windows"
    elif "iphone" in ua or "ipad" in ua:
        os_name = "iOS"
    elif "android" in ua:
        os_name = "Android"
    elif "mac os" in ua:
        os_name = "macOS"
    elif "linux" in ua:
        os_name = "Linux"
    else:
        os_name = "SO desconocido"

    return f"{browser} en {os_name}"
