import { ConcurrentDownloader } from './Index.js';

const downloader = new ConcurrentDownloader();

downloader.on('info', console.log);
downloader.on('warn', console.warn);
downloader.on('error', console.error);
downloader.on('done', console.log);
downloader.on('data', (chunk: Buffer) => {});
downloader.on('percentage', (p: string) => console.log(`Progreso: ${p}%`));
downloader.on('total', (t: string) => console.log(`Tamaño total: ${t} MB`));

downloader.download({
    url: 'https://release-assets.githubusercontent.com/github-production-release-asset/1101681833/0cb16b3d-6aab-4add-9e4d-b3f330155bf6?sp=r&sv=2018-11-09&sr=b&spr=https&se=2025-12-08T09%3A18%3A11Z&rscd=attachment%3B+filename%3DFlashCards.App.Setup.1.1.2.exe&rsct=application%2Foctet-stream&skoid=96c2d410-5711-43a1-aedd-ab1947aa7ab0&sktid=398a6654-997b-47e9-b12b-9515b896b4de&skt=2025-12-08T08%3A17%3A14Z&ske=2025-12-08T09%3A18%3A11Z&sks=b&skv=2018-11-09&sig=UMtxnGOdZ78wix%2FTVb9h7OdU6HbZ1MkjXcp2mfNFSlY%3D&jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmVsZWFzZS1hc3NldHMuZ2l0aHVidXNlcmNvbnRlbnQuY29tIiwia2V5Ijoia2V5MSIsImV4cCI6MTc2NTE4NjUzOSwibmJmIjoxNzY1MTgyOTM5LCJwYXRoIjoicmVsZWFzZWFzc2V0cHJvZHVjdGlvbi5ibG9iLmNvcmUud2luZG93cy5uZXQifQ.2VY_GVFmaiNWSyfKZcv0WQ_IeOcWhZeQKUZOT3Q0mYg&response-content-disposition=attachment%3B%20filename%3DFlashCards.App.Setup.1.1.2.exe&response-content-type=application%2Foctet-stream',
    output: './file.zip',
    maxRetries: 5,
    concurrency: 5,
});
