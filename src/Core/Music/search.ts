import youtubesearchapi from "youtube-search-api";
import type { VideoSearchResult } from "../../Utils/Types.js";

// Tokens de navegación en memoria
let nextPageData: { nextPageToken: string | null; nextPageContext: any } | null = null;
let prevPages: { nextPageToken: string | null; nextPageContext: any }[] = [];

export async function searchYouTube(query: string, limit = 10, goNext = true): Promise<VideoSearchResult[]> {
    if (!query) throw new Error("Debes especificar una query de búsqueda");

    let response: any;

    if (!nextPageData || goNext) {
        // Primera búsqueda o siguiente página
        response = !nextPageData
            ? await youtubesearchapi.GetListByKeyword(query, false, limit, [{ type: "video" }])
            : await youtubesearchapi.NextPage(nextPageData);

        // Guardamos token para volver
        if (nextPageData) prevPages.push(nextPageData);
        nextPageData = response.nextPage || null;
    } else {
        // Volver página
        const prevData = prevPages.pop() || null;
        response = prevData
            ? await youtubesearchapi.NextPage(prevData)
            : await youtubesearchapi.GetListByKeyword(query, false, limit, [{ type: "video" }]);
        nextPageData = response.nextPage || null;
    }

    if (!response?.items || response.items.length === 0) return [];

    return response.items.map((video: any) => ({
        title: video.title,
        url: `https://www.youtube.com/watch?v=${video.id}`,
        duration: video.length?.simpleText || "0:00",
        thumbnail: video.thumbnail?.[0]?.url || "",
        author: video.channelTitle || "",
        videoId: video.id,
        description: video.description || "",
        views: video.views || 0,
        uploadedAt: video.uploadedAt || "",
        ago: video.ago || ""
    }));
}
