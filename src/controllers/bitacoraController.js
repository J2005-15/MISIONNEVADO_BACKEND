const { pool } = require('../config/db')
const { responderDatosInvalidos } = require('../helpers/erroresBD')

// ─── OBTENER BITÁCORA DE AUDITORÍA ────────────────────────────────────────────
const obtenerBitacora = async (req, res) => {
  const { modulo, tipo } = req.query
  // Valores fuera de rango o no numéricos → por defecto (máx. 500 eventos por página)
  const limite = Math.min(Math.max(parseInt(req.query.limite, 10) || 50, 1), 500)
  const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1)
  const offset = (pagina - 1) * limite

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
         a.AUDIT_ID,
         a.AUDIT_MO  AS modulo,
         a.AUDIT_AC  AS accion,
         a.AUDIT_TI  AS tipo,
         COALESCE(a.AUDIT_EM, u.USUARI_EM, u.USUARI_NO) AS usuario,
         -- AUDIT_RO a veces guarda el ID del rol ('1') en vez del nombre
         CASE WHEN a.AUDIT_RO ~ '^[0-9]+$'
              THEN (SELECT ROLREG_NO FROM TM_ROLREG WHERE ROLREG_ID = a.AUDIT_RO::int)
              ELSE COALESCE(a.AUDIT_RO, r.ROLREG_NO)
         END AS rol,
         a.AUDIT_IP  AS ip,
         a.AUDIT_FE  AS timestamp
       FROM  TH_AUDIT a
       LEFT JOIN TM_USUARIO u ON u.USUARI_ID = a.USUARI_ID
       LEFT JOIN TM_ROLREG  r ON r.ROLREG_ID = u.ROLREG_ID
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
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al obtener la bitácora de auditoría' })
  }
}

module.exports = { obtenerBitacora }
