export type LangData = { [key: string]: string };

export interface MinecraftNewsImage {
  title: string;
  url: string;
}

export interface MinecraftNewsItem {
  title: string;
  version: string;
  type: "release" | "snapshot";
  image: MinecraftNewsImage;
  contentPath: string;
  id: string;
  date: string;
  shortText: string;
}

export interface MinecraftNewsResponse {
  entries: MinecraftNewsItem[];
}