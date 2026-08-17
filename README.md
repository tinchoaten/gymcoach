# GymCoach JM

PWA personal de entrenamiento: chat con un coach biomecánico (Gemini), registro de
series y seguimiento de progresión. Todo corre en el navegador, sin backend. Los datos
viven en `localStorage` del dispositivo y la API key nunca sale del navegador salvo
hacia Google.

## Archivos

| Archivo | Rol |
|---|---|
| `index.html` | Estructura y marcado de las tres pestañas |
| `app.js` | Toda la lógica: chat, registro, progresión, timer |
| `styles.css` | Estilos |
| `sw.js` | Service worker (offline + caché) |
| `manifest.json` | Metadatos de instalación PWA |

## Deploy

Se publica solo con GitHub Pages desde `main`.

**Regla que no se puede saltear:** cada vez que cambies `app.js`, `index.html` o
`styles.css`, **subí el número de `CACHE` en `sw.js`** (`gymcoach-v3` → `gymcoach-v4`).

El navegador solo reinstala un service worker cuando el archivo `sw.js` cambia byte a
byte. Si no lo tocás, los dispositivos que ya tienen la app instalada siguen ejecutando
la copia vieja de `app.js` para siempre, aunque el servidor tenga la nueva. Eso fue
exactamente lo que hizo que un cambio de modelo de Gemini ya corregido siguiera
fallando en el teléfono durante semanas.

## Modelo de Gemini

El modelo se configura desde la app (engranaje → Configuración), no está hardcodeado.
Cuando Google da de baja un modelo, la API responde 404 y la app te lo dice con el
nombre exacto y qué hacer. Se cambia ahí, sin tocar código ni redeployar.

Modelos vigentes: `gemini-2.5-flash` (default), `gemini-flash-latest`,
`gemini-2.5-flash-lite`, `gemini-2.5-pro`.

Conseguir una API key: https://aistudio.google.com/apikey

## Datos

- **Historial de series** → `localStorage`, exportable a JSON desde Configuración.
- **Snapshots automáticos** → se guardan los últimos 5 al cerrar cada sesión clínica.
- **Conversación** → se persisten los últimos 40 turnos, así el chat sobrevive a un
  cierre de la app en medio del entrenamiento.

Borrar los datos del sitio en el navegador borra todo esto. Exportá antes.

## Desarrollo local

```bash
python -m http.server 8777
```

Y abrir http://127.0.0.1:8777. Hace falta servirlo por HTTP: el service worker no se
registra desde `file://`.
