import type { MinecraftNewsResponse, MinecraftNewsItem } from '../../Types/Renderer/News.js';

const API_URL = 'https://launchercontent.mojang.com/v2/javaPatchNotes.json';

export class NewsService {
  private readonly DEFAULT_LIMIT = 10;
  private cachedNews: MinecraftNewsItem[] = [];
  private isCacheLoaded = false;

  async fetchAllNews(): Promise<MinecraftNewsItem[]> {
    try {
      if (!this.isCacheLoaded) {
        const response = await fetch(API_URL);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data: MinecraftNewsResponse = await response.json();
        this.cachedNews = data.entries || [];
        this.isCacheLoaded = true;
      }
      
      return this.cachedNews;
    } catch (error) {
      console.error('Error fetching Minecraft news:', error);
      return [];
    }
  }

  async fetchNews(limit: number = this.DEFAULT_LIMIT, offset: number = 0): Promise<MinecraftNewsItem[]> {
    const allNews = await this.fetchAllNews();
    return allNews.slice(offset, offset + limit);
  }

  getTotalNewsCount(): number {
    return this.cachedNews.length;
  }

  getDefaultLimit(): number {
    return this.DEFAULT_LIMIT;
  }

  clearCache(): void {
    this.isCacheLoaded = false;
    this.cachedNews = [];
  }
}