"""
Script de importación masiva de clientes para Tixy.

Lee clientes_tixy.csv y crea un Client por cada fila.
No crea almacenes (Stores); esos se agregan después desde la UI.

Idempotente: si ya existe un cliente con el mismo NIT, se omite.

Uso (local con docker-compose):
    docker exec -it tixy_backend python seed_clients.py
"""
import csv
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from core.database import SessionLocal, engine, Base
from models.client import Client

Base.metadata.create_all(bind=engine)

CSV_PATH = os.environ.get("TIXY_CLIENTS_CSV", os.path.join(HERE, "clientes_tixy.csv"))

if not os.path.exists(CSV_PATH):
    print(f"❌ No se encontró el archivo CSV: {CSV_PATH}")
    sys.exit(1)


def main() -> None:
    db = SessionLocal()
    creados  = 0
    omitidos = 0
    errores: list[tuple[str, str]] = []

    try:
        with open(CSV_PATH, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                business_name = (row.get("business_name") or "").strip()
                nit           = (row.get("nit") or "").strip() or None
                phone         = (row.get("phone") or "").strip() or None
                notes_parts   = []
                if row.get("phone_alt", "").strip():
                    notes_parts.append(f"Tel. alt.: {row['phone_alt'].strip()}")
                if row.get("notes", "").strip():
                    notes_parts.append(row["notes"].strip())
                notes = " | ".join(notes_parts) or None

                if not business_name:
                    continue

                # Omitir si ya existe un cliente con ese NIT
                if nit and db.query(Client).filter(Client.nit == nit).first():
                    omitidos += 1
                    continue

                try:
                    db.add(Client(
                        business_name=business_name,
                        nit=nit,
                        phone=phone,
                        notes=notes,
                    ))
                    creados += 1
                except Exception as e:
                    db.rollback()
                    errores.append((business_name, str(e)))

        db.commit()
        print("─" * 55)
        print("✅ Importación completada")
        print(f"   Clientes creados:   {creados}")
        print(f"   Omitidos (NIT dup): {omitidos}")
        if errores:
            print(f"   ⚠ Errores: {len(errores)}")
            for name, err in errores[:10]:
                print(f"     · {name}: {err}")
        print("─" * 55)

    except Exception as e:
        db.rollback()
        print(f"❌ Error fatal: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
