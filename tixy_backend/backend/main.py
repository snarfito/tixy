from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from core.config import settings
from core.database import Base, engine
from routers import auth, users, collections, references, clients, orders, pdf

# Crea tablas si no existen (en producción usarás Alembic)
Base.metadata.create_all(bind=engine)

# ── Rate limiter ─────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Registrar el limiter y su manejador de error en la app
app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded,
    _rate_limit_exceeded_handler,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Orígenes permitidos: configura ALLOWED_ORIGINS en el .env de producción
origenes = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origenes,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(collections.router)
app.include_router(references.router)
app.include_router(clients.router)
app.include_router(orders.router)
app.include_router(pdf.router)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.APP_NAME}
