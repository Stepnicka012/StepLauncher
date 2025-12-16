import type {
  MinecraftNewsResponse,
  MinecraftNewsItem
} from '../../Types/Renderer/News.js';

const API_URL = 'https://launchercontent.mojang.com/v2/javaPatchNotes.json';

/**
 * Error de dominio: NO inventa errores,
 * envuelve el error real y agrega contexto.
 */
export class NewsFetchError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
    public readonly status?: number,
    public readonly url?: string
  ) {
    super(message);
    this.name = 'NewsFetchError';
  }
}

export class NewsService {
  private readonly DEFAULT_LIMIT = 10;
  private cachedNews: MinecraftNewsItem[] = [];
  private isCacheLoaded = false;

  async fetchAllNews(): Promise<MinecraftNewsItem[]> {
    if (this.isCacheLoaded) return this.cachedNews;

    let response: Response;

    /* =======================
     * FETCH (errores reales)
     * ======================= */
    try {
      response = await fetch(API_URL);
    } catch (error) {
      // DNS / offline / CORS / abort / runtime real
      throw new NewsFetchError(
        'No se pudo conectar con el servidor de Mojang',
        error,
        undefined,
        API_URL
      );
    }

    /* =======================
     * HTTP
     * ======================= */
    if (!response.ok) {
      throw new NewsFetchError(
        `Respuesta HTTP inválida (${response.status})`,
        null,
        response.status,
        API_URL
      );
    }

    /* =======================
     * Content-Type
     * ======================= */
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new NewsFetchError(
        `Content-Type inesperado: ${contentType}`,
        null,
        response.status,
        API_URL
      );
    }

    /* =======================
     * JSON parse (error real)
     * ======================= */
    let data: MinecraftNewsResponse;

    try {
      data = await response.json();
    } catch (error) {
      throw new NewsFetchError(
        'Error al parsear JSON de Mojang',
        error,
        response.status,
        API_URL
      );
    }

    /* =======================
     * Validación de estructura
     * ======================= */
    if (!Array.isArray(data.entries)) {
      throw new NewsFetchError(
        'Estructura JSON inválida: entries no es un array',
        null,
        response.status,
        API_URL
      );
    }

    this.cachedNews = this.sortNews(data.entries);
    this.isCacheLoaded = true;

    return this.cachedNews;
  }

  /* =======================
   * Ordenamiento
   * ======================= */
  private sortNews(items: MinecraftNewsItem[]): MinecraftNewsItem[] {
    return [...items].sort((a, b) => {
      const pa = this.parseVersion(a.version);
      const pb = this.parseVersion(b.version);

      if (pa.major !== pb.major) return pb.major - pa.major;
      if (pa.minor !== pb.minor) return pb.minor - pa.minor;
      if (pa.patch !== pb.patch) return pb.patch - pa.patch;
      if (pa.typeOrder !== pb.typeOrder) return pa.typeOrder - pb.typeOrder;

      return pa.build - pb.build;
    });
  }

  private parseVersion(version: string) {
    const match = version.match(
      /(\d+)\.(\d+)\.(\d+)(?:-(pre|rc)(\d+))?/
    );

    if (!match) {
      return { major: 0, minor: 0, patch: 0, typeOrder: 99, build: 0 };
    }

    const [, major, minor, patch, type, build] = match;

    let typeOrder = 3; // snapshot / unknown
    if (!type) typeOrder = 0;       // release
    else if (type === 'rc') typeOrder = 1;
    else if (type === 'pre') typeOrder = 2;

    return {
      major: Number(major),
      minor: Number(minor),
      patch: Number(patch),
      typeOrder,
      build: Number(build ?? 0)
    };
  }

  /* =======================
   * API pública
   * ======================= */
  async fetchNews(
    limit: number = this.DEFAULT_LIMIT,
    offset: number = 0
  ): Promise<MinecraftNewsItem[]> {
    const all = await this.fetchAllNews();
    return all.slice(offset, offset + limit);
  }

  getTotalNewsCount(): number {
    return this.cachedNews.length;
  }

  getDefaultLimit(): number {
    return this.DEFAULT_LIMIT;
  }

  clearCache(): void {
    this.cachedNews = [];
    this.isCacheLoaded = false;
  }
}
