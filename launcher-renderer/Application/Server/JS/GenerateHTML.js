function generateDebugReport() {
    const getProblemSourceText = (value) => {
        const options = {
            'app_ui': 'Interfaz del Launcher (Visual/Botones)',
            'app_logic': 'Lógica de la App (Configuración/Rutas)',
            'mc_launch': 'Minecraft no abre',
            'mc_crash': 'Minecraft se cierra solo',
            'downloader': 'Error de descarga de archivos'
        };
        return options[value] || value || 'No especificado';
    };

    const getSeverityText = (value) => {
        const options = {
            'annoying': 'Molesto pero jugable',
            'urgent': 'Urgente (Afecta funciones)',
            'critical': 'Crítico (No puedo entrar)'
        };
        return options[value] || value || 'No especificado';
    };

    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    const cleanLogsHtml = (html) => {
        if (!html) return '';
        
        const temp = document.createElement('div');
        temp.innerHTML = html;
        
        let cleaned = temp.innerHTML
            .replace(/^\s+/gm, '')
            .replace(/\s+$/gm, '')
            .replace(/\n\s*\n/g, '\n')
            .trim();
        
        return cleaned;
    };

    const data = {};
    
    data.problem_source = document.querySelector('select[name="problem_source"]')?.value || '';
    data.severity = document.querySelector('select[name="severity"]')?.value || '';
    data.description = document.querySelector('textarea[name="description"]')?.value || '';
    
    const jvmTextarea = document.querySelector('textarea[name="jvm_args"]');
    data.jvm_args = jvmTextarea ? jvmTextarea.value : '';
    
    const finalCommandCode = document.querySelector('#finalCommand');
    data.full_mc_command = finalCommandCode ? finalCommandCode.textContent.trim() : '';
    
    data.os_info = document.querySelector('input[name="os_info"]')?.value || 'Windows 10 Pro x64';
    data.ram_free = document.querySelector('input[name="ram_free"]')?.value || '8.4 GB / 16 GB';
    data.extra_sys_info = document.querySelector('textarea[name="extra_sys_info"]')?.value || '';
    
    const filesInput = document.querySelector('input[name="attachments"]');
    const fileNames = [];
    if (filesInput && filesInput.files) {
        for (let i = 0; i < filesInput.files.length; i++) {
            fileNames.push(filesInput.files[i].name);
        }
    }
    data.attachments = fileNames;
    
    const logsContainer = document.querySelector('#tab-logs .Code-Container');
    data.raw_logs_html = logsContainer ? cleanLogsHtml(logsContainer.innerHTML) : '';

    const reportDate = new Date();
    const formattedDate = reportDate.toLocaleString('es-AR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const htmlContent = `<!DOCTYPE html>
<html lang="es-AR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StepLauncher | Reporte de Diagnóstico</title>
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #0a0b0f;
            --bg-secondary: #0c0d12;
            --bg-elevated: rgba(15, 17, 23, 0.95);
            --accent-primary: #71b7ff;
            --accent-glow: #4a9eff;
            --text-primary: #e8eaed;
            --text-secondary: #9aa0a6;
            --text-tertiary: #5f6368;
            --border-subtle: rgba(113, 183, 255, 0.08);
            --border-normal: rgba(113, 183, 255, 0.15);
            --border-strong: rgba(113, 183, 255, 0.25);
            --surface-hover: rgba(255, 255, 255, 0.04);
            --surface-active: rgba(113, 183, 255, 0.12);
            --success: #4ade80;
            --warning: #fbbf24;
            --error: #f87171;
            --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.2);
            --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.3);
            --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.4);
            --radius-sm: 4px;
            --radius-md: 6px;
            --radius-lg: 8px;
            --spacing-xs: 0.5rem;
            --spacing-sm: 0.75rem;
            --spacing-md: 1rem;
            --spacing-lg: 1.5rem;
            --spacing-xl: 2rem;
            --spacing-2xl: 3rem;
            --spacing-3xl: 4rem;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            scrollbar-width: thin;
            scrollbar-color: var(--minecraft-dialog-color) rgba(255,255,255,0.05);
        }

        *::-webkit-scrollbar {
            width: 6px;
            height: 6px;
        }

        *::-webkit-scrollbar-track {
            background: transparent;
        }

        *::-webkit-scrollbar-thumb {
            background: var(--accent-primary);
            border-radius: 3px;
            transition: background 200ms;
        }

        *::-webkit-scrollbar-thumb:hover {
            background: var(--accent-glow);
        }

        body, html {
            height: 100%;
            width: 100%;
            background: var(--bg-primary);
            color: var(--text-primary);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            overflow: hidden;
            line-height: 1.6;
        }

        .Debug-Wrapper {
            display: grid;
            grid-template-columns: 18rem 1fr;
            height: 100vh;
            width: 100vw;

            .Sidebar-Debug {
                background: var(--bg-elevated);
                border-right: 1px solid var(--border-normal);
                display: flex;
                flex-direction: column;
                padding: var(--spacing-xl) 0;
                box-shadow: var(--shadow-md);
                z-index: 100;

                .Brand {
                    display: flex;
                    align-items: center;
                    gap: var(--spacing-sm);
                    padding: 0 var(--spacing-xl);
                    margin-bottom: var(--spacing-2xl);
                    
                    .brand-icon {
                        width: 28px;
                        height: 28px;
                        background: linear-gradient(135deg, var(--accent-primary), var(--accent-glow));
                        border-radius: var(--radius-md);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 1.1rem;
                        box-shadow: 0 0 20px rgba(113, 183, 255, 0.3);
                        flex-shrink: 0;
                    }
                    
                    h2 {
                        font-size: 0.875rem;
                        letter-spacing: 2.5px;
                        color: var(--accent-primary);
                        font-weight: 700;
                        text-transform: uppercase;
                    }
                }

                .Nav-Group {
                    flex: 1;
                    padding: 0;
                    
                    .Nav-Item {
                        padding: var(--spacing-md) var(--spacing-xl);
                        display: flex;
                        align-items: center;
                        gap: var(--spacing-md);
                        color: var(--text-tertiary);
                        cursor: pointer;
                        transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
                        font-size: 0.875rem;
                        font-weight: 500;
                        border-left: 2px solid transparent;
                        user-select: none;
                        position: relative;

                        i {
                            font-size: 1.25rem;
                            transition: transform 250ms cubic-bezier(0.4, 0, 0.2, 1);
                            flex-shrink: 0;
                        }

                        &::before {
                            content: '';
                            position: absolute;
                            left: 0;
                            top: 0;
                            bottom: 0;
                            width: 0;
                            background: var(--accent-primary);
                            transition: width 250ms cubic-bezier(0.4, 0, 0.2, 1);
                        }

                        &:hover {
                            color: var(--text-primary);
                            background: var(--surface-hover);
                            
                            i {
                                transform: translateX(2px);
                            }
                        }

                        &.active {
                            color: var(--accent-primary);
                            background: var(--surface-active);
                            font-weight: 600;
                            
                            &::before {
                                width: 2px;
                            }
                            
                            i {
                                filter: drop-shadow(0 0 8px var(--accent-primary));
                            }
                        }
                    }
                }

                .Sidebar-Footer {
                    padding: var(--spacing-md) var(--spacing-xl);
                    border-top: 1px solid var(--border-subtle);
                    font-size: 0.75rem;
                    color: var(--text-tertiary);
                    line-height: 1.7;
                    
                    strong {
                        color: var(--text-secondary);
                        display: block;
                        margin-bottom: var(--spacing-xs);
                    }
                    
                    .version-badge {
                        display: inline-block;
                        background: var(--surface-active);
                        color: var(--accent-primary);
                        padding: 2px 8px;
                        border-radius: var(--radius-sm);
                        font-weight: 600;
                        font-size: 0.7rem;
                        margin-top: var(--spacing-xs);
                        border: 1px solid var(--border-subtle);
                    }
                }
            }

            .Main-Content {
                position: relative;
                display: flex;
                flex-direction: column;
                background: 
                    radial-gradient(circle at 20% 10%, rgba(113, 183, 255, 0.03), transparent 40%),
                    radial-gradient(circle at 80% 90%, rgba(113, 183, 255, 0.02), transparent 40%),
                    var(--bg-secondary);
                overflow-y: auto;

                header {
                    padding: var(--spacing-3xl) var(--spacing-3xl) var(--spacing-xl);
                    border-bottom: 1px solid var(--border-subtle);
                    background: rgba(10, 11, 15, 0.8);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    z-index: 50;
                    
                    .status-badge {
                        display: inline-flex;
                        align-items: center;
                        gap: var(--spacing-sm);
                        background: rgba(74, 222, 128, 0.12);
                        color: var(--success);
                        padding: 6px 14px;
                        border-radius: 20px;
                        font-size: 0.7rem;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 1.2px;
                        margin-bottom: var(--spacing-lg);
                        border: 1px solid rgba(74, 222, 128, 0.25);
                        
                        i {
                            font-size: 1rem;
                        }
                    }
                    
                    h1 { 
                        font-size: 2.25rem; 
                        font-weight: 300;
                        background: linear-gradient(135deg, var(--text-primary) 0%, var(--accent-primary) 100%);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        background-clip: text;
                        margin-bottom: var(--spacing-sm);
                        letter-spacing: -0.5px;
                    }
                    
                    p { 
                        color: var(--text-secondary); 
                        font-size: 0.95rem;
                        max-width: 600px;
                    }
                    
                    .report-metadata {
                        display: flex;
                        flex-wrap: wrap;
                        gap: var(--spacing-xl);
                        margin-top: var(--spacing-lg);
                        padding-top: var(--spacing-lg);
                        border-top: 1px solid var(--border-subtle);
                        
                        .meta-item {
                            display: flex;
                            align-items: center;
                            gap: var(--spacing-sm);
                            color: var(--text-tertiary);
                            font-size: 0.8rem;
                            
                            i {
                                font-size: 1.1rem;
                                color: var(--accent-primary);
                            }
                            
                            strong {
                                color: var(--text-primary);
                                margin-left: 4px;
                                font-weight: 600;
                            }
                        }
                    }
                }

                .Section-View {
                    display: none;
                    animation: fadeIn 400ms cubic-bezier(0.4, 0, 0.2, 1);
                    padding: var(--spacing-2xl) var(--spacing-3xl);
                    
                    &.active { 
                        display: block; 
                    }
                }

                .Form-Grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
                    gap: var(--spacing-xl);
                    margin-bottom: var(--spacing-xl);
                }

                .Field-Block {
                    margin-bottom: var(--spacing-xl);

                    label {
                        display: flex;
                        align-items: center;
                        gap: var(--spacing-sm);
                        font-size: 0.7rem;
                        text-transform: uppercase;
                        letter-spacing: 1.5px;
                        color: var(--accent-primary);
                        margin-bottom: var(--spacing-md);
                        font-weight: 700;

                        i {
                            font-size: 1.1rem;
                        }

                        .optional-tag {
                            margin-left: auto;
                            color: var(--text-tertiary);
                            font-weight: 400;
                            text-transform: none;
                            font-size: 0.65rem;
                        }
                    }

                    .readonly-field, .readonly-textarea {
                        width: 100%;
                        background: rgba(255, 255, 255, 0.02);
                        border: 1px solid var(--border-subtle);
                        padding: var(--spacing-lg);
                        color: var(--text-primary);
                        border-radius: var(--radius-md);
                        font-size: 0.9rem;
                        line-height: 1.7;
                        font-family: inherit;
                        transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
                        box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
                    }
                    
                    .readonly-field {
                        min-height: 54px;
                        display: flex;
                        align-items: center;
                    }
                    
                    .readonly-textarea {
                        min-height: 140px;
                        max-height: 300px;
                        overflow-y: auto;
                        white-space: pre-wrap;
                        word-wrap: break-word;
                    }
                    
                    .readonly-field:hover, .readonly-textarea:hover {
                        border-color: var(--border-normal);
                        background: rgba(255, 255, 255, 0.04);
                    }
                }
            }
        }

        .Code-Container {
            background: #050608;
            border: 1px solid var(--border-normal);
            padding: var(--spacing-lg);
            border-radius: var(--radius-md);
            font-family: 'SF Mono', 'Monaco', 'Consolas', 'Courier New', monospace;
            font-size: 0.875rem;
            line-height: 1.8;
            color: #a5d6ff;
            max-height: 500px;
            overflow-y: auto;
            position: relative;
            box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.5);
            
            &::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 2px;
                background: linear-gradient(90deg, var(--accent-primary), transparent);
            }
        }

        .Upload-Drop-Zone {
            border: 2px dashed var(--border-subtle);
            background: rgba(255, 255, 255, 0.01);
            padding: var(--spacing-xl);
            border-radius: var(--radius-lg);
            text-align: center;
            transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
            
            i { 
                font-size: 3rem; 
                color: var(--accent-primary); 
                display: block; 
                margin-bottom: var(--spacing-md);
                opacity: 0.8;
            }
            
            .drop-text {
                color: var(--text-secondary);
                font-size: 0.9rem;
                margin-bottom: var(--spacing-md);
            }
            
            .file-list {
                display: flex;
                flex-wrap: wrap;
                gap: var(--spacing-md);
                justify-content: center;
                margin-top: var(--spacing-lg);
            }
        }

        .file-item {
            background: var(--surface-active);
            border: 1px solid var(--border-normal);
            padding: var(--spacing-sm) var(--spacing-md);
            border-radius: var(--radius-md);
            font-size: 0.85rem;
            display: flex;
            align-items: center;
            gap: var(--spacing-sm);
            transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
            
            i {
                color: var(--accent-primary);
                font-size: 1.2rem;
            }
            
            &:hover {
                background: rgba(113, 183, 255, 0.18);
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(113, 183, 255, 0.2);
            }
        }

        .severity-badge {
            display: inline-flex;
            align-items: center;
            gap: var(--spacing-sm);
            padding: var(--spacing-sm) var(--spacing-md);
            border-radius: var(--radius-md);
            font-weight: 600;
            font-size: 0.875rem;
            
            i {
                font-size: 1.1rem;
            }
            
            &.critical {
                background: rgba(248, 113, 113, 0.15);
                color: var(--error);
                border: 1px solid rgba(248, 113, 113, 0.3);
            }
            
            &.urgent {
                background: rgba(251, 191, 36, 0.15);
                color: var(--warning);
                border: 1px solid rgba(251, 191, 36, 0.3);
            }
            
            &.annoying {
                background: rgba(74, 222, 128, 0.15);
                color: var(--success);
                border: 1px solid rgba(74, 222, 128, 0.3);
            }
        }

        .report-footer {
            margin-top: var(--spacing-3xl);
            padding: var(--spacing-xl) var(--spacing-3xl);
            border-top: 1px solid var(--border-subtle);
            color: var(--text-tertiary);
            font-size: 0.75rem;
            text-align: center;
            background: rgba(10, 11, 15, 0.8);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            
            .footer-content {
                max-width: 600px;
                margin: 0 auto;
                line-height: 1.8;
                
                strong {
                    color: var(--text-secondary);
                    display: block;
                    margin-bottom: var(--spacing-sm);
                }
            }
            
            a {
                color: var(--accent-primary);
                text-decoration: none;
                transition: color 200ms;
                font-weight: 600;
                
                &:hover {
                    color: var(--accent-glow);
                    text-decoration: underline;
                }
            }
        }

        @keyframes fadeIn {
            from { 
                opacity: 0; 
                transform: translateY(15px); 
            }
            to { 
                opacity: 1; 
                transform: translateY(0); 
            }
        }

        @media (max-width: 1024px) {
            .Debug-Wrapper {
                grid-template-columns: 1fr;
            }
            
            .Sidebar-Debug {
                display: none;
            }
            
            .Main-Content header,
            .Main-Content .Section-View {
                padding: var(--spacing-xl) var(--spacing-lg);
            }
            
            .Form-Grid {
                grid-template-columns: 1fr;
            }
        }

        @media print {
            .Sidebar-Debug {
                display: none;
            }
            
            .Debug-Wrapper {
                grid-template-columns: 1fr;
            }
            
            .Main-Content {
                overflow: visible;
            }
            
            .Section-View {
                display: block !important;
                page-break-after: always;
                padding: var(--spacing-lg) !important;
            }
            
            .status-badge,
            .report-metadata {
                display: none;
            }
        }
    </style>
