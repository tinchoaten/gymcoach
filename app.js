// ═══════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════
let apiKey = '';
let modelo = 'gemini-2.5-flash';
let conversationHistory = [];
let chartInstance = null;
let sesionActiva = false;
let setsData = [];

const MODELO_DEFAULT = 'gemini-2.5-flash';
const MAX_HISTORY_ITEMS = 10;
const REQUEST_TIMEOUT_MS = 60000;

const DIAS = {
  A: 'Pierna / Hombros / Core',
  B: 'Espalda / Bíceps (Rehab activa)',
  C: 'Pecho / Tríceps / Hombro lateral'
};

const SECUENCIA = ['A', 'B', 'C'];

const K = {
  apiKey: 'gymcoach_api_key',
  modelo: 'gymcoach_modelo',
  historial: 'gymcoach_historial',
  contexto: 'gymcoach_contexto_previo',
  conversacion: 'gymcoach_conversacion',
  ultimoDia: 'gymcoach_ultimo_dia',
  diasCount: 'gymcoach_dias_count',
  ultimoBackup: 'gymcoach_ultimo_backup',
  snapshots: 'gymcoach_snapshots'
};

// ═══════════════════════════════════════
// PWA — SERVICE WORKER
// ═══════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ═══════════════════════════════════════
// UTILIDADES BASE
// ═══════════════════════════════════════
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nuevoId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return `r_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function leerJSON(clave, fallback) {
  try {
    const raw = localStorage.getItem(clave);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function guardarJSON(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch (e) {
    showToast('Sin espacio de almacenamiento. Exportá y limpiá el historial.');
    return false;
  }
}

// Cada registro necesita un id propio: sin él, borrar un ejercicio
// repetido el mismo día con los mismos sets borraba el equivocado.
function getHistorial() {
  const historial = leerJSON(K.historial, []);
  let migrado = false;
  historial.forEach(r => {
    if (!r.id) { r.id = nuevoId(); migrado = true; }
  });
  if (migrado) guardarJSON(K.historial, historial);
  return historial;
}

function setHistorial(historial) {
  guardarJSON(K.historial, historial);
}

function maxKgDe(registro) {
  const pesos = (registro.sets || []).map(s => parseFloat(s.kg) || 0);
  return pesos.length ? Math.max(...pesos) : 0;
}

// ═══════════════════════════════════════
// PROMPT SISTEMA
// ═══════════════════════════════════════
const PROMPT_V2 = `PROMPT v2.0 — COACH BIOMECÁNICO CLÍNICO
Caso: Juan Martín Atencio | Versión: 2.0

0. META-INSTRUCCIÓN Y ROL (CRÍTICO)
Actúa como Coach Biomecánico Clínico y Especialista en Rehabilitación Funcional. No eres un animador de gimnasio. Combinás biomecánica clínica, fisiología del tejido conectivo y programación de fuerza para atletas con historial de lesión activa.

Regla de Oro: No asesorarás sobre nutrición, dietas ni suplementación a menos que se solicite explícitamente. Enfoque 100% mecánico, clínico y de ejecución. Cero condescendencia. Cero frases motivacionales. Comunicación con precisión fisiológica.

1. DIAGNÓSTICO CLÍNICO
Atleta: Juan Martín Atencio, 46 años, 95 kg.
Estado Estructural CRÍTICO: Fase de remodelación tisular activa por microtrauma (tirón) en dorsal ancho izquierdo (10/04/2026). Estado ACTIVO hasta reporte explícito "cero dolor confirmado".
Estatus: Fase de alto rendimiento con supercompensación.

2. REGLAS ESTRICTAS DE PROTECCIÓN BIOMECÁNICA
2.1 Mientras dorsal ACTIVO, están PROHIBIDOS: jalones, remos con carga isotónica pesada, estiramientos profundos del dorsal, ejercicios con co-contracción isométrica intensa del dorsal.
2.2 Escala de carga: Sin riesgo dorsal → 95% histórico. Riesgo moderado → 75-80% histórico. Contraindicado → sustituir.
2.3 Día B = Rehabilitación Activa: solo isométrico bajo, curl predicador 70%, movilidad manguito rotador.
2.4 En TODOS los ejercicios de tren inferior recordar: "Agarre neutro, no comprimas el dorsal por reflejo."
2.5 Excéntrica estricta 3s. Descansos 2-3 min innegociables.

3. FLUJO DE SESIÓN
Cuando el atleta diga "Voy a entrenar":
- Indicar qué Día toca y listar ejercicios del día
- Presentar SOLO el Ejercicio 1 con formato exacto:

Ejercicio N°[X] de [Total]:
────────────────────────────
Nombre:
Series x Repeticiones:
Peso sugerido:
Descanso:
Nivel de riesgo dorsal: [BAJO / MODERADO / VERIFICAR]
Sugerencia biomecánica:
⚠️ REVISIÓN DORSAL (si aplica):

Esperar feedback antes de continuar. Si reporta dolor → acción clínica inmediata. Si riesgo de co-contracción dorsal → advertir ANTES con etiqueta ⚠️ REVISIÓN DORSAL.

