// download-logger.js
export const initMinecraftLogger = (version) => {
    if (!window.MinecraftDownload) return console.error("MinecraftDownload no disponible en preload");

    const titleLabel = document.getElementById('TittleLogs'); // <--- Título dinámico
    const totalLabel = document.getElementById('Network:TotalCalculate');
    const percentageLabel = document.getElementById('Network:Porcentaje');
    const mbLabel = document.getElementById('Network:MB');
    const speedLabel = document.getElementById('Network:Velocity');
    const sectionLabel = document.getElementById('Network:SectionDone');
    const logsContainer = document.querySelector('.Logs');

    // Actualiza el título con la versión
    if (titleLabel) titleLabel.textContent = `Descargando Minecraft ${version}`;

    // Helper para imprimir en el contenedor de logs (limpiando cada vez)
    const log = (text) => {
        if (!logsContainer) return;
        logsContainer.innerHTML = ''; // Limpia todo antes de escribir
        const div = document.createElement('div');
        div.textContent = text;
        logsContainer.appendChild(div);
    };

    // Función para actualizar porcentaje
    const updatePercentage = () => {
        if (!window.MinecraftDownload.isCurrentlyDownloading()) return;
        const perc = window.MinecraftDownload.getPercentage();
        percentageLabel.textContent = `Porcentaje: ${perc}% / 100%`;
    };

    // Suscribirse a eventos
    const events = [
        'Download-MB','Download-GB','SpeedDownload','ETA','Percentage',
        'TotalCalculated','SectionDone','SectionError','Paused','Resumed',
        'Stopped','Done','NetworkWarning'
    ];

    events.forEach(ev => {
        window.MinecraftDownload.on(ev, (data) => {
            switch(ev) {
                case 'Download-MB':
                    mbLabel.textContent = `Descargado: ${data} MB`;
                    updatePercentage();
                    log(`📦 Descargado: ${data} MB`);
                    break;
                case 'Download-GB':
                    log(`📦 Descargado: ${data} GB`);
                    break;
                case 'SpeedDownload':
                    speedLabel.textContent = `Velocidad: ${data}/s`;
                    log(`⚡ Velocidad: ${data}/s`);
                    break;
                case 'TotalCalculated':
                    totalLabel.textContent = `Total: ${data.totalMB} MB (${data.totalGB} GB)`;
                    log(`📊 Total calculado: ${data.totalMB} MB (${data.totalGB} GB)`);
                    break;
                case 'SectionDone':
                    sectionLabel.textContent = `Sección Completada: ${data}`;
                    log(`✅ Sección completada: ${data}`);
                    break;
                case 'SectionError':
                    sectionLabel.textContent = `Error: ${data.name}`;
                    log(`❌ Error en sección ${data.name}: ${data.error}`);
                    break;
                case 'NetworkWarning':
                    log(`⚠️ [${data.severity.toUpperCase()}] ${data.type}: ${data.message}`);
                    break;
                case 'Paused':
                    log('⏸️ Descarga pausada');
                    break;
                case 'Resumed':
                    log('▶️ Descarga reanudada');
                    break;
                case 'Stopped':
                    log('🛑 Descarga detenida');
                    break;
                case 'Done':
                    log('🎉 Descarga completa');
                    break;
                case 'Percentage':
                    percentageLabel.textContent = `Porcentaje: ${data}% / 100%`;
                    break;
                default:
                    log(`${ev}: ${JSON.stringify(data)}`);
                    break;
            }
        });
    });

    // Iniciar descarga
    window.MinecraftDownload.start(version, false);
};
