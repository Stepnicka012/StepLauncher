import { HTMLFrameLoader } from "./HTMLLoader.js";
import lumina from "../Components/UI/Notification.js";

const loader = new HTMLFrameLoader("HTML_Container", { debug: true });
lumina.success({
    title:"Launcher Inciado",
    position: "top-center",
    description: "Launcher Iniciado Correctamente"
})

loader.register(
    {
        id: "settings",
        url: "./Panels/Settings.html",
        priority: "low",
        preloadScript: true,
        allowReexecuteScript: false,
    },
);

loader.preload("settings");