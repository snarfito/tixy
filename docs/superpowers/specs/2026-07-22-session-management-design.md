# Diseño: gestión de sesiones activas (ver y revocar por dispositivo)

Fecha: 2026-07-22

## Contexto

El 2026-07-22 un vendedor (José Miguel Serna) dejó su sesión abierta en un
computador de un cliente, exponiendo precios que no debía ver. Sin mecanismo
de revocación granular, la única forma de matarla fue rotar `SECRET_KEY` en
producción — lo cual cerró la sesión de **todos** los usuarios del sistema,
no solo la de ese dispositivo. Este diseño agrega la capacidad de ver
sesiones activas por usuario/dispositivo y revocar una en específico (o todas
las de un usuario) sin afectar al resto del sistema.

Estado actual (ver `tixy_backend/backend/core/security.py`,
`core/deps.py`, `models/user.py`): JWT stateless firmado con `SECRET_KEY`
(HS256), expiración fija de 8h (`ACCESS_TOKEN_EXPIRE_MINUTES` en
`core/config.py`), sin tabla de sesiones, sin `jti`, sin endpoint de logout.
El único chequeo per-request contra DB es `user.is_active`.

## Alcance de acceso

Esta funcionalidad es visible y utilizable **únicamente por usuarios con
`is_superuser = True`** (hoy solo `fredy.hortua@gmail.com`), no por todos los
`ADMIN`. Se usa el guard `require_superuser` en `core/deps.py` — al
implementar se confirmó que ya existía en el código previo a este feature
(no hubo que crearlo), análogo al `require_admin` ya existente.

## Modelo de datos

Nueva tabla `user_sessions` (nombre elegido en la implementación; el diseño
original decía `sessions`):

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID / PK | |
| `user_id` | FK → `users.id` | |
| `jti` | string, único, indexado | claim único generado en cada login, viaja dentro del JWT |
| `user_agent` | string | crudo, tal como llega el header `User-Agent` |
| `device_label` | string | versión parseada para mostrar en UI, ej. "Chrome en Windows" |
| `ip_address` | string | IP de origen; se actualiza si cambia en requests posteriores |
| `created_at` | timestamp | momento del login |
| `last_seen_at` | timestamp | actualizado con throttle (máx. cada 60s, ver más abajo) |
| `revoked_at` | timestamp nullable | NULL = activa; con valor = revocada manualmente |
| `expires_at` | timestamp | = `created_at` + 8h, igual al `exp` del JWT |

`jti` es la clave que conecta el JWT (lo que porta el cliente) con la fila en
DB (lo que controla el servidor), permitiendo matar una sesión puntual sin
tocar las demás del mismo usuario.

No hay limpieza periódica automática de filas expiradas/revocadas (ver
"Casos borde"): a la escala actual del sistema (pocos usuarios, ~1 fila por
login) el crecimiento de la tabla es insignificante.

## Cambios en el flujo de login/verificación

**En `create_access_token` (login, `core/security.py`):**
1. Generar un `jti` nuevo (UUID) por cada login.
2. Incluir `jti` en el payload del JWT junto a `sub`, `role`, `exp`.
3. Crear la fila en `sessions` con ese `jti`, parseando `User-Agent` e IP de
   la request de login.

**En `get_current_user` (cada request autenticado, `core/deps.py`):**
1. Decodificar el JWT como hoy (firma + expiración).
2. Extraer `jti` del payload.
3. Buscar la sesión por `jti`. Si no existe, o `revoked_at` no es NULL, o
   `expires_at` ya pasó → 401 (mismo tratamiento que hoy con
   `is_active=False`).
4. Si la sesión es válida: actualizar `last_seen_at` (throttle: solo si
   pasaron ≥60s desde el valor guardado) e `ip_address` si cambió.
5. Continuar con la verificación existente de `user.is_active`.

