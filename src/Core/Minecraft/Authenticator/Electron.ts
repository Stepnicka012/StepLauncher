import path from 'path';
import { app, BrowserWindow, session } from "electron";

const defaultProperties = {
    width: 1000,
    height: 650,
    resizable: false,
    center: true,
    icon: path.join(
        __dirname,
        '../../../../../public/assets',
        `icon.${process.platform === 'win32' ? 'ico' : 'png'}`
    ),
};

export default async function openMicrosoftWindow(url: string): Promise<string | null> {
    await new Promise<void>((resolve) => {
        app.whenReady().then(() => {
            session.defaultSession.cookies.get({ domain: 'live.com' }).then((cookies: any) => {
                for (const cookie of cookies) {
                    const urlcookie = `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '') + cookie.path}`;
                    session.defaultSession.cookies.remove(urlcookie, cookie.name);
                }
            });
            resolve();
        });
    });

    return new Promise<string | null>((resolve) => {
        app.whenReady().then(() => {
            const mainWindow = new BrowserWindow(defaultProperties);
            mainWindow.setMenu(null);
            mainWindow.loadURL(url);

            let loading = false;

            mainWindow.webContents.setWindowOpenHandler(() => {
                return { action: "deny" };
            });

            const allowedDomains = [
                "https://login.live.com",
                "https://login.microsoftonline.com",
                "https://login.live-int.com",
                "https://login.microsoft.com",
                "https://login.live.com/oauth20_desktop.srf"
            ];

            mainWindow.webContents.on("will-navigate", (event: { preventDefault: () => void; }, navigationUrl: string) => {
                if (!allowedDomains.some(domain => navigationUrl.startsWith(domain))) {
                    event.preventDefault();
                    window.ElectronPino.warn(`Bloqueado : ${navigationUrl}`);
                }
            });

            mainWindow.on('close', () => {
                if (!loading) resolve(null);
            });

            mainWindow.webContents.on('did-finish-load', () => {
                const loc = mainWindow.webContents.getURL();
                if (loc.startsWith('https://login.live.com/oauth20_desktop.srf')) {
                    const code = new URLSearchParams(loc.split('?')[1]).get('code');
                    resolve(code ?? null);
                    loading = true;
                    try {
                        mainWindow.close();
                    } catch {
                        window.ElectronPino.info('Failed to close window!');
                    }
                }
            });
        });
    });
}
