const { pool } = require('../config/db')
const { responderDatosInvalidos } = require('../helpers/erroresBD')
const { registrarAuditoria } = require('../helpers/auditoria')
const avisos = require('../helpers/avisos')

// ─── OBTENER DENUNCIAS ────────────────────────────────────────────────────────
const obtenerDenuncias = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         d.DENUNC_ID,
         d.DENUNC_FE,
         d.DENUNC_MO,
         d.DENUNC_ES,
         d.DENUNC_EM,
         p.PERSON_CE,
         p.PERSON_NO,
         p.PERSON_AP,
         s.SECTOR_NO as SECTOR_NOMBRE
       FROM TT_DENUNC d
       LEFT JOIN TM_PERSON p ON d.PERSON_ID = p.PERSON_ID
       LEFT JOIN TM_SECTOR s ON d.SECTOR_ID = s.SECTOR_ID
       ORDER BY d.DENUNC_FE DESC`
    )
    res.json({
      total: resultado.rows.length,
      registros: resultado.rows
    })
  } catch (error) {
    console.error('Error en obtenerDenuncias:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al obtener los registros de denuncias' })
  }
}

// ─── REGISTRAR DENUNCIA (PÚBLICA O ANÓNIMA) ───────────────────────────────────
const registrarDenuncia = async (req, res) => {
  const { SECTOR_ID, DENUNC_FE, DENUNC_MO } = req.body
  // El panel envía la cédula como DENUNC_CE; el formulario de la web, como PERSON_ID
  const DENUNC_CE = String(req.body.DENUNC_CE ?? req.body.PERSON_ID ?? '')
  // Correo de contacto opcional (también para denuncias anónimas)
  const DENUNC_EM = String(req.body.DENUNC_EM ?? '').trim() || null

  if (!SECTOR_ID || !DENUNC_FE || !DENUNC_MO) {
    return res.status(400).json({ mensaje: 'Faltan datos obligatorios para el registro' })
  }
  if (DENUNC_EM && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(DENUNC_EM)) {
    return res.status(400).json({ mensaje: 'El correo electrónico no tiene un formato válido' })
  }

  const cliente = await pool.connect()

  try {
    await cliente.query('BEGIN')

    // SECTOR_ID puede llegar como ID (panel) o como nombre del sector (web)
    let sectorId = Number(SECTOR_ID)
    if (!Number.isInteger(sectorId)) {
      const sector = await cliente.query(
        'SELECT SECTOR_ID FROM TM_SECTOR WHERE LOWER(SECTOR_NO) = LOWER($1) LIMIT 1',
        [String(SECTOR_ID).trim()]
      )
      if (sector.rows.length === 0) {
        await cliente.query('ROLLBACK')
        return res.status(400).json({ mensaje: 'El sector seleccionado no es válido' })
      }
      sectorId = sector.rows[0].sector_id
    }

    let personaId = null

    // Si se envía cédula, se asocia o se crea
    if (DENUNC_CE && DENUNC_CE.trim() !== '') {
      const busqueda = await cliente.query('SELECT PERSON_ID FROM TM_PERSON WHERE PERSON_CE = $1', [DENUNC_CE])

      if (busqueda.rows.length > 0) {
        personaId = busqueda.rows[0].person_id
      } else {
        const personaInsert = await cliente.query(
          `INSERT INTO TM_PERSON (PERSON_CE, PERSON_NO, PERSON_AP)
           VALUES ($1, 'Anónimo', 'Anónimo') RETURNING PERSON_ID`,
          [DENUNC_CE]
        )
        personaId = personaInsert.rows[0].person_id
      }
    }

    const denunciaInsert = await cliente.query(
      `INSERT INTO TT_DENUNC (PERSON_ID, SECTOR_ID, DENUNC_FE, DENUNC_MO, DENUNC_ES, DENUNC_EM)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [personaId, sectorId, DENUNC_FE, DENUNC_MO, req.body.DENUNC_ES || 'EN_PROCESO', DENUNC_EM]
    )

    await registrarAuditoria(cliente, {
      modulo: 'DENUNCIAS',
      accion: `Registro de denuncia creado (Anónimo: ${personaId === null})`,
      tipo: 'INFO',
      ip: req.ip
    })

    const sectorNombre = (await cliente.query('SELECT SECTOR_NO FROM TM_SECTOR WHERE SECTOR_ID = $1', [sectorId])).rows[0]?.sector_no

    await cliente.query('COMMIT')

    if (DENUNC_EM) {
      avisos.denunciaRecibida({ email: DENUNC_EM, numero: denunciaInsert.rows[0].denunc_id, sector: sectorNombre })
    }

    res.status(201).json({
      mensaje: 'Denuncia registrada exitosamente',
      registro: denunciaInsert.rows[0]
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    console.error('Error en registrarDenuncia:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ error: error.message })
  } finally {
    cliente.release()
  }
}

// ─── ACTUALIZAR ESTADO DE DENUNCIA ────────────────────────────────────────────
const actualizarDenuncia = async (req, res) => {
  const { id } = req.params
  const { DENUNC_ES } = req.body
  const { USUARI_ID, ROLREG_ID } = req.usuario

  if (!DENUNC_ES) {
    return res.status(400).json({ mensaje: 'Debe especificar el nuevo estado' })
  }

  try {
    const anterior = (await pool.query('SELECT DENUNC_ES FROM TT_DENUNC WHERE DENUNC_ID = $1', [id])).rows[0]
    const actualizacion = await pool.query(
      `UPDATE TT_DENUNC SET DENUNC_ES = $1 WHERE DENUNC_ID = $2 RETURNING *`,
      [DENUNC_ES, id]
    )

    if (actualizacion.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Registro no encontrado' })
    }

    // Aviso al denunciante si dejó correo y el estado realmente cambió
    const denuncia = actualizacion.rows[0]
    if (denuncia.denunc_em && anterior?.denunc_es !== denuncia.denunc_es) {
      avisos.denunciaActualizada({ email: denuncia.denunc_em, numero: denuncia.denunc_id, estado: denuncia.denunc_es })
    }

    await registrarAuditoria(pool, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'DENUNCIAS_ADMIN',
      accion: `Denuncia ${id} actualizada a: ${DENUNC_ES}`,
      tipo: 'INFO',
      ip: req.ip
    })

    res.json({
      mensaje: 'Denuncia actualizada correctamente',
      registro: actualizacion.rows[0]
    })
  } catch (error) {
    console.error('Error en actualizarDenuncia:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al modificar los datos de la denuncia' })
  }
}

module.exports = { obtenerDenuncias, registrarDenuncia, actualizarDenuncia }
