export interface PageRequest {
    /** 
     * ID único para identificar el panel en el DOM y en la caché interna.
     * Se usa para referenciar el panel en métodos como `open`, `close` o `preloadPage`.
     */
    id: string;

    /**
     * Ruta relativa o absoluta del archivo `.html` que será cargado para este panel.
     */
    url: string;

    /**
     * Indica si se debe mostrar el LoaderScreen al abrir este panel.
     * true → se muestra el loader durante la carga.
     * false → carga sin mostrar el loader.
     */
    loader: boolean;

    /**
     * Indica si el panel debe limpiarse automáticamente de la caché al cerrar.
     * true → el panel no será visible en `getCache()`.
     * false | undefined → el panel se mantiene en caché.
     */
    cleanUp?: boolean;

    /**
     * Indica si el panel debe ser excluido de los métodos públicos como `getPages()`.
     * true → el panel se considera “oculto” y no será devuelto por métodos públicos.
     */
    remove?: boolean;

    /**
     * Tiempo de espera artificial en milisegundos antes de mostrar el contenido.
     * Útil para simular retardos o dar tiempo al LoaderScreen.
     */
    timeout: number;

    /**
     * Añade un titulo al panel
     */
    title?: string;
}


export interface PageMetadata {
    // Configuración de Interfaz
    hideSidebar?: boolean;
    hideContentMain?: boolean;

    // Recursos
    // styles: string[];
    
    // Configuración de Scripts
    scriptType?: 'module' | 'text/javascript';
    scriptDefer?: boolean;
    scriptAsync?: boolean;
    scriptPath?: string;
    scriptEntryPoint?: string;

    // Optimizaciones de HTMLLoader
    /** Si es true, añade loading="lazy" y retrasa el src de las imágenes */
    lazyLoadImages?: boolean;
    /** Si es true, elimina todas las etiquetas <img> antes de inyectar al DOM */
    removeImages?: boolean;
    
    // Permitir claves dinámicas adicionales
    [key: string]: any;
}

export interface ParsedHTML {
    metadata: PageMetadata;
    htmlContent: string;
}

/**
 * Representa un panel almacenado en la memoria de la aplicación.
 */
export interface CachedPanel {
    title: string;
    scriptExecuted?: any;
    /** ID único del panel */
    id: string;
    /** Contenido HTML ya procesado y optimizado */
    htmlContent: string;
    /** Metadatos asociados al panel */
    metadata: PageMetadata;
    /** Referencia al módulo JS cargado mediante import() dinámico */
    scriptModule: any | null;
    /** Referencia al elemento DIV creado en el DOM */
    element: HTMLDivElement;
    /** Estado de carga */
    isLoaded: boolean;
    /** Indica si el panel está visible actualmente */
    isActive: boolean;

    onOpen?: (panel: CachedPanel, loader: HTMLLoader) => void;
    onClose?: (panel: CachedPanel, loader: HTMLLoader) => void;
}