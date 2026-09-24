# Diseño: catálogo de imágenes por referencia

Fecha: 2026-09-24

## Contexto

El cliente (Edison, Tixy Glamour) dejó de hacer sesiones fotográficas
tradicionales (modelo + fotógrafo + diseñadora) por insostenible
logísticamente. Ahora genera las fotos de producto con IA (ChatGPT, ~$100.000
COP/mes, listas en 4 días) y quiere que los vendedores puedan mostrárselas al
cliente final desde la app, por referencia, organizadas por colección.

Alcance confirmado por el cliente (llamada + respuestas escritas,
2026-09-21):

- ~250 referencias activas por colección, hasta ~400 imágenes en total.
- Una referencia puede tener varias imágenes (máx. ~3 típico: frente, espalda,
  lado). Casi todas las referencias tienen foto; unas pocas no.
- **Una misma imagen puede compartirse entre varias referencias** (ej. mismo
  diseño, color distinto). Es una relación muchos-a-muchos, no 1-a-1.
- Las imágenes **no** vienen nombradas con el código de referencia — no hay
  matching automático por filename. La asociación imagen↔referencia es manual
  (drag and drop en el panel de admin).
- Suben y editan las imágenes los administradores (Edison y Andrea, rol
  `ADMIN` existente) — no el equipo de desarrollo.
- Vendedores solo visualizan en pantalla; no hay descarga ni compartir desde
  el catálogo.
- Se quieren conservar catálogos de colecciones anteriores, con opción de
  vaciarlos cuando ya no se necesiten (para que la app no se vuelva pesada).

Estado actual del código (ver `tixy_backend/backend/models/reference.py`,
`models/collection.py`, `routers/references.py`, `routers/collections.py`,
`tixy_frontend/src/pages/AdminPage.jsx`): `Reference` pertenece a una
`Collection` (FK `collection_id`); no existe ninguna tabla ni columna de
imágenes; no hay almacenamiento de archivos (Railway no tiene disco
persistente entre deploys, y el backend no monta ningún directorio estático);
no hay `boto3` ni `Pillow` en `requirements.txt`. `AdminPage.jsx` ya usa un
patrón de pestañas internas (`refs`, `cats`, `cols`, `clients`, `users`,
`sessions`) para las distintas secciones de administración.

## Alcance de acceso

Lectura del catálogo (`GET`): mismo guard `require_vendor` que ya usan
`references.py`/`collections.py` — cubre `ADMIN`, `MANAGER` y `VENDOR`, es
decir, visible para todos los roles de la app.

Escritura (subir, reemplazar, asociar, eliminar): `require_admin`, igual que
la gestión actual de referencias/categorías/colecciones. No se introduce
ningún permiso nuevo.

## Modelo de datos

Dos tablas nuevas (ALTER TABLE manual, siguiendo la convención actual del
proyecto — no hay Alembic en uso real):

```sql
CREATE TABLE catalog_images (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  collection_id INT NOT NULL,
  storage_key   VARCHAR(255) NOT NULL,   -- key en R2, versión completa WebP
  thumb_key     VARCHAR(255) NOT NULL,   -- key en R2, miniatura WebP
  created_at    DATETIME NOT NULL,
  FOREIGN KEY (collection_id) REFERENCES collections(id)
);

CREATE TABLE catalog_image_references (
  image_id      INT NOT NULL,
  reference_id  INT NOT NULL,
  PRIMARY KEY (image_id, reference_id),
  FOREIGN KEY (image_id) REFERENCES catalog_images(id) ON DELETE CASCADE,
  FOREIGN KEY (reference_id) REFERENCES `references`(id)
);
```

La relación muchos-a-muchos vía `catalog_image_references` cubre
directamente "una imagen, varios códigos". `ON DELETE CASCADE` en `image_id`
significa que borrar una fila de `catalog_images` limpia solo sus propios
vínculos — no se toca `references` ni `collections` desde aquí.

Modelos SQLAlchemy nuevos: `models/catalog_image.py` (`CatalogImage`, con
`relationship` a `Collection` y `relationship` muchos-a-muchos a `Reference`
vía `secondary=catalog_image_references`).

## Almacenamiento (Cloudflare R2)

El cliente no tiene bucket todavía — se crea como parte de este trabajo.

