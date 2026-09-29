-- ═══════════════════════════════════════════════════════════════════════════
-- Migración 003 — Recuperación de contraseña por código enviado al correo
-- Fecha: 2026-09-29
--
-- Desde el login, "¿Olvidó su clave?" envía un código de 6 dígitos al correo
-- del usuario. Aquí se guarda SOLO la huella (hash) del código, nunca el código
-- en claro, junto con su vencimiento y los intentos fallidos.
--
-- Los parámetros de la pantalla "Configuración del Sistema" se guardan en
-- TM_CONFIG (claves sistema_*), que ya existe: no requieren migración.
--
-- Ejecutar UNA vez en cada base de datos (local y Neon) desde pgAdmin.
-- Es idempotente: si se ejecuta dos veces no produce errores.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tt_recup (
  recup_id  SERIAL       PRIMARY KEY,
  usuari_id INTEGER      NOT NULL REFERENCES tm_usuario (usuari_id) ON DELETE CASCADE,
  recup_co  VARCHAR(128) NOT NULL,
  recup_ex  TIMESTAMP    NOT NULL,
  recup_in  SMALLINT     NOT NULL DEFAULT 0,
  recup_us  BOOLEAN      NOT NULL DEFAULT FALSE,
  recup_fe  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_recup_usuario ON tt_recup (usuari_id, recup_fe DESC);

COMMENT ON TABLE  tt_recup          IS 'Códigos de recuperación de contraseña del panel';
COMMENT ON COLUMN tt_recup.recup_co IS 'Huella HMAC-SHA256 del código (el código no se guarda)';
COMMENT ON COLUMN tt_recup.recup_ex IS 'Fecha y hora de vencimiento del código';
COMMENT ON COLUMN tt_recup.recup_in IS 'Intentos fallidos (máximo 5)';
COMMENT ON COLUMN tt_recup.recup_us IS 'TRUE cuando ya se usó o fue reemplazado por otro';
