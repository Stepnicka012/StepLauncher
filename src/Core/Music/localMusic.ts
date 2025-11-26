import type { MusicReaderConfig, MusicData, ProcessingResult } from "../../Utils/Types.js";
import { readdir, stat } from 'fs/promises';
import { join, extname, basename } from 'path';
import * as musicMetadata from 'music-metadata';


class AdvancedMusicFolderReader {
  private config: Required<MusicReaderConfig>;
  private processedFiles: Set<string> = new Set();

  constructor(config: MusicReaderConfig) {
    this.config = {
      recursive: true,
      ignoreFolders: [],
      supportedFormats: ['.mp3', '.ogg', '.aac', '.m4a'],
      maxFileSize: 100 * 1024 * 1024, // 100MB
      concurrency: 10,
      timeout: 30000,
      ...config
    };
  }

  async readMusicFolder(): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      success: [],
      errors: [],
      stats: {
        totalFiles: 0,
        processed: 0,
        failed: 0,
        totalDuration: 0
      }
    };

    try {
      console.log(`🔍 Escaneando carpeta: ${this.config.basePath}`);
      
      const allFiles = await this.collectMusicFiles(this.config.basePath);
      result.stats.totalFiles = allFiles.length;
      
      console.log(`📁 Encontrados ${allFiles.length} archivos de música`);

      await this.processFilesWithConcurrency(allFiles, result);
      
      console.log(`✅ Procesamiento completado: ${result.success.length} éxitos, ${result.errors.length} errores`);
      
      return result;
    } catch (error) {
      console.error('❌ Error crítico leyendo la carpeta de música:', error);
      throw error;
    }
  }

  private async collectMusicFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const items = await readdir(dirPath);

      for (const item of items) {
        const fullPath = join(dirPath, item);
        
        try {
          const itemStat = await stat(fullPath);

          if (itemStat.isDirectory()) {
            if (this.shouldIgnoreFolder(item)) {
              continue;
            }
            if (this.config.recursive) {
              const subFiles = await this.collectMusicFiles(fullPath);
              files.push(...subFiles);
            }
          } else if (this.isMusicFile(item) && itemStat.size <= this.config.maxFileSize) {
            files.push(fullPath);
          }
        } catch (error) {
          console.warn(`⚠️ No se pudo acceder a: ${fullPath}`, error);
        }
      }
    } catch (error) {
      console.error(`❌ Error accediendo al directorio ${dirPath}:`, error);
    }

    return files;
  }

  private async processFilesWithConcurrency(
    files: string[], 
    result: ProcessingResult
  ): Promise<void> {
    const batches: string[][] = [];
    
    for (let i = 0; i < files.length; i += this.config.concurrency) {
      batches.push(files.slice(i, i + this.config.concurrency));
    }

    for (const batch of batches) {
      const promises = batch.map(filePath => 
        this.processSingleFile(filePath).catch(error => ({
          path: filePath,
          error: error instanceof Error ? error.message : String(error)
        }))
      );

      const batchResults = await Promise.all(promises);

      for (const batchResult of batchResults) {
        result.stats.processed++;
        
        if ('path' in batchResult! && 'error' in batchResult) {
          result.errors.push(batchResult);
          result.stats.failed++;
        } else if (batchResult) {
          const musicData = batchResult as MusicData;
          result.success.push(musicData);
          if (musicData.duration) {
            result.stats.totalDuration += musicData.duration;
          }
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  private async processSingleFile(filePath: string): Promise<MusicData | null> {
    if (this.processedFiles.has(filePath)) {
      return null;
    }

    this.processedFiles.add(filePath);

    try {
      const fileStat = await stat(filePath);
      const fileName = basename(filePath);
      const fileFormat = extname(filePath).toLowerCase();

      const metadataPromise = musicMetadata.parseFile(filePath);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout procesando archivo')), this.config.timeout);
      });

      const metadata = await Promise.race([metadataPromise, timeoutPromise]);
      const { common, format } = metadata;

      let coverArt: { base64: string; mimeType: string } | undefined = undefined;
      
      if (common.picture && common.picture.length > 0) {
        try {
          const picture = common.picture[0];
          const base64 = Buffer.from(picture!.data).toString('base64');
          const mimeType = picture!.format || 'image/jpeg';
          
          coverArt = {
            base64: `data:${mimeType};base64,${base64}`,
            mimeType
          };
        } catch (error) {
          console.warn(`⚠️ Error procesando imagen en ${filePath}:`, error);
        }
      }

      const musicData: MusicData = {
        path: filePath,
        fileName,
        title: common.title || this.getFileNameWithoutExtension(fileName),
        artist: common.artist,
        album: common.album,
        duration: format.duration,
        year: common.year,
        genre: common.genre,
        fileSize: fileStat.size,
        fileFormat
      };

      // Solo agregar coverArt si existe
      if (coverArt) {
        musicData.coverArt = coverArt;
      }

      return musicData;
    } catch (error) {
      console.warn(`⚠️ Error procesando archivo ${filePath}:`, error);
      throw error;
    }
  }

  private shouldIgnoreFolder(folderName: string): boolean {
    return this.config.ignoreFolders.some(ignore => 
      folderName.toLowerCase().includes(ignore.toLowerCase())
    );
  }

  private isMusicFile(fileName: string): boolean {
    const ext = extname(fileName).toLowerCase();
    return this.config.supportedFormats.includes(ext);
  }

  private getFileNameWithoutExtension(fileName: string): string {
    return fileName.replace(/\.[^/.]+$/, "");
  }

  updateConfig(newConfig: Partial<MusicReaderConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): Readonly<MusicReaderConfig> {
    return { ...this.config };
  }

  clearCache(): void {
    this.processedFiles.clear();
  }
}

// Versión alternativa sin music-metadata (más segura para Electron)
class SafeMusicFolderReader {
  private config: Required<MusicReaderConfig>;

  constructor(config: MusicReaderConfig) {
    this.config = {
      recursive: true,
      ignoreFolders: [],
      supportedFormats: ['.mp3', '.ogg', '.aac', '.m4a'],
      maxFileSize: 100 * 1024 * 1024,
      concurrency: 10,
      timeout: 30000,
      ...config
    };
  }

  async readMusicFolder(): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      success: [],
      errors: [],
      stats: {
        totalFiles: 0,
        processed: 0,
        failed: 0,
        totalDuration: 0
      }
    };

    try {
      const allFiles = await this.collectMusicFiles(this.config.basePath);
      result.stats.totalFiles = allFiles.length;

      for (const filePath of allFiles) {
        try {
          const fileStat = await stat(filePath);
          const fileName = basename(filePath);
          const fileFormat = extname(filePath).toLowerCase();

          const musicData: MusicData = {
            path: filePath,
            fileName,
            title: this.getFileNameWithoutExtension(fileName),
            fileSize: fileStat.size,
            fileFormat
          };

          result.success.push(musicData);
          result.stats.processed++;
        } catch (error) {
          result.errors.push({
            path: filePath,
            error: error instanceof Error ? error.message : String(error)
          });
          result.stats.failed++;
        }
      }

      return result;
    } catch (error) {
      console.error('Error leyendo carpeta de música:', error);
      throw error;
    }
  }

  private async collectMusicFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const items = await readdir(dirPath);

      for (const item of items) {
        const fullPath = join(dirPath, item);
        
        try {
          const itemStat = await stat(fullPath);

          if (itemStat.isDirectory()) {
            if (this.shouldIgnoreFolder(item)) {
              continue;
            }
            if (this.config.recursive) {
              const subFiles = await this.collectMusicFiles(fullPath);
              files.push(...subFiles);
            }
          } else if (this.isMusicFile(item) && itemStat.size <= this.config.maxFileSize) {
            files.push(fullPath);
          }
        } catch (error) {
          console.warn(`No se pudo acceder a: ${fullPath}`, error);
        }
      }
    } catch (error) {
      console.error(`Error accediendo al directorio ${dirPath}:`, error);
    }

    return files;
  }

  private shouldIgnoreFolder(folderName: string): boolean {
    return this.config.ignoreFolders.some(ignore => 
      folderName.toLowerCase().includes(ignore.toLowerCase())
    );
  }

  private isMusicFile(fileName: string): boolean {
    const ext = extname(fileName).toLowerCase();
    return this.config.supportedFormats.includes(ext);
  }

  private getFileNameWithoutExtension(fileName: string): string {
    return fileName.replace(/\.[^/.]+$/, "");
  }
}