4. CIERRE DE SESIÓN
Al terminar, generar Reporte Final con: ejercicios completados/modificados, análisis de sobrecarga progresiva, estado SNC (tempo, carga, RPE), y párrafo clínico de protección de contexto para próxima sesión.`;

// ═══════════════════════════════════════
// DIGEST DE DATOS REALES
// El coach ya no depende solo del párrafo de contexto que él mismo
// escribió: acá recibe las cargas efectivamente registradas.
// ═══════════════════════════════════════
function getResumenEntrenamiento() {
  const historial = getHistorial();
  if (historial.length === 0) return 'Sin registros de carga todavía. Primera sesión del sistema.';

  const porEjercicio = {};
  historial.forEach(r => {
    (porEjercicio[r.ejercicio] ||= []).push(r);
  });

  const lineas = Object.entries(porEjercicio)
    .map(([ejercicio, regs]) => {
      const ordenados = [...regs].sort((a, b) => a.fecha.localeCompare(b.fecha));
      const ultimo = ordenados[ordenados.length - 1];
      const maximo = Math.max(...ordenados.map(maxKgDe));
      const setsStr = (ultimo.sets || []).map(s => `${s.reps}×${s.kg}kg`).join(', ');
      const tendencia = calcularTendencia(ordenados);
      const tendStr = ordenados.length >= 2
        ? ` · tendencia ${tendencia > 0 ? '+' : ''}${tendencia} kg/sem`
        : '';
      return `• ${ejercicio}: máx histórico ${maximo} kg · última sesión ${ultimo.fecha} (${setsStr})${tendStr}${ultimo.notas ? ` · nota: "${ultimo.notas}"` : ''}`;
    })
    .sort();

  const fechas = [...new Set(historial.map(r => r.fecha))].sort().reverse().slice(0, 6);
  const sesiones = fechas.map(f => {
    const regs = historial.filter(r => r.fecha === f);
    return `  - ${f} (Día ${regs[0]?.dia || '?'}): ${regs.length} ejercicios — ${regs.map(r => r.ejercicio).join(', ')}`;
  });

  const hoy = hoyISO();
  const registradoHoy = historial.filter(r => r.fecha === hoy);
  const bloqueHoy = registradoHoy.length
    ? `\nYA REGISTRADO HOY (sesión en curso):\n${registradoHoy.map(r => `  - ${r.ejercicio}: ${(r.sets || []).map(s => `${s.reps}×${s.kg}kg`).join(', ')}`).join('\n')}`
    : '\nHoy todavía no hay ejercicios registrados.';

  return `CARGAS REALES REGISTRADAS POR EL ATLETA (fuente de verdad, priorizar sobre cualquier estimación):
${lineas.join('\n')}

ÚLTIMAS SESIONES:
${sesiones.join('\n')}
${bloqueHoy}`;
}

function calcularTendencia(registrosOrdenados) {
  if (registrosOrdenados.length < 2) return 0;
  const primero = registrosOrdenados[0];
  const ultimo = registrosOrdenados[registrosOrdenados.length - 1];
  const diff = maxKgDe(ultimo) - maxKgDe(primero);
  const ms = new Date(ultimo.fecha + 'T12:00:00') - new Date(primero.fecha + 'T12:00:00');
  const semanas = Math.max(1, ms / (7 * 86400000));
  return parseFloat((diff / semanas).toFixed(1));
}

function buildSystemPrompt() {
  const contextoPrevio = localStorage.getItem(K.contexto) || '';
  const counts = contarSesionesPorDia();
  const diaActual = getDiaActual();

  return `${PROMPT_V2}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KNOWLEDGE DIGEST — BASE CIENTÍFICA ACTIVA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Esta sección contiene los principios destilados de la biblioteca clínica del atleta (105 documentos). Aplicar siempre. Prioridad: evidencia sobre convención.

── HIPERTROFIA (Schoenfeld et al.) ──
• Rango óptimo para hipertrofia: 6–20 rep con RIR 1–3. Rangos altos (15–30) son igualmente efectivos si se llega cerca del fallo. Rangos bajos (1–5) priorizan fuerza neuronal.
• Volumen efectivo: 10–20 series semanales por grupo muscular. Atleta avanzado puede tolerar extremo superior. Señal de sobrevolumen: pérdida de rendimiento sesión a sesión.
• Tempo: excéntrica controlada (3–4s) maximiza tensión mecánica y daño muscular. El componente concéntrico puede ser explosivo. Isométrico al final del ROM aumenta activación.
• Descanso entre series: 2–3 min para ejercicios compuestos, 1–2 min para aislamiento. Reducir descanso no mejora hipertrofia y perjudica la carga absoluta.
• Frecuencia: 2x/semana por grupo muscular es el umbral mínimo para maximizar síntesis proteica. Sistema rotativo A/B/C de JM cumple este criterio.
• Progresión: sobrecarga progresiva es el driver principal. Doblar rep antes de subir peso (método doble progresión). Incrementos de 2.5 kg en ejercicios de aislamiento, 5 kg en compuestos.

── ATLETA MASTER (>40 años) ──
• Recuperación post-excéntrica: atletas master (40–50 años) requieren 48–72h vs 24–36h en jóvenes.
• Testosterona y entrenamiento: series de 4–6 rep al 85–90% 1RM con descansos largos producen mayor respuesta anabólica aguda.
• Tejido conectivo: progresar carga no más de 10% semanal en ejercicios que carguen tendones.
• Sarcopenia prevention: mínimo 1.6g proteína/kg/día. Entrenamiento de fuerza es la intervención más efectiva.

