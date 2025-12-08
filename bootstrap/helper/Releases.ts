import { get as httpsGet } from 'node:https';
import { writeFile } from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import { join } from 'node:path';

interface GitHubReleaseAsset {
    name: string;
    browser_download_url: string;
}

interface GitHubRelease {
    tag_name: string;
    assets: GitHubReleaseAsset[];
}

/**
 * Obtiene la última release de un repo.
 */
async function getLatestRelease(user: string, repo: string, token?: string): Promise<GitHubRelease> {
    const url = `https://api.github.com/repos/${user}/${repo}/releases/latest`;
    const headers: any = {
        'User-Agent': 'Node.js',
        'Accept': 'application/vnd.github.v3+json'
    };
    if (token) headers['Authorization'] = `token ${token}`;

    return new Promise((resolve, reject) => {
        httpsGet(url, { headers }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`GitHub API error: ${res.statusCode}`));
                        return;
                    }
                    const release: GitHubRelease = JSON.parse(data);
                    resolve(release);
                } catch (err) {
                    reject(err);
                }
            });
        }).on('error', reject);
    });
}

/**
 * Descarga un asset mostrando progreso.
 */
async function downloadAsset(asset: GitHubReleaseAsset, outputPath: string, token?: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const headers: any = { 'User-Agent': 'Node.js' };
        if (token) headers['Authorization'] = `token ${token}`;

        httpsGet(asset.browser_download_url, { headers }, res => {
            if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode)) {
                const redirectUrl = res.headers.location;
                if (!redirectUrl) return reject(new Error('Redirection sin location'));
                return resolve(downloadAsset({ name: asset.name, browser_download_url: redirectUrl }, outputPath, token));
            }

            if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`HTTP error: ${res.statusCode}`));
                return;
            }

            const total = parseInt(res.headers['content-length'] || '0');
            let downloaded = 0;

            const fileStream = createWriteStream(outputPath);

            res.on('data', chunk => {
                downloaded += chunk.length;
                fileStream.write(chunk);
                if (total) {
                    process.stdout.write(`\rDescargando ${asset.name}: ${((downloaded / total) * 100).toFixed(2)}%`);
                }
            });

            res.on('end', () => {
                fileStream.end();
                console.log(`\n✅ ${asset.name} descargado!`);
                resolve();
            });
        }).on('error', reject);
    });
}
// Función fuera del bloque principal
async function downloadList(assets: GitHubReleaseAsset[], prefix: string, outputDir: string, token?: string) {
    for (const asset of assets) {
        const outputPath = join(outputDir, `${prefix}-${asset.name}`);
        await downloadAsset(asset, outputPath, token);
    }
}

// ------------------ EJEMPLO DE USO ------------------
(async () => {
    try {
        const user = 'Stepnicka012';
        const repo = 'StepLauncher';
        const token = '';

        const release = await getLatestRelease(user, repo, token);

        const assetsBackend = release.assets.filter(a => a.name.includes('Backend'));
        const assetsRenderer = release.assets.filter(a => a.name.includes('Renderer'));
        const assetsApp = release.assets.filter(a => a.name.includes('Release'));

        const outputDir = './downloads';
        if (!existsSync(outputDir)) require('node:fs').mkdirSync(outputDir);

        console.log('🔹 Descargando Backend...');
        await downloadList(assetsBackend, 'Backend', outputDir, token);

        console.log('🔹 Descargando Renderer...');
        await downloadList(assetsRenderer, 'Renderer', outputDir, token);

        console.log('🔹 Descargando App Release...');
        await downloadList(assetsApp, 'App', outputDir, token);

        console.log('✅ Todas las partes descargadas!');
    } catch (err) {
        console.error('Error:', err);
    }
})();
