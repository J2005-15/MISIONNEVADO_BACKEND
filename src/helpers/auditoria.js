const { pool } = require('../config/db')

// Registra un evento en la bitácora (TH_AUDIT). Nunca lanza error.
// Si se llama dentro de una transacción (cliente de pool.connect()), el INSERT
// va dentro de un SAVEPOINT: si falla, se deshace solo ese registro y la
// operación principal puede confirmarse igual (sin savepoint, un fallo aquí
// abortaba la transacción y el COMMIT terminaba deshaciendo todo en silencio).
const registrarAuditoria = async (cliente, { usuari_id = null, email = null, rol = null, modulo, accion, tipo = 'INFO', ip = null }) => {
  const db = cliente || pool
  let conSavepoint = false
  try {
    if (typeof cliente?.release === 'function') {
      try { await cliente.query('SAVEPOINT sp_auditoria'); conSavepoint = true } catch { /* fuera de una transacción */ }
    }
    await db.query(
      `INSERT INTO TH_AUDIT (USUARI_ID, AUDIT_EM, AUDIT_RO, AUDIT_MO, AUDIT_AC, AUDIT_TI, AUDIT_IP)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [usuari_id, email, rol, modulo, accion, tipo, ip]
    )
    if (conSavepoint) await cliente.query('RELEASE SAVEPOINT sp_auditoria')
  } catch (err) {
    console.error('Error al registrar auditoría:', err.message)
    if (conSavepoint) await cliente.query('ROLLBACK TO SAVEPOINT sp_auditoria').catch(() => {})
  }
}

module.exports = { registrarAuditoria }
