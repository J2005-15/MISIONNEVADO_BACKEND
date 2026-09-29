const { pool } = require('../config/db')
const { responderDatosInvalidos } = require('../helpers/erroresBD')
const { registrarAuditoria } = require('../helpers/auditoria')

// Cantidades del inventario: enteros >= 0 (TM_INSUM guarda enteros)
const entero = (v) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 ? n : null
}

// Registra un movimiento en TT_MOVIN (dentro de la transacción recibida)
const registrarMovimiento = (cliente, { insumId, usuariId, tipo, cantidad, anterior, nueva, motivo }) =>
  cliente.query(
    `INSERT INTO TT_MOVIN (INSUM_ID, USUARI_ID, MOVIN_TI, MOVIN_CA, MOVIN_AN, MOVIN_NU, MOVIN_MO)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [insumId, usuariId ?? null, tipo, cantidad, anterior, nueva, motivo]
  )

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
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al obtener registros del inventario' })
  }
}

// ─── REGISTRAR CONSUMO DE INSUMO CON BLOQUEO CONCURRENTE ──────────────────────
const consumirInsumo = async (req, res) => {
  const { INSUM_ID, CANT_CONSU, MOT_CONSU } = req.body
  const { USUARI_ID, ROLREG_ID } = req.usuario
  const cantidad = entero(CANT_CONSU)

  if (!INSUM_ID || !cantidad) {
    return res.status(400).json({ mensaje: 'Datos obligatorios incompletos o cantidad inválida' })
  }

  const cliente = await pool.connect()

  try {
    await cliente.query('BEGIN')

    // Validacion de Stock estricta con SELECT FOR UPDATE para evitar condiciones de carrera
    const busquedaInsumo = await cliente.query(
      `SELECT INSUMO_EX, INSUMO_NO FROM TM_INSUM WHERE INSUM_ID = $1 FOR UPDATE`,
      [INSUM_ID]
    )

    if (busquedaInsumo.rows.length === 0) {
      throw new Error('El insumo solicitado no existe')
    }

    const existenciaActual = Number(busquedaInsumo.rows[0].insumo_ex)

    if (existenciaActual < cantidad) {
      throw new Error('Stock insuficiente para procesar el consumo solicitado')
    }

    const nuevaExistencia = existenciaActual - cantidad

    // Actualizar el stock
    const insumoUpdate = await cliente.query(
      `UPDATE TM_INSUM SET INSUMO_EX = $1 WHERE INSUM_ID = $2 RETURNING *`,
      [nuevaExistencia, INSUM_ID]
    )

    await registrarMovimiento(cliente, {
      insumId: INSUM_ID, usuariId: USUARI_ID, tipo: 'SALIDA', cantidad,
      anterior: existenciaActual, nueva: nuevaExistencia, motivo: MOT_CONSU || 'Consumo',
    })

    // Auditoria
    await registrarAuditoria(cliente, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'INVENTARIO',
      accion: `Consumo de ${busquedaInsumo.rows[0].insumo_no}. Cantidad: ${cantidad}. Motivo: ${MOT_CONSU || '—'}`,
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
    if (responderDatosInvalidos(res, error)) return
    // Sin código de PostgreSQL = aviso de negocio lanzado arriba (insumo inexistente, stock insuficiente)
    if (error.code) return res.status(500).json({ mensaje: 'Error al procesar la solicitud de consumo' })
    res.status(400).json({ mensaje: error.message || 'Error al procesar la solicitud de consumo' })
  } finally {
    cliente.release()
  }
}

// ─── AJUSTAR STOCK: ENTRADA / SALIDA / AJUSTE ─────────────────────────────────
// POST /api/inventario/:id/movimiento  { tipo, cantidad, motivo }
//   ENTRADA → suma · SALIDA → resta (sin quedar en negativo) · AJUSTE → fija el conteo físico
const TIPOS_MOVIMIENTO = ['ENTRADA', 'SALIDA', 'AJUSTE']

const registrarMovimientoInsumo = async (req, res) => {
  const { id } = req.params
  const tipo     = String(req.body?.tipo ?? '').toUpperCase()
  const cantidad = entero(req.body?.cantidad)
  const motivo   = String(req.body?.motivo ?? '').trim()
  const { USUARI_ID, ROLREG_ID } = req.usuario

  if (!/^\d+$/.test(String(id))) return res.status(400).json({ mensaje: 'Insumo no válido' })
  if (!TIPOS_MOVIMIENTO.includes(tipo)) return res.status(400).json({ mensaje: 'El tipo de movimiento debe ser Entrada, Salida o Ajuste' })
  if (cantidad === null) return res.status(400).json({ mensaje: 'La cantidad debe ser un número entero mayor o igual a 0' })
  if (tipo !== 'AJUSTE' && cantidad === 0) return res.status(400).json({ mensaje: 'La cantidad debe ser mayor que 0' })
  if (!motivo) return res.status(400).json({ mensaje: 'Indique el motivo del movimiento' })
  if (motivo.length > 300) return res.status(400).json({ mensaje: 'El motivo no puede superar 300 caracteres' })

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const fila = (await cliente.query(
      'SELECT INSUMO_EX, INSUMO_NO, INSUMO_UN FROM TM_INSUM WHERE INSUM_ID = $1 FOR UPDATE', [id]
    )).rows[0]
    if (!fila) {
      await cliente.query('ROLLBACK')
      return res.status(404).json({ mensaje: 'El insumo no existe' })
    }

    const anterior = Number(fila.insumo_ex)
    const nueva = tipo === 'ENTRADA' ? anterior + cantidad
                : tipo === 'SALIDA'  ? anterior - cantidad
                : cantidad
    if (nueva < 0) {
      await cliente.query('ROLLBACK')
      return res.status(400).json({ mensaje: `No hay suficiente existencia: hay ${anterior} ${fila.insumo_un} y se quieren retirar ${cantidad}.` })
    }
    if (tipo === 'AJUSTE' && nueva === anterior) {
      await cliente.query('ROLLBACK')
      return res.status(400).json({ mensaje: 'El conteo es igual a la existencia actual: no hay nada que ajustar.' })
    }

    const actualizado = (await cliente.query(
      'UPDATE TM_INSUM SET INSUMO_EX = $1 WHERE INSUM_ID = $2 RETURNING *', [nueva, id]
    )).rows[0]
    await registrarMovimiento(cliente, { insumId: id, usuariId: USUARI_ID, tipo, cantidad, anterior, nueva, motivo })

    const verbo = { ENTRADA: 'Entrada', SALIDA: 'Salida', AJUSTE: 'Ajuste por conteo' }[tipo]
    await registrarAuditoria(cliente, {
      usuari_id: USUARI_ID,
      rol:       ROLREG_ID,
      modulo:    'INVENTARIO',
      accion:    `${verbo} de stock — ${fila.insumo_no}: ${anterior} → ${nueva} ${fila.insumo_un}. Motivo: ${motivo}`,
      tipo:      tipo === 'AJUSTE' ? 'ALERTA' : 'INFO',
      ip:        req.ip,
    })
    await cliente.query('COMMIT')

    res.status(201).json({ mensaje: 'Movimiento registrado', registro: actualizado })
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {})
    console.error('Error en registrarMovimientoInsumo:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'No se pudo registrar el movimiento de stock' })
  } finally {
    cliente.release()
  }
}

// ─── HISTORIAL DE MOVIMIENTOS DE UN INSUMO ────────────────────────────────────
// GET /api/inventario/:id/movimientos
const historialInsumo = async (req, res) => {
  const { id } = req.params
  if (!/^\d+$/.test(String(id))) return res.status(400).json({ mensaje: 'Insumo no válido' })
  try {
    const insumo = (await pool.query('SELECT INSUMO_NO, INSUMO_UN, INSUMO_EX FROM TM_INSUM WHERE INSUM_ID = $1', [id])).rows[0]
    if (!insumo) return res.status(404).json({ mensaje: 'El insumo no existe' })
    const movimientos = (await pool.query(
      `SELECT m.movin_id, m.movin_ti, m.movin_ca, m.movin_an, m.movin_nu, m.movin_mo, m.movin_fe,
              COALESCE(NULLIF(TRIM(CONCAT(p.person_no, ' ', p.person_ap)), ''), u.usuari_no, 'Sistema') AS usuario
       FROM   TT_MOVIN m
       LEFT JOIN TM_USUARIO u ON u.usuari_id = m.usuari_id
       LEFT JOIN TM_PERSON  p ON p.person_id = u.person_id
       WHERE  m.insum_id = $1
       ORDER  BY m.movin_fe DESC, m.movin_id DESC
       LIMIT  300`,
      [id]
    )).rows
    res.json({ insumo, total: movimientos.length, registros: movimientos })
  } catch (error) {
    console.error('Error en historialInsumo:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'No se pudo obtener el historial del insumo' })
  }
}

// ─── REGISTRAR NUEVO INSUMO ───────────────────────────────────────────────────
const crearInsumo = async (req, res) => {
  const { CATEGO_ID, INSUMO_NO, INSUMO_UN, INSUMO_FE, INSUMO_SM, INSUMO_EX } = req.body
  const { USUARI_ID, ROLREG_ID } = req.usuario

  if (!INSUMO_NO || !INSUMO_UN) {
    return res.status(400).json({ mensaje: 'Nombre y unidad de medida son obligatorios' })
  }
  const existencia = entero(INSUMO_EX || 0)
  const minimo     = entero(INSUMO_SM || 0)
  if (existencia === null || minimo === null) {
    return res.status(400).json({ mensaje: 'Las existencias y el stock mínimo deben ser números enteros mayores o iguales a 0' })
  }
  if (INSUMO_FE && (!/^\d{4}-\d{2}-\d{2}$/.test(INSUMO_FE) || Number.isNaN(Date.parse(INSUMO_FE)))) {
    return res.status(400).json({ mensaje: 'La fecha de vencimiento no es válida' })
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
      } catch { /* TM_CATEG no disponible */ }
    }
  }
  if (!categoriaId) {
    return res.status(400).json({ mensaje: 'Seleccione la categoría del insumo' })
  }

  const cliente = await pool.connect()
  try {
    await cliente.query('BEGIN')
    const resultado = await cliente.query(
      `INSERT INTO TM_INSUM
         (CATEGO_ID, INSUMO_NO, INSUMO_UN, INSUMO_FE, INSUMO_SM, INSUMO_EX, USUARI_ID, INSUM_FRE)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       RETURNING *`,
      [categoriaId, INSUMO_NO, INSUMO_UN, INSUMO_FE || null, minimo, existencia, USUARI_ID || null]
    )
    const nuevo = resultado.rows[0]

    await registrarMovimiento(cliente, {
      insumId: nuevo.insum_id, usuariId: USUARI_ID, tipo: 'ENTRADA', cantidad: existencia,
      anterior: 0, nueva: existencia, motivo: 'Existencia inicial registrada',
    })

    await registrarAuditoria(cliente, {
      usuari_id: USUARI_ID,
      rol: ROLREG_ID,
      modulo: 'INVENTARIO',
      accion: `Nuevo insumo registrado: ${INSUMO_NO} — Cantidad inicial: ${existencia}`,
      tipo: 'INFO',
      ip: req.ip,
    })
    await cliente.query('COMMIT')

    res.status(201).json({
      mensaje: 'Insumo registrado exitosamente',
      registro: nuevo,
    })
  } catch (error) {
    await cliente.query('ROLLBACK').catch(() => {})
    if (error.code === '23503') {
      return res.status(400).json({ mensaje: 'La categoría seleccionada no existe' })
    }
    console.error('Error en crearInsumo:', error.message)
    if (responderDatosInvalidos(res, error)) return
    res.status(500).json({ mensaje: 'Error al registrar el insumo en el inventario' })
  } finally {
    cliente.release()
  }
}

module.exports = { obtenerInsumos, consumirInsumo, crearInsumo, registrarMovimientoInsumo, historialInsumo }
