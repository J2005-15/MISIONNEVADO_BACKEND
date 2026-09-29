const cloudinary = require('./cloudinary')

// Sube una imagen (buffer de multer) a Cloudinary y devuelve su URL segura
const subirImagen = (buffer, carpeta) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: carpeta, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result.secure_url))
    )
    stream.end(buffer)
  })

module.exports = { subirImagen }
