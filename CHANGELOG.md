# Changelog's
- Todas las modificaciones importantes de este proyecto se documentarán en este archivo.
- JSON De Noticias de StepLaucnher **Mas detallado** :

---

### Segundo Commit — *12 / 11 / 2025*

#### ✨ **Mejoras visuales, animaciones y rendimiento general**

#### 🧩 Sistema de Paneles y Transiciones (PanelsManager)

#### 📰 Sistema de Noticias (iframes optimizados)

* **Nuevo sistema de transiciones visuales:**

  * Añadida una animación fluida de entrada/salida de paneles mediante el componente `LoaderProgram`.
  * Se evita completamente el cambio de contenido visible durante la transición (sin parpadeos o flashes).
  * Integración perfecta con el flujo de `showPanel()` y `hidePanel()` — ahora todo el cambio de paneles está sincronizado con las animaciones CSS.

* **`PanelsManager` totalmente reestructurado:**

  * 🚀 Carga dinámica de paneles con cache interno (`Map<string, string>`) para evitar peticiones redundantes.
  * 🧩 Ejecución automática de scripts embebidos dentro del HTML cargado.
  * 🔁 Control completo de visibilidad y destrucción de paneles (`destroyPanel`, `destroyAll`).
  * ✨ Animaciones suaves y bloqueos de interacción temporales para asegurar transiciones sin cortes.
  * 🧱 Arquitectura más limpia y orientada a reutilización — lista para ampliarse con futuros efectos o loaders personalizados.

* **Optimización del sistema de iframes (`IframeController`):**

  * ⚡ Carga más rápida y estable mediante `setupIframeLoader()`, con indicadores visuales actualizados.
  * 🌐 Sistema de traducciones dinámico mejorado — ahora `setupIframeTranslations()` detecta el idioma en tiempo real y reenvía los textos al iframe sin recargarlo.
  * 🧠 Observador (`MutationObserver`) para detectar cambios de `src` en iframes y simular correctamente los eventos de carga.
  * 🔒 Comunicación segura entre el proceso principal y los iframes, con soporte para `open-external`.

* **Logger Mejorado (`ElectronPino`):**

  * Registro de logs más estructurado y categorizado por niveles: `info`, `warn`, `error`, `debug`, `success`, `critical`.
  * Integración directa con el proceso principal vía IPC.
  * Logs automáticos eliminados tras reinicios para mantener limpio `%appdata%/.StepLauncher/Launcher/Logs`.

* **``Electron-Updater`` - Actualizaciones automáticas:**

  * Sistema de detección de nuevas versiones mediante Github Releases.
  * Notificación de progreso al usuario mediante eventos personalizados.

* **Activación de DiscordRPC:**

  * Conexión automática al iniciar el launcher.
  * Soporte completo para `connect`, `disconnect`, `setMode` y `getStatus`.
  * Eventos en tiempo real disponibles en el renderer a través del preload seguro.

* **Panel de Bienvenida para nuevos usuarios:**

  * Detecta si el launcher se ejecuta por primera vez.
  * Muestra un panel introductorio con guía inicial.
  * Marca `isFirstTimeUser = false` al finalizar la bienvenida para evitar que se repita.

* **Eliminación automática de logs antiguos:**

  * Todos los logs generados en `%appdata%/.StepLauncher/Launcher/Logs` se eliminan al iniciar el launcher.
  * Previene acumulación de archivos y mejora el rendimiento general.

* **Otras mejoras menores:**

  * Reducción de redundancias en llamadas a `querySelector`.
  * Mejor sincronización entre animaciones y operaciones del DOM (usando `setTimeout` calibrado).
  * Mayor estabilidad general del launcher y optimización de recursos en segundo plano.

---

### Primer commit **6 / 11 / 2025**
- 🚀 Subida inicial del proyecto StepLauncher.
- Incluye **todos los archivos base**:
  - UI/UX completa.
  - Sistema de noticias.
  - Módulos de carga.
  - Controladores de conexión.
  - Soporte inicial para traducciones.
- Primer build funcional de StepLauncher.