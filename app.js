// ═══════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════
let apiKey = '';
let conversationHistory = [];
let chartInstance = null;
let sesionActiva = false;

const DIAS = {
  A: 'Pierna / Hombros / Core',
  B: 'Espalda / Bíceps (Rehab activa)',
  C: 'Pecho / Tríceps / Hombro lateral'
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

function buildSystemPrompt() {
  const contextoPrevio = localStorage.getItem('gymcoach_contexto_previo') || '';
  const diasEntrenados = JSON.parse(localStorage.getItem('gymcoach_dias_count') || '{"A":0,"B":0,"C":0}');
  const ultimoDay = localStorage.getItem('gymcoach_ultimo_dia') || 'C';
  const diaActual = calcularDiaActual(ultimoDay);

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
• Cargas históricas de referencia: Prensa piernas 112.5 kg · Press plano 55 kg · Extensión cuádriceps 50 kg
• Estado dorsal: ACTIVO hasta "cero dolor confirmado" explícito
• Factor de carga actual (ejercicios sin riesgo dorsal): 95% de histórico
• Factor de carga (riesgo moderado): 75–80% de histórico
• Protocolo Día B: Rehabilitación activa. Sin jalones ni remos pesados.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONTEXTO DE SESIÓN PREVIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${contextoPrevio || 'Sin sesiones previas registradas. Primera sesión del sistema.'}

DÍA ACTUAL CALCULADO: ${diaActual}
SESIONES COMPLETADAS — A: ${diasEntrenados.A} · B: ${diasEntrenados.B} · C: ${diasEntrenados.C}
`;
}

// ═══════════════════════════════════════
// COMPRESIÓN DE CONTEXTO (mejora #3)
// Mantiene las últimas 10 interacciones completas
// y resume las anteriores para reducir tokens enviados a la API
// ═══════════════════════════════════════
const MAX_HISTORY_ITEMS = 10;

function getCompressedHistory() {
  if (conversationHistory.length <= MAX_HISTORY_ITEMS) return conversationHistory;

  const older = conversationHistory.slice(0, -MAX_HISTORY_ITEMS);
  const recent = conversationHistory.slice(-MAX_HISTORY_ITEMS);

  const summaryLines = older
    .filter(m => m.role === 'model')
    .map(m => m.parts[0].text.slice(0, 120).replace(/\n/g, ' '))
    .join(' | ');

  const compressionTurn = [
    { role: 'user', parts: [{ text: `[RESUMEN DE ${older.length} MENSAJES ANTERIORES]: ${summaryLines}` }] },
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

// ═══════════════════════════════════════
// CÁLCULO DE DÍA
// ═══════════════════════════════════════
function calcularDiaActual(ultimoDia) {
  const secuencia = ['A', 'B', 'C'];
  const idx = secuencia.indexOf(ultimoDia);
  return secuencia[(idx + 1) % 3];
}

function getDiaActual() {
  const ultimoDia = localStorage.getItem('gymcoach_ultimo_dia') || 'C';
  return calcularDiaActual(ultimoDia);
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
  localStorage.setItem('gymcoach_api_key', key);
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

function formatearMensaje(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/⚠️(.*)/g, '<em>⚠️$1</em>')
    .replace(/BAJO/g, '<span class="risk-bajo">BAJO</span>')
    .replace(/MODERADO/g, '<span class="risk-mod">MODERADO</span>')
    .replace(/VERIFICAR/g, '<span class="risk-ver">VERIFICAR</span>');
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || !apiKey) return;

  input.value = '';
  input.style.height = 'auto';
  addMessage('user', text);

  conversationHistory.push({ role: 'user', parts: [{ text }] });
  updateCtxIndicator();

  const msgs = document.getElementById('messages');
  const thinking = document.createElement('div');
  thinking.className = 'msg assistant thinking';
  thinking.setAttribute('aria-live', 'polite');
  thinking.innerHTML = '<div class="msg-label" aria-hidden="true">Coach</div><div class="msg-bubble">Analizando...</div>';
  msgs.appendChild(thinking);
  msgs.scrollTop = msgs.scrollHeight;

  try {
    const systemPrompt = buildSystemPrompt();
    const compressedHistory = getCompressedHistory();

    const contentsWithSystem = [
      { role: 'user', parts: [{ text: systemPrompt + '\n\nConfirmá que entendiste respondiendo SOLO: Sistema cargado.' }] },
      { role: 'model', parts: [{ text: 'Sistema cargado.' }] },
      ...compressedHistory
    ];

    const body = {
      contents: contentsWithSystem,
      generationConfig: { temperature: 0.3, maxOutputTokens: 1500 }
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );

    const data = await res.json();
    thinking.remove();

    if (data.candidates && data.candidates[0]) {
      const reply = data.candidates[0].content.parts[0].text;
      conversationHistory.push({ role: 'model', parts: [{ text: reply }] });
      updateCtxIndicator();
      addMessage('assistant', reply);

      if (text.toLowerCase().includes('voy a entrenar')) activarSesion();

      if (text.toLowerCase().includes('terminé') || text.toLowerCase().includes('termine') || text.toLowerCase().includes('cerrar sesión')) {
        checkAndSaveContext(reply);
      }
    } else if (data.error) {
      addMessage('assistant', `Error de API: ${data.error.message}\n\nVerificá tu API key en Configuración.`);
    }
  } catch (e) {
    thinking.remove();
    addMessage('assistant', `Error de conexión: ${e.message}`);
  }
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
  document.getElementById('descanso-card').classList.add('visible');
}

function cerrarSesion() {
  const prompt = 'Terminé la sesión. Generá el reporte final clínico completo con todas las secciones del protocolo.';
  document.getElementById('chat-input').value = prompt;
  sendMessage();
  document.getElementById('btn-cerrar-sesion').classList.remove('visible');
  document.getElementById('descanso-card').classList.remove('visible');
  sesionActiva = false;
}

function checkAndSaveContext(replyText) {
  const match = replyText.match(/Sesión[\s\S]{0,1200}próxima sesión/i);
  const toSave = match ? match[0] : replyText.slice(0, 800);
  const fecha = new Date().toLocaleDateString('es-AR');
  localStorage.setItem('gymcoach_contexto_previo', `[${fecha}] ${toSave}`);
  localStorage.setItem('gymcoach_ultimo_backup', Date.now().toString());

  const dia = getDiaActual();
  const counts = JSON.parse(localStorage.getItem('gymcoach_dias_count') || '{"A":0,"B":0,"C":0}');
  counts[dia] = (counts[dia] || 0) + 1;
  localStorage.setItem('gymcoach_dias_count', JSON.stringify(counts));
  localStorage.setItem('gymcoach_ultimo_dia', dia);
  updateDayUI();

  exportarHistorial(true);
  showToast('Reporte guardado + backup exportado ✓');
}

function exportarHistorial(silencioso = false) {
  const historial = JSON.parse(localStorage.getItem('gymcoach_historial') || '[]');
  const contexto = localStorage.getItem('gymcoach_contexto_previo') || '';
  const data = {
    version: '1.2',
    atleta: 'Juan Martín Atencio',
    exportado: new Date().toISOString().split('T')[0],
    contexto_previo: contexto,
    historial
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gymcoach_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem('gymcoach_ultimo_backup', Date.now().toString());
  document.getElementById('backup-banner').style.display = 'none';
  if (!silencioso) showToast('Historial exportado ✓');
}

// ═══════════════════════════════════════
// CONFIG MODAL — con focus trap
// ═══════════════════════════════════════
function mostrarConfig() {
  document.getElementById('config-api-key').value = apiKey;
  const modal = document.getElementById('modal-config');
  modal.classList.add('open');
  trapFocus(modal);
}

function cerrarConfig() {
  document.getElementById('modal-config').classList.remove('open');
}

function guardarConfig() {
  const key = document.getElementById('config-api-key').value.trim();
  if (!key || !key.startsWith('AIza')) { showToast('API key inválida'); return; }
  apiKey = key;
  localStorage.setItem('gymcoach_api_key', key);
  cerrarConfig();
  showToast('API key actualizada ✓');
}

function checkBackupAlert() {
  const ultimo = parseInt(localStorage.getItem('gymcoach_ultimo_backup') || '0');
  const diasSinBackup = (Date.now() - ultimo) / (1000 * 60 * 60 * 24);
  if (diasSinBackup > 3 || !ultimo) {
    document.getElementById('backup-banner').style.display = 'flex';
  }
}

// ═══════════════════════════════════════
// ACCESIBILIDAD — focus trap en modales
// ═══════════════════════════════════════
function trapFocus(modal) {
  const focusable = modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  first?.focus();

  const handler = e => {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }
    if (e.key === 'Escape') {
      modal.classList.remove('open');
      modal.removeEventListener('keydown', handler);
    }
  };

  modal.addEventListener('keydown', handler);

  modal.addEventListener('click', e => {
    if (e.target === modal) {
      modal.classList.remove('open');
      modal.removeEventListener('keydown', handler);
    }
  }, { once: true });
}

// ═══════════════════════════════════════
// REGISTRO
// ═══════════════════════════════════════
let setsData = [];

function renderSetsUI(n) {
  setsData = Array.from({ length: n }, () => ({ reps: '', kg: '' }));
  const container = document.getElementById('sets-container');

  const labels = `<div class="field-label" style="grid-column:1/-1;margin-bottom:0">Repeticiones</div>
    <div class="field-label" style="margin-bottom:0">Kg</div>
    <div></div>`;

  const rows = setsData.map((_, i) => `
    <input type="number" inputmode="decimal" placeholder="Reps"
      aria-label="Set ${i + 1}: repeticiones"
      style="grid-column:1;height:38px"
      oninput="setsData[${i}].reps=this.value" value="${setsData[i].reps || ''}">
    <input type="number" inputmode="decimal" step="0.5" placeholder="Kg"
      aria-label="Set ${i + 1}: peso en kg"
      style="grid-column:2;height:38px"
      oninput="setsData[${i}].kg=this.value" value="${setsData[i].kg || ''}">
    <div class="set-num" aria-hidden="true" style="grid-column:3">${i + 1}</div>
  `).join('');

  container.innerHTML = labels + rows;
}

function addSet() {
  renderSetsUI(setsData.length + 1);
}

document.addEventListener('change', function (e) {
  if (e.target.id === 'reg-ejercicio') {
    document.getElementById('custom-ej-wrap').style.display =
      e.target.value === '__custom__' ? 'block' : 'none';
  }
});

function guardarEjercicio() {
  const ejercicioSelect = document.getElementById('reg-ejercicio').value;
  const ejercicio = ejercicioSelect === '__custom__'
    ? document.getElementById('custom-ej').value.trim()
    : ejercicioSelect;

  if (!ejercicio) { showToast('Seleccioná un ejercicio'); return; }

  const sets = setsData.filter(s => s.reps && s.kg);
  if (sets.length === 0) { showToast('Ingresá al menos 1 set completo'); return; }

  const dia = document.getElementById('reg-dia').value;
  const notas = document.getElementById('reg-notas').value;
  const fecha = new Date().toISOString().split('T')[0];

  const registro = { fecha, dia, ejercicio, sets, notas };

  const historial = JSON.parse(localStorage.getItem('gymcoach_historial') || '[]');
  historial.push(registro);
  localStorage.setItem('gymcoach_historial', JSON.stringify(historial));

  document.getElementById('reg-notas').value = '';
  renderSetsUI(3);
  renderHistorialHoy();
  actualizarSelectorProgresion();
  renderProgresion();
  showToast(`${ejercicio} guardado ✓`);
}

// ═══════════════════════════════════════
// UNDO EN DELETE (mejora #4)
// ═══════════════════════════════════════
let pendingDelete = null;
let deleteTimer = null;

function eliminarEjercicio(idx) {
  const historial = JSON.parse(localStorage.getItem('gymcoach_historial') || '[]');
  const hoy = new Date().toISOString().split('T')[0];
  const hoyData = historial.filter(r => r.fecha === hoy);

  if (idx < 0 || idx >= hoyData.length) return;

  const item = hoyData[idx];
  const globalIdx = historial.findIndex(r =>
    r.fecha === item.fecha && r.ejercicio === item.ejercicio &&
    JSON.stringify(r.sets) === JSON.stringify(item.sets)
  );

  if (globalIdx === -1) return;

  historial.splice(globalIdx, 1);
  localStorage.setItem('gymcoach_historial', JSON.stringify(historial));
  renderHistorialHoy();
  actualizarSelectorProgresion();

  if (deleteTimer) clearTimeout(deleteTimer);
  pendingDelete = { item, globalIdx };

  showUndoToast(`${item.ejercicio} eliminado`, () => {
    const h = JSON.parse(localStorage.getItem('gymcoach_historial') || '[]');
    h.splice(pendingDelete.globalIdx, 0, pendingDelete.item);
    localStorage.setItem('gymcoach_historial', JSON.stringify(h));
    pendingDelete = null;
    renderHistorialHoy();
    actualizarSelectorProgresion();
    renderProgresion();
    showToast('Eliminación deshecha ✓');
  });

  deleteTimer = setTimeout(() => { pendingDelete = null; }, 5000);
}

function renderHistorialHoy() {
  const hoy = new Date().toISOString().split('T')[0];
  const historial = JSON.parse(localStorage.getItem('gymcoach_historial') || '[]');
  const hoyData = historial.filter(r => r.fecha === hoy);
  const lista = document.getElementById('historial-hoy-lista');

  if (hoyData.length === 0) {
    lista.innerHTML = '<div class="empty-state">No hay ejercicios registrados hoy</div>';
    return;
  }

  lista.innerHTML = hoyData.map((r, i) => {
    const maxKg = Math.max(...r.sets.map(s => parseFloat(s.kg) || 0));
    const setsStr = r.sets.map(s => `${s.reps}×${s.kg}kg`).join(' · ');
    return `<div class="ejercicio-card">
      <div style="flex:1">
        <div class="ej-name">${r.ejercicio}</div>
        <div class="ej-sets">${setsStr}</div>
        ${r.notas ? `<div class="ej-sets" style="color:var(--text3);margin-top:2px">${r.notas}</div>` : ''}
      </div>
      <div class="ej-peso-max">${maxKg} kg</div>
      <button class="btn-delete" onclick="eliminarEjercicio(${i})" aria-label="Eliminar ${r.ejercicio}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════
// PROGRESIÓN
// ═══════════════════════════════════════
function actualizarSelectorProgresion() {
  const historial = JSON.parse(localStorage.getItem('gymcoach_historial') || '[]');
  const ejercicios = [...new Set(historial.map(r => r.ejercicio))];
  const sel = document.getElementById('prog-selector');
  const prev = sel.value;
  sel.innerHTML = ejercicios.length
    ? ejercicios.map(e => `<option value="${e}">${e}</option>`).join('')
    : '<option value="">Sin datos aún</option>';
  if (prev && ejercicios.includes(prev)) sel.value = prev;
}

function renderProgresion() {
  const ejercicio = document.getElementById('prog-selector').value;
  if (!ejercicio) return;

  const historial = JSON.parse(localStorage.getItem('gymcoach_historial') || '[]');
  const datos = historial.filter(r => r.ejercicio === ejercicio);

  if (datos.length === 0) {
    document.getElementById('stat-max').textContent = '—';
    document.getElementById('stat-sesiones').textContent = '—';
    document.getElementById('stat-tendencia').textContent = '—';
    return;
  }

  const porFecha = {};
  datos.forEach(r => {
    const max = Math.max(...r.sets.map(s => parseFloat(s.kg) || 0));
    if (!porFecha[r.fecha] || porFecha[r.fecha] < max) porFecha[r.fecha] = max;
  });

  const fechas = Object.keys(porFecha).sort();
  const pesos = fechas.map(f => porFecha[f]);
  const maxKg = Math.max(...pesos);
  const sesiones = fechas.length;

  let tendencia = 0;
  if (pesos.length >= 2) {
    const diff = pesos[pesos.length - 1] - pesos[0];
    const semanas = Math.max(1, (new Date(fechas[fechas.length - 1]) - new Date(fechas[0])) / (7 * 86400000));
    tendencia = parseFloat((diff / semanas).toFixed(1));
  }

  document.getElementById('stat-max').textContent = maxKg;
  document.getElementById('stat-sesiones').textContent = sesiones;
  document.getElementById('stat-tendencia').textContent = (tendencia > 0 ? '+' : '') + tendencia;

  const ctx = document.getElementById('progChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  const labels = fechas.map(f => {
    const d = new Date(f + 'T12:00:00');
    return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  });

  chartInstance = new Chart(ctx, {
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

  const recientes = [...fechas].reverse().slice(0, 8);
  document.getElementById('sesiones-recientes').innerHTML = recientes.map(fecha => {
    const registrosDia = datos.filter(r => r.fecha === fecha);
    const d = new Date(fecha + 'T12:00:00');
    const diasStr = registrosDia[0]?.dia ? `Día ${registrosDia[0].dia}` : '';
    return `<div class="sesion-item">
      <div>
        <div class="sesion-fecha">${d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <div class="sesion-dia">${diasStr}</div>
      </div>
      <div class="sesion-ejercicios">${porFecha[fecha]} kg</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════
// UI UTILS
// ═══════════════════════════════════════
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    const tabs = ['chat', 'registro', 'progresion'];
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
let currentUndoHandler = null;

function showToast(msg) {
  const t = document.getElementById('toast');
  t.innerHTML = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

function showUndoToast(msg, onUndo) {
  const t = document.getElementById('toast');

  if (currentUndoHandler) {
    t.querySelector('.toast-undo')?.removeEventListener('click', currentUndoHandler);
  }

  currentUndoHandler = () => {
    onUndo();
    t.classList.remove('show');
    if (toastTimer) clearTimeout(toastTimer);
  };

  t.innerHTML = `${msg} <button class="toast-undo" aria-label="Deshacer eliminación">Deshacer</button>`;
  t.querySelector('.toast-undo').addEventListener('click', currentUndoHandler);
  t.classList.add('show');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    currentUndoHandler = null;
  }, 5000);
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
      const existente = JSON.parse(localStorage.getItem('gymcoach_historial') || '[]');
      const merged = [...existente, ...data.historial];
      const seen = new Set();
      const unique = merged.filter(r => {
        const key = r.fecha + '|' + r.ejercicio + '|' + (r.sets[0]?.kg || '');
        if (seen.has(key)) return false;
        seen.add(key); return true;
      });
      localStorage.setItem('gymcoach_historial', JSON.stringify(unique));
      if (data.contexto_previo) localStorage.setItem('gymcoach_contexto_previo', data.contexto_previo);
      showToast(`✓ ${data.historial.length} registros importados`);
      renderHistorialHoy(); actualizarSelectorProgresion(); renderProgresion();
    } catch (err) { showToast('Error al leer el archivo JSON'); }
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
window.addEventListener('load', () => {
  const savedKey = localStorage.getItem('gymcoach_api_key');
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

  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
  const dia = getDiaActual();
  addMessage('assistant', `${saludo}, Juan Martín. Sistema activado.\n\nContexto clínico cargado. Protocolo de protección dorsal activo.\n\nTe toca el **Día ${dia}** (${DIAS[dia]}).\n\nCuando estés listo para entrenar, decime "Voy a entrenar" y arrancamos.`);
}
