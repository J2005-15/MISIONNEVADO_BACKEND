const multer = require('multer')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Solo se permiten archivos de imagen'))
  },
})

// Recibe una imagen en el campo `campo`; los errores de multer (no es imagen,
// supera 5 MB) se responden como 400 con un mensaje claro en vez de un 500.
const recibirImagen = (campo) => (req, res, next) =>
  upload.single(campo)(req, res, (err) => {
    if (!err) return next()
    const mensaje = err.code === 'LIMIT_FILE_SIZE' ? 'La imagen supera el máximo de 5 MB' : err.message
    res.status(400).json({ mensaje })
  })

module.exports = upload
module.exports.recibirImagen = recibirImagen
