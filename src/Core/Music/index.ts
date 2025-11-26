// import { MediaDownloader } from "./download.js";
// import type { ProgressData, DownloadResult} from "../../Utils/Types.js";

// (async () => {
//     const downloader = new MediaDownloader();

//     downloader.on("start", data => console.log("Empezando:", data));

//     downloader.on("progress:video", (p: ProgressData) => {
//         console.log(`[VIDEO] ${p.readable ?? `${p.percent.toFixed(2)}%`} (${p.percent.toFixed(2)}%)`);
//     });

//     downloader.on("progress:audio", (p: ProgressData) => {
//         console.log(`[AUDIO] ${p.readable ?? `${p.percent.toFixed(2)}%`} (${p.percent.toFixed(2)}%)`);
//     });

//     downloader.on("finish", (info: DownloadResult) => {
//         console.log("✅ Descarga completa:", info);
//     });

//     try {
//         await downloader.download("https://www.youtube.com/watch?v=7W5bZJY2IPI", {
//             downloadVideo: true,
//             downloadAudio: true,
//             qualityVideo: "low",
//             qualityAudio: "low",
//         });
//     } catch (err) {
//         console.error("❌ Error en la descarga:", err);
//     }
// })();

// import { readMusicFolder, generateReport }    from './localMusic.js';

// async function ejemploDesarrollo() {
//   try {
//     // Configuración básica
//     const config = {
//       basePath: 'C:/Users/Stepnicka/Music', // Tu carpeta de música
//       recursive: true, // Buscar en subcarpetas
//       ignoreFolders: ['temp', 'backup', '@eaDir'], // Carpetas a ignorar
//       supportedFormats: ['.mp3', '.ogg', '.aac', '.m4a'],
//       maxFileSize: 50 * 1024 * 1024, // 50MB máximo
//       concurrency: 5, // Archivos simultáneos
//       timeout: 15000 // 15 segundos por archivo
//     };

//     // Procesar la carpeta
//     const resultado = await readMusicFolder(config);
    
//     // Generar reporte
//     console.log(generateReport(resultado));
    
//     // Usar los datos en tu aplicación
//     resultado.success.forEach(cancion => {
//       console.log(`
//         🎵 Canción: ${cancion.title}
//         🎤 Artista: ${cancion.artist || 'Desconocido'}
//         💿 Álbum: ${cancion.album || 'Desconocido'}
//         ⏱️ Duración: ${cancion.duration ? Math.round(cancion.duration) + 's' : 'N/A'}
//         📁 Archivo: ${cancion.fileName}
//       `);
      
//       // Si tiene portada, puedes usarla en HTML
//       if (cancion.coverArt) {
//         console.log(`🖼️ Tiene portada: ${cancion.coverArt.mimeType}`);
//       }
//     });
    
//     return resultado;
    
//   } catch (error) {
//     console.error('Error procesando música:', error);
//   }
// }

// // Ejecutar
// ejemploDesarrollo();