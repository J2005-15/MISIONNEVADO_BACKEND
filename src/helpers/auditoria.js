const { pool } = require('../config/db')

const registrarAuditoria = async (cliente, { usuari_id = null, email = null, rol = null, modulo, accion, tipo = 'INFO', ip = null }) => {
  try {
    const db = cliente || pool
    await db.query(
      `INSERT INTO TH_AUDIT (USUARI_ID, AUDIT_EM, AUDIT_RO, AUDIT_MO, AUDIT_AC, AUDIT_TI, AUDIT_IP)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [usuari_id, email, rol, modulo, accion, tipo, ip]
    )
  } catch (err) {
    console.error('Error al registrar auditoría:', err.message)
  }
}

module.exports = { registrarAuditoria }
