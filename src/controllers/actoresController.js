const { pool } = require('../config/db')

// ─── VOLUNTARIOS ──────────────────────────────────────────────────────────────
const registrarVoluntario = async (req, res) => {
  const {
    VOLUN_NO,   // nombres y apellidos
    VOLUN_CI,   // cédula de identidad
    VOLUN_TP,   // teléfono principal
    VOLUN_TS,   // teléfono secundario
    VOLUN_OS,   // organización social
    VOLUN_ES,   // estado y municipio
    VOLUN_PA,   // parroquia
    VOLUN_DI,   // dirección
    VOLUN_CO,   // nombre de la comuna
    VOLUN_CC,   // nombre del consejo comunal
  } = req.body

  try {
    const resultado = await pool.query(
      `INSERT INTO TM_VOLUNT
         (VOLUN_NO, VOLUN_CI, VOLUN_TP, VOLUN_TS, VOLUN_OS, VOLUN_ES,
          VOLUN_PA, VOLUN_DI, VOLUN_CO, VOLUN_CC, VOLUN_ST)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVO')
       RETURNING *`,
      [VOLUN_NO, VOLUN_CI, VOLUN_TP, VOLUN_TS, VOLUN_OS, VOLUN_ES,
       VOLUN_PA, VOLUN_DI, VOLUN_CO, VOLUN_CC]
    )
    res.status(201).json({
      mensaje:  'Voluntario registrado exitosamente',
      registro: resultado.rows[0],
    })
  } catch (error) {
    console.error('Error en registrarVoluntario:', error.message)
    res.status(500).json({ mensaje: 'Error al registrar el voluntario' })
  }
}

// ─── PROTECCIONISTAS ──────────────────────────────────────────────────────────
const registrarProteccionista = async (req, res) => {
  const {
    PRTEC_NO,   // nombres y apellidos del responsable
    PRTEC_CI,   // cédula de identidad
    PRTEC_TP,   // teléfono principal
    PRTEC_TS,   // teléfono secundario
    PRTEC_TI,   // tipo de organización: Independiente / Fundación
    PRTEC_ON,   // nombre de la organización
    PRTEC_RF,   // RIF
    PRTEC_DI,   // dirección
    PRTEC_ES,   // estado y municipio
    PRTEC_PA,   // parroquia
    PRTEC_CO,   // nombre de la comuna
    PRTEC_CC,   // nombre del consejo comunal
    PRTEC_CA,   // cantidad de caninos
    PRTEC_CF,   // cantidad de felinos
    PRTEC_CX,   // cantidad de otras especies
  } = req.body

  try {
    const resultado = await pool.query(
      `INSERT INTO TM_PROTEC
         (PRTEC_NO, PRTEC_CI, PRTEC_TP, PRTEC_TS, PRTEC_TI, PRTEC_ON, PRTEC_RF,
          PRTEC_DI, PRTEC_ES, PRTEC_PA, PRTEC_CO, PRTEC_CC,
          PRTEC_CA, PRTEC_CF, PRTEC_CX, PRTEC_ST)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'ACTIVO')
       RETURNING *`,
      [PRTEC_NO, PRTEC_CI, PRTEC_TP, PRTEC_TS, PRTEC_TI, PRTEC_ON, PRTEC_RF,
       PRTEC_DI, PRTEC_ES, PRTEC_PA, PRTEC_CO, PRTEC_CC,
       PRTEC_CA, PRTEC_CF, PRTEC_CX]
    )
    res.status(201).json({
      mensaje:  'Proteccionista registrado exitosamente',
      registro: resultado.rows[0],
    })
  } catch (error) {
    console.error('Error en registrarProteccionista:', error.message)
    res.status(500).json({ mensaje: 'Error al registrar el proteccionista' })
  }
}

module.exports = { registrarVoluntario, registrarProteccionista }
