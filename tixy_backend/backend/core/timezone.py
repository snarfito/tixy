from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

COLOMBIA_TZ = ZoneInfo("America/Bogota")


def bogota_day_start_utc(d: date) -> datetime:
    """Medianoche de `d` en hora Colombia, convertida a UTC."""
    return datetime.combine(d, time.min, tzinfo=COLOMBIA_TZ).astimezone(timezone.utc)


def bogota_day_end_utc(d: date) -> datetime:
    """Último instante de `d` en hora Colombia, convertido a UTC."""
    return datetime.combine(d, time.max, tzinfo=COLOMBIA_TZ).astimezone(timezone.utc)
