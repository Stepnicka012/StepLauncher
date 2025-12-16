import { NotificationManager } from './Notification.js';
import { HTMLLoader } from '../Dev/HTMLLoader.js';

const PanelManager = new HTMLLoader();

await PanelManager.register({
        id: "Settings",
        url: "./Layouts/settings.html",
        loader: true,
        timeout: 1500,
        remove: true,
        cleanUp: true,
        title: window.LangAPI.getText("Layouts.ID.Settings"),
    },
    {
        id: "Instancies",
        url: "./Layouts/instancies.html",
        loader: false,
        timeout: 0,
        title: window.LangAPI.getText("Layouts.ID.Instancies"),
    },
    {
        id: "Download",
        url: "./Layouts/download.html",
        loader: false,
        timeout: 0,
        title: window.LangAPI.getText("Layouts.ID.Download")
    },
    {
        id: "Play",
        url: "./Layouts/play.html",
        loader: false,
        timeout: 0,
        title: window.LangAPI.getText("Layouts.ID.Play")
    }
);

// NotificationManager.getInstance().activate({
//     message: 'Notificación con sonido!',
//     icon: './Static/Img/Notifications/Circle_Check.png',
//     sound: './Static/Sounds/notification-on.mp3',
//     timeout: 5000,
// });
