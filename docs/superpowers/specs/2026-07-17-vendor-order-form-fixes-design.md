# Diseño: mejoras al formulario de pedidos del vendedor

Fecha: 2026-07-17

## Contexto

Un video (WhatsApp, 2026-07-17) muestra que al tocar "Enviar pedido" sin
"Nombre del almacén" diligenciado, el vendedor no percibe ningún error: el
mensaje aparece fuera de la pantalla visible y desaparece antes de que pueda
verlo. A raíz de esto se identificaron dos problemas adicionales relacionados
con el formulario de pedidos en `tixy_frontend/src/pages/VendorPage.jsx`.

## Sección 1 — Alerta de campos faltantes (visibilidad)

**Problema:** el banner de error (`{banner && ...}`) se renderiza al inicio
del documento (línea ~551), antes del selector de tabs. El botón "Enviar
pedido" está al final del formulario. En móvil, con el vendedor scrolleado
hasta abajo (a menudo con el teclado abierto), el mensaje de error queda
fuera del viewport y se autodesaparece a los 3.5s (`flash()`, línea ~207-210)
sin que el vendedor llegue a verlo.

**Solución:**
- El estado `banner` y la función `flash(type, msg)` se mantienen igual.
  Cambia únicamente el renderizado: pasa de un bloque en el flujo normal del
  documento a un **toast flotante con `position: fixed`**, anclado en la
  parte inferior del viewport en móvil (cerca de donde el vendedor ya tiene
  el pulgar), con `z-50` para quedar por encima de cualquier contenido o
  teclado. Duración aumentada a ~5s para errores (mantiene 3.5s para OK).
- Para los dos campos validados en `resolveStoreId()` (`clientName`,
  `storeName`): cuando falten, además del toast se marca el input
  correspondiente con borde rojo y se ejecuta `scrollIntoView({behavior:
  'smooth', block: 'center'})` + `.focus()` sobre el primer campo faltante.
  Requiere `useRef` para los inputs de Cliente y Nombre del almacén.
- El mecanismo del toast aplica a **todos** los usos existentes de
  `flash('err', …)` (líneas de pedido vacías, sin colección activa, etc.),
  no solo a la validación de almacén — mismo componente, cobertura completa.
- Fuera de alcance: no se añade un sistema de notificaciones nuevo (ej.
  librería de toasts) ni botón de cierre manual.

## Sección 2 — Restringir referencias a colecciones activas

**Contexto de datos:** una `Reference` (artículo) pertenece a una sola
`Collection` vía `collection_id` (FK), pero el mismo código de artículo
puede existir como filas duplicadas en varias colecciones (vía el endpoint
`/references/copy`). Puede haber más de una `Collection` con `is_active =
True` simultáneamente, y puede haber referencias activas dentro de
colecciones inactivas.

**Problema:** hoy `GET /references/` (`routers/references.py`) filtra
solo por `Reference.is_active`, sin considerar si la colección padre
(`Collection.is_active`) está activa. El buscador de referencias del
vendedor (`VendorPage.jsx`, llamada `getReferences({ search })` sin
`collection_id`) puede devolver artículos de colecciones ya inactivas.

**Solución:**
- **Backend:** en `list_references()`, cuando **no** se especifica
  `collection_id` en la query, se agrega `JOIN Collection` + filtro
  `Collection.is_active == True`, además del filtro existente por
  `Reference.is_active`. Cuando sí se especifica `collection_id` (como
  hace siempre `AdminPage` vía `getReferencesByCollection`, incluso para
  colecciones inactivas), el comportamiento no cambia — ese flujo de
  administración no debe verse afectado.
- **Frontend:** en el dropdown de resultados del buscador de referencias
  (`VendorPage.jsx`, sección "Buscador de referencias"), se muestra el
  nombre de la colección de cada resultado junto al código/descripción,
  usando el arreglo `collections` que ya se carga vía `getCollections()`
  (sin llamadas adicionales al backend: se resuelve `ref.collection_id` →
  `collections.find(c => c.id === ref.collection_id)?.name`). Esto permite
  al vendedor distinguir y elegir la colección correcta cuando el mismo
  código aparece en más de una colección activa.
- Fuera de alcance: no se modifica `order.collection_id` (sigue siendo la
  colección activa más reciente, sin selector), ni la lógica de reportes
  de gerencia por colección.

## Sección 3 — Limpiar/actualizar campos de almacén al cambiar de cliente

**Problema:** en el buscador de "cliente existente" (`VendorPage.jsx`),
hay dos rutas de selección:

1. `selectStore(client, store)` (cliente **con** almacén elegido): llena
   `storeName`, `address`, `city`, `selectedStore`, pero **nunca** llena
   `cel` con el teléfono del almacén (`store.phone`), a pesar de que el
   modelo `Store` sí tiene ese campo. `cel` queda con el valor anterior.
2. Rama "sin almacenes" (cliente sin `stores`): solo llena `clientName`,
   `nit`, `tel`. **No limpia** `storeName`, `address`, `cel` ni
   `selectedStore`. El caso más grave es `selectedStore`: si quedó
   apuntando a un almacén de una selección anterior, el pedido podría
   guardarse contra el almacén equivocado (de un cliente distinto al que
   se ve en pantalla) sin ningún aviso.

**Solución:**
- En `selectStore(client, store)`: agregar `setCel(store.phone || '')`.
- En la rama "sin almacenes" (línea ~649-656): agregar `setStoreName('')`,
  `setAddress('')`, `setCel('')` y, crítico, `setSelectedStore(null)` para
  evitar que el pedido quede asociado al almacén de una selección previa.
  `city` no se toca (es un campo libre, no proviene del cliente/almacén).

## Testing

- Manual, en navegador (mobile viewport + desktop), siguiendo la skill
  `verify`: reproducir el flujo del video (llenar cliente, agregar
  referencias, enviar sin nombre de almacén) y confirmar que el toast es
  visible y el campo se resalta; buscar una referencia y confirmar que
  solo aparecen colecciones activas con su nombre visible; seleccionar un
  cliente con almacén y luego uno sin almacenes y confirmar que los campos
  se actualizan/limpian correctamente.
- No se agregan tests automatizados nuevos (el proyecto no tiene suite de
  tests de frontend/backend establecida para este flujo).
