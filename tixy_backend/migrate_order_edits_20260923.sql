-- =============================================================================
-- TIXY GLAMOUR — Migración de producción
-- Sesión: 23 septiembre 2026
-- Edición de pedidos por usuarios autorizados + bitácora + re-envío al cliente.
-- Ejecutar ANTES de desplegar el nuevo código del backend.
-- NO idempotente (MySQL 8 no soporta ADD COLUMN IF NOT EXISTS): si una
-- sentencia falla con "Duplicate column", esa columna ya existe; seguir.
-- =============================================================================

-- Permiso para editar pedidos (lo asigna el superusuario)
ALTER TABLE users
    ADD COLUMN can_edit_orders TINYINT(1) NOT NULL DEFAULT 0;

-- Último correo al que se envió el PDF del pedido
ALTER TABLE orders
    ADD COLUMN client_email VARCHAR(180) NULL;

-- Bitácora de ediciones (create_all también la crea al arrancar el backend)
CREATE TABLE IF NOT EXISTS order_edits (
    id         INT      AUTO_INCREMENT PRIMARY KEY,
    order_id   INT      NOT NULL,
    user_id    INT      NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    summary    TEXT     NOT NULL,
    reason     TEXT     NULL,
    KEY ix_order_edits_order_id (order_id),
    CONSTRAINT fk_order_edits_order FOREIGN KEY (order_id) REFERENCES orders(id),
    CONSTRAINT fk_order_edits_user  FOREIGN KEY (user_id)  REFERENCES users(id)
);
