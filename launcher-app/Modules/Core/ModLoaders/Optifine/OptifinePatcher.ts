import { readFile, writeFile, mkdir, rm, copyFile, rename, readdir } from 'fs/promises';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { spawn, exec, ChildProcess } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

interface CommandOptions {
	cwd?: string;
	silent?: boolean;
}

export class OptifinePatcher extends EventEmitter {
	static async executeCommand(args: string[], options: CommandOptions = {}): Promise<void> {
		console.log('[EXEC]', args.join(' '));
		
		const { cwd, silent } = options;
		
		return new Promise((resolve, reject) => {
			const child: ChildProcess = spawn(args[0] || "", args.slice(1), {
				cwd: cwd || process.cwd(),
				stdio: silent ? 'pipe' : 'inherit',
				shell: process.platform === 'win32'
			});
			
			child.on('close', (code: number) => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`Comando falló con código ${code}`));
				}
			});
			
			child.on('error', (err: Error) => {
				reject(err);
			});
		});
	}
	
	static async extractWithPureNode(jarPath: string, fileToExtract: string): Promise<Buffer> {
		try {
			const buffer = await readFile(jarPath);
			
			let eocdOffset = -1;
			for (let i = buffer.length - 22; i >= 0; i--) {
				if (buffer.readUInt32LE(i) === 0x06054b50) {
					eocdOffset = i;
					break;
				}
			}
			
			if (eocdOffset === -1) {
				throw new Error('No se pudo encontrar EOCD en el archivo ZIP');
			}
			
			const cdEntries = buffer.readUInt16LE(eocdOffset + 8);
			const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
			
			let entryOffset = cdOffset;
			for (let i = 0; i < cdEntries; i++) {
				if (buffer.readUInt32LE(entryOffset) !== 0x02014b50) {
					throw new Error('Firma de entrada de directorio central inválida');
				}
				
				const nameLength = buffer.readUInt16LE(entryOffset + 28);
				const extraLength = buffer.readUInt16LE(entryOffset + 30);
				const commentLength = buffer.readUInt16LE(entryOffset + 32);
				const localHeaderOffset = buffer.readUInt32LE(entryOffset + 42);
				
				const name = buffer.toString('utf8', entryOffset + 46, entryOffset + 46 + nameLength);
				
				if (name === fileToExtract) {
					const localHeaderOffsetActual = localHeaderOffset;
					if (buffer.readUInt32LE(localHeaderOffsetActual) !== 0x04034b50) {
						throw new Error('Firma de header local inválida');
					}
					
					const compressionMethod = buffer.readUInt16LE(localHeaderOffsetActual + 8);
					const compressedSize = buffer.readUInt32LE(localHeaderOffsetActual + 18);
					const uncompressedSize = buffer.readUInt32LE(localHeaderOffsetActual + 22);
					const nameLengthLocal = buffer.readUInt16LE(localHeaderOffsetActual + 26);
					const extraLengthLocal = buffer.readUInt16LE(localHeaderOffsetActual + 28);
					
					const dataOffset = localHeaderOffsetActual + 30 + nameLengthLocal + extraLengthLocal;
					
					if (compressionMethod === 0) {
						return buffer.slice(dataOffset, dataOffset + uncompressedSize);
					} else if (compressionMethod === 8) {
						const zlib = await import('zlib');
						const compressedData = buffer.slice(dataOffset, dataOffset + compressedSize);
						
						return new Promise((resolve, reject) => {
							zlib.inflate(compressedData, (err, result) => {
								if (err) reject(err);
								else resolve(result);
							});
						});
					} else {
						throw new Error(`Método de compresión no soportado: ${compressionMethod}`);
					}
				}
				
				entryOffset += 46 + nameLength + extraLength + commentLength;
			}
			
			throw new Error(`Archivo no encontrado en el JAR: ${fileToExtract}`);
			
		} catch (error) {
			throw new Error(`Error en extracción pura de Node.js: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	
	static async extractSingleFile(jarPath: string, fileToExtract: string, destPath: string): Promise<void> {
		const destDir = path.dirname(destPath);
		await mkdir(destDir, { recursive: true });
		
		try {
			console.log('[INFO] Intentando extracción con puro Node.js...');
			const fileData = await this.extractWithPureNode(jarPath, fileToExtract);
			await writeFile(destPath, fileData);
			console.log(`[SUCCESS] Extraído con éxito usando Node.js: ${fileToExtract}`);
			
		} catch (error) {
			console.log(`[WARN] Falló extracción con Node.js, usando comando del sistema: ${error instanceof Error ? error.message : String(error)}`);
			await mkdir(destDir, { recursive: true });
			
			try {
				if (process.platform === 'win32') {
					const command = `powershell -Command "& {
                        Add-Type -AssemblyName System.IO.Compression.FileSystem;
                        $zip = [System.IO.Compression.ZipFile]::OpenRead('${jarPath}');
                        $entry = $zip.Entries | Where-Object { $$_.FullName -eq '${fileToExtract}' };
                        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, '${destPath}', $true);
                        $zip.Dispose()
                    }"`;
					await execPromise(command);
				} else {
					await execPromise(`cd "${destDir}" && unzip -o "${jarPath}" "${fileToExtract}"`);
					
					const extractedPath = path.join(destDir, fileToExtract);
					if (existsSync(extractedPath) && extractedPath !== destPath) {
						await rename(extractedPath, destPath);
					}
					
					if (!existsSync(destPath)) {
						await execPromise(`cd "${destDir}" && jar -xf "${jarPath}" "${fileToExtract}"`);
					}
				}
			} catch (fallbackError) {
				throw new Error(`No se pudo extraer ${fileToExtract}: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
			}
		}
	}
	
	static async addFileToJar(jarPath: string, fileToAdd: string, entryName: string): Promise<void> {
		try {
			if (process.platform === 'win32') {
				await execPromise(`powershell -Command "& {
                    Add-Type -AssemblyName System.IO.Compression.FileSystem;
                    $zip = [System.IO.Compression.ZipFile]::Open('${jarPath}', 'Update');
                    $entry = $zip.GetEntry('${entryName}');
                    if ($entry) { $entry.Delete(); }
                    $zip.Dispose()
                }"`);
				} else {
					await execPromise(`zip -d "${jarPath}" "${entryName}" 2>/dev/null || true`);
				}
				
				const tempDir = await mkdir(path.join(os.tmpdir(), `optifine-${Date.now()}`), { recursive: true });
				const tempEntryPath = path.join(tempDir!, entryName);
				
				await mkdir(path.dirname(tempEntryPath), { recursive: true });
				await copyFile(fileToAdd, tempEntryPath);
				
				const oldCwd = process.cwd();
				process.chdir(tempDir!);
				
				try {
					if (process.platform === 'win32') {
						await execPromise(`jar -uf "${jarPath}" "${entryName}"`);
					} else {
						await execPromise(`jar -uf "${jarPath}" "${entryName}" 2>&1`);
					}
				} finally {
					process.chdir(oldCwd);
					await rm(tempDir!, { recursive: true, force: true });
				}
				
			} catch (error) {
				throw new Error(`Error al añadir archivo al JAR: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		
		static async patchOptifineInstaller(
			optifineJar: string,
			outputJar: string,
			cfrJar: string,
			workdir: string = '.optifine_patch_work'
		): Promise<void> {
			console.log('[INFO] Parcheando OptiFine Installer...');
			
			if (existsSync(workdir)) {
				await rm(workdir, { recursive: true, force: true });
			}
			
			const srcDir = path.join(workdir, 'src');
			const binDir = path.join(workdir, 'bin');
			const installerClass = 'optifine/Installer.class';
			
			await mkdir(srcDir, { recursive: true });
			await mkdir(binDir, { recursive: true });
			
			console.log('[INFO] Extrayendo Installer.class...');
			const extractedClass = path.join(workdir, installerClass);
			await this.extractSingleFile(optifineJar, installerClass, extractedClass);
			
			if (!existsSync(extractedClass)) {
				throw new Error('No se pudo extraer Installer.class');
			}
			
			console.log('[INFO] Descompilando con CFR...');
			await this.executeCommand([
				'java', '-jar', cfrJar,
				extractedClass,
				'--outputdir', srcDir,
				'--silent', 'true'
			]);
			
			let installerJava = path.join(srcDir, 'optifine', 'Installer.java');
			if (!existsSync(installerJava)) {
				const files = await this.getAllFiles(srcDir);
				const found = files.find(f => f.endsWith('Installer.java'));
				if (found) {
					installerJava = path.join(srcDir, found);
				} else {
					throw new Error('CFR no generó Installer.java');
				}
			}
			
			console.log('[INFO] Modificando código Java...');
			let code = await readFile(installerJava, 'utf8');
			
			if (!code.includes('package optifine;')) {
				const firstCommentEnd = code.indexOf('*/');
				if (firstCommentEnd !== -1) {
					code = code.slice(0, firstCommentEnd + 2) + '\npackage optifine;\n' + code.slice(firstCommentEnd + 2);
				} else {
					code = 'package optifine;\n\n' + code;
				}
			}
			
			const pattern = /File\s+(\w+)\s*=\s*Utils\.getWorkingDirectory\s*\(\s*\)\s*;/;
			const match = code.match(pattern);
			
			if (!match) {
				throw new Error('No se encontró Utils.getWorkingDirectory()');
			}
			
			const varName = match[1];
			const replacement = `File ${varName} = null;
        for (int i = 0; i < args.length; i++) {
            if (args[i].equals("--mcdir") && i + 1 < args.length) {
                ${varName} = new File(args[++i]);
            }
        }
        if (${varName} == null) {
            ${varName} = Utils.getWorkingDirectory();
        }`;
			
			code = code.replace(pattern, replacement);
			await writeFile(installerJava, code);
			
			console.log('[INFO] Compilando código modificado...');
			const classpath = optifineJar;
			
			try {
				await this.executeCommand([
					'javac',
					'-source', '8',
					'-target', '8',
					'-cp', classpath,
					'-d', binDir,
					installerJava
				]);
			} catch {
				await this.executeCommand([
					'javac',
					'-cp', classpath,
					'-d', binDir,
					installerJava
				]);
			}
			
			let compiledClass = path.join(binDir, 'optifine', 'Installer.class');
			if (!existsSync(compiledClass)) {
				const files = await this.getAllFiles(binDir);
				const found = files.find(f => f.endsWith('Installer.class'));
				if (found) {
					compiledClass = path.join(binDir, found);
				} else {
					throw new Error('Falló la compilación de Installer.class');
				}
			}
			
			console.log('[INFO] Creando JAR parcheado...');
			if (existsSync(outputJar)) {
				await rm(outputJar, { force: true });
			}
			
			await copyFile(optifineJar, outputJar);
			await this.addFileToJar(outputJar, compiledClass, installerClass);
			
			if (!existsSync(outputJar)) {
				throw new Error('El JAR parcheado no se creó correctamente');
			}
			
			console.log(`[INFO] JAR parcheado creado: ${outputJar}`);
		}
		
		static async patchManifest(jarPath: string, newMainClass: string): Promise<void> {
			console.log('[INFO] Parcheando manifiesto...');
			
			const tempDir = await mkdir(path.join(os.tmpdir(), `optifine-manifest-${Date.now()}`), { recursive: true });
			
			try {
				let manifestContent = 'Manifest-Version: 1.0\n';
				manifestContent += `Main-Class: ${newMainClass}\n`;
				manifestContent += 'Created-By: OptiFinePatcher\n';
				
				const manifestFile = path.join(tempDir!, 'MANIFEST.MF');
				await writeFile(manifestFile, manifestContent);
				
				const extractDir = path.join(tempDir!, 'extracted');
				await mkdir(extractDir, { recursive: true });
				
				if (process.platform === 'win32') {
					await execPromise(`powershell -Command "& {
                    Add-Type -AssemblyName System.IO.Compression.FileSystem;
                    $zip = [System.IO.Compression.ZipFile]::Open('${jarPath}', 'Update');
                    # Eliminar viejo manifiesto si existe
                    $oldManifest = $zip.GetEntry('META-INF/MANIFEST.MF');
                    if ($oldManifest) { $oldManifest.Delete(); }
                    # Añadir nuevo
                    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, '${manifestFile}', 'META-INF/MANIFEST.MF');
                    $zip.Dispose()
                }"`);
					} else {
						await execPromise(`cd "${tempDir}" && jar -ufm "${jarPath}" MANIFEST.MF 2>&1`);
					}
					
					console.log(`[INFO] Manifiesto actualizado a Main-Class: ${newMainClass}`);
					
				} finally {
					await rm(tempDir!, { recursive: true, force: true });
				}
			}
			
			static async createBasicLauncherProfiles(minecraftDir: string): Promise<void> {
				const profilesFile = path.join(minecraftDir, 'launcher_profiles.json');
				
				if (existsSync(profilesFile)) {
					return;
				}
				
				const basicData = {
					profiles: {},
					selectedProfile: "",
					launcherVersion: {
						name: "2.1.0",
						format: 21
					}
				};
				
				await mkdir(minecraftDir, { recursive: true });
				await writeFile(profilesFile, JSON.stringify(basicData, null, 2));
				console.log(`[INFO] launcher_profiles.json creado en ${profilesFile}`);
			}
			
			private static async getAllFiles(dir: string, fileList: string[] = [], baseDir: string = dir): Promise<string[]> {
				const files = await readdir(dir, { withFileTypes: true });
				
				for (const file of files) {
					const fullPath = path.join(dir, file.name);
					const relativePath = path.relative(baseDir, fullPath);
					
					if (file.isDirectory()) {
						await this.getAllFiles(fullPath, fileList, baseDir);
					} else {
						fileList.push(relativePath);
					}
				}
				
				return fileList;
			}
			
			static async executeOptifine(
				optifineJarPath: string,
				minecraftDirPath: string,
				javaCmd: string = 'java'
			): Promise<void> {
				console.log('=== Ejecutando OptiFine Patcher ===');
				
				const cfrLocations = [ 
					path.join(__dirname,'../../../resources/Java/cfr-0.152.jar'),
					path.join(process.cwd(), 'Libs', 'cfr-0.152.jar'),
				];
				
				let cfrJar: string | null = null;
				for (const loc of cfrLocations) {
					if (existsSync(loc)) {
						cfrJar = loc;
						console.log(`[INFO] CFR encontrado en: ${cfrJar}`);
						break;
					}
				}
				
				if (!cfrJar) {
					console.error('[ERROR] No se encontró cfr-0.152.jar');
					console.error('Coloca cfr-0.152.jar en una de estas ubicaciones:');
					cfrLocations.forEach(loc => console.error(`  - ${loc}`));
					throw new Error('CFR no encontrado');
				}
				
				const optifineJar = path.resolve(optifineJarPath);
				const minecraftDir = path.resolve(minecraftDirPath);
				
				if (!existsSync(optifineJar)) {
					throw new Error(`OptiFine jar no encontrado: ${optifineJar}`);
				}
				
				try {
					await execPromise(`${javaCmd} -version`);
				} catch {
					throw new Error(`Java no encontrado: ${javaCmd}`);
				}
				
				await this.createBasicLauncherProfiles(minecraftDir);
				
				const stem = path.basename(optifineJar, '.jar');
				const patchedJar = path.join(path.dirname(optifineJar), `${stem}_PATCHED.jar`);
				const workDir = path.join(process.cwd(), '.optifine_patch_work');
				
				if (existsSync(patchedJar)) {
					await rm(patchedJar, { force: true });
				}
				if (existsSync(workDir)) {
					await rm(workDir, { recursive: true, force: true });
				}
				
				try {
					await this.patchOptifineInstaller(optifineJar, patchedJar, cfrJar, workDir);
					await this.patchManifest(patchedJar, 'optifine.Installer');
					
					if (!existsSync(patchedJar)) {
						throw new Error('No se generó el OptiFine parcheado');
					}
					
					console.log('[INFO] Ejecutando instalador de OptiFine...');
					console.log(`[INFO] Comando: ${javaCmd} -jar ${patchedJar} --mcdir ${minecraftDir}`);
					
					await this.executeCommand([
						javaCmd, '-jar', patchedJar,
						'--mcdir', minecraftDir
					]);
					
					console.log('[INFO] Instalador ejecutado exitosamente!');
					
				} catch (error) {
					console.error(`[ERROR] ${error instanceof Error ? error.message : String(error)}`);
					throw error;
					
				} finally {
					if (existsSync(workDir)) {
						await rm(workDir, { recursive: true, force: true });
					}
					if (existsSync(patchedJar)) {
						await rm(patchedJar, { force: true });
					}
				}
				
				console.log('[SUCCESS] Proceso completado exitosamente!');
			}
			
			async patch(optifineJarPath: string, minecraftDirPath: string, javaCmd: string = 'java'): Promise<void> {
				this.emit('start', { optifineJarPath, minecraftDirPath, javaCmd });
				
				try {
					const cfrLocations = [ 
						path.join(process.cwd(), 'Libs', 'cfr-0.152.jar'),
						path.join(process.cwd(), 'Libs', 'cfr-0.152.jar')
					];
					
					let cfrJar: string | null = null;
					for (const loc of cfrLocations) {
						if (existsSync(loc)) {
							cfrJar = loc;
							this.emit('info', `CFR encontrado en: ${cfrJar}`);
							break;
						}
					}
					
					if (!cfrJar) {
						const error = new Error('CFR no encontrado');
						this.emit('error', error);
						throw error;
					}
					
					const optifineJar = path.resolve(optifineJarPath);
					const minecraftDir = path.resolve(minecraftDirPath);
					
					if (!existsSync(optifineJar)) {
						const error = new Error(`OptiFine jar no encontrado: ${optifineJar}`);
						this.emit('error', error);
						throw error;
					}
					
					try {
						await execPromise(`${javaCmd} -version`);
					} catch {
						const error = new Error(`Java no encontrado: ${javaCmd}`);
						this.emit('error', error);
						throw error;
					}
					
					this.emit('progress', { step: 'creating_profiles', progress: 10 });
					await OptifinePatcher.createBasicLauncherProfiles(minecraftDir);
					
					const stem = path.basename(optifineJar, '.jar');
					const patchedJar = path.join(path.dirname(optifineJar), `${stem}_PATCHED.jar`);
					const workDir = path.join(process.cwd(), '.optifine_patch_work');
					
					if (existsSync(patchedJar)) {
						await rm(patchedJar, { force: true });
					}
					if (existsSync(workDir)) {
						await rm(workDir, { recursive: true, force: true });
					}
					
					this.emit('progress', { step: 'patching_installer', progress: 30 });
					await OptifinePatcher.patchOptifineInstaller(optifineJar, patchedJar, cfrJar, workDir);
					
					this.emit('progress', { step: 'patching_manifest', progress: 60 });
					await OptifinePatcher.patchManifest(patchedJar, 'optifine.Installer');
					
					if (!existsSync(patchedJar)) {
						const error = new Error('No se generó el OptiFine parcheado');
						this.emit('error', error);
						throw error;
					}
					
					this.emit('progress', { step: 'running_installer', progress: 80 });
					this.emit('info', `Ejecutando instalador: ${javaCmd} -jar ${patchedJar} --mcdir ${minecraftDir}`);
					
					await OptifinePatcher.executeCommand([
						javaCmd, '-jar', patchedJar,
						'--mcdir', minecraftDir
					]);
					
					this.emit('progress', { step: 'completed', progress: 100 });
					this.emit('complete', { patchedJar, minecraftDir });
					
				} catch (error) {
					this.emit('error', error);
					throw error;
				}
			}
		}