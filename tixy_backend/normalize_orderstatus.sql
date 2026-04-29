-- =============================================================================
-- Migracion: Normalizar OrderStatus ENUM en MySQL (abr-2026)
-- CRÍTICO: Ejecutar PRIMERO antes de desplegar el código actualizado
-- =============================================================================

-- 1. Renombrar columna status a status_old (guardar datos)
ALTER TABLE orders CHANGE COLUMN status status_old VARCHAR(50);

-- 2. Crear nueva columna status con ENUM correcto (mayúsculas)
ALTER TABLE orders ADD COLUMN status ENUM('DRAFT', 'SENT', 'CONFIRMED', 'CANCELLED') 
  NOT NULL DEFAULT 'DRAFT' AFTER status_old;

-- 3. Migrar datos: convertir a mayúsculas
UPDATE orders 
SET status = UPPER(status_old) 
WHERE status_old IS NOT NULL;

-- 4. Eliminar columna antigua
ALTER TABLE orders DROP COLUMN status_old;

-- 5. Verificar resultado
SELECT DISTINCT status FROM orders;
SELECT COUNT(*) as total_orders FROM orders;