**Efecto de despliegue:** los tokens emitidos antes de este deploy no tienen
`jti` (o no tienen fila en `sessions`) y serán rechazados. Esto cierra todas
las sesiones activas en el momento del deploy — efecto esperado, análogo a
lo ocurrido al rotar `SECRET_KEY`, y ocurre una única vez en ese despliegue.
No se implementa tolerancia a tokens viejos sin `jti`.

## Costo de performance

El lookup de sesión por `jti` es una consulta indexada O(1), del mismo tipo
que el `db.get(User, user_id)` que `get_current_user` ya hace hoy en cada
request — no escala con el número de usuarios registrados, sino con
requests/segundo contra la DB, que a esta escala (app B2B interna) es
insignificante para el plan de MySQL en Railway (el proyecto usa MySQL, no
Postgres — corrección respecto a la versión original de este documento).

El write de `last_seen_at` en cada request sí sería costoso sin el throttle
propuesto (bloat de WAL/autovacuum); con el throttle de 60s el costo se
vuelve despreciable independientemente de la escala de usuarios.

## Endpoints nuevos

Nuevo router `routers/sessions.py`, protegido con `require_superuser`. Nota:
la implementación usa el prefijo `/sessions` (no `/admin/sessions` como
decía la versión original de este documento) — este proyecto no tiene una
convención de prefijo `/admin` para rutas del backend, "admin" es puramente
un concepto de rutas del frontend (`/admin`) más el guard de rol/superusuario:

- **`GET /sessions/`** — lista todas las sesiones activas (no
  revocadas, no expiradas) de todos los usuarios. Devuelve por cada una:
  usuario (nombre/email), `device_label`, `ip_address`, `created_at`,
  `last_seen_at`. Parámetro opcional `?user_id=` para filtrar por usuario.
- **`DELETE /sessions/{session_id}`** — revoca esa sesión puntual
  (`revoked_at = now()`). Idempotente.
- **`DELETE /sessions/user/{user_id}`** — revoca todas las sesiones
  activas de un usuario de una vez (atajo para el caso de incidente, sin
  necesidad de desactivar la cuenta con `is_active`).

## Panel de UI

Nueva sección **"Sesiones"** dentro de "Administración", visible solo si
`is_superuser`:

- Tabla: **Usuario**, **Dispositivo** (`device_label`), **IP**, **Inició
  sesión** (hora relativa), **Última actividad** (hora relativa), **Acción**
  (botón "Cerrar sesión" por fila).
- Botón por usuario (si tiene ≥1 sesión activa): "Cerrar todas sus
  sesiones", llama al endpoint de atajo.
- Refresco **manual** (botón "Actualizar"), sin auto-polling.

## Casos borde y manejo de errores

- **Superusuario revoca su propia sesión actual:** permitido, pero el
  frontend muestra confirmación explícita ("Esto cerrará tu propia sesión
  actual") antes de ejecutar.
- **Revocar una sesión ya expirada naturalmente:** no aplica — el `GET` la
  filtra (`expires_at > now()` y `revoked_at IS NULL`), así que ya no
  aparece en la lista.
- **Acumulación de filas viejas:** sin limpieza automática (decisión
  explícita, ver "Modelo de datos"); purga manual futura si hace falta, no
  incluida en este alcance.
- **Token revocado mientras hay una petición en curso:** la siguiente
  llamada recibe 401, igual que el comportamiento actual con
  `is_active=False`.
- **No-superuser golpea `/sessions/*` directamente:** 403 vía
  `require_superuser`, mismo patrón que `require_admin` en `routers/users.py`.

## Fuera de alcance

- Autogestión de sesiones por parte del propio usuario (cerrar sus propias
  sesiones desde su perfil) — descartado en brainstorming, solo superuser
  gestiona sesiones de terceros.
- Auto-refresh / tiempo real en el panel — refresco manual es suficiente.
- Limpieza periódica automática de sesiones expiradas.
- Geolocalización a partir de IP — solo se guarda la IP cruda.