// Funciones de exportación
export async function readMusicFolder(config: MusicReaderConfig): Promise<ProcessingResult> {
  const reader = new AdvancedMusicFolderReader(config);
  return await reader.readMusicFolder();
}

export async function readMusicFolderSafe(config: MusicReaderConfig): Promise<ProcessingResult> {
  const reader = new SafeMusicFolderReader(config);
  return await reader.readMusicFolder();
}

export async function readMusicFilesOnly(config: MusicReaderConfig): Promise<MusicData[]> {
  const result = await readMusicFolder(config);
  return result.success;
}

export function generateReport(result: ProcessingResult): string {
  const { success, errors, stats } = result;
  
  return `
🎵 REPORTE DE PROCESAMIENTO DE MÚSICA
====================================
📊 Estadísticas:
   • Total de archivos: ${stats.totalFiles}
   • Procesados exitosamente: ${success.length}
   • Errores: ${errors.length}
   • Duración total: ${Math.round(stats.totalDuration / 60)} minutos

🎼 Archivos procesados: ${success.length}
   ${success.slice(0, 5).map(file => 
     `   • ${file.fileName} - ${file.artist || 'N/A'} - ${file.duration ? Math.round(file.duration) + 's' : 'N/A'}`
   ).join('\n   ')}
   ${success.length > 5 ? `   ... y ${success.length - 5} más` : ''}

❌ Errores: ${errors.length}
   ${errors.slice(0, 3).map(error => 
     `   • ${basename(error.path)}: ${error.error}`
   ).join('\n   ')}
   ${errors.length > 3 ? `   ... y ${errors.length - 3} más` : ''}
  `.trim();
}

// Ejemplo de uso
export async function exampleUsage() {
  try {
    const result = await readMusicFolder({
      basePath: '/ruta/a/tu/musica',
      recursive: true,
      ignoreFolders: ['temp', 'backup', '@eaDir', '.tmp'],
      supportedFormats: ['.mp3', '.ogg', '.aac', '.m4a'],
      maxFileSize: 50 * 1024 * 1024,
      concurrency: 5,
      timeout: 15000
    });

    console.log(generateReport(result));

    return result;
  } catch (error) {
    console.error('Error en el ejemplo:', error);
    throw error;
  }
}

// Tipos de exportación
export type { MusicData, MusicReaderConfig, ProcessingResult };