# CLAUDE.md

PWA personal de entrenamiento (GymCoach JM). Sin backend: todo corre
en el navegador, usa la API de Gemini directo desde el cliente, datos en
localStorage.

- Archivos: `index.html`, `app.js` (toda la logica), `styles.css`,
  `sw.js` (service worker), `manifest.json`.
- Regla critica e innegociable: cada vez que cambien `app.js`,
  `index.html` o `styles.css`, hay que subir el numero de `CACHE` en
  `sw.js` (ej. gymcoach-v3 -> gymcoach-v4). Si no se hace, los
  dispositivos con la PWA instalada siguen corriendo la version vieja
  indefinidamente.
- El modelo de Gemini se configura desde la UI (Configuracion), nunca
  hardcodeado en el codigo.
- Deploy: GitHub Pages desde `main`. No hay entorno de staging.
- Desarrollo local: `python -m http.server 8777` (el service worker
  no registra sobre `file://`).
- Ver README.md para el detalle completo de manejo de datos.