── BIOMECÁNICA CLÍNICA (McGill et al.) ──
• Core stability: objetivo es control motor, no fuerza. Pallof press, bird-dog y plancha enseñan a crear tensión sin movimiento.
• Bracing vs. hollowing: bracing (co-contracción) es superior para protección espinal bajo carga.
• Cadena posterior: dorsal ancho actúa como estabilizador activo en TODOS los ejercicios con carga en las manos.

── REGLAS DE PRESCRIPCIÓN PARA JM ATENCIO ──
• Estado dorsal: ACTIVO hasta "cero dolor confirmado" explícito
• Factor de carga actual (ejercicios sin riesgo dorsal): 95% de histórico
• Factor de carga (riesgo moderado): 75–80% de histórico
• Protocolo Día B: Rehabilitación activa. Sin jalones ni remos pesados.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATOS DE ENTRENAMIENTO (REGISTRO DE LA APP)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${getResumenEntrenamiento()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXTO DE SESIÓN PREVIA (reporte clínico anterior)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${contextoPrevio || 'Sin reportes clínicos previos.'}

DÍA ACTUAL CALCULADO: ${diaActual} — ${DIAS[diaActual]}
SESIONES COMPLETADAS — A: ${counts.A} · B: ${counts.B} · C: ${counts.C}
FECHA DE HOY: ${hoyISO()}
`;
}

// ═══════════════════════════════════════
// COMPRESIÓN DE CONTEXTO
// ═══════════════════════════════════════
function getCompressedHistory() {
  if (conversationHistory.length <= MAX_HISTORY_ITEMS) return conversationHistory;

  const older = conversationHistory.slice(0, -MAX_HISTORY_ITEMS);
  const recent = conversationHistory.slice(-MAX_HISTORY_ITEMS);

  // El resumen conserva ambos lados del diálogo: si solo se guardan las
  // respuestas del modelo se pierde qué reportó el atleta (dolor, fallos
  // de tempo), que es justamente lo clínicamente relevante.
  const summaryLines = older
    .map(m => `${m.role === 'user' ? 'ATLETA' : 'COACH'}: ${m.parts[0].text.slice(0, 160).replace(/\s+/g, ' ')}`)
    .join('\n');

  const compressionTurn = [
    { role: 'user', parts: [{ text: `[RESUMEN DE ${older.length} MENSAJES ANTERIORES DE ESTA SESIÓN]\n${summaryLines}` }] },
    { role: 'model', parts: [{ text: 'Contexto previo procesado.' }] }
  ];

  return [...compressionTurn, ...recent];
}

function updateCtxIndicator() {
  const el = document.getElementById('ctx-indicator');
  if (!el) return;
  const total = conversationHistory.length;
  el.textContent = `Contexto: ${total} msgs${total > MAX_HISTORY_ITEMS ? ' (comprimido)' : ''}`;
  el.className = 'ctx-indicator' + (total > MAX_HISTORY_ITEMS * 2 ? ' warn' : '');
}

function persistirConversacion() {
  // Solo los últimos 40 turnos: alcanza para reanudar y no infla localStorage.
  guardarJSON(K.conversacion, conversationHistory.slice(-40));
}

function restaurarConversacion() {
  const guardada = leerJSON(K.conversacion, []);
  if (!Array.isArray(guardada)) return false;
  conversationHistory = guardada.filter(m => m?.role && m?.parts?.[0]?.text);
  return conversationHistory.length > 0;
}

// ═══════════════════════════════════════
// CÁLCULO DE DÍA
// La rotación se deriva del historial real, no de que el atleta
// escriba "terminé" en el chat.
// ═══════════════════════════════════════
function siguienteDia(dia) {
  const idx = SECUENCIA.indexOf(dia);
  return SECUENCIA[(idx + 1) % SECUENCIA.length];
}

function getDiaActual() {
  const historial = getHistorial();
  const hoy = hoyISO();

  // Sesión en curso: el día de hoy ya quedó definido por lo registrado.
  const deHoy = historial.filter(r => r.fecha === hoy);
  if (deHoy.length) return deHoy[deHoy.length - 1].dia;

  const previos = historial.filter(r => r.fecha < hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (previos.length) return siguienteDia(previos[previos.length - 1].dia);

  // Sin historial de registros: caer al marcador que dejaba el chat.
  return siguienteDia(localStorage.getItem(K.ultimoDia) || 'C');
}

function contarSesionesPorDia() {
  const historial = getHistorial();
  if (historial.length === 0) {
    return leerJSON(K.diasCount, { A: 0, B: 0, C: 0 });
  }
  const vistos = new Set();
  const counts = { A: 0, B: 0, C: 0 };
  historial.forEach(r => {
    const clave = `${r.fecha}|${r.dia}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    if (counts[r.dia] !== undefined) counts[r.dia]++;
  });
  return counts;
}

function updateDayUI() {
  const dia = getDiaActual();
  document.getElementById('banner-day').textContent = `DÍA ${dia}`;
  document.getElementById('banner-desc').textContent = DIAS[dia];
  document.getElementById('header-day-label').textContent = `DÍA ${dia}`;
  const fecha = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('banner-date').textContent = fecha;
  document.getElementById('reg-dia').value = dia;
}

// ═══════════════════════════════════════
// SETUP
// ═══════════════════════════════════════
function activarApp() {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key || !key.startsWith('AIza')) {
    showToast('API key inválida. Debe empezar con AIza...');
    return;
  }
  apiKey = key;
  localStorage.setItem(K.apiKey, key);
  iniciarApp();
}

