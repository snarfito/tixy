-- =============================================================================
-- TIXY GLAMOUR — Migración de producción
-- Sesión: 28 abril 2026
-- Cubre todos los cambios de la sesión de desarrollo del 28 abr.
-- IDEMPOTENTE: se puede ejecutar varias veces sin romper nada.
-- Ejecutar ANTES de desplegar el nuevo código del backend.
-- =============================================================================

-- =============================================================================
-- BLOQUE B — Columnas is_active en clients y stores
-- Permite activar/desactivar clientes y almacenes sin borrarlos.
-- =============================================================================

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Soft-delete: 0 = inactivo, 1 = activo';

ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1
    COMMENT 'Soft-delete: 0 = inactivo, 1 = activo';


-- =============================================================================
-- BLOQUE E2 — Eliminar estado "confirmed" de pedidos
-- El flujo queda: draft → sent → cancelled.
-- Cualquier pedido que quedó "confirmed" se migra a "sent".
-- =============================================================================

-- 1. Reclasificar pedidos confirmados como enviados
UPDATE orders
SET status = 'sent'
WHERE status = 'confirmed';

-- 2. Actualizar el ENUM de MySQL para que solo acepte los 3 estados válidos
--    (previene insertar 'confirmed' aunque el código viejo llegue a producción)
ALTER TABLE orders
    MODIFY COLUMN status ENUM('draft', 'sent', 'cancelled') NOT NULL DEFAULT 'draft';


-- =============================================================================
-- BLOQUE A — Categorías administrables
-- Nueva tabla `categories` + migración de references.category de ENUM a VARCHAR.
-- =============================================================================

-- 1. Crear tabla de categorías (si no existe)
CREATE TABLE IF NOT EXISTS categories (
    id         INT          AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    is_active  TINYINT(1)   NOT NULL DEFAULT 1,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_category_name (name)
) COMMENT='Categorías de referencia administrables por el admin';

-- 2. Convertir la columna category de references de ENUM a VARCHAR(100)
--    (preserva todos los datos existentes; MySQL convierte los valores automáticamente)
ALTER TABLE `references`
    MODIFY COLUMN category VARCHAR(100) NOT NULL;

-- 3. Normalizar los valores de category en references al formato legible
--    (el enum de Python guardaba "Vestido corto", pero en algunos entornos
--     quedó el nombre del miembro "VESTIDO_CORTO" — este paso cubre ambos casos)
UPDATE `references` SET category = 'Vestido corto' WHERE category IN ('VESTIDO_CORTO', 'vestido corto', 'Vestido corto');
UPDATE `references` SET category = 'Vestido largo' WHERE category IN ('VESTIDO_LARGO', 'vestido largo', 'Vestido largo');
UPDATE `references` SET category = 'Conjunto'      WHERE category IN ('CONJUNTO',      'conjunto',      'Conjunto');
UPDATE `references` SET category = 'Blusa'         WHERE category IN ('BLUSA',         'blusa',         'Blusa');
UPDATE `references` SET category = 'Body'          WHERE category IN ('BODY',          'body',          'Body');
UPDATE `references` SET category = 'Camiseta'      WHERE category IN ('CAMISETA',      'camiseta',      'Camiseta');
UPDATE `references` SET category = 'Chaleco'       WHERE category IN ('CHALECO',       'chaleco',       'Chaleco');
UPDATE `references` SET category = 'Otro'          WHERE category IN ('OTRO',          'otro',          'Otro');

-- 4. Poblar la tabla categories con las categorías únicas de references
INSERT IGNORE INTO categories (name, is_active, created_at)
SELECT DISTINCT category, 1, NOW()
FROM `references`
WHERE category IS NOT NULL AND category != '';

-- 5. Asegurar que los nombres en categories queden en formato legible
--    (por si el INSERT anterior tomó valores en SNAKE_CASE)
UPDATE categories SET name = 'Vestido corto' WHERE name IN ('VESTIDO_CORTO', 'vestido corto');
UPDATE categories SET name = 'Vestido largo' WHERE name IN ('VESTIDO_LARGO', 'vestido largo');
UPDATE categories SET name = 'Conjunto'      WHERE name IN ('CONJUNTO',      'conjunto');
UPDATE categories SET name = 'Blusa'         WHERE name IN ('BLUSA',         'blusa');
UPDATE categories SET name = 'Body'          WHERE name IN ('BODY',          'body');
UPDATE categories SET name = 'Camiseta'      WHERE name IN ('CAMISETA',      'camiseta');
UPDATE categories SET name = 'Chaleco'       WHERE name IN ('CHALECO',       'chaleco');
UPDATE categories SET name = 'Otro'          WHERE name IN ('OTRO',          'otro');

-- Agregar "Otro" si no existe (categoría de fallback)
INSERT IGNORE INTO categories (name, is_active) VALUES ('Otro', 1);


-- =============================================================================
-- VERIFICACIÓN FINAL
-- Muestra el estado de todas las tablas modificadas.
-- =============================================================================

SELECT '=== VERIFICACION ===' AS '';

SELECT 'clients.is_active' AS columna,
       COUNT(*) AS total_registros,
       SUM(is_active) AS activos
FROM clients;

SELECT 'stores.is_active' AS columna,
       COUNT(*) AS total_registros,
       SUM(is_active) AS activos
FROM stores;

SELECT 'orders.status — distribucion' AS '';
SELECT status, COUNT(*) AS cantidad
FROM orders
GROUP BY status
ORDER BY status;

SELECT 'categories' AS tabla,
       name, is_active
FROM categories
ORDER BY name;

SELECT 'references — muestra de categorias' AS '';
SELECT DISTINCT category, COUNT(*) AS cantidad
FROM `references`
GROUP BY category
ORDER BY category;
