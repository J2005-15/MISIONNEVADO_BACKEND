-- ═══════════════════════════════════════════════════════════════════════════
-- Migración 001 — Registro del operativo de jornada (cierre de jornada)
-- Fecha: 2026-09-28
--
-- Agrega a TT_JORNAD la cantidad de animales atendidos y las observaciones que
-- captura la ventana "Registrar Operativo" del panel. Al registrarse, la
-- jornada pasa a estado FINALIZADA.
--
-- Ejecutar UNA vez en cada base de datos (local y Neon) desde pgAdmin.
-- Es idempotente: si se ejecuta dos veces no produce errores ni duplica nada.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE tt_jornad
  ADD COLUMN IF NOT EXISTS jornad_ca INTEGER,
  ADD COLUMN IF NOT EXISTS jornad_ob TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tt_jornad_jornad_ca_check'
  ) THEN
    ALTER TABLE tt_jornad ADD CONSTRAINT tt_jornad_jornad_ca_check CHECK (jornad_ca >= 0);
  END IF;
END $$;

COMMENT ON COLUMN tt_jornad.jornad_ca IS 'Cantidad de animales atendidos en el operativo';
COMMENT ON COLUMN tt_jornad.jornad_ob IS 'Observaciones del operativo';
