const { pool } = require('../config/db')
const { registrarAuditoria } = require('../helpers/auditoria')

// ─── OBTENER INSUMOS ──────────────────────────────────────────────────────────
const obtenerInsumos = async (_req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT i.*, c.catego_no
       FROM   TM_INSUM i
       LEFT JOIN TM_CATEGO c ON c.catego_id = i.catego_id
       ORDER  BY i.INSUMO_NO ASC`
    )
    res.json({
      total: resultado.rows.length,
      registros: resultado.rows
    })
  } catch (error) {
    console.error('Error en obtenerInsumos:', error.message)
    res.status(500).json({ mensaje: 'Error al obtener registros del inventario' })
  }
}

// ─── REGISTRAR CONSUMO DE INSUMO CON BLOQUEO CONCURRENTE ──────────────────────
const consumirInsumo = async (req, res) => {
  const { INSUM_ID, CANT_CONSU, MOT_CONSU } = req.body
  const { USUARI_ID, ROLREG_ID } = req.usuario

  if (!INSUM_ID || !CANT_CONSU || CANT_CONSU <= 0) {
    return res.status(400).json({ mensaje: 'Datos obligatorios incompletos o cantidad inválida' })
  }

  const cliente = await pool.connect()

  try {
    await cliente.query('BEGIN')

    // Validacion de Stock estricta con SELECT FOR UPDATE para evitar condiciones de carrera
    const busquedaInsumo = await cliente.query(
      `SELECT INSUMO_EX FROM TM_INSUM WHERE INSUM_ID = $1 FOR UPDATE`,
      [INSUM_ID]
    )

    if (busquedaInsumo.rows.length === 0) {
      throw new Error('El insumo solicitado no existe')
    }

    const existenciaActual = parseFloat(busquedaInsumo.rows[0].insumo_ex)
    const cantidadRequerida = parseFloat(CANT_CONSU)

    if (existenciaActual < cantidadRequerida) {
      throw new Error('Stock insuficiente para procesar el consumo solicitado')
    }

    const nuevaExistencia = existenciaActual - cantidadRequerida

    // Actualizar el stock
    const insumoUpdate = await cliente.query(
      `UPDATE TM_INSUM SET INSUMO_EX = $1 WHERE INSUM_ID = $2 RETURNING *`,
      [nuevaExistencia, INSUM_ID]
    )

    // Auditoria
    await registrarAuditoria(cliente, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'INVENTARIO',
      accion: `Consumo de insumo ${INSUM_ID}. Cantidad: ${cantidadRequerida}. Motivo: ${MOT_CONSU}`,
      tipo: 'INFO',
      ip: req.ip
    })

    await cliente.query('COMMIT')

    res.status(201).json({
      mensaje: 'Consumo procesado exitosamente',
      registro: insumoUpdate.rows[0]
    })
  } catch (error) {
    await cliente.query('ROLLBACK')
    console.error('Error en consumirInsumo:', error.message)
    res.status(400).json({ mensaje: error.message || 'Error al procesar la solicitud de consumo' })
  } finally {
    cliente.release()
  }
}

// ─── REGISTRAR NUEVO INSUMO ───────────────────────────────────────────────────
const crearInsumo = async (req, res) => {
  const { CATEGO_ID, INSUMO_NO, INSUMO_UN, INSUMO_FE, INSUMO_SM, INSUMO_EX } = req.body
  const { USUARI_ID, ROLREG_ID } = req.usuario

  if (!INSUMO_NO || !INSUMO_UN) {
    return res.status(400).json({ mensaje: 'Nombre y unidad de medida son obligatorios' })
  }

  // Resolver CATEGO_ID: puede llegar como entero o como nombre de categoría
  let categoriaId = null
  if (CATEGO_ID) {
    const comoEntero = parseInt(CATEGO_ID, 10)
    if (!isNaN(comoEntero)) {
      categoriaId = comoEntero
    } else {
      try {
        const cat = await pool.query(
          `SELECT catego_id FROM TM_CATEGO WHERE LOWER(catego_no) = LOWER($1) LIMIT 1`,
          [String(CATEGO_ID).trim()]
        )
        if (cat.rows.length > 0) categoriaId = cat.rows[0].catego_id
      } catch { /* TM_CATEG no disponible — se guarda sin categoría */ }
    }
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO TM_INSUM
         (CATEGO_ID, INSUMO_NO, INSUMO_UN, INSUMO_FE, INSUMO_SM, INSUMO_EX, USUARI_ID, INSUM_FRE)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        categoriaId,
        INSUMO_NO,
        INSUMO_UN,
        INSUMO_FE || null,
        Number(INSUMO_SM) || 0,
        Number(INSUMO_EX) || 0,
        USUARI_ID || null,
      ]
    )

    await registrarAuditoria(pool, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'INVENTARIO',
      accion: `Nuevo insumo registrado: ${INSUMO_NO} — Cantidad inicial: ${INSUMO_EX}`,
      tipo: 'INFO',
      ip: req.ip,
    })

    res.status(201).json({
      mensaje: 'Insumo registrado exitosamente',
      registro: resultado.rows[0],
    })
  } catch (error) {
    console.error('Error en crearInsumo:', error.message)
    res.status(500).json({ mensaje: 'Error al registrar el insumo en el inventario' })
  }
}

module.exports = { obtenerInsumos, consumirInsumo, crearInsumo }
