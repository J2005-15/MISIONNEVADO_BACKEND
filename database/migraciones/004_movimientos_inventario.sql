-- ═══════════════════════════════════════════════════════════════════════════
-- Migración 004 — Movimientos de inventario (Ajustar Stock / Historial)
-- Fecha: 2026-09-29
--
-- Cada cambio de existencias de un insumo queda registrado:
--   ENTRADA  → suma unidades (compra, donación, reposición)
--   SALIDA   → resta unidades (consumo, vencimiento, daño)
--   AJUSTE   → fija la existencia a un conteo físico
-- Guarda la existencia anterior y la nueva, el motivo y quién lo hizo.
--
-- Al final se registra la existencia actual de cada insumo como
-- "Existencia inicial" para que el historial no empiece vacío.
--
-- Ejecutar UNA vez en cada base de datos (local y Neon) desde pgAdmin.
-- Es idempotente: si se ejecuta dos veces no produce errores ni duplicados.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tt_movin (
  movin_id  SERIAL      PRIMARY KEY,
  insum_id  INTEGER     NOT NULL REFERENCES tm_insum (insum_id) ON DELETE CASCADE,
  usuari_id INTEGER     REFERENCES tm_usuario (usuari_id) ON DELETE SET NULL,
  movin_ti  VARCHAR(10) NOT NULL CHECK (movin_ti IN ('ENTRADA', 'SALIDA', 'AJUSTE')),
  movin_ca  INTEGER     NOT NULL CHECK (movin_ca >= 0),
  movin_an  INTEGER     NOT NULL,
  movin_nu  INTEGER     NOT NULL CHECK (movin_nu >= 0),
  movin_mo  TEXT        NOT NULL,
  movin_fe  TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_movin_insumo ON tt_movin (insum_id, movin_fe DESC);
CREATE INDEX IF NOT EXISTS ix_movin_fecha  ON tt_movin (movin_fe);

COMMENT ON TABLE  tt_movin          IS 'Movimientos de existencias de insumos (entradas, salidas y ajustes)';
COMMENT ON COLUMN tt_movin.movin_ti IS 'ENTRADA, SALIDA o AJUSTE';
COMMENT ON COLUMN tt_movin.movin_ca IS 'Cantidad movida (en AJUSTE, el conteo físico registrado)';
COMMENT ON COLUMN tt_movin.movin_an IS 'Existencia antes del movimiento';
COMMENT ON COLUMN tt_movin.movin_nu IS 'Existencia después del movimiento';
COMMENT ON COLUMN tt_movin.movin_mo IS 'Motivo del movimiento';

-- Existencia inicial de los insumos que aún no tienen movimientos
INSERT INTO tt_movin (insum_id, usuari_id, movin_ti, movin_ca, movin_an, movin_nu, movin_mo, movin_fe)
SELECT i.insum_id, i.usuari_id, 'ENTRADA', GREATEST(i.insumo_ex, 0), 0, GREATEST(i.insumo_ex, 0),
       'Existencia inicial registrada', COALESCE(i.insum_fre, NOW())
FROM   tm_insum i
WHERE  NOT EXISTS (SELECT 1 FROM tt_movin m WHERE m.insum_id = i.insum_id);
