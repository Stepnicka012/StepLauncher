import { BrowserWindow, dialog } from 'electron';
import updater from 'electron-updater';
const { autoUpdater } = updater;
import log from 'electron-log';

let mainWindow: BrowserWindow | null = null;

log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = false;

export async function initUpdater(window: BrowserWindow) {
  mainWindow = window;

  log.info('Iniciando comprobación de actualizaciones...');
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.updateInfo) {
      log.info('No hay actualizaciones disponibles');
      return;
    }
  } catch (err) {
    log.error('Error al buscar actualizaciones:', err);
    return;
  }

  autoUpdater.on('update-available', handleUpdateAvailable);
  autoUpdater.on('update-downloaded', handleUpdateDownloaded);
  autoUpdater.on('download-progress', handleDownloadProgress);
  autoUpdater.on('error', (err) => log.error('Error en updater:', err));
}

async function handleUpdateAvailable(info: any) {
  if (!mainWindow) return;

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Actualización disponible',
    message: `Se encontró una nueva versión (${info.version}). ¿Qué deseas hacer?`,
    detail:
      'Puedes actualizar ahora, más tarde o ignorar esta versión si no quieres recibirla de nuevo.',
    buttons: ['Actualizar', 'Más tarde', 'No actualizar'],
    defaultId: 0,
    cancelId: 1,
  });

  // 0 = Actualizar
  // 1 = Más tarde
  // 2 = No actualizar
  switch (result.response) {
    case 0:
      log.info('Descargando actualización...');
      autoUpdater.downloadUpdate();
      break;
    case 1:
      log.info('El usuario decidió actualizar más tarde.');
      break;
    case 2:
      log.info('El usuario rechazó esta actualización.');
      break;
  }
}

async function handleUpdateDownloaded() {
  if (!mainWindow) return;

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Actualización lista para instalar',
    message: 'La actualización ha sido descargada. ¿Deseas reiniciar para instalarla?',
    buttons: ['Instalar ahora', 'Más tarde'],
    defaultId: 0,
  });

  if (result.response === 0) {
    log.info('Instalando y reiniciando aplicación...');
    autoUpdater.quitAndInstall();
  } else {
    log.info('El usuario pospuso la instalación.');
  }
}

function handleDownloadProgress(progress: any) {
  const percent = Math.round(progress.percent);
  log.info(`Progreso de descarga: ${percent}%`);

  mainWindow?.webContents.send('update-progress', {
    percent,
    transferred: progress.transferred,
    total: progress.total,
    bytesPerSecond: progress.bytesPerSecond,
  });
}
