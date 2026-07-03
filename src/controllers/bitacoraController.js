const { pool } = require('../config/db')

// ─── OBTENER BITÁCORA DE AUDITORÍA ────────────────────────────────────────────
const obtenerBitacora = async (req, res) => {
  const { modulo, tipo, pagina = 1, limite = 50 } = req.query
  const offset = (Number(pagina) - 1) * Number(limite)

  const condiciones = []
  const valores     = []
  let   idx         = 1

  if (modulo && modulo !== 'Todos') {
    condiciones.push(`AUDIT_MO = $${idx++}`)
    valores.push(modulo)
  }
  if (tipo) {
    condiciones.push(`AUDIT_TI = $${idx++}`)
    valores.push(tipo)
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''
  const filtroValores = [...valores]

  valores.push(Number(limite), offset)
  const idxLimite = idx++
  const idxOffset = idx

  try {
    const resultado = await pool.query(
      `SELECT
         AUDIT_ID,
         AUDIT_MO  AS modulo,
         AUDIT_AC  AS accion,
         AUDIT_TI  AS tipo,
         AUDIT_EM  AS usuario,
         AUDIT_RO  AS rol,
         AUDIT_IP  AS ip,
         AUDIT_FE  AS timestamp
       FROM  TH_AUDIT
       ${where}
       ORDER BY AUDIT_FE DESC
       LIMIT $${idxLimite} OFFSET $${idxOffset}`,
      valores
    )

    const conteo = await pool.query(
      `SELECT COUNT(*) AS total FROM TH_AUDIT ${where}`,
      filtroValores
    )

    res.json({
      total:     Number(conteo.rows[0].total),
      pagina:    Number(pagina),
      registros: resultado.rows,
    })
  } catch (error) {
    console.error('Error en obtenerBitacora:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener la bitácora de auditoría' })
  }
}

module.exports = { obtenerBitacora }
