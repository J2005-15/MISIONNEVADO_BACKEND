-- ═══════════════════════════════════════════════════════════════════════════
-- Verificación de la base de datos antes de publicar (SOLO LECTURA)
--
-- Pegar en Neon → SQL Editor y ejecutar. No modifica nada.
-- Cada fila debe decir "OK". Si alguna dice "FALTA", ejecutar la migración
-- indicada (carpeta database/migraciones) y volver a correr esta consulta.
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'Migración 001 — jornadas: cantidad atendida y observaciones' AS comprobacion,
       CASE WHEN (SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_name = 'tt_jornad' AND column_name IN ('jornad_ca', 'jornad_ob')) = 2
            THEN 'OK' ELSE 'FALTA → 001_jornada_operativo.sql' END AS resultado
UNION ALL
SELECT 'Migración 002 — correo en denuncias',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'tt_denunc' AND column_name = 'denunc_em')
            THEN 'OK' ELSE 'FALTA → 002_correo_denuncias.sql' END
UNION ALL
SELECT 'Migración 003 — recuperación de contraseña (tt_recup)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tt_recup')
            THEN 'OK' ELSE 'FALTA → 003_recuperacion_clave.sql' END
UNION ALL
SELECT 'Migración 004 — movimientos de inventario (tt_movin)',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tt_movin')
            THEN 'OK' ELSE 'FALTA → 004_movimientos_inventario.sql' END
UNION ALL
SELECT 'Trigger de aprobación de solicitudes de adopción',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.triggers WHERE event_object_table = 'tt_solic')
            THEN 'OK' ELSE 'FALTA el trigger siscvi_aprobar_solicitud' END
UNION ALL
SELECT 'Visibilidad en la web (adopci_vw / jornad_vw)',
       CASE WHEN (SELECT COUNT(*) FROM information_schema.columns
                  WHERE (table_name, column_name) IN (('tm_adopci', 'adopci_vw'), ('tt_jornad', 'jornad_vw'))) = 2
            THEN 'OK' ELSE 'FALTA alguna columna de visibilidad' END
UNION ALL
SELECT 'Roles 1 Administrador / 2 Veterinario / 3 Personal de Campo',
       CASE WHEN (SELECT string_agg(rolreg_id::text, ',' ORDER BY rolreg_id) FROM tm_rolreg WHERE rolreg_id IN (1, 2, 3)) = '1,2,3'
            THEN 'OK' ELSE 'REVISAR tm_rolreg' END
UNION ALL
SELECT 'Al menos un Administrador ACTIVO',
       CASE WHEN EXISTS (SELECT 1 FROM tm_usuario WHERE rolreg_id = 1 AND usuari_es = 'ACTIVO')
            THEN 'OK' ELSE 'FALTA un administrador activo' END
UNION ALL
SELECT 'Contenido de la web (hero / contacto / estadísticas)',
       CASE WHEN (SELECT COUNT(*) FROM tm_config
                  WHERE config_cl LIKE 'hero\_%' OR config_cl LIKE 'contacto\_%' OR config_cl = 'estadisticas') > 0
            THEN 'OK' ELSE 'VACÍO (la web usará los textos por defecto hasta publicar desde el panel)' END;
