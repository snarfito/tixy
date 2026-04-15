from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from core.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,        # reconnect automático si cae la conexión
    pool_recycle=3600,         # recicla conexiones cada hora
    echo=settings.DEBUG,       # loguea SQL cuando DEBUG=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """Dependency inyectable en FastAPI."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
