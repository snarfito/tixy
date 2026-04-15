# Tixy Glamour — Sistema de Pedidos

Backend en **FastAPI + MySQL**. Frontend viene en la siguiente fase.

---

## Arranque rápido (desarrollo local)

### Opción A — MySQL local

```bash
# 1. Clona / copia el proyecto
cd tixy/backend

# 2. Entorno virtual
python -m venv venv
source venv/bin/activate        # Linux/Mac
# venv\Scripts\activate         # Windows

# 3. Dependencias
pip install -r requirements.txt
# Agregar reportlab para PDFs:
pip install reportlab==4.1.0

# 4. Crea la BD en MySQL
mysql -u root -p -e "
  CREATE DATABASE IF NOT EXISTS tixy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS 'tixy'@'localhost' IDENTIFIED BY 'tixy_pass';
  GRANT ALL PRIVILEGES ON tixy.* TO 'tixy'@'localhost';
  FLUSH PRIVILEGES;
"

# 5. Configura el .env (ya viene listo para local)
# Edita DB_PASSWORD y SECRET_KEY si cambiaste los valores de arriba

# 6. Seed: crea admin, colección y referencias de ejemplo
python seed.py

# 7. Levanta el servidor
uvicorn main:app --reload
```

Abre **http://localhost:8000/docs** — verás la documentación interactiva completa.

---

### Opción B — Docker Compose (BD + backend juntos)

```bash
cd tixy
docker compose up --build
```

- Backend en: http://localhost:8000
- MySQL en puerto **3307** del host (para no chocar con MySQL local)

Primer run: entra al contenedor y corre el seed:
```bash
docker exec -it tixy_backend python seed.py
```

---

## Credenciales de prueba (post-seed)

| Email                | Password   | Rol     |
|----------------------|------------|---------|
| admin@tixy.co        | Tixy2026!  | Admin   |
| vendedor1@tixy.co    | Tixy2026!  | Vendor  |
| vendedor2@tixy.co    | Tixy2026!  | Vendor  |

---

## Endpoints principales

| Método | Ruta                            | Descripción                        |
|--------|---------------------------------|------------------------------------|
| POST   | /auth/login                     | Login → JWT                        |
| GET    | /collections/                   | Listar colecciones                 |
| GET    | /references/?search=3366        | Buscar referencias (autocomplete)  |
| POST   | /orders/                        | Crear pedido                       |
| POST   | /orders/{id}/send               | Vendedor envía pedido              |
| POST   | /orders/{id}/confirm            | Gerencia confirma                  |
| GET    | /pdf/{id}?show_total=true       | PDF con total                      |
| GET    | /pdf/{id}?show_total=false      | PDF sin total (para el cliente)    |
| GET    | /orders/summary/by-reference    | Ventas por referencia              |
| GET    | /orders/summary/by-vendor       | Ventas por vendedor                |
| GET    | /clients/?search=supermoda      | Buscar clientes por razón social   |

Documentación completa: **http://localhost:8000/docs**

---

## Estructura del proyecto

```
tixy/
├── backend/
│   ├── core/
│   │   ├── config.py      # Settings (.env)
│   │   ├── database.py    # SQLAlchemy engine + session
│   │   ├── security.py    # JWT + bcrypt
│   │   └── deps.py        # Dependencies (auth, roles)
│   ├── models/
│   │   ├── user.py        # Usuario + roles (admin/manager/vendor)
│   │   ├── collection.py  # Colecciones (4 por año)
│   │   ├── reference.py   # Catálogo de prendas
│   │   ├── client.py      # Cliente + almacenes (1 NIT → N stores)
│   │   └── order.py       # Pedido + líneas de pedido
│   ├── routers/
│   │   ├── auth.py        # Login, registro admin, /me
│   │   ├── users.py       # CRUD usuarios
│   │   ├── collections.py # CRUD colecciones
│   │   ├── references.py  # CRUD referencias + búsqueda
│   │   ├── clients.py     # CRUD clientes + almacenes
│   │   ├── orders.py      # CRUD pedidos + reportes
│   │   └── pdf.py         # Generación PDF (con/sin total)
│   ├── schemas/           # Pydantic (validación I/O)
│   ├── main.py            # FastAPI app
│   ├── seed.py            # Datos iniciales
│   ├── .env               # Variables de entorno
│   ├── Dockerfile
│   └── requirements.txt
└── docker-compose.yml
```

---

## Siguiente fase

- [ ] Frontend React + Vite
- [ ] Pantalla admin: colecciones y referencias
- [ ] Pantalla vendedor: orden de pedido (diseño aprobado)
- [ ] Pantalla gerencia: dashboard + filtros
- [ ] Deploy en Railway
