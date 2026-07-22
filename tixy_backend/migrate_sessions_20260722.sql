-- =============================================================================
-- TIXY GLAMOUR — Migración de producción
-- Sesión: 22 julio 2026
-- Tabla user_sessions: permite ver y revocar sesiones JWT activas por
-- dispositivo (solo superusuario). Ver docs/superpowers/specs/2026-07-22-session-management-design.md
-- IDEMPOTENTE: se puede ejecutar varias veces sin romper nada.
-- Ejecutar ANTES de desplegar el nuevo código del backend.
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_sessions (
    id           INT          AUTO_INCREMENT PRIMARY KEY,
    user_id      INT          NOT NULL,
    jti          VARCHAR(36)  NOT NULL,
    user_agent   VARCHAR(255) NOT NULL,
    device_label VARCHAR(120) NOT NULL,
    ip_address   VARCHAR(45)  NOT NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at   DATETIME     NULL,
    expires_at   DATETIME     NOT NULL,
    UNIQUE KEY uq_user_sessions_jti (jti),
    KEY ix_user_sessions_user_id (user_id)
);
