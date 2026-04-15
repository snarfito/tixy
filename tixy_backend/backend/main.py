from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.database import Base, engine
from routers import auth, users, collections, references, clients, orders, pdf

# Crea tablas si no existen (en producción usarás Alembic)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# En producción reemplaza "*" con el dominio del frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