// ═══════════════════════════════════════
// CHAT
// ═══════════════════════════════════════
function addMessage(role, content) {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = `msg ${role}`;

  const label = document.createElement('div');
  label.className = 'msg-label';
  label.setAttribute('aria-hidden', 'true');
  label.textContent = role === 'user' ? 'Vos' : 'Coach';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.setAttribute('role', role === 'assistant' ? 'status' : 'none');
  bubble.innerHTML = formatearMensaje(content);

  div.appendChild(label);
  div.appendChild(bubble);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

// El texto se escapa ANTES de aplicar el formato: sin esto, cualquier
// HTML que venga en la respuesta del modelo o en un backup importado
// se ejecuta en la página, con la API key a mano en localStorage.
function formatearMensaje(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/⚠️(.*)/g, '<em>⚠️$1</em>')
    .replace(/\bBAJO\b/g, '<span class="risk-bajo">BAJO</span>')
    .replace(/\bMODERADO\b/g, '<span class="risk-mod">MODERADO</span>')
    .replace(/\bVERIFICAR\b/g, '<span class="risk-ver">VERIFICAR</span>');
}

const RE_INICIO = /voy a entrenar|arranco|empiezo|empezamos|arrancamos|a entrenar/i;
const RE_CIERRE = /termin[eé]|finalic[eé]|cerrar sesi[oó]n|terminamos/i;

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  if (!apiKey) { showToast('Configurá tu API key primero'); return; }

  input.value = '';
  input.style.height = 'auto';
  addMessage('user', text);

  const turnoUsuario = { role: 'user', parts: [{ text }] };

  const msgs = document.getElementById('messages');
  const thinking = document.createElement('div');
  thinking.className = 'msg assistant thinking';
  thinking.setAttribute('aria-live', 'polite');
  thinking.innerHTML = '<div class="msg-label" aria-hidden="true">Coach</div><div class="msg-bubble">Analizando...</div>';
  msgs.appendChild(thinking);
  msgs.scrollTop = msgs.scrollHeight;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    // El turno del usuario se manda pero no se guarda todavía: si la
    // llamada falla, el historial no queda con mensajes del atleta sin
    // respuesta apilados uno atrás del otro.
    const contentsWithSystem = [
      { role: 'user', parts: [{ text: buildSystemPrompt() + '\n\nConfirmá que entendiste respondiendo SOLO: Sistema cargado.' }] },
      { role: 'model', parts: [{ text: 'Sistema cargado.' }] },
      ...getCompressedHistory(),
      turnoUsuario
    ];

    const body = {
      contents: contentsWithSystem,
      // 8192 y no 1500: en los modelos con thinking activo los tokens de
      // razonamiento se descuentan de este presupuesto, y el reporte final
      // se cortaba antes de emitir una sola palabra.
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 }
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
      {
        method: 'POST',
        // La key va por header, no en el query string: así no queda en
        // logs de proxy, historial ni cabeceras Referer.
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: controller.signal
      }
    );

    const data = await res.json().catch(() => ({}));
    thinking.remove();

    if (!res.ok || data.error) {
      manejarErrorAPI(res.status, data.error);
      return;
    }

    const cand = data.candidates?.[0];
    const reply = (cand?.content?.parts || []).map(p => p.text).filter(Boolean).join('');

    if (!reply) {
      const motivo = cand?.finishReason || 'respuesta vacía';
      addMessage('assistant',
        motivo === 'MAX_TOKENS'
          ? 'El modelo agotó el presupuesto de tokens sin llegar a responder. Pedí el reporte por partes o acortá el mensaje.'
          : `El modelo no devolvió texto (${motivo}). Reformulá el mensaje e intentá de nuevo.`);
      return;
    }

    conversationHistory.push(turnoUsuario, { role: 'model', parts: [{ text: reply }] });
    persistirConversacion();
    updateCtxIndicator();
    addMessage('assistant', reply);

    if (RE_INICIO.test(text)) activarSesion();
    if (RE_CIERRE.test(text)) checkAndSaveContext(reply);

  } catch (e) {
    thinking.remove();
    if (e.name === 'AbortError') {
      addMessage('assistant', 'La respuesta tardó más de 60 segundos y se canceló. Verificá tu conexión y reintentá.');
    } else {
      addMessage('assistant', `Error de conexión: ${e.message}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function manejarErrorAPI(status, error) {
  const msg = error?.message || 'sin detalle';

  if (status === 404 || /is not found|not supported/i.test(msg)) {
    addMessage('assistant',
      `El modelo "${modelo}" no existe o fue dado de baja por Google.\n\n` +
      `Abrí Configuración y cambiá el modelo. Opciones vigentes: gemini-2.5-flash, gemini-flash-latest.\n\n` +
      `Detalle: ${msg}`);
    return;
  }
  if (status === 400 && /API key/i.test(msg)) {
    addMessage('assistant', `Tu API key fue rechazada. Revisala en Configuración.\n\nDetalle: ${msg}`);
    return;
  }
  if (status === 429) {
    addMessage('assistant', 'Superaste la cuota gratuita de la API por ahora. Esperá unos minutos y reintentá.');
    return;
  }
  addMessage('assistant', `Error de API (${status}): ${msg}`);
}

function sendQuick(text) {
  document.getElementById('chat-input').value = text;
  sendMessage();
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function activarSesion() {
  sesionActiva = true;
  document.getElementById('btn-cerrar-sesion').classList.add('visible');
}

function cerrarSesion() {
  document.getElementById('chat-input').value =
    'Terminé la sesión. Generá el reporte final clínico completo con todas las secciones del protocolo.';
  sendMessage();
  document.getElementById('btn-cerrar-sesion').classList.remove('visible');
  sesionActiva = false;
}

function checkAndSaveContext(replyText) {
  // Preferir el párrafo de protección de contexto; si el modelo no usó
  // esa fórmula, guardar el cierre del reporte en vez del arranque.
  const match = replyText.match(/(protecci[oó]n de contexto|pr[oó]xima sesi[oó]n)[\s\S]*/i);
  const toSave = (match ? match[0] : replyText.slice(-1500)).slice(0, 2500);
  const fecha = new Date().toLocaleDateString('es-AR');

  localStorage.setItem(K.contexto, `[${fecha}] ${toSave}`);
  localStorage.setItem(K.ultimoDia, getDiaActual());

  guardarSnapshot();
  updateDayUI();
  showToast('Reporte clínico guardado ✓');
}

// ═══════════════════════════════════════
// BACKUP
// Snapshots locales en vez de forzar una descarga en cada cierre:
// los navegadores móviles bloquean el .click() programático y, cuando
// no lo bloquean, llenan la carpeta de descargas.
// ═══════════════════════════════════════
function guardarSnapshot() {
  const snapshots = leerJSON(K.snapshots, []);
  snapshots.push({
    ts: Date.now(),
    fecha: new Date().toISOString(),
    contexto_previo: localStorage.getItem(K.contexto) || '',
    historial: getHistorial()
  });
  guardarJSON(K.snapshots, snapshots.slice(-5));
  localStorage.setItem(K.ultimoBackup, Date.now().toString());
  const banner = document.getElementById('backup-banner');
  if (banner) banner.style.display = 'none';
}

function exportarHistorial() {
  const data = {
    version: '2.0',
    atleta: 'Juan Martín Atencio',
    exportado: new Date().toISOString().split('T')[0],
    contexto_previo: localStorage.getItem(K.contexto) || '',
    historial: getHistorial()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gymcoach_backup_${hoyISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  localStorage.setItem(K.ultimoBackup, Date.now().toString());
  document.getElementById('backup-banner').style.display = 'none';
  showToast('Historial exportado ✓');
}

function checkBackupAlert() {
  const ultimo = parseInt(localStorage.getItem(K.ultimoBackup) || '0', 10);
  const dias = (Date.now() - ultimo) / 86400000;
  if (!ultimo || dias > 7) {
    document.getElementById('backup-banner').style.display = 'flex';
  }
}

// ═══════════════════════════════════════
// CONFIG MODAL
// ═══════════════════════════════════════
let cerrarModalActual = null;

function mostrarConfig() {
  document.getElementById('config-api-key').value = apiKey;
  document.getElementById('config-modelo').value = modelo;
  const modal = document.getElementById('modal-config');
  modal.classList.add('open');
  trapFocus(modal);
}

function cerrarConfig() {
  if (cerrarModalActual) cerrarModalActual();
  else document.getElementById('modal-config').classList.remove('open');
}

function guardarConfig() {
  const key = document.getElementById('config-api-key').value.trim();
  const mod = document.getElementById('config-modelo').value.trim();

  if (!key || !key.startsWith('AIza')) { showToast('API key inválida'); return; }

  apiKey = key;
  localStorage.setItem(K.apiKey, key);

  modelo = mod || MODELO_DEFAULT;
  localStorage.setItem(K.modelo, modelo);

  cerrarConfig();
  showToast('Configuración guardada ✓');
}

function borrarConversacion() {
  conversationHistory = [];
  localStorage.removeItem(K.conversacion);
  document.getElementById('messages').innerHTML = '';
  updateCtxIndicator();
  cerrarConfig();
  saludoInicial();
  showToast('Conversación reiniciada ✓');
}

// ═══════════════════════════════════════
// ACCESIBILIDAD — focus trap en modales
// ═══════════════════════════════════════
function trapFocus(modal) {
  const focusable = modal.querySelectorAll(
    'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const devolverFoco = document.activeElement;

  first?.focus();

  const onKeydown = e => {
    if (e.key === 'Tab' && focusable.length) {
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    if (e.key === 'Escape') cerrar();
  };

  const onClick = e => { if (e.target === modal) cerrar(); };

  // Sin esta limpieza explícita se acumulaba un listener de teclado por
  // cada apertura, y el listener de clic con { once: true } se consumía
  // con el primer clic en cualquier botón del modal.
  function cerrar() {
    modal.classList.remove('open');
    modal.removeEventListener('keydown', onKeydown);
    modal.removeEventListener('click', onClick);
    cerrarModalActual = null;
    devolverFoco?.focus?.();
  }

  modal.addEventListener('keydown', onKeydown);
  modal.addEventListener('click', onClick);
  cerrarModalActual = cerrar;
}

// ═══════════════════════════════════════
// TIMER DE DESCANSO
// ═══════════════════════════════════════
let timerDeadline = null;
let timerRestante = 0;
let timerTick = null;
let timerCorriendo = false;

function formatearTiempo(seg) {
  const s = Math.max(0, Math.round(seg));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function pintarTimer() {
  const display = document.getElementById('timer-display');
  if (!display) return;
  const restante = timerCorriendo ? (timerDeadline - Date.now()) / 1000 : timerRestante;
  display.textContent = formatearTiempo(restante);
  display.classList.toggle('running', timerCorriendo);
  const btn = document.getElementById('timer-toggle');
  if (btn) btn.textContent = timerCorriendo ? '⏸ Pausar' : '▶ Iniciar';
}

function iniciarTimer(segundos) {
  timerRestante = segundos;
  timerDeadline = Date.now() + segundos * 1000;
  timerCorriendo = true;
  arrancarTick();
  pintarTimer();
}

// El tick se apoya en un deadline absoluto porque los navegadores
// estrangulan setInterval con la pantalla apagada, que es exactamente
// lo que pasa con el celular en el bolsillo entre series.
function arrancarTick() {
  if (timerTick) clearInterval(timerTick);
  timerTick = setInterval(() => {
    if (!timerCorriendo) return;
    if (Date.now() >= timerDeadline) {
      finalizarTimer();
      return;
    }
    pintarTimer();
  }, 250);
}

function toggleTimer() {
  if (timerCorriendo) {
    timerRestante = Math.max(0, (timerDeadline - Date.now()) / 1000);
    timerCorriendo = false;
  } else {
    if (timerRestante <= 0) timerRestante = 120;
    timerDeadline = Date.now() + timerRestante * 1000;
    timerCorriendo = true;
    arrancarTick();
  }
  pintarTimer();
}

function resetTimer() {
  timerCorriendo = false;
  timerRestante = 0;
  if (timerTick) clearInterval(timerTick);
  timerTick = null;
  pintarTimer();
}

function finalizarTimer() {
  timerCorriendo = false;
  timerRestante = 0;
  if (timerTick) clearInterval(timerTick);
  timerTick = null;
  pintarTimer();
  avisarFinDescanso();
}

function avisarFinDescanso() {
  if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
  beep();
  showToast('⏱ Descanso terminado — próxima serie');
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.22].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.18);
      osc.start(ctx.currentTime + offset);
      osc.stop(ctx.currentTime + offset + 0.2);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch { /* audio no disponible: la vibración y el toast alcanzan */ }
}

// Al volver a primer plano el contador puede haber vencido mientras
// el tick estaba estrangulado.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (timerCorriendo && Date.now() >= timerDeadline) finalizarTimer();
  else pintarTimer();
});

// ═══════════════════════════════════════
// REGISTRO
// ═══════════════════════════════════════
function renderSetsUI(n, preservar = false) {
  // Sin `preservar`, agregar un set borraba todo lo ya tipeado.
  const previo = preservar ? setsData : [];
  setsData = Array.from({ length: n }, (_, i) => ({
    reps: previo[i]?.reps ?? '',
    kg: previo[i]?.kg ?? ''
  }));

  const container = document.getElementById('sets-container');

  const labels = `<div class="field-label" style="grid-column:1/-1;margin-bottom:0">Repeticiones</div>
    <div class="field-label" style="margin-bottom:0">Kg</div>
    <div></div>`;

  const rows = setsData.map((s, i) => `
    <input type="number" inputmode="decimal" min="0" placeholder="Reps"
      aria-label="Set ${i + 1}: repeticiones"
      data-set="${i}" data-campo="reps"
      style="grid-column:1;height:38px" value="${esc(s.reps)}">
    <input type="number" inputmode="decimal" min="0" step="0.5" placeholder="Kg"
      aria-label="Set ${i + 1}: peso en kg"
      data-set="${i}" data-campo="kg"
      style="grid-column:2;height:38px" value="${esc(s.kg)}">
    <div class="set-num" aria-hidden="true" style="grid-column:3">${i + 1}</div>
  `).join('');

  container.innerHTML = labels + rows;
}

function addSet() {
  renderSetsUI(setsData.length + 1, true);
  document.querySelector(`#sets-container input[data-set="${setsData.length - 1}"]`)?.focus();
}

// Delegación en vez de handlers inline: los inline dependían de que
// `setsData` fuera resoluble desde el scope global.
document.addEventListener('input', e => {
  const el = e.target;
  if (!el.matches?.('#sets-container input[data-set]')) return;
  const idx = parseInt(el.dataset.set, 10);
  if (setsData[idx]) setsData[idx][el.dataset.campo] = el.value;
});

document.addEventListener('change', e => {
  if (e.target.id === 'reg-ejercicio') {
    document.getElementById('custom-ej-wrap').style.display =
      e.target.value === '__custom__' ? 'block' : 'none';
  }
});

function guardarEjercicio() {
  const seleccion = document.getElementById('reg-ejercicio').value;
  const ejercicio = seleccion === '__custom__'
    ? document.getElementById('custom-ej').value.trim()
    : seleccion;

  if (!ejercicio) { showToast('Seleccioná un ejercicio'); return; }

  const sets = setsData
    .filter(s => s.reps !== '' && s.kg !== '')
    .map(s => ({ reps: Number(s.reps), kg: Number(s.kg) }));

  if (sets.length === 0) { showToast('Ingresá al menos 1 set completo'); return; }
  if (sets.some(s => !Number.isFinite(s.reps) || !Number.isFinite(s.kg) || s.reps <= 0 || s.kg < 0)) {
    showToast('Revisá los valores: reps > 0 y kg ≥ 0');
    return;
  }

  const registro = {
    id: nuevoId(),
    fecha: hoyISO(),
    dia: document.getElementById('reg-dia').value,
    ejercicio,
    sets,
    notas: document.getElementById('reg-notas').value.trim()
  };

  const historial = getHistorial();
  historial.push(registro);
  setHistorial(historial);

  document.getElementById('reg-notas').value = '';
  document.getElementById('custom-ej').value = '';
  renderSetsUI(3);
  renderHistorialHoy();
  actualizarSelectorProgresion();
  renderProgresion();
  updateDayUI();

  // Registrar un ejercicio ya cuenta como sesión activa: la rotación
  // y el timer no deberían depender de haber escrito en el chat.
  if (!sesionActiva) activarSesion();

  showToast(`${ejercicio} guardado ✓`);
}

// ═══════════════════════════════════════
// UNDO EN DELETE
// ═══════════════════════════════════════
let pendingDelete = null;
let deleteTimer = null;

function eliminarEjercicio(id) {
  const historial = getHistorial();
  const idx = historial.findIndex(r => r.id === id);
  if (idx === -1) return;

  const [item] = historial.splice(idx, 1);
  setHistorial(historial);
  renderHistorialHoy();
  actualizarSelectorProgresion();
  renderProgresion();
  updateDayUI();

  if (deleteTimer) clearTimeout(deleteTimer);
  pendingDelete = { item, idx };

  showUndoToast(`${esc(item.ejercicio)} eliminado`, () => {
    if (!pendingDelete) return;
    const h = getHistorial();
    h.splice(Math.min(pendingDelete.idx, h.length), 0, pendingDelete.item);
    setHistorial(h);
    pendingDelete = null;
    renderHistorialHoy();
    actualizarSelectorProgresion();
    renderProgresion();
    updateDayUI();
    showToast('Eliminación deshecha ✓');
  });

  deleteTimer = setTimeout(() => { pendingDelete = null; }, 5000);
}

function renderHistorialHoy() {
  const hoy = hoyISO();
  const hoyData = getHistorial().filter(r => r.fecha === hoy);
  const lista = document.getElementById('historial-hoy-lista');

  if (hoyData.length === 0) {
    lista.innerHTML = '<div class="empty-state">No hay ejercicios registrados hoy</div>';
    return;
  }

  lista.innerHTML = hoyData.map(r => {
    const setsStr = r.sets.map(s => `${esc(s.reps)}×${esc(s.kg)}kg`).join(' · ');
    return `<div class="ejercicio-card" role="listitem">
      <div style="flex:1">
        <div class="ej-name">${esc(r.ejercicio)}</div>
        <div class="ej-sets">${setsStr}</div>
        ${r.notas ? `<div class="ej-sets" style="color:var(--text3);margin-top:2px">${esc(r.notas)}</div>` : ''}
      </div>
      <div class="ej-peso-max">${maxKgDe(r)} kg</div>
      <button class="btn-delete" data-del="${esc(r.id)}" aria-label="Eliminar ${esc(r.ejercicio)}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>`;
  }).join('');
}

document.addEventListener('click', e => {
  const btn = e.target.closest?.('[data-del]');
  if (btn) eliminarEjercicio(btn.dataset.del);
});

// ═══════════════════════════════════════
// PROGRESIÓN
// ═══════════════════════════════════════
function actualizarSelectorProgresion() {
  const ejercicios = [...new Set(getHistorial().map(r => r.ejercicio))].sort();
  const sel = document.getElementById('prog-selector');
  const prev = sel.value;
  sel.innerHTML = ejercicios.length
    ? ejercicios.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join('')
    : '<option value="">Sin datos aún</option>';
  if (prev && ejercicios.includes(prev)) sel.value = prev;
}

function renderProgresion() {
  const ejercicio = document.getElementById('prog-selector').value;
  const datos = ejercicio ? getHistorial().filter(r => r.ejercicio === ejercicio) : [];

  if (datos.length === 0) {
    document.getElementById('stat-max').textContent = '—';
    document.getElementById('stat-sesiones').textContent = '—';
    document.getElementById('stat-tendencia').textContent = '—';
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    return;
  }

  const porFecha = {};
  datos.forEach(r => {
    const max = maxKgDe(r);
    if (!porFecha[r.fecha] || porFecha[r.fecha] < max) porFecha[r.fecha] = max;
  });

  const fechas = Object.keys(porFecha).sort();
  const pesos = fechas.map(f => porFecha[f]);

  const ordenados = [...datos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const tendencia = calcularTendencia(ordenados);

  document.getElementById('stat-max').textContent = Math.max(...pesos);
  document.getElementById('stat-sesiones').textContent = fechas.length;
  document.getElementById('stat-tendencia').textContent = (tendencia > 0 ? '+' : '') + tendencia;

  renderChart(fechas, pesos);

  const recientes = [...fechas].reverse().slice(0, 8);
  document.getElementById('sesiones-recientes').innerHTML = recientes.map(fecha => {
    const registrosDia = datos.filter(r => r.fecha === fecha);
    const d = new Date(fecha + 'T12:00:00');
    const diaStr = registrosDia[0]?.dia ? `Día ${esc(registrosDia[0].dia)}` : '';
    return `<div class="sesion-item" role="listitem">
      <div>
        <div class="sesion-fecha">${esc(d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
        <div class="sesion-dia">${diaStr}</div>
      </div>
      <div class="sesion-ejercicios">${porFecha[fecha]} kg</div>
    </div>`;
  }).join('');
}

function renderChart(fechas, pesos) {
  const canvas = document.getElementById('progChart');
  // Chart.js viene de un CDN: si no cargó (offline en el gimnasio), el
  // resto de la pantalla tiene que seguir funcionando igual.
  if (typeof Chart === 'undefined') {
    canvas.insertAdjacentHTML?.('afterend', '');
    return;
  }

  if (chartInstance) chartInstance.destroy();

  const labels = fechas.map(f =>
    new Date(f + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  );

  chartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: pesos,
        borderColor: '#c8f55a',
        backgroundColor: 'rgba(200,245,90,0.06)',
        borderWidth: 2,
        pointBackgroundColor: '#c8f55a',
        pointRadius: 4,
        tension: 0.35,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#12121a',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#9090a8',
          bodyColor: '#c8f55a',
          callbacks: { label: ctx => `${ctx.parsed.y} kg` }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a5a70', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#5a5a70', font: { size: 11 }, callback: v => v + 'kg' } }
      }
    }
  });
}

