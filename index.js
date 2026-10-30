const webTransfer = require('./webTransferServer');

async function iniciar() {
  try {
    // Puedes cambiar el puerto o la ruta de la carpeta si lo deseas
    const info = await webTransfer.start({ 
      port: 7891, 
      folder: require('path').join(require('os').homedir(), 'Drop') 
    });
    
    console.log('=== Servidor de Transferencia Activo ===');
    console.log(`IP Local: ${info.ip}`);
    console.log(`Puerto:   ${info.port}`);
    console.log(`URL web:  ${info.url}`);
    console.log(`Carpeta:  ${info.folder}`);
    console.log('========================================');

    // Escuchar eventos de archivos
    webTransfer.onEvent((ev) => {
      console.log(`[Evento] Tipo: ${ev.type} | Archivo: ${ev.name}`);
    });

  } catch (error) {
    console.error('Error al iniciar el servidor:', error);
  }
}

iniciar();
