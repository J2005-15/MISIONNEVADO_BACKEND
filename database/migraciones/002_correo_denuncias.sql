-- ═══════════════════════════════════════════════════════════════════════════
-- Migración 002 — Correo de contacto en las denuncias
-- Fecha: 2026-09-29
--
-- El formulario de denuncias de la web pide un correo OPCIONAL para avisar al
-- denunciante los cambios de estado. Se guarda en la denuncia (y no solo en
-- TM_PERSON) porque una denuncia puede ser anónima y aun así dejar un correo.
--
-- (Voluntarios y proteccionistas usan TM_PERSON.PERSON_EM, que ya existe.)
--
-- Ejecutar UNA vez en cada base de datos (local y Neon) desde pgAdmin.
-- Es idempotente: si se ejecuta dos veces no produce errores.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE tt_denunc
  ADD COLUMN IF NOT EXISTS denunc_em VARCHAR(150);

COMMENT ON COLUMN tt_denunc.denunc_em IS 'Correo de contacto del denunciante (opcional)';