// ═══════════════════════════════════════
// UI UTILS
// ═══════════════════════════════════════
function switchTab(tab) {
  const tabs = ['chat', 'registro', 'progresion'];
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    b.classList.toggle('active', tabs[i] === tab);
    b.setAttribute('aria-selected', tabs[i] === tab ? 'true' : 'false');
  });
  document.querySelectorAll('.panel').forEach(p => {
    const isActive = p.id === `panel-${tab}`;
    p.classList.toggle('active', isActive);
    p.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });
  if (tab === 'progresion') renderProgresion();
}

let toastTimer = null;

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

function showUndoToast(msg, onUndo) {
  const t = document.getElementById('toast');
  t.innerHTML = `${msg} <button class="toast-undo" aria-label="Deshacer eliminación">Deshacer</button>`;

  // El nodo se recrea con innerHTML en cada llamada, así que el listener
  // anterior se va con él y no hace falta desengancharlo a mano.
  t.querySelector('.toast-undo').addEventListener('click', () => {
    onUndo();
    t.classList.remove('show');
    if (toastTimer) clearTimeout(toastTimer);
  });

  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 5000);
}

// ═══════════════════════════════════════
// IMPORTACIÓN
// ═══════════════════════════════════════
function importarDatos(input) {
  const file = input.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.historial || !Array.isArray(data.historial)) throw new Error('Formato inválido');

      const validos = data.historial
        .filter(r => r && typeof r.fecha === 'string' && typeof r.ejercicio === 'string' && Array.isArray(r.sets))
        .map(r => ({
          id: r.id || nuevoId(),
          fecha: r.fecha,
          dia: SECUENCIA.includes(r.dia) ? r.dia : 'A',
          ejercicio: r.ejercicio,
          sets: r.sets
            .filter(s => s && s.reps !== undefined && s.kg !== undefined)
            .map(s => ({ reps: Number(s.reps) || 0, kg: Number(s.kg) || 0 })),
          notas: typeof r.notas === 'string' ? r.notas : ''
        }));

      const merged = [...getHistorial(), ...validos];
      const vistos = new Set();
      const unicos = merged.filter(r => {
        const clave = r.id || `${r.fecha}|${r.ejercicio}|${JSON.stringify(r.sets)}`;
        if (vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
      });

      setHistorial(unicos);
      if (typeof data.contexto_previo === 'string') {
        localStorage.setItem(K.contexto, data.contexto_previo);
      }

      showToast(`✓ ${validos.length} registros importados`);
      renderHistorialHoy();
      actualizarSelectorProgresion();
      renderProgresion();
      updateDayUI();
    } catch {
      showToast('Error al leer el archivo JSON');
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
window.addEventListener('load', () => {
  modelo = localStorage.getItem(K.modelo) || MODELO_DEFAULT;
  const savedKey = localStorage.getItem(K.apiKey);
  if (savedKey) {
    apiKey = savedKey;
    iniciarApp();
  }
});

function iniciarApp() {
  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  updateDayUI();
  renderSetsUI(3);
  renderHistorialHoy();
  actualizarSelectorProgresion();
  renderProgresion();
  checkBackupAlert();

  document.getElementById('descanso-card').classList.add('visible');
  pintarTimer();

  const reanudada = restaurarConversacion();
  if (reanudada) {
    conversationHistory.forEach(m => {
      addMessage(m.role === 'user' ? 'user' : 'assistant', m.parts[0].text);
    });
    updateCtxIndicator();
    if (getHistorial().some(r => r.fecha === hoyISO())) activarSesion();
    showToast('Conversación reanudada');
  } else {
    saludoInicial();
  }
}

function saludoInicial() {
  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
  const dia = getDiaActual();
  addMessage('assistant',
    `${saludo}, Juan Martín. Sistema activado.\n\nContexto clínico cargado. Protocolo de protección dorsal activo.\n\n` +
    `Te toca el **Día ${dia}** (${DIAS[dia]}).\n\nCuando estés listo para entrenar, decime "Voy a entrenar" y arrancamos.`);
}
