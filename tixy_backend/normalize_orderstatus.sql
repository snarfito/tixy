-- =============================================================================
-- Migracion: Normalizar OrderStatus a mayúsculas (abr-2026)
-- Necesaria porque el enum Python usa mayúsculas pero la BD tenía minúsculas
-- Ejecutar UNA sola vez antes de desplegar el código actualizado
-- =============================================================================

-- 1. Verificar valores actuales (diagnostico)
SELECT DISTINCT status FROM orders;

-- 2. Normalizar valores a mayúsculas
UPDATE orders SET status = 'DRAFT' WHERE LOWER(status) = 'draft';
UPDATE orders SET status = 'SENT' WHERE LOWER(status) = 'sent';
UPDATE orders SET status = 'CONFIRMED' WHERE LOWER(status) = 'confirmed';
UPDATE orders SET status = 'CANCELLED' WHERE LOWER(status) = 'cancelled';

-- 3. Verificar que la normalización fue exitosa
SELECT DISTINCT status FROM orders;
