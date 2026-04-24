"""
Script de seed para el primer arranque.
Crea: usuario admin, colección 1-2026, y referencias de ejemplo de TIXY.

Uso:
    cd backend
    python seed.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from core.database import SessionLocal, engine, Base
from core.security import hash_password
from models.user import User, UserRole
from models.collection import Collection
from models.reference import Reference, ProductCategory

Base.metadata.create_all(bind=engine)

db = SessionLocal()

# ── Migraciones manuales (ALTER TABLE seguros) ────────────────────────────────
def run_migrations(connection):
    """
    Aplica cambios de esquema que create_all no puede hacer automáticamente.
    Cada ALTER está protegido para no fallar si la columna ya existe.
    """
    migrations = [
        # v1 — Superusuario
        "ALTER TABLE users ADD COLUMN is_superuser BOOLEAN NOT NULL DEFAULT FALSE",
    ]
    for sql in migrations:
        try:
            connection.execute(text(sql))
            connection.commit()
            print(f"✓ Migración aplicada: {sql[:60]}…")
        except Exception as e:
            connection.rollback()
            if "Duplicate column" in str(e) or "1060" in str(e):
                pass  # La columna ya existe, se ignora
            else:
                print(f"⚠️  Migración omitida ({e})")

from sqlalchemy import text
with engine.connect() as conn:
    run_migrations(conn)

try:
    # ── Admin ──────────────────────────────────────────────────────────────────
    if not db.query(User).filter(User.email == "admin@tixy.co").first():
        admin = User(
            full_name="Administrador Tixy",
            email="admin@tixy.co",
            hashed_pw=hash_password("Tixy2026!"),
            role=UserRole.ADMIN,
            contact_info="319 680 0557",
        )
        db.add(admin)
        print("✓ Usuario admin creado  →  admin@tixy.co / Tixy2026!")
    else:
        print("· Admin ya existe, se omite")

    # ── Superusuario ──────────────────────────────────────────────────────────
    SUPERUSER_EMAIL = "fredy.hortua@gmail.com"
    superuser = db.query(User).filter(User.email == SUPERUSER_EMAIL).first()
    if not superuser:
        superuser = User(
            full_name="Fredy Hortua",
            email=SUPERUSER_EMAIL,
            hashed_pw=hash_password("Tixy2026!"),
            role=UserRole.ADMIN,
            is_superuser=True,
            contact_info="",
        )
        db.add(superuser)
        print(f"✓ Superusuario creado  →  {SUPERUSER_EMAIL}")
    elif not superuser.is_superuser:
        # Si ya existe el usuario, solo promoverlo a superusuario
        superuser.is_superuser = True
        superuser.role = UserRole.ADMIN
        print(f"✓ Superusuario promovido  →  {SUPERUSER_EMAIL}")
    else:
        print(f"· Superusuario ya existe  →  {SUPERUSER_EMAIL}")

    # ── Vendedores de ejemplo ──────────────────────────────────────────────────
    vendors = [
        ("Vendedor 1", "vendedor1@tixy.co", "Vendedor 1", "313 623 1499"),
        ("Vendedor 2", "vendedor2@tixy.co", "Vendedor 2", "319 680 0557"),
    ]
    for full_name, email, _, contact in vendors:
        if not db.query(User).filter(User.email == email).first():
            db.add(User(
                full_name=full_name,
                email=email,
                hashed_pw=hash_password("Tixy2026!"),
                role=UserRole.VENDOR,
                contact_info=contact,
            ))
            print(f"✓ Vendedor creado  →  {email} / Tixy2026!")

    # ── Colección 1 - 2026 ────────────────────────────────────────────────────
    col = db.query(Collection).filter(Collection.year == 2026, Collection.season == 1).first()
    if not col:
        col = Collection(name="Colección 1 - 2026", year=2026, season=1)
        db.add(col)
        db.flush()
        print(f"✓ Colección creada  →  {col.name}")
    else:
        print(f"· Colección ya existe: {col.name}")

    # ── Referencias TIXY (del PDF adjunto) ────────────────────────────────────
    sample_refs = [
        ("3366",  "Vestido C manga corta",           ProductCategory.VESTIDO_CORTO, 22000),
        ("3372",  "Vestido C tiras",                 ProductCategory.VESTIDO_CORTO, 22000),
        ("3450",  "Vestido C asimétrico",            ProductCategory.VESTIDO_CORTO, 24000),
        ("3176",  "Vestido C manga corta",           ProductCategory.VESTIDO_CORTO, 22000),
        ("3465",  "Vestido L raya",                  ProductCategory.VESTIDO_LARGO, 27000),
        ("3202",  "Vestido L manga sisa",            ProductCategory.VESTIDO_LARGO, 27000),
        ("13326", "Vestido L tiras",                 ProductCategory.VESTIDO_LARGO, 27000),
        ("3011",  "Vestido L manga sisa",            ProductCategory.VESTIDO_LARGO, 27000),
        ("3462",  "Vestido L línea continua sisa",   ProductCategory.VESTIDO_LARGO, 27000),
        ("3463",  "Vestido L línea continua sisa",   ProductCategory.VESTIDO_LARGO, 27000),
        ("3384",  "Blusa manga corta",               ProductCategory.BLUSA,         15000),
        ("3383",  "Blusa manga sisa",                ProductCategory.BLUSA,         15000),
        ("3427",  "Blusa manga sisa asimétrica",     ProductCategory.BLUSA,         18000),
        ("3417",  "Blusa manga sisa asim. PCS",      ProductCategory.BLUSA,         18000),
        ("33191", "Blusa PCS",                       ProductCategory.BLUSA,         16000),
        ("3289",  "Body tiras",                      ProductCategory.BODY,          16000),
        ("3292",  "Body manga sisa",                 ProductCategory.BODY,          16000),
        ("3288",  "Body manga sisa",                 ProductCategory.BODY,          16000),
        ("3428",  "Chaleco corto",                   ProductCategory.CHALECO,       15000),
        ("2917",  "Conjunto manga sisa short",       ProductCategory.CONJUNTO,      30000),
        ("2920",  "Conjunto manga corta short",      ProductCategory.CONJUNTO,      30000),
        ("3258",  "Conjunto manga corta pantalón",   ProductCategory.CONJUNTO,      36000),
        ("3056",  "Conjunto manga sisa pantalón",    ProductCategory.CONJUNTO,      36000),
        ("3470",  "Camiseta cuello redondo",         ProductCategory.CAMISETA,      15000),
        ("3075",  "Camiseta cuello redondo",         ProductCategory.CAMISETA,      15000),
    ]

    added = 0
    for code, desc, cat, price in sample_refs:
        exists = db.query(Reference).filter(
            Reference.code == code,
            Reference.collection_id == col.id,
        ).first()
        if not exists:
            db.add(Reference(code=code, description=desc, category=cat,
                             base_price=price, collection_id=col.id))
            added += 1

    db.commit()
    print(f"✓ {added} referencias agregadas a '{col.name}'")
    print("\n✅ Seed completado. Puedes iniciar el backend con:")
    print("   uvicorn main:app --reload")

except Exception as e:
    db.rollback()
    print(f"❌ Error en seed: {e}")
    raise
finally:
    db.close()
