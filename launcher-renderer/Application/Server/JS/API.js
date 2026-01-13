const API_URL = 'http://localhost:3000/api';

window.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([
        loadSystemInfo(),
        loadMinecraftArgs(),
        loadLogs()
    ]);
    
    setupFormInterceptor();
    setupCopyButton();
    startLogRefresh();

});

async function loadSystemInfo() {
    try {
        const response = await fetch(`${API_URL}/system-info`);
        const data = await response.json();
        
        document.querySelector('input[name="os_info"]').value = data.os;
        document.querySelector('input[name="ram_free"]').value = data.ram;
    } catch (error) {
        console.error('Error cargando sistema:', error);
        document.querySelector('input[name="os_info"]').value = 'Error al cargar';
        document.querySelector('input[name="ram_free"]').value = 'Error al cargar';
    }
}

async function loadMinecraftArgs() {
    try {
        const response = await fetch(`${API_URL}/minecraft-args`);
        const data = await response.json();
        
        document.querySelector('textarea[name="jvm_args"]').value = data.jvmArgs;
        document.getElementById('finalCommand').textContent = data.fullCommand;
        document.querySelector('input[name="full_mc_command"]').value = data.fullCommand;
    } catch (error) {
        console.error('Error cargando Minecraft config:', error);
        document.querySelector('textarea[name="jvm_args"]').value = 'Error al cargar';
    }
}

async function loadLogs() {
    try {
        const response = await fetch(`${API_URL}/logs`);
        const data = await response.json();
        
        const logContainer = document.querySelector('#tab-logs .Code-Container');
        
        if (!logContainer) return;
        
        logContainer.innerHTML = data.logs.map(log => {
            let color = '#ccc';
            
            if (log.includes('ERROR') || log.includes('STDERR')) {
                color = '#ff6b6b';
            } else if (log.includes('WARN')) {
                color = '#ffd93d';
            } else if (log.includes('OK') || log.includes('SUCCESS')) {
                color = '#6bcf7f';
            } else if (log.includes('INFO')) {
                color = '#4ecdc4';
            }
            
            const escapedLog = log.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            return `<span style="color:${color}">${escapedLog}</span>`;
        }).join('<br>');
        
        logContainer.scrollTop = logContainer.scrollHeight;
        document.querySelector('input[name="raw_logs"]').value = data.logs.join('\n');
    } catch (error) {
        console.error('Error cargando logs:', error);
    }
}

function startLogRefresh() {
    setInterval(async () => {
        const logsTab = document.getElementById('tab-logs');
        if (logsTab && logsTab.classList.contains('active')) {
            await loadLogs();
        }
    }, 3000);
}

function setupFormInterceptor() {
    const form = document.querySelector('form');
    
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        try {
            await fetch(`${API_URL}/prepare-diagnostic`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
        } catch (error) {
            console.error('Error preparando diagnóstico:', error);
        }
    });
}

function setupCopyButton() {
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('Copy-Action')) {
            const codeElement = e.target.nextElementSibling;
            
            if (!codeElement) return;
            
            const code = codeElement.textContent || '';
            
            navigator.clipboard.writeText(code)
                .then(() => {
                    e.target.textContent = 'done';
                    setTimeout(() => {
                        e.target.textContent = 'content_copy';
                    }, 2000);
                })
                .catch(err => {
                    console.error('Error copiando:', err);
                });
        }
    });
}

window.refreshDebugData = async function() {
    await Promise.all([
        loadSystemInfo(),
        loadMinecraftArgs(),
        loadLogs()
    ]);
};