</head>
<body>

    <div class="Debug-Wrapper">
        
        <aside class="Sidebar-Debug">
            <div class="Brand">
                <div class="brand-icon">
                    <i class="material-icons">terminal</i>
                </div>
                <h2>STEPLAUNCHER</h2>
            </div>
            
            <div class="Nav-Group">
                <div class="Nav-Item active" onclick="showReportTab('tab-incident')">
                    <i class="material-icons">bug_report</i> Incidencia
                </div>
                <div class="Nav-Item" onclick="showReportTab('tab-app')">
                    <i class="material-icons">settings_remote</i> Launcher & MC
                </div>
                <div class="Nav-Item" onclick="showReportTab('tab-env')">
                    <i class="material-icons">memory</i> Entorno
                </div>
                <div class="Nav-Item" onclick="showReportTab('tab-logs')">
                    <i class="material-icons">terminal</i> Logs
                </div>
                <div class="Nav-Item" onclick="showReportTab('tab-files')">
                    <i class="material-icons">collections</i> Archivos
                </div>
            </div>

            <div class="Sidebar-Footer">
                <strong>StepLauncher</strong><br>
                <span class="version-badge">v1.0.0</span><br>
                Reporte de Diagnóstico
            </div>
        </aside>

        <main class="Main-Content">
            <header>
                <div class="status-badge">
                    <i class="material-icons">check_circle</i>
                    Reporte Generado
                </div>
                <h1>Reporte de Diagnóstico</h1>
                <p>Informe completo generado automáticamente desde el formulario de diagnóstico del launcher</p>
                <div class="report-metadata">
                    <div class="meta-item">
                        <i class="material-icons">event</i>
                        <span>Generado: <strong>${formattedDate}</strong></span>
                    </div>
                    <div class="meta-item">
                        <i class="material-icons">developer_board</i>
                        <span>Sistema: <strong>${escapeHtml(data.os_info)}</strong></span>
                    </div>
                </div>
            </header>

            <!-- Sección Incidencia -->
            <div id="tab-incident" class="Section-View active">
                <div class="Form-Grid">
                    <div class="Field-Block">
                        <label><i class="material-icons">category</i> Origen del problema</label>
                        <div class="readonly-field">
                            ${escapeHtml(getProblemSourceText(data.problem_source))}
                        </div>
                    </div>
                    <div class="Field-Block">
                        <label><i class="material-icons">priority_high</i> Gravedad</label>
                        <div class="readonly-field">
                            <span class="severity-badge ${data.severity}">
                                <i class="material-icons">${data.severity === 'critical' ? 'error' : data.severity === 'urgent' ? 'warning' : 'info'}</i>
                                ${escapeHtml(getSeverityText(data.severity))}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="Field-Block">
                    <label><i class="material-icons">description</i> Descripción del suceso <span class="optional-tag">Información detallada</span></label>
                    <div class="readonly-textarea">${escapeHtml(data.description) || 'No se proporcionó descripción'}</div>
                </div>
            </div>

            <!-- Sección Launcher & MC -->
            <div id="tab-app" class="Section-View">
                <div class="Field-Block">
                    <label><i class="material-icons">code</i> Argumentos de Inicio (JVM)</label>
                    <div class="Code-Container" style="color: var(--accent-primary);">${escapeHtml(data.jvm_args) || '-Xmx4096M -Djava.library.path=natives -Dminecraft.launcher.brand=StepLauncher'}</div>
                </div>

                <div class="Field-Block">
                    <label><i class="material-icons">launch</i> Comando Final de Ejecución <span class="optional-tag">Comando ejecutado</span></label>
                    <div class="Code-Container">${escapeHtml(data.full_mc_command) || 'C:\\Java\\bin\\javaw.exe -cp "libraries.jar;client.jar" net.minecraft.Main --username StepNicka --version 1.20.1'}</div>
                </div>
            </div>

            <!-- Sección Entorno -->
            <div id="tab-env" class="Section-View">
                <div class="Form-Grid">
                    <div class="Field-Block">
                        <label><i class="material-icons">computer</i> Sistema Operativo</label>
                        <div class="readonly-field">${escapeHtml(data.os_info)}</div>
                    </div>
                    <div class="Field-Block">
                        <label><i class="material-icons">memory</i> Memoria RAM Libre</label>
                        <div class="readonly-field">${escapeHtml(data.ram_free)}</div>
                    </div>
                </div>
                <div class="Field-Block">
                    <label><i class="material-icons">info</i> Información adicional del sistema <span class="optional-tag">Detalles extra</span></label>
                    <div class="readonly-textarea">${escapeHtml(data.extra_sys_info) || 'No se proporcionó información adicional'}</div>
                </div>
            </div>

            <!-- Sección Logs -->
            <div id="tab-logs" class="Section-View">
                <div class="Field-Block">
                    <label><i class="material-icons">article</i> VOLCADO DE CONSOLA <span class="optional-tag">Stdout/Stderr capturado</span></label>
                    <div class="Code-Container" style="max-height: 600px;">${data.raw_logs_html || `<span style="color:var(--text-tertiary); font-style: italic;">[No hay logs disponibles]</span>`}</div>
                </div>
            </div>

            <!-- Sección Archivos -->
            <div id="tab-files" class="Section-View">
                <div class="Field-Block">
                    <label><i class="material-icons">attach_file</i> Capturas de pantalla y archivos adjuntos</label>
                    <div class="Upload-Drop-Zone">
                        <i class="material-icons">collections</i>
                        <div class="drop-text">Archivos adjuntos en el reporte original</div>
                        <div class="file-list">
                            ${data.attachments.length > 0 
                                ? data.attachments.map(file => `
                                    <div class="file-item">
                                        <i class="material-icons">insert_drive_file</i>
                                        ${escapeHtml(file)}
                                    </div>
                                `).join('')
                                : '<div class="file-item" style="border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.02);"><i class="material-icons">info</i> No hay archivos adjuntos</div>'
                            }
                        </div>
                    </div>
                </div>
            </div>

            <div class="report-footer">
                <div class="footer-content">
                    <strong>Reporte generado automáticamente por StepLauncher Debug Center</strong><br>
                    Este documento contiene información de diagnóstico para resolver problemas técnicos.<br>
                    <a href="https://github.com/NovaStepStudios" target="_blank">NovaStepStudios</a> © ${reportDate.getFullYear()}
                </div>
            </div>
        </main>
    </div>

    <script>
        function showReportTab(tabId) {
            document.querySelectorAll('.Section-View').forEach(v => v.classList.remove('active'));
            document.querySelectorAll('.Nav-Item').forEach(n => n.classList.remove('active'));
            
            document.getElementById(tabId).classList.add('active');
            event.currentTarget.classList.add('active');
        }
        
        // Scroll suave
        document.querySelectorAll('.Nav-Item').forEach(item => {
            item.addEventListener('click', function() {
                document.querySelector('.Main-Content').scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            });
        });
    </script>

</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = reportDate.toISOString().slice(0, 19).replace(/[:]/g, '-');
    a.href = url;
    a.download = `StepLauncher-Debug-Report-${timestamp}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('✓ Reporte generado exitosamente:', {
        timestamp,
        dataCollected: Object.keys(data).length,
        logsSize: data.raw_logs_html.length
    });
    
    return {
        success: true,
        htmlContent: htmlContent,
        formData: data,
        timestamp: timestamp
    };
}
