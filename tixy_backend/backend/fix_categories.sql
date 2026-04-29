-- =============================================================================
-- Correccion de categorias: actualiza los nombres del enum al formato legible
-- Ejecutar despues de migrate_categories.sql si los nombres quedaron en SNAKE_CASE
-- =============================================================================

-- Corregir nombres en tabla categories
UPDATE categories SET name = 'Vestido corto' WHERE name IN ('VESTIDO_CORTO', 'vestido corto');
UPDATE categories SET name = 'Vestido largo' WHERE name IN ('VESTIDO_LARGO', 'vestido largo');
UPDATE categories SET name = 'Conjunto'      WHERE name IN ('CONJUNTO',      'conjunto');
UPDATE categories SET name = 'Blusa'         WHERE name IN ('BLUSA',         'blusa');
UPDATE categories SET name = 'Body'          WHERE name IN ('BODY',          'body');
UPDATE categories SET name = 'Camiseta'      WHERE name IN ('CAMISETA',      'camiseta');
UPDATE categories SET name = 'Chaleco'       WHERE name IN ('CHALECO',       'chaleco');
UPDATE categories SET name = 'Otro'          WHERE name IN ('OTRO',          'otro');

-- Corregir la columna category en references para que coincida
UPDATE `references` SET category = 'Vestido corto' WHERE category IN ('VESTIDO_CORTO', 'Vestido corto');
UPDATE `references` SET category = 'Vestido largo' WHERE category IN ('VESTIDO_LARGO', 'Vestido largo');
UPDATE `references` SET category = 'Conjunto'      WHERE category IN ('CONJUNTO',      'Conjunto');
UPDATE `references` SET category = 'Blusa'         WHERE category IN ('BLUSA',         'Blusa');
UPDATE `references` SET category = 'Body'          WHERE category IN ('BODY',          'Body');
UPDATE `references` SET category = 'Camiseta'      WHERE category IN ('CAMISETA',      'Camiseta');
UPDATE `references` SET category = 'Chaleco'       WHERE category IN ('CHALECO',       'Chaleco');
UPDATE `references` SET category = 'Otro'          WHERE category IN ('OTRO',          'Otro');

-- Verificacion final
SELECT 'categories' as tabla, name, is_active FROM categories ORDER BY name;
SELECT 'references sample' as tabla, code, category FROM `references` LIMIT 5;
