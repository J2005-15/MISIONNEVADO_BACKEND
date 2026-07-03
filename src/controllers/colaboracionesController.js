const { pool } = require('../config/db')
const { registrarAuditoria } = require('../helpers/auditoria')

// ─── OBTENER COLABORACIONES ───────────────────────────────────────────────────
const obtenerColaboraciones = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT * FROM TT_COLAB ORDER BY COLAB_ID DESC`
    )
    res.json({
      total: resultado.rows.length,
      registros: resultado.rows
    })
  } catch (error) {
    console.error('Error en obtenerColaboraciones:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener los registros de colaboraciones' })
  }
}

// ─── REGISTRAR COLABORACIÓN MAESTRO-DETALLE ───────────────────────────────────
const registrarColaboracion = async (req, res) => {
  const { COLAB_CO, COLAB_TI, COLAB_FE, COLAB_ES, COLAB_OB, PERSON_CE, PERSON_NO, datos_colaboracion } = req.body

  if (!COLAB_CO || !COLAB_TI || !COLAB_FE) {
    return res.status(400).json({ mensaje: 'Nombre, tipo y fecha de la colaboración son obligatorios' })
  }

  const cliente = await pool.connect()

  try {
    await cliente.query('BEGIN')

    // 1. Resolver PERSON_ID — buscar por cédula o crear persona nueva
    let personaId = null
    if (PERSON_CE) {
      const personaExistente = await cliente.query(
        `SELECT person_id FROM TM_PERSON WHERE LOWER(PERSON_CE) = LOWER($1) LIMIT 1`,
        [PERSON_CE]
      )
      if (personaExistente.rows.length > 0) {
        personaId = personaExistente.rows[0].person_id
      } else {
        const partes    = (PERSON_NO || PERSON_CE).trim().split(' ')
        const primerNom = partes[0]
        const apellido  = partes.slice(1).join(' ') || primerNom
        const nueva = await cliente.query(
          `INSERT INTO TM_PERSON (PERSON_NO, PERSON_AP, PERSON_CE)
           VALUES ($1, $2, $3) RETURNING person_id`,
          [primerNom, apellido, PERSON_CE]
        )
        personaId = nueva.rows[0].person_id
      }
    }

    // 2. Insertar cabecera — COLAB_ID es serial, la BD lo genera automáticamente
    const colabInsert = await cliente.query(
      `INSERT INTO TT_COLAB (PERSON_ID, COLAB_CO, COLAB_FE, COLAB_TI, COLAB_ES, COLAB_OB, COLAB_FRE)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
       RETURNING *`,
      [personaId, COLAB_CO, COLAB_FE, COLAB_TI, COLAB_ES || 'Recibida', COLAB_OB || null]
    )

    const colabId = colabInsert.rows[0].colab_id

    // 3. Insertar detalles si los hay (no bloquea si TT_DETCO tiene esquema distinto)
    if (Array.isArray(datos_colaboracion) && datos_colaboracion.length > 0) {
      for (const detalle of datos_colaboracion) {
        if (!detalle.DETDON_NO) continue
        try {
          await cliente.query(
            `INSERT INTO TT_DETCO (COLAB_ID, DETDON_NO, DETDON_CA, DETDON_UN, DETDON_VA)
             VALUES ($1, $2, $3, $4, $5)`,
            [colabId, detalle.DETDON_NO, detalle.DETDON_CA || 1, detalle.DETDON_UN || 'unidad', detalle.DETDON_VA || 0]
          )
        } catch (errDetalle) {
          console.warn('Advertencia en detalle de colaboración:', errDetalle.message)
        }
      }
    }

    // 4. Auditoría
    await registrarAuditoria(cliente, {
      modulo: 'COLABORACIONES',
      accion: `Registro de colaboración ID ${colabId} con ${Array.isArray(datos_colaboracion) ? datos_colaboracion.length : 0} registros`,
      tipo: 'INFO',
      ip: req.ip
    })

    await cliente.query('COMMIT')

    res.status(201).json({
      mensaje: 'Colaboración registrada exitosamente',
      registro: colabInsert.rows[0]
    })
  } catch (error) {
    // Si la inserción en TT_DETCO falla, la cabecera en TT_COLAB no existirá bajo ninguna circunstancia
    await cliente.query('ROLLBACK')
    console.error('Error en registrarColaboracion:', error.message)
    res.status(400).json({ mensaje: error.message || 'Error al procesar la transacción' })
  } finally {
    cliente.release()
  }
}

// ─── ACTUALIZAR ESTADO DE COLABORACIÓN ───────────────────────────────────────
const actualizarEstadoColab = async (req, res) => {
  const { id } = req.params
  const { COLAB_ES } = req.body
  const { USUARI_ID, ROLREG_ID } = req.usuario

  if (!COLAB_ES) {
    return res.status(400).json({ mensaje: 'El estado es obligatorio' })
  }

  try {
    const resultado = await pool.query(
      `UPDATE TT_COLAB SET COLAB_ES = $1 WHERE COLAB_ID = $2 RETURNING *`,
      [COLAB_ES, id]
    )

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Colaboración no encontrada' })
    }

    await registrarAuditoria(pool, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'COLABORACIONES',
      accion: `Colaboración ${id} actualizada a estado: ${COLAB_ES}`,
      tipo: 'INFO',
      ip: req.ip,
    })

    res.json({ mensaje: 'Estado actualizado', registro: resultado.rows[0] })
  } catch (error) {
    console.error('Error en actualizarEstadoColab:', error.message)
    res.status(500).json({ mensaje: 'Error al actualizar el estado de la colaboración' })
  }
}

module.exports = { obtenerColaboraciones, registrarColaboracion, actualizarEstadoColab }
