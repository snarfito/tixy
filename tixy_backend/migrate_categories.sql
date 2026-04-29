-- =============================================================================
-- Migracion: Categorias administrables (abr-2026)
-- Ejecutar UNA sola vez antes de reiniciar el backend.
-- =============================================================================

-- 1. Crear tabla categories
CREATE TABLE IF NOT EXISTS categories (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    is_active  TINYINT(1)  NOT NULL DEFAULT 1,
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_category_name (name)
);

-- 2. Poblar con las categorias unicas que ya existen en references
INSERT IGNORE INTO categories (name, is_active, created_at)
SELECT DISTINCT category, 1, NOW()
FROM `references`
WHERE category IS NOT NULL AND category != '';

-- 3. Cambiar la columna category de ENUM a VARCHAR(100)
--    (preserva todos los datos existentes)
ALTER TABLE `references`
    MODIFY COLUMN category VARCHAR(100) NOT NULL;

-- Verificacion (deberia mostrar las categorias migradas)
SELECT * FROM categories ORDER BY name;
