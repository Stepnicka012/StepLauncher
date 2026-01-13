export type ConfigValue = string | number | boolean | object | Array<any> | null | undefined;

export type ConfigObject = { [key: string]: ConfigValue };

export interface ConfigOptions {
	/** Crear directorios automáticamente si no existen */
	createDirs?: boolean;
	/** Formatear el JSON con indentación */
	prettyPrint?: boolean;
	/** Codificación del archivo */
	encoding?: BufferEncoding;
	/** Configuración por defecto si el archivo no existe */
	defaultConfig?: ConfigObject;
	/** Modo de solo lectura */
	readOnly?: boolean;
}

export type LangManagerData = { [key: string]: string | LangManagerData; };