Variables nuevas en `core/config.py`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`. El bucket se deja
con acceso público de lectura (dominio `.r2.dev` o un subdominio propio) —
las fotos son de catálogo, se muestran igual dentro de una app autenticada, y
no vale la pena la complejidad de URLs firmadas con expiración para un
requisito de "solo ver en pantalla" que de todas formas no impide un
clic-derecho-guardar en el navegador.

Convención de keys: `catalog/{collection_id}/{image_id}/full.webp` y
`catalog/{collection_id}/{image_id}/thumb.webp`.

Dependencias nuevas en `requirements.txt`: `boto3` (cliente S3-compatible
para R2) y `Pillow` (resize + conversión a WebP). No existía ninguna
alternativa ya instalada que cubriera esto.

**Costo:** a este volumen (≤400 imágenes, subidas ocasionales por un admin,
no tráfico de vendedores) el costo adicional es insignificante — R2 no cobra
egress y las operaciones de escritura están muy por debajo del free tier
(1M/mes); en Railway solo se factura el tramo backend→R2 (egress a
$0,05/GB) sobre el WebP ya comprimido, del orden de fracciones de centavo por
colección completa subida. La lectura de imágenes (tráfico real de
vendedores navegando el catálogo) se sirve directo desde R2 por URL, nunca
pasa por Railway.

## Pipeline de subida

El backend actúa como proxy: recibe el archivo original vía multipart,
Pillow lo redimensiona y convierte:

- Versión completa: máx. 1600px en el lado más largo, WebP calidad ~82.
- Miniatura: máx. 400px en el lado más largo, WebP calidad ~82.

Ambas se suben a R2 (`boto3.put_object`). El frontend sube un archivo por
request (varias en paralelo, máx. ~3 concurrentes) para poder mostrar
progreso/errores por archivo — no se implementa un endpoint de "batch", un
loop del lado del cliente es suficiente a esta escala.

## Endpoints nuevos

Nuevo router `routers/catalog_images.py`, prefijo `/catalog-images`:

- **`GET /catalog-images/covers?collection_id=`** *(require_vendor)* — para
  la grilla del catálogo: devuelve `{reference_id, code, thumb_url}[]`, una
  portada por cada referencia de esa colección que tenga ≥1 imagen.
- **`GET /catalog-images/by-reference/{reference_id}`** *(require_vendor)* —
  todas las imágenes de esa referencia (`full_url`, `thumb_url`, `id`), para
  el visor con navegación por flechas.
- **`POST /catalog-images/`** *(require_admin)* — multipart: `file`,
  `collection_id`, `reference_ids` opcional (lista). Procesa y sube la
  imagen, crea la fila y los vínculos iniciales.
- **`PATCH /catalog-images/{id}/references`** *(require_admin)* — body
  `{reference_ids: list[int]}`, reemplaza el set completo de asociaciones
  (mismo patrón "reemplazar el conjunto" que ya usa `ReferenceBulkUpdate`).
- **`PUT /catalog-images/{id}`** *(require_admin)* — multipart `file`,
  reemplaza el archivo reprocesando y sobrescribiendo las mismas keys en R2.
- **`DELETE /catalog-images/{id}`** *(require_admin)* — borra los objetos en
  R2 (full + thumb) y luego la fila en DB (los vínculos caen por CASCADE).
- **`DELETE /collections/{id}/catalog-images`** *(require_admin)* — "vaciar
  catálogo de esta colección": recorre y borra todas sus `catalog_images`
  (objetos en R2 + filas). **No borra la colección ni sus referencias.**

## UI — pestaña "Catálogo" (todos los roles)

Nueva ruta `/catalogo` en `App.jsx`, entrada nueva en `AppLayout.jsx` junto a
"Orden de Pedido", "Administración" y "Gerencia".

Flujo: elegir colección (por defecto la más reciente activa, misma
convención que el filtro de Gerencia) → grilla de portadas por referencia
(código + miniatura) → tocar una, o escribir un código en el buscador, abre
un visor a pantalla completa con las imágenes de esa referencia y flechas
◀ ▶ para moverse a la referencia anterior/siguiente por orden de código. Solo
se muestra el código junto a las imágenes (sin precio ni otros datos).
Referencia sin foto: estado vacío simple ("Sin imágenes aún").

## UI — sección "Colección" dentro de Administración (solo admin)

Nueva pestaña en el tab bar existente de `AdminPage.jsx` (componente en
archivo propio, no agregado al archivo de 1776 líneas):

- Selector de colección de trabajo.
- Zona de arrastrar-y-soltar para subir varias imágenes a la vez, con
  progreso y error por archivo.
- Por cada imagen: editor de asociaciones (asignar/quitar códigos de
  referencia, drag and drop), botón reemplazar, botón eliminar.
- Botón "Vaciar catálogo de esta colección" con confirmación explícita,
  llama al `DELETE /collections/{id}/catalog-images`.

## Rollout

1. Crear el bucket R2 y el token de API (pasos guiados, cliente no tiene
   cuenta previa).
2. Agregar las 5 variables de entorno nuevas en local (`.env`) y en Railway.
3. Correr los dos `ALTER TABLE` en Docker local y en la DB de Railway (manual,
   igual que el resto de migraciones del proyecto — ver
   [[db-migrations]]).
4. Deploy backend + frontend.

## Casos borde y manejo de errores

- **Imagen sin ninguna referencia asociada todavía** (recién subida, antes de
  arrastrarla a un código): válida, simplemente no aparece en `covers` de
  ninguna referencia hasta que se asocie.
- **Referencia sin imágenes:** estado vacío en el visor, no rompe la
  navegación por flechas.
- **Reemplazo de imagen (`PUT`) mientras un vendedor la tiene abierta:** el
  vendedor sigue viendo la versión vieja hasta refrescar (mismo
  comportamiento que cualquier imagen cacheada por URL; no se implementa
  invalidación en tiempo real).
- **Vaciar catálogo de una colección con imágenes compartidas entre
  referencias de esa colección:** se borran igual, es una operación completa
  por colección, no por referencia individual.
- **Fallo de red a mitad de un `PUT`/`POST` a R2:** no se crea/actualiza la
  fila en DB hasta que la subida a R2 confirme éxito, para no dejar
  referencias a objetos inexistentes.

## Fuera de alcance

- Recorte/edición manual de imágenes (crop) — la compresión automática basta
  según el cliente.
- Descarga o compartir imágenes desde el catálogo (view-only).
- Cualquier preview/miniatura dentro del flujo de Orden de Pedido — se
  discutió explícitamente y se descartó para esta fase.
- Módulo de bodega/inventario (pedido pendiente del cliente, es un proyecto
  aparte).
- Matching automático de imágenes a códigos por nombre de archivo — la
  asociación siempre es manual.
- Borrado de la colección o sus referencias desde esta funcionalidad.
