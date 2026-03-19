// DOM Elements
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const loginForm = document.getElementById('login-form');
const apiUrlInput = document.getElementById('api-url');
const ordersTableBody = document.getElementById('orders-table-body');
const searchInput = document.getElementById('search-input');
const refreshBtn = document.getElementById('refresh-btn');
const newOrderBtn = document.getElementById('new-order-btn');
const newOrderForm = document.getElementById('new-order-form');
const validateForm = document.getElementById('validate-form');
const photoInput = document.getElementById('photo-input');
const photoPreview = document.getElementById('photo-preview');
const uploadPlaceholder = document.getElementById('upload-placeholder');
const ocrOverlay = document.getElementById('ocr-overlay');
const validationStatusBox = document.getElementById('validation-status-box');
const valPhotoAmountInput = document.getElementById('val-photo-amount');
const driverFilterSelect = document.getElementById('driver-filter'); // v18

// State
let currentUser = null;
let orders = [];
let API_URL = localStorage.getItem('api_url') || 'https://script.google.com/macros/s/AKfycbwHcoS-lpxyMDE4SC6PKlGMLyc8bv279gDZOZ2SDqw5NoHn_RTQHUWHNdI4puLQfM0F/exec';
let currentFilter = 'all';
let currentFilteredOrders = [];
let dateRange = { start: null, end: null };
window.allDriversList = []; // v1.21: Lista completa de motorizados desde DB
let bestOCRData = {}; // v6.1: Almacén global para data extraída por OCR

// Alerts State
let alertsEnabled = false;
let notifiedDelayed = new Set();
let notifiedPorValidar = new Set();
let notifiedContado = new Set(); // v5.1: Alerta para pedidos al contado
let notifiedRobotFindings = new Set(); // v5.5: Alerta para hallazgos del robot
let currentRobotAlerts = []; // v5.5: Lista actual de alertas del robot
let audioCtx = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (API_URL) apiUrlInput.value = API_URL;

    // Set Date Filter to Today (ajustado a zona horaria local para evitar saltos de día)
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localDate = new Date(now.getTime() - offset);
    const todayStr = localDate.toISOString().split('T')[0];

    // 1. Initialize all standard date inputs
    const dateInputs = [
        'date-filter',
        'mapa-date-filter',
        'report-date-filter',
        'caja-date-picker',
        'dash-from',
        'dash-to'
    ];

    dateInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = todayStr;
    });

    // 2. Initialize Week Picker for Horarios (ISO Week)
    const weekPicker = document.getElementById('horario-semana-picker');
    if (weekPicker && !weekPicker.value) {
        const target = new Date(now.valueOf());
        const dayNr = (now.getDay() + 6) % 7;
        target.setDate(target.getDate() - dayNr + 3);
        const firstThursday = target.valueOf();
        target.setMonth(0, 1);
        if (target.getDay() !== 4) {
            target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
        }
        const weekNum = 1 + Math.ceil((firstThursday - target) / 604800000);
        weekPicker.value = `${now.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
    }

    checkSession();

    // Configurar manejador de errores de imagen para bypass de 429
    if (photoPreview) {
        photoPreview.onerror = () => handleImageError(photoPreview);
    }

    // Botón Copiar Llave (v22.1)
    const btnCopyLlave = document.getElementById('btn-copy-llave');
    if (btnCopyLlave) {
        btnCopyLlave.addEventListener('click', async () => {
            const llave = document.getElementById('val-key-display').textContent;
            if (llave && llave.trim() !== "") {
                try {
                    await navigator.clipboard.writeText(llave);
                    const icon = btnCopyLlave.querySelector('i');
                    if (icon) icon.className = 'fa-solid fa-check';
                    btnCopyLlave.classList.add('copy-success');
                    
                    setTimeout(() => {
                        if (icon) icon.className = 'fa-regular fa-copy';
                        btnCopyLlave.classList.remove('copy-success');
                    }, 2000);
                } catch (err) {
                    console.error('Error al copiar:', err);
                }
            }
        });
    }
});

// --- Authentication ---

// --- Alerts Logic ---
const toggleAlertsBtn = document.getElementById('toggle-alerts-btn');

if (toggleAlertsBtn) {
    toggleAlertsBtn.addEventListener('click', () => {
        alertsEnabled = !alertsEnabled;
        if (alertsEnabled) {
            // Initialize AudioContext on first user interaction
            if (!audioCtx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) audioCtx = new AudioContext();
            }
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume();
            }

            // Request Notification Permission
            if (window.Notification && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
                Notification.requestPermission();
            }

            toggleAlertsBtn.style.background = 'rgba(74, 222, 128, 0.1)';
            toggleAlertsBtn.style.color = '#4ade80';
            toggleAlertsBtn.style.border = '1px solid rgba(74, 222, 128, 0.3)';
            toggleAlertsBtn.innerHTML = '<i class="fa-solid fa-bell"></i> <span id="lbl-alerts">Alertas: ON</span>';
            Swal.fire({ toast: true, position: 'top-end', text: 'Alertas sonoras y visuales encendidas', icon: 'success', timer: 2000, showConfirmButton: false });
        } else {
            toggleAlertsBtn.style.background = 'rgba(239, 68, 68, 0.1)';
            toggleAlertsBtn.style.color = '#ef4444';
            toggleAlertsBtn.style.border = '1px solid rgba(239, 68, 68, 0.3)';
            toggleAlertsBtn.innerHTML = '<i class="fa-solid fa-bell-slash"></i> <span id="lbl-alerts">Alertas: OFF</span>';
        }
    });
}

const robotAlertsBtn = document.getElementById('robot-alerts-btn');
if (robotAlertsBtn) {
    robotAlertsBtn.addEventListener('click', () => {
        document.getElementById('robot-alerts-pulse').style.display = 'none';
        
        if (currentRobotAlerts.length === 0) {
            Swal.fire('Sin Alertas', 'No hay hallazgos del robot pendientes.', 'success');
            return;
        }

        let html = '<div style="text-align: left; max-height: 400px; overflow-y: auto;">';
        currentRobotAlerts.forEach(o => {
            html += `<div style="padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 5px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="color: #f59e0b;"># ${o.nro} - ${o.llave}</strong>
                    <span style="font-size: 0.8em; color: gray; margin-left: auto;">S/ ${parseFloat(o.monto || 0).toFixed(2)}</span>
                </div>
                <div style="font-size: 0.9em; margin-top: 5px; color: #fef3c7;">
                    <i class="fa-solid fa-triangle-exclamation"></i> ${o.hallazgoRobot}
                </div>
                <button onclick="window.openValidateModal(${o.nro})" style="margin-top: 8px; font-size: 0.75em; padding: 6px 10px; background: #3b82f6; border: none; color: white; border-radius: 6px; cursor: pointer; font-weight: bold;">
                    Ver Detalle
                </button>
            </div>`;
        });
        html += '</div>';

        Swal.fire({
            title: 'Hallazgos del Robot',
            html: html,
            icon: 'warning',
            background: 'var(--card-bg)',
            color: 'var(--text-main)',
            confirmButtonText: 'Cerrar',
            confirmButtonColor: '#334155'
        });
    });
}

const clearRobotFindingsBtn = document.getElementById('clear-robot-findings-btn');
if (clearRobotFindingsBtn) {
    clearRobotFindingsBtn.addEventListener('click', async () => {
        const { isConfirmed } = await Swal.fire({
            title: '¿Limpiar historial de hallazgos?',
            text: 'Se borrarán todos los hallazgos y alertas del robot en la base de datos.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, limpiar todo',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#ef4444'
        });

        if (isConfirmed) {
            setLoading(true);
            try {
                const res = await fetchAPI('limpiarHallazgosRobot', { fecha: document.getElementById('date-filter').value });
                if (res.success) {
                    Swal.fire('¡Limpiado!', `Se han borrado ${res.count} hallazgos.`, 'success');
                    loadOrders(); // Recargar para limpiar localmente
                } else {
                    Swal.fire('Error', res.message, 'error');
                }
            } catch (e) {
                console.error(e);
                Swal.fire('Error', 'Error de red al limpiar hallazgos', 'error');
            }
            setLoading(false);
        }
    });
}

function playAlertSound(type) {
    if (!alertsEnabled || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (type === 'delayed') {
            // Alarm Beep (Doble pitido rápido rojo)
            osc.type = 'square';
            osc.frequency.setValueAtTime(400, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.05, audioCtx.currentTime); // low volume
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.2);

            setTimeout(() => {
                if (audioCtx && audioCtx.state === 'running') {
                    const osc2 = audioCtx.createOscillator();
                    const gain2 = audioCtx.createGain();
                    osc2.connect(gain2);
                    gain2.connect(audioCtx.destination);
                    osc2.type = 'square';
                    osc2.frequency.setValueAtTime(400, audioCtx.currentTime);
                    osc2.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
                    gain2.gain.setValueAtTime(0.05, audioCtx.currentTime);
                    gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
                    osc2.start(audioCtx.currentTime);
                    osc2.stop(audioCtx.currentTime + 0.2);
                }
            }, 250);

        } else if (type === 'por_validar') {
            // Ding / Campanilla (Verde/Éxito)
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
            osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1); // E5
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.5);
        } else if (type === 'contado') {
            // SIRENA / EMERGENCA (Triple pitido ascendente y penetrante)
            [0, 0.2, 0.4].forEach((delay, i) => {
                const sOsc = audioCtx.createOscillator();
                const sGain = audioCtx.createGain();
                sOsc.type = 'triangle';
                sOsc.frequency.setValueAtTime(880 + (i * 200), audioCtx.currentTime + delay);
                sGain.gain.setValueAtTime(0.15, audioCtx.currentTime + delay);
                sGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + 0.25);
                sOsc.connect(sGain);
                sGain.connect(audioCtx.destination);
                sOsc.start(audioCtx.currentTime + delay);
                sOsc.stop(audioCtx.currentTime + delay + 0.25);
            });
        } else if (type === 'new_order') {
            [0, 0.15].forEach((delay, i) => {
                const bOsc = audioCtx.createOscillator();
                const bGain = audioCtx.createGain();
                bOsc.type = 'sine';
                bOsc.frequency.setValueAtTime(660 + (i * 220), audioCtx.currentTime + delay);
                bGain.gain.setValueAtTime(0.1, audioCtx.currentTime + delay);
                bGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + 0.2);
                bOsc.connect(bGain);
                bGain.connect(audioCtx.destination);
                bOsc.start(audioCtx.currentTime + delay);
                bOsc.stop(audioCtx.currentTime + delay + 0.2);
            });
        }
    } catch (e) { }
}

function showSystemNotification(title, body) {
    if (!alertsEnabled || !window.Notification) return;
    if (Notification.permission === 'granted') {
        new Notification(title, { body: body });
    }
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const url = apiUrlInput.value.trim();

    if (!url) {
        Swal.fire('Error', 'Debes ingresar la URL del Script de Google', 'error');
        return;
    }

    localStorage.setItem('api_url', url);
    API_URL = url;

    setLoading(true);
    try {
        const response = await fetchAPI('login', { user, pass });
        if (response.success) {
            currentUser = response.user;
            sessionStorage.setItem('user', JSON.stringify(currentUser));
            showApp();
        } else {
            Swal.fire('Error', 'Credenciales incorrectas', 'error');
        }
    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
    }
    setLoading(false);
});

function checkSession() {
    const savedUser = sessionStorage.getItem('user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showApp();
    }
}

async function showApp() {
    if (!currentUser) return;
    loginSection.classList.add('hidden');
    appSection.style.display = 'grid'; // Grid layout
    document.getElementById('user-name-display').textContent = currentUser.nombre || 'Usuario';

    // Role based UI (null-safe)
    const importBtn = document.getElementById('import-btn');
    const importTextBtn = document.getElementById('import-text-btn');
    if (currentUser.rol !== 'Admin') {
        if (newOrderBtn) newOrderBtn.style.display = 'none';
        if (importBtn) importBtn.style.display = 'none';
        if (importTextBtn) importTextBtn.style.display = 'none';
    } else {
        if (newOrderBtn) newOrderBtn.style.display = 'flex';
        if (importBtn) importBtn.style.display = 'flex';
        if (importTextBtn) importTextBtn.style.display = 'flex';
    }

    // Cargar orders primero (no bloqueante para mostrar tabla rápido)
    loadOrders();

    // Cargar lista maestra de motorizados (v1.21)
    if (typeof loadAllDrivers === 'function') {
        await loadAllDrivers();
    }
}

document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('user');
    location.reload();
});

// --- Navigation ---
const navPedidos = document.getElementById('nav-pedidos');
const navReportes = document.getElementById('nav-reportes');
const navMapa = document.getElementById('nav-mapa'); // NUEVO
const contentPedidos = document.getElementById('app-content');
const contentReportes = document.getElementById('reports-content');
const contentMapa = document.getElementById('mapa-content'); // NUEVO
const contentHorarios = document.getElementById('horarios-content'); // NUEVO

navPedidos.addEventListener('click', (e) => {
    e.preventDefault();
    navPedidos.classList.add('active');
    navReportes.classList.remove('active');
    navMapa.classList.remove('active');
    const navHorarios = document.getElementById('nav-horarios');
    if (navHorarios) navHorarios.classList.remove('active');
    const nc = document.getElementById('nav-caja');
    if (nc) nc.classList.remove('active');
    document.getElementById('nav-dashboard').classList.remove('active');

    contentPedidos.style.display = 'block';
    contentPedidos.classList.remove('hidden'); // Fix just in case

    contentReportes.style.display = 'none';
    contentReportes.classList.add('hidden');
    if (contentMapa) {
        contentMapa.style.display = 'none';
        contentMapa.classList.add('hidden');
    }
    if (contentHorarios) {
        contentHorarios.style.display = 'none';
        contentHorarios.classList.add('hidden');
    }
    const cc = document.getElementById('caja-content');
    if (cc) {
        cc.style.display = 'none';
        cc.classList.add('hidden');
    }
    const dv = document.getElementById('dashboard-view');
    if (dv) dv.style.display = 'none';
});

navReportes.addEventListener('click', (e) => {
    e.preventDefault();
    navReportes.classList.add('active');
    navPedidos.classList.remove('active');
    navMapa.classList.remove('active');
    const navHorarios = document.getElementById('nav-horarios');
    if (navHorarios) navHorarios.classList.remove('active');
    const nc = document.getElementById('nav-caja');
    if (nc) nc.classList.remove('active');
    document.getElementById('nav-dashboard').classList.remove('active');

    contentPedidos.style.display = 'none';
    contentPedidos.classList.add('hidden');
    if (contentMapa) {
        contentMapa.style.display = 'none';
        contentMapa.classList.add('hidden');
    }
    if (contentHorarios) {
        contentHorarios.style.display = 'none';
        contentHorarios.classList.add('hidden');
    }
    const cc = document.getElementById('caja-content');
    if (cc) {
        cc.style.display = 'none';
        cc.classList.add('hidden');
    }
    contentReportes.style.display = '';
    contentReportes.classList.remove('hidden');
    const dv = document.getElementById('dashboard-view');
    if (dv) dv.style.display = 'none';

    const mainDate = document.getElementById('date-filter').value;
    if (mainDate) {
        document.getElementById('report-date-filter').value = mainDate;
    } else {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        document.getElementById('report-date-filter').value = `${yyyy}-${mm}-${dd}`;
    }

    renderReportsTable();
});

// NUEVO MANEJADOR DE MAPA
navMapa.addEventListener('click', (e) => {
    e.preventDefault();
    navMapa.classList.add('active');
    navPedidos.classList.remove('active');
    navReportes.classList.remove('active');
    const navHorarios = document.getElementById('nav-horarios');
    if (navHorarios) navHorarios.classList.remove('active');
    const nc = document.getElementById('nav-caja');
    if (nc) nc.classList.remove('active');
    document.getElementById('nav-dashboard').classList.remove('active');

    contentPedidos.style.display = 'none';
    contentPedidos.classList.add('hidden');
    contentReportes.classList.add('hidden');
    contentReportes.style.display = 'none';
    if (contentHorarios) {
        contentHorarios.style.display = 'none';
        contentHorarios.classList.add('hidden');
    }
    const cc = document.getElementById('caja-content');
    if (cc) {
        cc.style.display = 'none';
        cc.classList.add('hidden');
    }
    const dv = document.getElementById('dashboard-view');
    if (dv) dv.style.display = 'none';

    if (contentMapa) {
        contentMapa.style.display = 'flex';
        contentMapa.classList.remove('hidden');
    }

    const mainDate = document.getElementById('date-filter').value;
    const mapaDateFilter = document.getElementById('mapa-date-filter');
    if (mainDate && mapaDateFilter) {
        mapaDateFilter.value = mainDate;
    }

    if (typeof renderMapaMotorizados === 'function') {
        renderMapaMotorizados();
    }
});

// NUEVO MANEJADOR DE HORARIOS
const navHorarios = document.getElementById('nav-horarios');
if (navHorarios) {
    navHorarios.addEventListener('click', (e) => {
        e.preventDefault();
        navHorarios.classList.add('active');
        navPedidos.classList.remove('active');
        navReportes.classList.remove('active');
        navMapa.classList.remove('active');
        const nc = document.getElementById('nav-caja');
        if (nc) nc.classList.remove('active');
        document.getElementById('nav-dashboard').classList.remove('active');

        contentPedidos.style.display = 'none';
        contentPedidos.classList.add('hidden');
        contentReportes.classList.add('hidden');
        contentReportes.style.display = 'none';
        if (contentMapa) {
            contentMapa.style.display = 'none';
            contentMapa.classList.add('hidden');
        }
        const cc = document.getElementById('caja-content');
        if (cc) {
            cc.style.display = 'none';
            cc.classList.add('hidden');
        }

        const dv = document.getElementById('dashboard-view');
        if (dv) dv.style.display = 'none';

        if (contentHorarios) {
            contentHorarios.style.display = '';
            contentHorarios.classList.remove('hidden');
        }

        // Initialize week picker if empty
        const weekPicker = document.getElementById('horario-semana-picker');
        if (weekPicker && !weekPicker.value) {
            const now = new Date();
            const year = now.getFullYear();
            const start = new Date(now.getFullYear(), 0, 1);
            const days = Math.floor((now - start) / (24 * 60 * 60 * 1000));
            const weekNumber = Math.ceil((now.getDay() + 1 + days) / 7);
            weekPicker.value = `${year}-W${weekNumber.toString().padStart(2, '0')}`;
        }

        // Always load existing data for the selected week when visiting the tab
        if (typeof window.loadHorarioSemana === 'function') {
            window.loadHorarioSemana();
        }
    });
}

const navCajaElem = document.getElementById('nav-caja');
if (navCajaElem) {
    navCajaElem.addEventListener('click', (e) => {
        e.preventDefault();
        navCajaElem.classList.add('active');
        navPedidos.classList.remove('active');
        navReportes.classList.remove('active');
        navMapa.classList.remove('active');
        if (navHorarios) navHorarios.classList.remove('active');
        document.getElementById('nav-dashboard').classList.remove('active');

        contentPedidos.style.display = 'none';
        contentPedidos.classList.add('hidden');
        contentReportes.classList.add('hidden');
        contentReportes.style.display = 'none';
        if (contentMapa) {
            contentMapa.style.display = 'none';
            contentMapa.classList.add('hidden');
        }
        if (contentHorarios) {
            contentHorarios.style.display = 'none';
            contentHorarios.classList.add('hidden');
        }

        const dv = document.getElementById('dashboard-view');
        if (dv) dv.style.display = 'none';

        const contentCajaElem = document.getElementById('caja-content');
        if (contentCajaElem) {
            contentCajaElem.style.display = 'flex';
            contentCajaElem.classList.remove('hidden');
        }

        if (typeof window.loadCajaData === 'function') {
            window.loadCajaData();
        }
    });
}

// NUEVO MANEJADOR DE AUDITORÍA POS (Botón Independiente)
const navAuditoria = document.getElementById('nav-auditoria');
if (navAuditoria) {
    navAuditoria.addEventListener('click', (e) => {
        e.preventDefault();
        openAuditoriaModal();
    });
}


// --- Orders Management ---

async function loadOrders() {
    document.getElementById('loading-indicator').classList.remove('hidden');
    const refreshIcon = document.querySelector('#refresh-btn i');
    if (refreshIcon) refreshIcon.classList.add('spin');

    try {
        const response = await fetchAPI('listarPedidos');
        if (response.success) {
            orders = response.data.sort((a, b) => b.nro - a.nro);
            loadAllDrivers(); // v1.21: Cargar lista completa de manera asíncrona
            updateDriverFilterOptions(); // v18: Actualizar opciones del filtro
            applyFilters();
            refreshRobotAlerts(); // Actualizar indicadores del robot
            if (typeof window.refreshDashboardIfVisible === 'function') {
                window.refreshDashboardIfVisible();
            }
        }
    } catch (error) {
        Swal.fire('Error', 'Error cargando pedidos', 'error');
    }
    document.getElementById('loading-indicator').classList.add('hidden');
    if (refreshIcon) refreshIcon.classList.remove('spin');

    // Iniciar actualizaciones locales segundo a segundo si no estaba corriendo
    if (!window.globalTimerRunning) {
        startGlobalTimers();
        window.globalTimerRunning = true;
    }
}

// Auto-refresh silencioso cada 30 segundos
setInterval(() => {
    // Si la pantalla a la vista no es la de pedidos, o estamos loggeandonos, no hacemos nada
    if (appSection.style.display === 'none' || currentUser == null) return;

    const valModal = document.getElementById('modal-validate');
    const newModal = document.getElementById('modal-new-order');
    const isValOpen = valModal && valModal.classList.contains('active');
    const isNewOpen = newModal && newModal.classList.contains('active');

    // Verificamos modal de Swal (Alertas) o importes
    const isSwalOpen = typeof Swal !== 'undefined' && Swal.isVisible && Swal.isVisible();
    const isImportOpen = document.getElementById('modal-import')?.classList.contains('active');
    const isImportTextOpen = document.getElementById('modal-import-text')?.classList.contains('active');

    // Módulos que no sean pedidos (Si mapa o reportes están activos y visibles, puede recargar por debajo sin problema, pero aseguramos de no saltar scroll si están frente a pedidos visuales)

    if (!isValOpen && !isNewOpen && !isSwalOpen && !isImportOpen && !isImportTextOpen && API_URL) {
        // Bloqueo de seguridad: No recargar si el usuario está arrastrando un pedido (v3.0)
        if (window.isDraggingOrder) {
            console.log("[SilentRefresh] Pausado por drag & drop activo...");
            return;
        }
        loadOrdersSilent();
    }
}, 30000); // 30 segundos

async function loadOrdersSilent() {
    try {
        const response = await fetchAPI('listarPedidos');
        if (response.success) {
            const newOrders = response.data;

            // Detectar nuevos pedidos (IDs que no estaban antes)
            const currentIds = new Set(orders.map(o => o.llave || o.id)); // Usamos llave/id
            const trulyNew = newOrders.filter(o => !currentIds.has(o.llave || o.id));

            if (trulyNew.length > 0 && orders.length > 0) {
                console.log(`[Alert] ${trulyNew.length} nuevos pedidos detectados.`);
                playAlertSound('new_order');

                const Toast = Swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 5000,
                    timerProgressBar: true,
                    background: 'var(--card-bg)',
                    color: 'var(--text-main)',
                    didOpen: (toast) => {
                        toast.addEventListener('mouseenter', Swal.stopTimer)
                        toast.addEventListener('mouseleave', Swal.resumeTimer)
                    }
                });

                Toast.fire({
                    icon: 'info',
                    title: `¡Entraron ${trulyNew.length} pedidos nuevos!`
                });
            }

            orders = newOrders.sort((a, b) => b.nro - a.nro);
            updateDriverFilterOptions();
            refreshRobotAlerts();

            // Re-aplicar el filtro de la tabla de forma silenciosa si estamos en la vista
            const isOrdersView = window.getComputedStyle(document.getElementById('app-content')).display !== 'none';
            if (isOrdersView) {
                applyFilters();
            }

            if (typeof window.refreshDashboardIfVisible === 'function') {
                window.refreshDashboardIfVisible();
            }
            if (!document.getElementById('mapa-content').classList.contains('hidden') && typeof renderMapaMotorizados === 'function') {
                renderMapaMotorizados();
            }

            // Se elimina el autogrupado por tiempo para respetar la condición de entrega real
        }
    } catch (e) {
        // Ignorar fallas de red en background
    }
}

function refreshRobotAlerts() {
    // --- DECTECTAR HALLAZGOS DEL ROBOT (v5.5) ---
    const findings = orders.filter(o => o.hallazgoRobot && o.hallazgoRobot.trim() !== "" && !o.hallazgoRobot.toLowerCase().includes('todo conforme'));
    currentRobotAlerts = findings;

    const robotBtn = document.getElementById('robot-alerts-btn');
    const robotCount = document.getElementById('robot-alerts-count');
    const robotPulse = document.getElementById('robot-alerts-pulse');
    const clearRobotBtn = document.getElementById('clear-robot-findings-btn');

    if (findings.length > 0) {
        if (robotBtn) robotBtn.classList.remove('hidden');
        if (clearRobotBtn) clearRobotBtn.classList.remove('hidden');
        if (robotCount) robotCount.textContent = `${findings.length} Alerta${findings.length > 1 ? 's' : ''} Robot`;
        
        // Buscar si hay alguno nuevo que no hayamos notificado
        const newFindings = findings.filter(f => !notifiedRobotFindings.has(f.llave + f.hallazgoRobot));
        if (newFindings.length > 0 && orders.length > 0) {
            newFindings.forEach(f => notifiedRobotFindings.add(f.llave + f.hallazgoRobot));
            playAlertSound('warning'); 
            if (robotPulse) robotPulse.style.display = 'block';

            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 6000,
                timerProgressBar: true,
                background: '#78350f',
                color: '#fef3c7',
            });
            Toast.fire({
                icon: 'warning',
                title: `Robot detectó ${newFindings.length} hallazgo(s) nuevo(s)`,
                text: 'Revisa el panel de alertas'
            });
        }
    } else {
        if (robotBtn) robotBtn.classList.add('hidden');
        if (clearRobotBtn) clearRobotBtn.classList.add('hidden');
        if (robotPulse) robotPulse.style.display = 'none';
    }
}

function renderOrders(data) {
    ordersTableBody.innerHTML = '';
    const totalOrders = data.length;

    data.forEach((order, index) => {
        const dynamicCorrelative = totalOrders - index;

        // 1. LÓGICA DE COLUMNA "DETALLE"
        let detalleHtml = '<span style="color: gray; opacity: 0.5;">-</span>';
        if (order.estado === 'Cancelado' || order.estado === 'Rechazado') {
            const motivo = (order.motivo_cancelacion || '').toLowerCase();
            if (motivo.includes('consumidor')) detalleHtml = '<span style="color:#fca5a5; font-size:0.9em;">🙋‍♂️ Consumidor</span>';
            else if (motivo.includes('venta')) detalleHtml = '<span style="color:#fca5a5; font-size:0.9em;">🏪 Pto de Venta</span>';
            else if (motivo.includes('repartidor')) detalleHtml = '<span style="color:#fca5a5; font-size:0.9em;">🚴 Repartidor</span>';
            else if (motivo !== '') detalleHtml = `<span style="color:#fca5a5; font-size:0.9em;">${order.motivo_cancelacion}</span>`;
        } else if (order.estado === 'Validado' || order.estado === 'Validado AG') {
            const tipo = (order.tipo_pago_val || order.tipo_pago || '').toString().toUpperCase();
            if (tipo.includes('EFECTIVO')) detalleHtml = '<span style="color:#4ade80; font-weight:bold; font-size:0.85em;">💵 EFECTIVO</span>';
            else if (tipo.includes('ONLINE')) detalleHtml = '<span style="color:#60a5fa; font-weight:bold; font-size:0.85em;">🌐 ONLINE</span>';
            else if (tipo.includes('TARJETA')) detalleHtml = '<span style="color:#a78bfa; font-weight:bold; font-size:0.85em;">💳 TARJETA</span>';
            else if (tipo.includes('QR') || tipo.includes('YAPE') || tipo.includes('PLIN')) detalleHtml = '<span style="color:#2dd4bf; font-weight:bold; font-size:0.85em;">📱 QR</span>';
            else if (tipo !== '') detalleHtml = `<span style="color:#cbd5e1; font-weight:bold; font-size:0.85em;">${tipo}</span>`;
        } else if (order.pago && order.pago.trim() !== '') {
            detalleHtml = `<span style="color:#94a3b8; font-size:0.85em;">${order.pago}</span>`;
        }

        // --- LÓGICA DE COLUMNA "VUELTO" ---
        let vueltoHtml = '<span class="text-muted">-</span>';
        const isContado = (order.pago || '').toUpperCase().includes('CONTADO') || (order.tipo_pago || '').toUpperCase().includes('CONTADO');

        if (isContado) {
            const currentVuelto = order.vuelto ? parseFloat(order.vuelto).toFixed(2) : '';
            // Si el motorizado o admin ya validó, se puede deshabilitar o dejar en solo lectura dependiendo del rol.
            // Para simplicidad, si está Validado, bloqueamos la edición directa aquí.
            const isReadonly = (order.estado === 'Validado' || order.estado === 'Validado AG' || currentUser.rol !== 'Admin') ? 'disabled' : '';

            vueltoHtml = `
                <div style="display: flex; align-items: center; justify-content: center; gap: 4px;">
                    <span style="color: #4ade80; font-weight: bold;">S/</span>
                    <input type="number" step="0.01" class="vuelto-inline-input" 
                        value="${currentVuelto}" 
                        placeholder="0.00"
                        ${isReadonly}
                        onblur="saveInlineVuelto('${order.nro}', '${order.llave}', '${order.envio || ''}', this.value, '${currentVuelto}')"
                        style="width: 60px; padding: 4px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.2); color: white; text-align: center; font-size: 0.9em;">
                </div>
            `;
        }
        // ----------------------------------

        // 2. LÓGICA DE COLUMNA "TIEMPO" (Azul/Rojo)
        let tiempoHtml = '<span class="text-muted">-</span>';
        let orderDate = null;

        // --- NUEVO: TIEMPO REAL (HORA TADA / COL Z) ---
        let realMinsPart = '-';
        if (order.minutosReales !== undefined && order.minutosReales !== "" && order.minutosReales !== null && order.minutosReales !== "---") {
            const mins = Math.floor(parseFloat(order.minutosReales));
            if (!isNaN(mins)) {
                const rText = Math.abs(mins) >= 60 ? `${Math.floor(Math.abs(mins) / 60)}h ${Math.abs(mins) % 60}m` : `${mins} min`;
                let rColor = '#60a5fa'; // Celeste
                if (mins > 35) rColor = '#fca5a5'; // Rojo claro
                realMinsPart = `<span style="color:${rColor}; font-weight:bold; white-space: nowrap;"><i class="fa-solid fa-ghost"></i> ${rText}</span>`;
            }
        } else if (order.fechaHoraReal) {
            // Fallback si solo tenemos el timestamp pero no los minutos calculados
            realMinsPart = `<span style="color:#94a3b8; font-size:0.8em;">${order.fechaHoraReal}</span>`;
        }

        try {
            // Intento #1: Forzar parseo de la fecha como America/Lima usando Intl (Si es Date válido)
            const dRegistroOrig = new Date(order.fecha);
            if (!isNaN(dRegistroOrig.getTime())) {
                const formatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'America/Lima',
                    year: 'numeric', month: 'numeric', day: 'numeric',
                    hour: 'numeric', minute: 'numeric', second: 'numeric',
                    hour12: false
                });
                const parts = formatter.formatToParts(dRegistroOrig);
                const getP = (type) => parseInt(parts.find(p => p.type === type).value, 10);

                let rH = getP('hour');
                if (rH === 24) rH = 0;

                orderDate = new Date(Date.UTC(getP('year'), getP('month') - 1, getP('day'), rH, getP('minute'), 0));
            }
        } catch (e) {
            console.error("Error parseando fecha base:", e);
        }

        try {
            if (orderDate && !isNaN(orderDate.getTime())) {
                let diffMs = null;
                let staticMins = null; // Para cuando viene de HH:MM:SS de Google Sheets

                // PRIORIDAD v7.0: Usar el tiempo guardado en Columna R (SLA Operativo)
                const finalStates = ['Validado', 'Validado AG', 'Por Validar', 'Cancelado', 'Rechazado'];
                if (finalStates.includes(order.estado) && order.tiempo_transcurrido) {
                    let valTiempo = order.tiempo_transcurrido;

                    // Si viene como string HH:MM:SS (formato preferido para Col R)
                    if (typeof valTiempo === 'string' && valTiempo.includes(':')) {
                        let parts = valTiempo.split(':');
                        let h = parseInt(parts[0] || '0', 10);
                        let m = parseInt(parts[1] || '0', 10);
                        if (!isNaN(h) && !isNaN(m)) {
                            staticMins = (h * 60) + m;
                        }
                    }
                    // Fallback si viene como Date object/ISO string
                    else {
                        try {
                            const d = new Date(valTiempo);
                            if (!isNaN(d.getTime())) {
                                staticMins = (d.getUTCHours() * 60) + d.getUTCMinutes();
                            }
                        } catch (e) { }
                    }
                }
                // Si no hay tiempo estático, calculamos dinámicamente o por fecha entrega (legacy/fallbacks)
                else if ((order.estado === 'Validado' || order.estado === 'Validado AG' || order.estado === 'Por Validar') && order.hora_entrega) {
                    let hStr = String(order.hora_entrega).trim();
                    let hh = 0, mm = 0, ok = false;

                    if (hStr.includes('T')) {
                        let dT = new Date(hStr);
                        if (!isNaN(dT.getTime())) {
                            const formatterD = new Intl.DateTimeFormat('en-US', {
                                timeZone: 'America/Lima',
                                hour: 'numeric', minute: 'numeric', second: 'numeric',
                                hour12: false
                            });
                            const pD = formatterD.formatToParts(dT);
                            const getPD = (type) => parseInt(pD.find(p => p.type === type).value, 10);
                            let tH = getPD('hour');
                            if (tH === 24) tH = 0;
                            hh = tH;
                            mm = getPD('minute');
                            ok = true;
                        }
                    } else {
                        let pts = hStr.split(':');
                        if (pts.length >= 2) { hh = parseInt(pts[0], 10); mm = parseInt(pts[1], 10); ok = true; }
                    }

                    if (ok) {
                        const limY = orderDate.getUTCFullYear();
                        const limM = orderDate.getUTCMonth();
                        const limD = orderDate.getUTCDate();

                        let delDate = new Date(Date.UTC(limY, limM, limD, hh, mm, 0));
                        diffMs = delDate.getTime() - orderDate.getTime();

                        if (diffMs < -43200000) {
                            delDate = new Date(Date.UTC(limY, limM, limD + 1, hh, mm, 0));
                            diffMs = delDate.getTime() - orderDate.getTime();
                        } else if (diffMs > 43200000) {
                            delDate = new Date(Date.UTC(limY, limM, limD - 1, hh, mm, 0));
                            diffMs = delDate.getTime() - orderDate.getTime();
                        }
                    }
                } else if (order.estado === 'Pendiente' || order.estado === 'En Camino') {
                    // Calcular against now(Lima) para Pendientes y Por Validar
                    const now = new Date();
                    const formatterNow = new Intl.DateTimeFormat('en-US', {
                        timeZone: 'America/Lima',
                        year: 'numeric', month: 'numeric', day: 'numeric',
                        hour: 'numeric', minute: 'numeric', second: 'numeric',
                        hour12: false
                    });
                    const partsNow = formatterNow.formatToParts(now);
                    const getPN = (type) => parseInt(partsNow.find(p => p.type === type).value, 10);
                    let nH = getPN('hour');
                    if (nH === 24) nH = 0;
                    const limaNowUtc = Date.UTC(getPN('year'), getPN('month') - 1, getPN('day'), nH, getPN('minute'), 0);

                    diffMs = limaNowUtc - orderDate.getTime();
                    if (diffMs < 0) diffMs = 0;
                }

                if (staticMins !== null || (diffMs !== null && diffMs >= 0 && diffMs <= 86400000)) {
                    let mins = staticMins !== null ? staticMins : Math.floor(diffMs / 60000);
                    
                    // --- FALLBACK: Solo si no hay tiempo operativo (R), usar TADA (Z) ---
                    if (staticMins === null && order.minutosReales !== undefined && order.minutosReales !== "" && order.minutosReales !== null && order.minutosReales !== "---") {
                        const mz = Math.floor(parseFloat(order.minutosReales));
                        if (!isNaN(mz)) mins = mz;
                    }

                    // --- NUEVA LÃ“GICA DE COLORES SINCRONIZADA (v5.0) ---
                    let color, bg;

                    if (order.estado === 'Pendiente' || order.estado === 'En Camino') {
                        // LÃ³gica unificada: Celeste (#60a5fa) hasta los 35 min
                        if (mins > 35) {
                            color = '#f87171'; // Rojo suave
                            bg = 'rgba(248, 113, 113, 0.1)';
                        } else {
                            color = '#60a5fa'; // Celeste
                            bg = 'rgba(96, 165, 250, 0.1)';
                        }

                        // EVALUAR ALERTAS (Sincronizado a 30 min)
                        const isToday = order.fecha && order.fecha.startsWith(new Date().toISOString().split('T')[0]);
                        if (isToday) {
                            if (mins > 35 && !notifiedDelayed.has(order.nro)) {
                                notifiedDelayed.add(order.nro);
                                playAlertSound('delayed');
                                showSystemNotification('🚨 Pedido Retrasado', `El pedido #${order.nro} ha cruzado los ${mins} minutos en espera.`);
                            }
                            // ... (resto de alertas de validaciÃ³n se mantienen igual)
                        }
                    }

                    // --- NUEVA ALERTA: PEDIDOS AL CONTADO (v5.2) ---
                    const esContado = (order.pago || '').toUpperCase().includes('CONTADO') || (order.tipo_pago || '').toUpperCase().includes('CONTADO');
                    const estadoActivo = order.estado === 'Pendiente' || order.estado === 'En Camino';

                    if (esContado && estadoActivo && !notifiedContado.has(order.nro)) {
                        notifiedContado.add(order.nro);
                        playAlertSound('contado');
                        Swal.fire({
                            title: '🚨 ¡NUEVO PEDIDO AL CONTADO! 🚨',
                            icon: 'warning',
                            background: '#1e1e2e',
                            color: '#fff',
                            confirmButtonText: 'ENTENDIDO',
                            confirmButtonColor: '#ef4444',
                            timer: 10000,
                            timerProgressBar: true
                        });
                        showSystemNotification('⚠️ COBRO CONTADO', `Pedido #${order.nro} al contado. ¡Cobrar de inmediato!`);
                    }
                    // ----------------------------------------------

                    else {
                        // Para otros estados (Validado, etc) mantenemos distinciÃ³n pero con nuevos tiempos
                        if (mins > 35) {
                            color = '#fb923c'; // Naranja
                            bg = 'rgba(251, 146, 60, 0.1)';
                        } else {
                            color = '#60a5fa'; // Celeste
                            bg = 'rgba(96, 165, 250, 0.1)';
                        }
                    }
                    // ----------------------------------------------------

                    let text = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
                    tiempoHtml = `<span style="color:${color}; font-weight:bold; background:${bg}; padding: 3px 8px; border-radius: 6px; white-space: nowrap;"><i class="fa-solid fa-clock"></i> ${text}</span>`;
                }
            }
        } catch (e) { }

        // 3. CONSTRUIR LA FILA DE LA TABLA (11 Columnas exactas)
        const tr = document.createElement('tr');
        // Efecto cebra: filas pares con fondo ligeramente diferente
        const rowBg = index % 2 === 0 ? 'rgba(255, 255, 255, 0.03)' : 'rgba(30, 58, 95, 0.15)';
        tr.style.backgroundColor = rowBg;
        tr.style.transition = 'background-color 0.2s ease';
        // Hover highlight para facilitar seguimiento visual
        tr.addEventListener('mouseenter', () => { tr.style.backgroundColor = 'rgba(59, 130, 246, 0.15)'; });
        tr.addEventListener('mouseleave', () => { tr.style.backgroundColor = rowBg; });
        // Guardar metadata en el TR para poder actualizarlo en tiempo real localmente
        tr.setAttribute('data-nro', order.nro);
        tr.setAttribute('data-estado', order.estado);
        if (orderDate && !isNaN(orderDate.getTime())) {
            tr.setAttribute('data-time', orderDate.getTime());
        }
        const validadoPorColH = (order.validado_por || '').toString();
        const displayResponsable = validadoPorColH ? ` <span style="font-size:0.75em; opacity:0.6; color:#60a5fa; font-weight:normal;">(${validadoPorColH.includes(':') ? validadoPorColH.split(':')[0].trim() : validadoPorColH})</span>` : '';

        tr.innerHTML = `
            <td>#${dynamicCorrelative}${displayResponsable}</td>
            <td>${order.llave}</td>
            <td>${formatDate(order.fecha)}</td>
            <td>S/ ${formatMoney(order.monto)}</td>
            <td>${vueltoHtml}</td>
            <td>${detalleHtml}</td>
            <td><span class="badge ${order.estado === 'Validado AG' ? 'Validado-AG' : (order.estado === 'Validado' && order.validado_por === 'Robot (Auto)' ? 'Validado-Auto' : order.estado.replace(' ', '-'))}">${order.estado}</span>
                ${(order.lat && order.lat !== 0) ? `
                    <a href="https://www.google.com/maps/search/?api=1&query=${order.lat},${order.lng}" target="_blank" class="gps-link" title="Abrir en Google Maps: ${order.lat}, ${order.lng}">
                        <i class="fa-solid fa-location-dot" style="margin-left:8px;"></i>
                    </a>` : ''}
            </td>
            <td style="font-size:0.9em;">${order.envio || '<span class="text-muted">-</span>'}</td>
            <td>${tiempoHtml}</td>
            <td style="background: rgba(96, 165, 250, 0.05);">${realMinsPart}</td>
            <td>
                ${(order.estado === 'Cancelado' || order.estado === 'Rechazado') ? '<span class="text-muted" title="Pedido Cancelado"><i class="fa-solid fa-lock"></i></span>' : `
                <button class="btn-secondary small" onclick="openValidateModal(${order.nro})" title="${currentUser.rol === 'Admin' ? 'Validar/Ver' : 'Solo Lectura'}">
                    ${currentUser.rol === 'Admin' ?
                    `<i class="fa-solid ${order.estado === 'Validado' ? 'fa-eye' : 'fa-pen-to-square'}"></i>` :
                    `<i class="fa-solid fa-eye"></i> <i class="fa-solid fa-lock" style="font-size:0.7em"></i>`}
                </button>
                ${currentUser.rol === 'Admin' && order.estado !== 'Validado' ? `
                <button class="btn-icon-small danger" onclick="rejectOrder(${order.nro})" title="Cancelar">
                    <i class="fa-solid fa-ban"></i>
                </button>` : ''}
                ${currentUser.rol === 'Admin' && order.estado === 'Validado' ? `
                <button class="btn-icon-small ${order.sla_fuera ? 'danger' : ''}"
                    onclick="toggleSLA(${order.nro})"
                    title="${order.sla_fuera ? 'Fuera de SLA ⏱️ — Clic para desmarcar' : 'Marcar como fuera de SLA (>35 min)'}"
                    style="${order.sla_fuera ? 'opacity:1;' : 'opacity:0.4;'}">
                    <i class="fa-solid fa-stopwatch"></i>
                </button>` : ''}
            `}</td>
        `;
        ordersTableBody.appendChild(tr);
    });
}

// --- ACTUALIZACIÓN DINÁMICA DE TIEMPO SIN RECARGAR API ---
function startGlobalTimers() {
    setInterval(() => {
        // Solo actualizar si la tabla de pedidos está visible y hay filas
        const isOrdersView = window.getComputedStyle(document.getElementById('app-content')).display !== 'none';
        if (!isOrdersView || ordersTableBody.children.length === 0) return;

        const now = new Date();
        const formatterNow = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Lima',
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric',
            hour12: false
        });
        const partsNow = formatterNow.formatToParts(now);
        const getPN = (type) => parseInt(partsNow.find(p => p.type === type).value, 10);
        let nH = getPN('hour');
        if (nH === 24) nH = 0;
        const limaNowUtc = Date.UTC(getPN('year'), getPN('month') - 1, getPN('day'), nH, getPN('minute'), 0);

        // Recorrer filas en pantalla con estado Pendiente, En Camino o Por Validar
        Array.from(ordersTableBody.children).forEach(tr => {
            const estado = tr.getAttribute('data-estado');
            const startTime = parseInt(tr.getAttribute('data-time'), 10);

            if ((estado === 'Pendiente' || estado === 'En Camino' || estado === 'Por Validar') && !isNaN(startTime)) {
                let diffMs;
                const nro = tr.getAttribute('data-nro');
                const oData = orders.find(x => x.nro == nro);

                // Si está por validar, intentar usar la hora de entrega manual enviada por el repartidor (App)
                if (estado === 'Por Validar' && oData && oData.hora_entrega && oData.hora_entrega.includes(':')) {
                    try {
                        const [h, m] = oData.hora_entrega.split(':').map(Number);
                        const d = new Date(startTime);
                        // Crear objeto fecha con la misma fecha del pedido pero hora de entrega
                        const entregaDate = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0).getTime();
                        diffMs = entregaDate - startTime;
                        
                        // Ajuste por cruce de medianoche si el diff es muy negativo
                        if (diffMs < -700 * 60000) diffMs += 24 * 3600000;
                    } catch (e) {
                        diffMs = limaNowUtc - startTime;
                    }
                } else {
                    diffMs = limaNowUtc - startTime;
                }

                if (diffMs < 0) diffMs = 0;
                let mins = Math.floor(diffMs / 60000);

                // --- PRIORIDAD v7.0: Si ya existe un tiempo en Columna R, lo usamos (especialmente para "Por Validar") ---
                if (oData && oData.tiempo_transcurrido && typeof oData.tiempo_transcurrido === 'string' && oData.tiempo_transcurrido.includes(':')) {
                    const parts = oData.tiempo_transcurrido.split(':');
                    const h = parseInt(parts[0] || '0', 10);
                    const m = parseInt(parts[1] || '0', 10);
                    if (!isNaN(h) && !isNaN(m)) {
                        mins = (h * 60) + m;
                    }
                }
                // Fallback: Prioridad robot TADA
                else if (oData && oData.minutosReales !== undefined && oData.minutosReales !== "" && oData.minutosReales !== null && oData.minutosReales !== "---") {
                    const mz = Math.floor(parseFloat(oData.minutosReales));
                    if (!isNaN(mz)) mins = mz;
                }

                // Evaluar Colores dinámicos (Sincronizado a 35 min celeste)
                let color = mins <= 35 ? '#60a5fa' : '#f87171';
                let bg = mins <= 35 ? 'rgba(96, 165, 250, 0.1)' : 'rgba(248, 113, 113, 0.1)';
                let text = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;

                let icon = (estado === 'Por Validar') ? 'fa-stopwatch-20' : 'fa-clock';
                let tiempoHtml = `<span style="color:${color}; font-weight:bold; background:${bg}; padding: 3px 8px; border-radius: 6px; white-space: nowrap;" title="${estado === 'Por Validar' ? 'Tiempo congelado al enviar fotos' : 'Tiempo transcurrido'}"><i class="fa-solid ${icon}"></i> ${text}</span>`;

                // Actualizar la celda exacta del tiempo (es la columna índice 8)
                if (tr.children[8]) {
                    tr.children[8].innerHTML = tiempoHtml;
                }
            }
        });
    }, 60000); // Actualiza la UI visual cada 60 segundos (1 minuto) exactos
}

window.toggleSLA = async (nro) => {
    try {
        // Buscar el estado actual del SLA para hacer toggle
        const order = orders.find(o => o.nro == nro);
        const currentlySLA = order && order.sla_fuera ? true : false;

        const res = await fetchAPI('marcarSLAFuera', { nro, fuera_sla: !currentlySLA });
        if (res.success) {
            loadOrders();
        } else {
            Swal.fire('Error', res.message || res.msg, 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'Error de conexión', 'error');
    }
};

// --- FUNCIÓN GLOBAL: GUARDAR VUELTO INLINE Y ENVIAR EGRESO A CAJA ---
window.saveInlineVuelto = async (nro, llave, repartidor, newVal, oldVal) => {
    if (newVal === oldVal) return; // No hubieron cambios

    let montoVal = parseFloat(newVal);
    if (isNaN(montoVal) || montoVal < 0) {
        montoVal = 0;
    }

    Swal.fire({
        title: 'Actualizando Vuelto...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // Enviar actualización de Vuelto a Google Apps Script (Columna M de la base). 
        // Asume que la API crearPedido o actualizarPedido puede actualizar solo el vuelto si se envía action dedicada.
        // Si no existe, se usa una llamada especial, aquí la creamos a nivel JS y asumiremos el Backend puede manejarla o lo ajustará.
        // Simulando llamada a la API "guardarVueltoInline"
        const resSheet = await fetchAPI('guardarVueltoInline', {
            nro: nro,
            vuelto: montoVal,
            usuario: currentUser.usuario
        });

        // Registrar movimiento simultáneo de EGRESO físico en caja (COMENTADO v6.0: Se confirma manualmente en pestaña Caja con el botón inteligente)
        /*
        if (montoVal > 0) {
            const resCaja = await fetchAPI('registrarMovimientoCaja', {
                tipo: 'EGRESO',
                metodo: 'FISICO',
                concepto: `Vuelto Entregado [LLAVE: ${llave}] - ${repartidor || 'Sin Asignar'}`,
                monto: montoVal,
                pedidoNro: nro,
                repartidor: repartidor || '',
                usuario: currentUser.usuario
            });

            if (!resCaja.success) {
                console.warn("Advertencia: Se guardó el vuelto en el pedido pero falló el registro en la Caja.", resCaja.message);
                Swal.fire('Atención', 'Se guardó en el pedido, pero hubo un error actualizando la Caja: ' + resCaja.message, 'warning');
                loadOrders(); // Recargar pedidos de todas formas
                if (typeof loadCajaData === 'function') loadCajaData();
                return;
            }
        }
        */

        if (resSheet.success || (resSheet.msg && resSheet.msg.includes('exito'))) {
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });
            Toast.fire({
                icon: 'success',
                title: `Vuelto guardado (S/ ${montoVal.toFixed(2)}) y descontado de caja.`
            });

            // Actualizar arreglo local temporal
            const idx = orders.findIndex(o => o.nro == nro);
            if (idx > -1) orders[idx].vuelto = montoVal;

            // Refrescar caja por debajo
            if (typeof loadCajaData === 'function') loadCajaData();
        } else {
            Swal.fire('Error', resSheet.message || 'No se pudo guardar el vuelto', 'error');
            loadOrders(); // Revertir a los valores de la DB original
        }

    } catch (err) {
        Swal.fire('Error', 'Falló la conexión al tratar de guardar el vuelto.', 'error');
        loadOrders();
    }
};

// --- Reports Logic ---

document.getElementById('report-date-filter').addEventListener('change', renderReportsTable);
document.getElementById('btn-print-report').addEventListener('click', () => {
    window.print();
});

function getDayName(dateString) {
    const d = new Date(dateString + 'T12:00:00');
    const dias = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
    return dias[d.getDay()];
}

function renderReportsTable() {
    const reportDate = document.getElementById('report-date-filter').value;
    const tbody = document.getElementById('reports-table-body');
    const title = document.getElementById('print-title');
    tbody.innerHTML = '';

    if (!reportDate) return;

    const parts = reportDate.split('-');
    const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    const dayName = getDayName(reportDate);
    title.textContent = `TADA ATE - VALIDACION DE COBROS [${dayName} ${formattedDate}]`;

    const targetDateObj = new Date(reportDate + 'T12:00:00');
    const filteredForReport = orders.filter(o => {
        if (!o.fecha) return false;
        try {
            const orderDate = new Date(o.fecha);
            return orderDate.getFullYear() === targetDateObj.getFullYear() &&
                orderDate.getMonth() === targetDateObj.getMonth() &&
                orderDate.getDate() === targetDateObj.getDate();
        } catch (e) { return false; }
    });

    if (filteredForReport.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 20px;">No hay reportes para esta fecha</td></tr>';
        return;
    }

    filteredForReport.sort((a, b) => a.nro - b.nro);

    filteredForReport.forEach((order, index) => {
        const correlativeCode = String(index + 1).padStart(2, '0');

        let horaFormat = '-';
        if (order.fecha) {
            try {
                horaFormat = new Date(order.fecha).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: true });
                horaFormat = horaFormat.toLowerCase().replace(' ', '');
            } catch (e) { }
        }

        let tipoDisplay = '-';
        if (order.tipo_pago && String(order.tipo_pago).trim() !== '') {
            tipoDisplay = String(order.tipo_pago).trim().toUpperCase();
        } else if (order.estado === 'Cancelado' || order.estado === 'Rechazado') {
            tipoDisplay = '-';
        }

        let validTick = order.estado === 'Validado' ? '✓' : '';
        if (order.estado === 'Cancelado' || order.estado === 'Rechazado') {
            const motivo = order.motivo_cancelacion || '';
            if (motivo === 'Por consumidor') validTick = 'X Consumidor';
            else if (motivo === 'Por Punto de Venta') validTick = 'X Venta';
            else if (motivo === 'Por Repartidor') validTick = 'X Repartidor';
            else if (motivo) validTick = motivo;
        }

        let vueltoDisplay = '';
        if (tipoDisplay === 'EFECTIVO' && order.vuelto !== '' && order.vuelto !== null && order.vuelto !== undefined) {
            const v = parseFloat(order.vuelto);
            if (!isNaN(v) && v > 0) {
                vueltoDisplay = v.toFixed(2);
            }
        }

        let envioDisplay = order.envio ? order.envio : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${correlativeCode})</td>
            <td>${order.llave}</td>
            <td>${envioDisplay}</td>
            <td>${tipoDisplay}</td>
            <td>${parseFloat(order.monto).toFixed(2)}</td>
            <td>${vueltoDisplay}</td>
            <td>${validTick}</td>
            <td style="font-size: 0.8em; color: var(--text-muted);">${horaFormat}</td>
        `;
        tbody.appendChild(tr);
    });

    // Generar bloque visual del Podio si hay pedidos ese día
    renderPodioMotorizados(filteredForReport);
}

function renderPodioMotorizados(data) {
    const podioContainer = document.getElementById('podio-motorizados');
    const podioGrid = document.getElementById('podio-grid');
    if (!podioContainer || !podioGrid) return;

    // 1. Agrupar data
    const drivers = {};
    data.forEach(o => {
        if (!o.envio || String(o.envio).trim() === '') return;
        const driverName = String(o.envio).trim();

        if (!drivers[driverName]) {
            drivers[driverName] = {
                name: driverName,
                total: 0,
                onTime: 0,
                delayed: 0,
                cancelled: 0,
                monto: 0
            };
        }

        drivers[driverName].total++;
        drivers[driverName].monto += (parseFloat(o.monto) || 0);

        if (o.estado === 'Cancelado' || o.estado === 'Rechazado') {
            drivers[driverName].cancelled++;
            return;
        }

        if (o.estado !== 'Validado') return; // Ignore pendientes here 

        // Evaluar retraso
        let delayed = o.sla_fuera ? true : false;

        if (!delayed && o.tiempo_transcurrido) {
            let mins = 0;
            if (typeof o.tiempo_transcurrido === 'string' && o.tiempo_transcurrido.includes(':') && !o.tiempo_transcurrido.includes('T')) {
                let parts = o.tiempo_transcurrido.split(':');
                let h = parseInt(parts[0] || '0', 10);
                let m = parseInt(parts[1] || '0', 10);
                if (!isNaN(h) && !isNaN(m)) mins = (h * 60) + m;
            } else {
                try {
                    const d = new Date(o.tiempo_transcurrido);
                    if (!isNaN(d.getTime())) {
                        mins = (d.getUTCHours() * 60) + d.getUTCMinutes();
                    }
                } catch (e) { }
            }
            if (mins > 35) delayed = true;
        }

        if (delayed) {
            drivers[driverName].delayed++;
        } else {
            drivers[driverName].onTime++;
        }
    });

    const driverKeys = Object.keys(drivers);
    if (driverKeys.length === 0) {
        podioContainer.style.display = 'none';
        return;
    }

    // Ordenar mejor rendimiento (más a tiempo, menos demoras)
    driverKeys.sort((a, b) => {
        const dA = drivers[a], dB = drivers[b];
        // 1. Mayor cantidad A Tiempo
        if (dB.onTime !== dA.onTime) return dB.onTime - dA.onTime;
        // 2. Menor cantidad Retraso
        if (dA.delayed !== dB.delayed) return dA.delayed - dB.delayed;
        // 3. Monto
        return dB.monto - dA.monto;
    });

    podioGrid.innerHTML = driverKeys.map((k, index) => {
        const d = drivers[k];
        const pct = d.total - d.cancelled > 0 ? Math.round((d.onTime / (d.total - d.cancelled)) * 100) : 0;

        let positionBadge = '';
        if (index === 0) positionBadge = '<i class="fa-solid fa-trophy" style="color: #fbbf24; font-size:1.5em; margin-right:8px;"></i>';
        else if (index === 1) positionBadge = '<i class="fa-solid fa-medal" style="color: #9ca3af; font-size:1.3em; margin-right:8px;"></i>';
        else if (index === 2) positionBadge = '<i class="fa-solid fa-medal" style="color: #b45309; font-size:1.3em; margin-right:8px;"></i>';
        else positionBadge = `<span style="display:inline-block; width:25px; text-align:center; color:rgba(255,255,255,0.3); font-weight:bold; margin-right:8px;">#${index + 1}</span>`;

        // Color gradient depending on efficiency
        let glow = pct >= 90 ? '#4ade80' : (pct >= 70 ? '#fb923c' : '#f87171');

        return `
            <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 15px; position: relative; overflow: hidden;">
                <div style="position: absolute; top:0; left:0; width:4px; height:100%; background: ${glow};"></div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div style="display: flex; align-items: center;">
                        ${positionBadge}
                        <h4 style="margin: 0; font-size: 1.1em; color: white;">${d.name}</h4>
                    </div>
                    <div style="text-align: right; background: rgba(255,255,255,0.1); padding: 4px 8px; border-radius: 6px;">
                        <span style="font-weight: bold; font-size: 1.1em; color: ${glow};">${pct}%</span>
                        <div style="font-size: 0.65em; color: rgba(255,255,255,0.5); text-transform: uppercase;">Efectividad</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9em;">
                    <div style="background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.2); padding: 8px; border-radius: 8px; text-align: center;">
                        <div style="color: #4ade80; font-weight: bold; font-size: 1.2em;">${d.onTime}</div>
                        <div style="color: rgba(255,255,255,0.6); font-size: 0.75em;">A Tiempo</div>
                    </div>
                    <div style="background: rgba(248, 113, 113, 0.1); border: 1px solid rgba(248, 113, 113, 0.2); padding: 8px; border-radius: 8px; text-align: center;">
                        <div style="color: #f87171; font-weight: bold; font-size: 1.2em;">${d.delayed}</div>
                        <div style="color: rgba(255,255,255,0.6); font-size: 0.75em;">Demoras (>35m)</div>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; margin-top: 15px; font-size: 0.8em; color: rgba(255,255,255,0.5); border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 10px;">
                    <div>Entregas: <strong style="color: white;">${d.total - d.cancelled}</strong></div>
                    <div>Cancelados: <strong style="color: #f87171;">${d.cancelled}</strong></div>
                </div>
            </div>
        `;
    }).join('');

    podioContainer.style.display = 'block';
}

// --- Modals & Forms ---

if (newOrderBtn) {
    newOrderBtn.addEventListener('click', () => {
        let maxNro = 0;
        if (orders && orders.length > 0) {
            maxNro = orders.reduce((max, o) => {
                const val = parseInt(o.nro);
                return (!isNaN(val)) ? Math.max(max, val) : max;
            }, 0);
        }

        if (orders.length > 0 && maxNro === 0) {
            maxNro = orders.length;
        }

        document.getElementById('new-nro').value = maxNro + 1;

        const currentCount = currentFilteredOrders ? currentFilteredOrders.length : 0;
        document.getElementById('new-correlative-display').value = `# ${currentCount + 1}`;

        let dateText = '';
        const fmtLocal = (s) => s.split('-').reverse().join('/');

        if (dateRange.start && dateRange.end) {
            dateText = `${fmtLocal(dateRange.start)} - ${fmtLocal(dateRange.end)}`;
        } else {
            const singleDate = document.getElementById('date-filter').value;
            dateText = singleDate ? fmtLocal(singleDate) : 'Todas las fechas';
        }

        const activeTabObj = document.querySelector('.filter-tab.active');
        const statusText = activeTabObj ? activeTabObj.textContent.trim() : 'Todos';

        document.getElementById('active-filter-details').textContent = `(${dateText} | ${statusText})`;

        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        document.getElementById('new-date').value = `${yyyy}-${mm}-${dd}`;

        document.getElementById('new-time').value = '';

        document.getElementById('modal-new-order').classList.add('active');
    });
}

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const swalOpen = typeof Swal !== 'undefined' && Swal.isVisible && Swal.isVisible();
        if (!swalOpen) {
            document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
        }
    }
});

document.getElementById('new-key').addEventListener('input', function () {
    this.value = this.value.toUpperCase();
});

newOrderForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const datePart = document.getElementById('new-date').value;
    const timePart = document.getElementById('new-time').value;

    const data = {
        nro: document.getElementById('new-nro').value,
        fecha: datePart,
        hora: timePart,
        llave: document.getElementById('new-key').value,
        envio: document.getElementById('new-envio').value,
        pago: document.getElementById('new-pago').value,
        monto: document.getElementById('new-amount').value,
        usuario: currentUser.usuario
    };

    const exists = orders.find(o => o.nro == data.nro);
    if (exists && exists.estado !== 'Reservado') {
        Swal.fire('Atención', `El pedido #${data.nro} ya existe.`, 'warning');
        return;
    }

    Swal.showLoading();
    try {
        const res = await fetchAPI('crearPedido', data);
        if (res.success) {
            Swal.fire('Éxito', 'Pedido registrado correctamente', 'success');
            document.getElementById('modal-new-order').classList.remove('active');
            newOrderForm.reset();
            loadOrders();
        } else {
            Swal.fire('Error', res.message, 'error');
        }
    } catch (err) {
        Swal.fire('Error', 'Falló el registro', 'error');
    }
});

// --- Validation & OCR ---

let currentOrderForValidation = null;

function getUniqueDrivers(ordersArray = orders) {
    const drivers = new Set();
    ordersArray.forEach(order => {
        if (order.envio && order.envio.trim() !== '') {
            drivers.add(order.envio.trim());
        }
    });
    return Array.from(drivers).sort();
}

function updateDriverFilterOptions(ordersArray = orders) {
    const driverSelect = document.getElementById('driver-filter');
    if (!driverSelect) return;
    const currentSelection = driverSelect.value;
    const drivers = getUniqueDrivers(ordersArray);

    let options = '<option value="all">Todos los Repartidores</option>';
    drivers.forEach(driver => {
        options += `<option value="${driver}" ${driver === currentSelection ? 'selected' : ''}>${driver}</option>`;
    });

    driverSelect.innerHTML = options;
}

// v24: Poblado dinámico Genérico para filtros de multi-selección
function updateDynamicFiltersGeneric(ordersArray, config) {
    const { statusDropdownId, paymentDropdownId, statusPrefix, paymentPrefix, onFilterChange } = config;
    const statusDropdown = document.getElementById(statusDropdownId);
    const paymentDropdown = document.getElementById(paymentDropdownId);
    if (!statusDropdown || !paymentDropdown) return;

    const getSelected = (dropdown) => Array.from(dropdown.querySelectorAll('input:checked')).map(cb => cb.value);
    const prevSelectedStatus = getSelected(statusDropdown);
    const prevSelectedPayment = getSelected(paymentDropdown);

    const statuses = new Set();
    const payments = new Set();

    ordersArray.forEach(o => {
        if (o.estado) statuses.add(String(o.estado).trim());
        if (o.pago) payments.add(String(o.pago).trim());
    });

    const renderOptions = (items, dropdown, prevSelected, groupClass) => {
        let html = `
            <label class="multi-select-option" style="border-bottom: 1px solid rgba(255,255,255,0.05); margin-bottom: 5px; padding-bottom: 10px;">
                <input type="checkbox" id="${groupClass}-select-all" checked>
                <span style="font-weight: bold; color: white;">(Seleccionar todo)</span>
            </label>
        `;
        
        [...items].sort().forEach(item => {
            const isChecked = prevSelected.length === 0 || prevSelected.includes(item);
            html += `
                <label class="multi-select-option">
                    <input type="checkbox" value="${item}" ${isChecked ? 'checked' : ''} class="${groupClass}">
                    <span>${item}</span>
                </label>
            `;
        });
        dropdown.innerHTML = html;

        const selectAll = dropdown.querySelector(`#${groupClass}-select-all`);
        const groupCbs = dropdown.querySelectorAll(`.${groupClass}`);
        
        selectAll?.addEventListener('change', () => {
            groupCbs.forEach(cb => cb.checked = selectAll.checked);
            onFilterChange();
        });

        groupCbs.forEach(cb => {
            cb.addEventListener('change', () => {
                const allChecked = Array.from(groupCbs).every(c => c.checked);
                if (selectAll) selectAll.checked = allChecked;
                onFilterChange();
            });
        });
    };

    renderOptions(statuses, statusDropdown, prevSelectedStatus, `${statusPrefix}-cb`);
    renderOptions(payments, paymentDropdown, prevSelectedPayment, `${paymentPrefix}-cb`);

    updateMultiSelectLabelGeneric(`${statusPrefix}-cb`, `${statusPrefix}-filter-label`);
    updateMultiSelectLabelGeneric(`${paymentPrefix}-cb`, `${paymentPrefix}-filter-label`);
}

// v24.1: Wrapper para pestaña principal
function updateDynamicFilters(ordersArray = orders) {
    updateDynamicFiltersGeneric(ordersArray, {
        statusDropdownId: 'main-status-filter-dropdown',
        paymentDropdownId: 'main-payment-filter-dropdown',
        statusPrefix: 'main-status',
        paymentPrefix: 'main-payment',
        onFilterChange: applyFilters
    });
}

function updateMultiSelectLabelGeneric(groupClass, labelId) {
    const btnLabel = document.getElementById(labelId);
    const cbs = document.querySelectorAll(`.${groupClass}`);
    if (!btnLabel) return;
    const checked = Array.from(cbs).filter(cb => cb.checked);
    
    const baseName = labelId.includes('status') ? 'Estados' : 'Pagos';
    
    if (checked.length === 0) {
        btnLabel.textContent = `${baseName}: Ninguno`;
    } else if (checked.length === cbs.length) {
        btnLabel.textContent = `${baseName}: Todos`;
    } else {
        btnLabel.textContent = `${baseName}: (${checked.length})`;
    }
}

// (Eliminado updateMultiSelectLabel antiguo, favoreciendo la versión genérica v24.1)

function updateDriversDatalist() {
    const datalist = document.getElementById('drivers-list');
    if (!datalist) return;

    // Si ya cargamos la lista completa del servidor, usar esa como prioridad (v1.21)
    const drivers = (window.allDriversList && window.allDriversList.length > 0)
        ? window.allDriversList
        : getUniqueDrivers();

    datalist.innerHTML = drivers.map(d => `<option value="${d}">`).join('');
}

async function loadAllDrivers() {
    try {
        const res = await fetchAPI('obtenerNombresMotorizados');
        if (res.success && res.data) {
            window.allDriversList = res.data;
            updateDriversDatalist();
            console.log("✅ Lista completa de motorizados cargada:", window.allDriversList.length);

            // Si estamos en la vista de pedidos/cronológico, refrescar para mostrar la lista
            if (typeof applyFilters === 'function') {
                applyFilters();
            }
        }
    } catch (e) {
        console.error("Error al cargar lista de motorizados:", e);
    }
}
// window.loadDriversList() ya se llama al inicio...
window.openValidateModal = (nro) => {
    const order = orders.find(o => o.nro == nro);
    if (!order) return;
    currentOrderForValidation = order; // v4.0 FIX
    bestOCRData = {}; // Reset cada vez que se abre el modal
    const ocrChips = document.getElementById('ocr-info-chips');
    if (ocrChips) ocrChips.innerHTML = '';

    // Poblar datos del encabezado del modal (v1.23 Fix)
    const nroDisplay = document.getElementById('val-nro-display');
    const amountDisplay = document.getElementById('val-amount-display');
    const keyDisplay = document.getElementById('val-key-display');
    
    if (nroDisplay) nroDisplay.textContent = order.nro;
    if (amountDisplay) amountDisplay.textContent = formatMoney(order.monto);
    if (keyDisplay) keyDisplay.textContent = order.llave || '';

    // Poblar Entrega (Y) e Intervalo (Z) (v4.2 Refined)
    const entregaYDisplay = document.getElementById('val-entrega-y-display');
    const tadaZDisplay = document.getElementById('val-tada-z-display');
    
    let timeY = '--';
    if (order.fechaHoraReal) {
        try {
            const d = new Date(order.fechaHoraReal);
            if (!isNaN(d.getTime())) {
                timeY = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase().replace(' ', '');
            } else {
                timeY = String(order.fechaHoraReal).substring(0, 10);
            }
        } catch(e) { timeY = '--'; }
    }
    if (entregaYDisplay) entregaYDisplay.textContent = timeY;
    
    let minZ = '--';
    const mzRaw = String(order.minutosReales || '').trim();
    if (mzRaw && mzRaw !== "---") {
        minZ = `${mzRaw} min`;
    }
    if (tadaZDisplay) tadaZDisplay.textContent = minZ;

    const validatorDisplay = document.getElementById('val-validator-display');
    if (validatorDisplay) {
        const fullVal = (order.validado_por || '').toString();
        const namePart = fullVal.includes(':') ? fullVal.split(':')[0].trim() : fullVal;
        validatorDisplay.textContent = namePart ? `(${namePart})` : '';
    }

    const statusBadge = document.getElementById('val-status-badge');
    if (statusBadge) {
        let text = order.estado;
        let bgStr = 'rgba(255,255,255,0.1)';
        let colorStr = 'white';
        let borderStr = 'rgba(255,255,255,0.2)';

        if (order.estado === 'Validado' || order.estado === 'Validado AG') {
            const findings = (order.hallazgoRobot || '').toUpperCase();
            const isCritical = findings.includes('ALERTA') || findings.includes('DUPLICADO') || findings.includes('ERR:') || findings.includes('NOVALIDADO');

            if (order.validado_por === 'Robot (Auto)' || order.estado === 'Validado AG') {
                text = isCritical ? 'ALERTA ROBOT' : 'VAL. AUTO';
                bgStr = isCritical ? 'rgba(248, 113, 113, 0.2)' : 'rgba(16, 185, 129, 0.25)';
                colorStr = isCritical ? '#F87171' : '#34d399';
                borderStr = isCritical ? 'rgba(248, 113, 113, 0.5)' : 'rgba(16, 185, 129, 0.5)';
            } else {
                bgStr = 'rgba(74, 222, 128, 0.2)';
                colorStr = '#4ADE80';
                borderStr = 'rgba(74, 222, 128, 0.5)';
            }
        } else if (order.estado === 'Cancelado' || order.estado === 'Rechazado') {
            bgStr = 'rgba(248, 113, 113, 0.2)';
            colorStr = '#F87171';
            borderStr = 'rgba(248, 113, 113, 0.5)';
        } else if (order.estado === 'En Camino') {
            bgStr = 'rgba(255, 255, 255, 0.2)';
            colorStr = '#FFFFFF';
            borderStr = 'rgba(255, 255, 255, 0.4)';
        } else if (order.estado === 'Por Validar') {
            bgStr = 'rgba(59, 130, 246, 0.2)';
            colorStr = '#3B82F6';
            borderStr = 'rgba(59, 130, 246, 0.5)';
        } else if (order.estado === 'Pendiente') {
            bgStr = 'rgba(251, 191, 36, 0.2)';
            colorStr = '#FBBF24';
            borderStr = 'rgba(251, 191, 36, 0.5)';
        }

        statusBadge.textContent = text;
        statusBadge.style.background = bgStr;
        statusBadge.style.color = colorStr;
        statusBadge.style.border = `1px solid ${borderStr}`;
    }

    console.log(`[Diagnostic] Abriendo modal para pedido #${order.nro}, estado: ${order.estado}, hallazgoRobot:`, order.hallazgoRobot);

    // --- Lógica para mostrar Hallazgos del Robot (v7.1 Permanent) ---
    const robotContainer = document.getElementById('val-robot-findings-container');
    if (robotContainer) {
        robotContainer.classList.remove('hidden'); // Siempre visible
        const fullVal = (order.validado_por || '').toString();
        const columnZFindings = (order.minutosReales || '').toString();
        const columnAFBox = (order.hallazgoRobot || '').toString();
        
        // Prioridad: 1. Columna AF, 2. Columna Z (si no es num), 3. Texto en H
        let findingMsg = '';
        if (columnAFBox.trim()) {
            findingMsg = columnAFBox;
        } else if (columnZFindings && isNaN(parseFloat(columnZFindings))) {
            findingMsg = columnZFindings;
        } else if (fullVal.includes(':')) {
            findingMsg = fullVal.split(':').slice(1).join(':').trim();
        }

        const isError = findingMsg.toLowerCase().includes('novalidado') || 
                        findingMsg.toLowerCase().includes('err:') || 
                        findingMsg.toLowerCase().includes('duplicado');
        
        // Asignar clase según contenido
        robotContainer.className = `robot-findings-box ${findingMsg ? (isError ? 'error' : 'info') : 'empty'}`;
        
        robotContainer.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
                <strong><i class="fa-solid fa-robot"></i> Hallazgos del Robot</strong>
                ${findingMsg ? `
                <button type="button" class="btn-icon-small" title="Limpiar visualmente" 
                        onclick="document.getElementById('robot-msg-text').innerHTML='<span style-opacity:0.5; font-style:italic;>Hallazgos ignorados (visual).</span>'; this.style.display='none';"
                        style="background:rgba(255,255,255,0.1); border:none; width:24px; height:24px;">
                    <i class="fa-solid fa-eye-slash" style="font-size:0.8em;"></i>
                </button>` : ''}
            </div>
            <div id="robot-msg-text" style="margin-top:5px; font-size: 0.95em;">
                ${findingMsg || '<span style="opacity:0.5; font-style:italic;">No se reportaron hallazgos extra para este pedido.</span>'}
            </div>
        `;
    }

    const extraInfoDiv = document.getElementById('val-extra-info');
    extraInfoDiv.innerHTML = '';
    const chipStyle = 'display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:20px; font-size:0.78em; font-weight:600; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.85);';

    if (order.idCompras) {
        extraInfoDiv.innerHTML += `<span style="${chipStyle} background:rgba(59,130,246,0.15); border-color:rgba(59,130,246,0.3); color:#60a5fa;" title="ID Compras del Voucher"><i class="fa-solid fa-receipt"></i> ID: ${order.idCompras}</span>`;
    }

    if (order.envio) {
        extraInfoDiv.innerHTML += `<span style="${chipStyle}"><i class="fa-solid fa-motorcycle" style="color:#60a5fa;"></i> ${order.envio}</span>`;
    }
    if (order.fecha) {
        let horaChip = '-';
        try {
            horaChip = new Date(order.fecha).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: true });
        } catch (e) { }
        extraInfoDiv.innerHTML += `<span style="${chipStyle}"><i class="fa-solid fa-clock" style="color:#a78bfa;"></i> ${horaChip}</span>`;
    }
    if (order.pago) {
        extraInfoDiv.innerHTML += `<span style="${chipStyle}" title="Pago Original Ingresado"><i class="fa-solid fa-credit-card" style="color:#4ade80;"></i> Orig: ${order.pago}</span>`;
    }
    if (order.lat && order.lat !== 0) {
        const mapUrl = `https://www.google.com/maps?q=${order.lat},${order.lng}`;
        extraInfoDiv.innerHTML += `<a href="${mapUrl}" target="_blank" style="${chipStyle}; text-decoration:none; cursor:pointer;" title="Ver en Google Maps">
            <i class="fa-solid fa-location-dot" style="color:#ef4444;"></i> GPS: ${Math.round(order.accuracy || 0)}m
        </a>`;
    }

    photoInput.value = '';
    currentZoom = 1;
    currentRotation = 0;
    translateX = 0;
    translateY = 0;
    updatePhotoTransform(false);

    photoPreview.classList.add('hidden');
    uploadPlaceholder.classList.remove('hidden');
    document.getElementById('photo-actions').classList.add('hidden');
    
    // (Se limpia el monto al inicio y se decide si precargar al final de la función)
    valPhotoAmountInput.value = ''; 


    const vueltoInput = document.getElementById('val-vuelto-amount');
    const recibidoInput = document.getElementById('val-monto-recibido');
    if (vueltoInput) vueltoInput.value = '';
    if (recibidoInput) recibidoInput.value = '';

    const ocrChipsContainer = document.getElementById('ocr-info-chips');
    if (ocrChipsContainer) {
        ocrChipsContainer.innerHTML = '';
        ocrChipsContainer.style.display = 'none';
    }

    updateDriversDatalist();
    document.getElementById('val-driver-name').value = order.envio || '';

    const valFechaEntrega = document.getElementById('val-fecha-entrega');
    const valHoraEntrega = document.getElementById('val-hora-entrega');

    // --- PRIORIDAD OBLIGATORIA: 1. Extracción Robot (AB), 2. Manual (P) ---
    // Usamos ?.toString() para manejar nulos y trim() para ignorar celdas con solo espacios
    const robotFecha = (order.fechaPos || '').toString().trim();
    const manualFecha = (order.fecha_entrega || '').toString().trim();
    const rawFecha = robotFecha || manualFecha;

    console.log(`[Diagnostic] Modal #${order.nro} | RobotFecha: "${robotFecha}", ManualFecha: "${manualFecha}"`);

    if (rawFecha) {
        if (rawFecha.includes('/') && rawFecha.split('/').length === 3) {
            let partes = rawFecha.split('/');
            if (partes[2].length === 2) partes[2] = '20' + partes[2];
            valFechaEntrega.value = partes.join('/');
        } else {
            const d = new Date(rawFecha);
            if (!isNaN(d.getTime())) {
                const fmt = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'America/Lima',
                    year: 'numeric', month: '2-digit', day: '2-digit'
                });
                const parts = fmt.formatToParts(d);
                const getP = (type) => parts.find(p => p.type === type).value;
                valFechaEntrega.value = `${getP('day')}/${getP('month')}/${getP('year')}`;
            } else {
                valFechaEntrega.value = rawFecha;
            }
        }
    } else {
        valFechaEntrega.value = '';
    }

    const robotHora = (order.horaPos || '').toString().trim();
    const manualHora = (order.hora_entrega || '').toString().trim();
    const rawHora = robotHora || manualHora;

    if (rawHora) {
        if (rawHora.includes('T')) {
            let dT = new Date(rawHora);
            if (!isNaN(dT.getTime())) {
                dT.setUTCFullYear(2000); 
                const fmtD = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'America/Lima',
                    hour: 'numeric', minute: 'numeric',
                    hour12: false
                });
                const pD = fmtD.formatToParts(dT);
                const getPD = (type) => pD.find(p => p.type === type).value;
                let tH = getPD('hour');
                if (tH === '24') tH = '00';
                valHoraEntrega.value = `${tH.padStart(2, '0')}:${getPD('minute').padStart(2, '0')}`;
            } else {
                valHoraEntrega.value = rawHora;
            }
        } else if (rawHora.includes(':')) {
            const parts = rawHora.split(':');
            const hh = parts[0].padStart(2, '0');
            const mm = parts[1].padStart(2, '0');
            valHoraEntrega.value = `${hh}:${mm}`;
        } else {
            valHoraEntrega.value = rawHora;
        }
    } else {
        valHoraEntrega.value = '';
    }
    calculateLiveElapsedTime();

    document.querySelectorAll('input[name="valType"]').forEach(r => r.checked = false);
    updateValidationMode(null);

    const cleanUrl = extractPhotoUrl(order.foto);

    // Si aún no hay tipoPago validado, intentar inferirlo del pago original (order.pago)
    let tipoPago = (order.tipo_pago || '').toString().trim().toUpperCase();
    if (!tipoPago && order.pago) {
        const pStr = order.pago.toUpperCase();
        if (pStr.includes('CONTADO')) {
            tipoPago = 'EFECTIVO';
        } else if (pStr.includes('TARJETA DE CRÉDITO') || pStr.includes('TARJETA DE CREDITO') || pStr.includes('QR') || pStr.includes('YAPE') || pStr.includes('PLIN')) {
            if (pStr.includes('LINEA') || pStr.includes('LÍNEA')) {
                tipoPago = 'ONLINE';
            } else if (pStr.includes('QR') || pStr.includes('YAPE') || pStr.includes('PLIN')) {
                tipoPago = 'QR';
            } else {
                tipoPago = 'TARJETA';
            }
        }
    }

    if (tipoPago === 'EFECTIVO') {
        document.querySelector('input[name="valType"][value="efectivo"]').checked = true;
        updateValidationMode('efectivo');
        if (order.vuelto !== '' && order.vuelto !== null && order.vuelto !== undefined) {
            document.getElementById('val-vuelto-amount').value = parseFloat(order.vuelto) || '';
        }
        document.getElementById('val-monto-recibido').value = '';
        updateSugeridoRedondo();
    } else if (tipoPago === 'ONLINE') {
        document.querySelector('input[name="valType"][value="online"]').checked = true;
        updateValidationMode('online');
    } else if (tipoPago === 'QR') {
        document.querySelector('input[name="valType"][value="pos"]').checked = true;
        setPosType('QR');
        updateValidationMode('pos');
    } else if (tipoPago === 'TARJETA') {
        document.querySelector('input[name="valType"][value="pos"]').checked = true;
        setPosType('TARJETA');
        updateValidationMode('pos');
    } else if (tipoPago === 'POS') {
        document.querySelector('input[name="valType"][value="pos"]').checked = true;
        setPosType('TARJETA');
        updateValidationMode('pos');
    } else if (order.foto) {
        if (order.foto.includes('EFECTIVO')) {
            document.querySelector('input[name="valType"][value="efectivo"]').checked = true;
            updateValidationMode('efectivo');
            const match = order.foto.match(/VUELTO:\s*([\d.]+)/i);
            if (match) document.getElementById('val-vuelto-amount').value = match[1];
        } else if (order.foto.includes('ONLINE')) {
            document.querySelector('input[name="valType"][value="online"]').checked = true;
            updateValidationMode('online');
        } else if (order.foto.includes('QR')) {
            document.querySelector('input[name="valType"][value="pos"]').checked = true;
            setPosType('QR');
            updateValidationMode('pos');
        } else if (order.foto.includes('TARJETA')) {
            document.querySelector('input[name="valType"][value="pos"]').checked = true;
            setPosType('TARJETA');
            updateValidationMode('pos');
        }
    }

    if (cleanUrl && (order.estado === 'Validado' || order.estado === 'Validado AG' || order.estado === 'Por Validar')) {
        photoPreview.setAttribute('data-nro', order.nro); // Para el fallback onerror
        photoPreview.src = getDirectPhotoUrl(order.foto);
        photoPreview.classList.remove('hidden');
        uploadPlaceholder.classList.add('hidden');
        document.getElementById('photo-actions').classList.remove('hidden');
        document.getElementById('view-full-photo').href = extractPhotoUrl(order.foto);
    }

    // --- PRE-POBLACIÓN DE MONTO (v8.0: Solo para pedidos YA VALIDADOS) ---
    // Según requerimiento: Solo si es Validado o Validado AG se precarga el monto extraído.
    // Para 'Por Validar', 'En camino' o 'Pendiente' el campo DEBE estar vacío (lo limpiamos al inicio).
    if ((order.estado === 'Validado' || order.estado === 'Validado AG') && 
        (tipoPago === 'POS' || tipoPago === 'QR' || tipoPago === 'TARJETA')) {
        if (order.monto_foto && parseFloat(order.monto_foto) > 0) {
            valPhotoAmountInput.value = parseFloat(order.monto_foto).toFixed(2);
            validateAmounts(); // Actualizar indicadores visuales
        }

        showOcrInfoChips({
            fecha: order.fecha_entrega || '',
            hora: order.hora_entrega || '',
            tipoPago: tipoPago === 'QR' || (order.foto && order.foto.includes('QR')) ? 'QR' : 'TARJETA'
        });
    }

    updateValidationUI(order.monto_foto, order.monto);

    const saveBtn = document.getElementById('btn-save-validation');
    const dropZone = document.getElementById('photo-drop-zone');

    if (currentUser.rol !== 'Admin') {
        saveBtn.style.display = 'none';
        dropZone.style.pointerEvents = 'none';
        dropZone.style.opacity = '0.7';
        valPhotoAmountInput.disabled = true;
        document.querySelectorAll('input[name="valType"]').forEach(r => r.disabled = true);
        document.getElementById('val-driver-name').disabled = true;
        valFechaEntrega.disabled = true;
        valHoraEntrega.disabled = true;

        const title = document.querySelector('#modal-validate h3');
        if (!document.getElementById('readonly-badge')) {
            const badge = document.createElement('span');
            badge.id = 'readonly-badge';
            badge.className = 'badge';
            badge.style.background = '#94a3b8';
            badge.style.color = 'white';
            badge.textContent = 'Solo Lectura';
            badge.style.fontSize = '0.6em';
            badge.style.verticalAlign = 'middle';
            badge.style.marginLeft = '10px';
            title.appendChild(badge);
        }

        const removeBtn = document.getElementById('remove-photo-btn');
        if (removeBtn) removeBtn.style.display = 'none';
    } else {
        saveBtn.style.display = 'block';
        valPhotoAmountInput.disabled = false;
        document.querySelectorAll('input[name="valType"]').forEach(r => r.disabled = false);
        document.getElementById('val-driver-name').disabled = false;
        valFechaEntrega.disabled = false;
        valHoraEntrega.disabled = false;

        const isTypeSelected = document.querySelector('input[name="valType"]:checked');
        if (isTypeSelected) {
            dropZone.style.pointerEvents = 'auto';
            dropZone.style.opacity = '1';
            photoInput.disabled = false;
        } else {
            dropZone.style.pointerEvents = 'none';
            dropZone.style.opacity = '0.5';
            photoInput.disabled = true;
        }

        const badge = document.getElementById('readonly-badge');
        if (badge) badge.remove();

        const removeBtn = document.getElementById('remove-photo-btn');
        if (removeBtn) removeBtn.style.display = 'inline-block';
    }

    // Calcular tiempo y validar UI inicialmente (v4.0 Corazón APP)
    calculateLiveElapsedTime();

    document.getElementById('modal-validate').classList.add('active');
};

// --- NAVEGACIÓN SECUENCIAL EN MODAL DE VALIDACIÓN ---
function navigateValidationModal(direction) {
    if (!currentOrderForValidation) return;
    const currentNro = currentOrderForValidation.nro;
    
    // Obtener todas las filas actualmente visibles en la tabla principal respectando los filtros
    const visibleRows = Array.from(document.getElementById('orders-table-body').querySelectorAll('tr'));
    if (visibleRows.length === 0) return;

    let currentIndex = visibleRows.findIndex(tr => tr.getAttribute('data-nro') == currentNro);
    
    if (currentIndex === -1) {
        // Fallback si no está en la tabla (ej. abierto desde mapa), navegar el arreglo global
        currentIndex = orders.findIndex(o => o.nro == currentNro);
        if (currentIndex === -1) return;
        
        let nextIndex = currentIndex + direction;
        if (nextIndex >= 0 && nextIndex < orders.length) {
            window.openValidateModal(orders[nextIndex].nro);
        }
        return;
    }

    let nextIndex = currentIndex + direction;
    // Evitar desbordamiento
    if (nextIndex < 0) nextIndex = visibleRows.length - 1; // Ciclar al final (opcional) o bloquear
    if (nextIndex >= visibleRows.length) nextIndex = 0;    // Ciclar al inicio (opcional) o bloquear
    
    // Si prefieres bloquear en los extremos en lugar de ciclar, descomenta estas dos:
    if (nextIndex < 0 || nextIndex >= visibleRows.length) return; 

    const nextNro = visibleRows[nextIndex].getAttribute('data-nro');
    if (nextNro) {
        window.openValidateModal(nextNro);
    }
}

const btnValPrev = document.getElementById('btn-val-prev');
const btnValNext = document.getElementById('btn-val-next');
if(btnValPrev) btnValPrev.addEventListener('click', () => navigateValidationModal(-1));
if(btnValNext) btnValNext.addEventListener('click', () => navigateValidationModal(1));

// Atajos de teclado para la navegación
document.addEventListener('keydown', (e) => {
    const modalValidate = document.getElementById('modal-validate');
    if (!modalValidate || !modalValidate.classList.contains('active')) return;
    
    // Evitar si está escribiendo en un input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateValidationModal(1);
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateValidationModal(-1);
    }
});

const valVueltoAmount = document.getElementById('val-vuelto-amount');
const valMontoRecibido = document.getElementById('val-monto-recibido');
const valTypeRadios = document.querySelectorAll('input[name="valType"]');

if (valVueltoAmount) {
    valVueltoAmount.addEventListener('input', () => {
        updateSugeridoRedondo();
        validateAmounts(); // v4.0
    });
}

if (valMontoRecibido) {
    valMontoRecibido.addEventListener('input', () => {
        validateAmounts(); // v4.0
    });
}

function updateSugeridoRedondo() {
    if (!currentOrderForValidation) return;
    const montoPedido = parseFloat(currentOrderForValidation.monto) || 0;
    const montoVuelto = parseFloat(document.getElementById('val-vuelto-amount')?.value) || 0;
    const sugerido = montoPedido + montoVuelto;

    const display = document.getElementById('val-sugerido-redondo');
    if (display) {
        display.textContent = sugerido > 0 ? 'S/ ' + sugerido.toFixed(2) : '--';
    }
}

valTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        updateValidationMode(e.target.value);
        if (e.target.value === 'efectivo') {
            updateSugeridoRedondo();
        }
        validateAmounts(); // Actualizar UI al cambiar tipo (v4.0)
    });
});

function calculateLiveElapsedTime() {
    if (!currentOrderForValidation || !currentOrderForValidation.fecha) return;

    const fechaEntrega = document.getElementById('val-fecha-entrega').value;
    const horaEntrega = document.getElementById('val-hora-entrega').value;
    const display = document.getElementById('val-tiempo-transcurrido');

    if (!fechaEntrega || !horaEntrega) {
        display.textContent = '--';
        display.style.color = 'var(--accent)';
        return;
    }

    try {
        const dateParts = fechaEntrega.split('/');
        if (dateParts.length !== 3 || dateParts[2].length !== 4) {
            display.textContent = '--';
            return;
        }

        const [d, m, y] = dateParts;

        // Convertimos la hora digitada en partes
        const hParts = horaEntrega.split(':');
        const hh = parseInt(hParts[0] || '0', 10);
        const mm = parseInt(hParts[1] || '0', 10);

        // Creamos un UTC map absoluto representando el 'reloj' de entrega (ignoramos la TZ de la laptop)
        const entregaMs = Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), hh, mm, 0);

        // Para la fecha de registro, forzamos extraer las partes del reloj según la hora en Perú
        const dRegistro = new Date(currentOrderForValidation.fecha);
        let registroMs = dRegistro.getTime();

        if (isNaN(registroMs)) {
            display.textContent = '--';
            return;
        }

        // Extraer partes en America/Lima para unificar todas las computadoras
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Lima',
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric',
            hour12: false
        });
        const parts = formatter.formatToParts(dRegistro);
        const getP = (type) => parseInt(parts.find(p => p.type === type).value, 10);

        let rH = getP('hour');
        if (rH === 24) rH = 0; // Algunas implementaciones de Intl devuelven 24 en vez de 0

        registroMs = Date.UTC(getP('year'), getP('month') - 1, getP('day'), rH, getP('minute'), 0);

        const diffMs = entregaMs - registroMs;
        const diffMin = Math.round(diffMs / 60000);

        if (diffMin >= 0) {
            display.textContent = diffMin + (diffMin === 1 ? ' minuto' : ' minutos');
            display.setAttribute('data-min', diffMin);
            display.style.color = '#60a5fa';
        } else {
            display.textContent = 'Error: Entrega < Pedido';
            display.removeAttribute('data-min');
            display.style.color = '#f87171';
        }
        
        // Disparar validación de UI para chequear fechas/montos (v4.0 Corazón APP)
        validateAmounts();
    } catch (e) {
        display.textContent = '--';
    }
}

document.getElementById('val-fecha-entrega')?.addEventListener('input', calculateLiveElapsedTime);
document.getElementById('val-hora-entrega')?.addEventListener('input', calculateLiveElapsedTime);
document.getElementById('val-fecha-entrega')?.addEventListener('change', calculateLiveElapsedTime);
document.getElementById('val-hora-entrega')?.addEventListener('change', calculateLiveElapsedTime);

document.getElementById('modal-validate')?.addEventListener('click', (e) => {
    if (!e.target.closest('input')) {
        calculateLiveElapsedTime();
    }
});

function updateValidationMode(mode) {
    const photoColumn = document.querySelector('.photo-column');
    const ocrBtn = document.getElementById('ocr-trigger-btn');
    const helperParams = document.getElementById('ocr-helper-text');

    if (mode === 'efectivo' || mode === 'online') {
        const dateInput = document.getElementById('val-fecha-entrega');
        if (!dateInput.value) {
            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            dateInput.value = `${day}/${month}/${year}`;
        }
    }

    const posOptions = document.getElementById('pos-options');
    const efectivoOptions = document.getElementById('efectivo-options');
    const onlineOptions = document.getElementById('online-options');

    posOptions.style.display = 'none';
    efectivoOptions.style.display = 'none';
    onlineOptions.style.display = 'none';

    const dropZone = document.getElementById('photo-drop-zone');
    if (!mode) {
        ocrBtn.style.display = 'none';
        helperParams.textContent = 'Selecciona un Tipo de Validación (POS/Online/Efectivo) primero.';
        if (currentUser && currentUser.rol === 'Admin') {
            dropZone.style.pointerEvents = 'none';
            dropZone.style.opacity = '0.5';
            photoInput.disabled = true;
        }
        return;
    } else if (currentUser && currentUser.rol === 'Admin') {
        dropZone.style.pointerEvents = 'auto';
        dropZone.style.opacity = '1';
        photoInput.disabled = false;
    }

    if (mode === 'pos') {
        posOptions.style.display = 'block';
        ocrBtn.style.display = 'inline-block';
        helperParams.textContent = 'Sube la foto del voucher POS para leer monto.';
    } else if (mode === 'efectivo') {
        efectivoOptions.style.display = 'block';
        ocrBtn.style.display = 'none';
        helperParams.textContent = 'Sube una foto del billete/monedas (Obligatorio). Ingrese monto manualmente.';
    } else if (mode === 'online') {
        onlineOptions.style.display = 'block';
        ocrBtn.style.display = 'none';
        helperParams.textContent = 'Sube captura de pantalla de la transferencia (Obligatorio). Ingrese monto manualmente.';
    }

    if (mode !== 'pos') {
        if (!valPhotoAmountInput.value && currentOrderForValidation) {
            valPhotoAmountInput.value = parseFloat(currentOrderForValidation.monto).toFixed(2);
            validateAmounts();
        }
        const ocrChipsContainer = document.getElementById('ocr-info-chips');
        if (ocrChipsContainer) ocrChipsContainer.style.display = 'none';
    } else {
        const ocrChipsContainer = document.getElementById('ocr-info-chips');
        if (ocrChipsContainer && ocrChipsContainer.innerHTML !== '') ocrChipsContainer.style.display = 'flex';
    }
}

photoPreview.addEventListener('click', (e) => {
    if (photoPreview.dataset.wasDragged === 'true') {
        photoPreview.dataset.wasDragged = 'false';
        return;
    }

    if (photoPreview.src && !photoPreview.classList.contains('hidden')) {
        window.open(photoPreview.src, '_blank');
    }
});

const dropZone = document.getElementById('photo-drop-zone');

photoInput.addEventListener('click', () => {
    photoInput.value = '';
});

photoInput.addEventListener('change', handleFileSelect);

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; });
dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--glass-border)'; });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--glass-border)';
    if (e.dataTransfer.files.length) {
        photoInput.files = e.dataTransfer.files;
        handleFileSelect();
    }
});

document.addEventListener('paste', (e) => {
    // 1. Caso: Modal de Validación estándar
    const validateModal = document.getElementById('modal-validate');
    const isValidateActive = validateModal && validateModal.classList.contains('active');

    // 2. Caso: Modal de Cancelación (SweetAlert)
    const swalTitle = Swal.isVisible() ? Swal.getTitle()?.innerText : '';
    const isCancelActive = swalTitle && swalTitle.includes('Evidencia del Repartidor');

    if (!isValidateActive && !isCancelActive) return;
    if (currentUser && currentUser.rol !== 'Admin') return;

    // Solo validamos valType para el modal de validación estándar
    if (isValidateActive) {
        const valType = document.querySelector('input[name="valType"]:checked');
        if (!valType) {
            Swal.fire({
                toast: true, position: 'top-end', icon: 'warning',
                title: 'Seleccione un tipo (POS, Online, Efectivo) primero',
                showConfirmButton: false, timer: 3000
            });
            return;
        }
    }

    const tagName = e.target.tagName.toUpperCase();
    if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
        if (e.target.type === 'text' || e.target.type === 'number') return;
    }

    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    let imageFile = null;

    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.indexOf('image/') === 0) {
            imageFile = item.getAsFile();
            break;
        }
    }

    if (imageFile) {
        e.preventDefault();
        
        if (isValidateActive) {
            const dt = new DataTransfer();
            dt.items.add(imageFile);
            photoInput.files = dt.files;
            handleFileSelect();
        } 
        else if (isCancelActive) {
            // Manejo especial para el SweetAlert de cancelación
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64Content = event.target.result.split(',')[1];
                window.lastPastedEvidence = {
                    data: base64Content,
                    type: imageFile.type,
                    name: `evidencia_pegada_${Date.now()}.jpg`
                };

                // Actualizar la UI del Swal de forma dinámica
                const container = Swal.getHtmlContainer();
                const photoArea = container?.querySelector('div[style*="border:2px dashed"], div[style*="border:2px solid"]');
                if (photoArea) {
                    photoArea.innerHTML = `
                        <img src="${event.target.result}" style="max-height:350px; max-width:100%; border-radius:12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                        <div style="margin-top:8px; font-size:0.8em; color:#22c55e; font-weight:600;">
                            <i class="fa-solid fa-paste"></i> Evidencia pegada correctamente
                        </div>
                    `;
                    photoArea.style.border = '2px solid #22c55e';
                    photoArea.style.background = '#f0fdf4';
                    photoArea.style.padding = '8px';
                }

                // Habilitar y resaltar botón de confirmar
                const confirmBtn = Swal.getConfirmButton();
                if (confirmBtn) {
                    confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Cancelación';
                    confirmBtn.style.background = '#d33';
                }
            };
            reader.readAsDataURL(imageFile);
        }
    }
});

let currentZoom = 1;
let currentRotation = 0;
let isDragging = false;
let dragMoveThreshold = 5;
let startX, startY;
let initialMouseX, initialMouseY;
let translateX = 0;
let translateY = 0;

function updatePhotoTransform(smooth = true) {
    photoPreview.style.transition = smooth ? 'transform 0.2s ease-out' : 'none';
    photoPreview.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentZoom}) rotate(${currentRotation}deg)`;
}

// Enable mouse wheel scroll to zoom
photoPreview.addEventListener('wheel', (e) => {
    // Si estamos en zoom 1x y el usuario hace scroll hacia abajo, dejamos que la página baje
    if (currentZoom === 1 && e.deltaY > 0) {
        return;
    }

    e.preventDefault();
    const zoomIntensity = 0.15;
    if (e.deltaY < 0) {
        currentZoom = Math.min(currentZoom + zoomIntensity, 5); // Zoom In max 5x
    } else {
        currentZoom = Math.max(currentZoom - zoomIntensity, 1);  // Zoom Out min 1x
        // Auto center when returning to 1x zoom
        if (currentZoom === 1) {
            translateX = 0;
            translateY = 0;
        }
    }

    // Cambiar cursor según zoom
    if (currentZoom > 1) {
        photoPreview.classList.add('zoomed');
    } else {
        photoPreview.classList.remove('zoomed');
    }

    updatePhotoTransform(false); // disable smooth css transition for responsive mouse wheel
});

photoPreview.addEventListener('mousedown', (e) => {
    if (currentZoom > 1) {
        isDragging = true;
        photoPreview.dataset.wasDragged = 'false';
        initialMouseX = e.clientX;
        initialMouseY = e.clientY;

        photoPreview.classList.add('grabbing');
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
        e.preventDefault();
    }
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;

    const dist = Math.sqrt(Math.pow(e.clientX - initialMouseX, 2) + Math.pow(e.clientY - initialMouseY, 2));
    if (dist > dragMoveThreshold) {
        photoPreview.dataset.wasDragged = 'true';
    }

    updatePhotoTransform(false);
});

window.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        photoPreview.classList.remove('grabbing');
    }
});

document.getElementById('rotate-photo-btn')?.addEventListener('click', () => {
    currentRotation = (currentRotation + 90) % 360;
    updatePhotoTransform(true);
});

document.getElementById('ocr-trigger-btn')?.addEventListener('click', async () => {
    const file = photoInput.files[0];
    if (file) {
        runOCR(file, currentRotation);
    } else if (photoPreview.src && !photoPreview.classList.contains('hidden')) {
        // Nueva lógica: Si la foto ya está previsualizada (viene del servidor)
        try {
            Swal.fire({ title: 'Descargando imagen...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
            const res = await fetchAPI('getPhotoBase64', { nro: currentOrderForValidation.nro });
            Swal.close();

            if (res.success) {
                // Convertir base64 a un objeto File-like para runOCR
                const byteString = atob(res.base64);
                const ab = new ArrayBuffer(byteString.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                const blob = new Blob([ab], { type: res.mimeType });
                const virtualFile = new File([blob], "voucher.jpg", { type: res.mimeType });

                runOCR(virtualFile, currentRotation);
            } else {
                Swal.fire('Error', 'No se pudo obtener la imagen del servidor: ' + res.message, 'error');
            }
        } catch (err) {
            Swal.fire('Error', 'Error al conectar con el servidor.', 'error');
        }
    } else {
        Swal.fire('Info', 'Sube una foto primero para poder escanearla.', 'info');
    }
});

photoPreview.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    let newZoom = currentZoom + delta;

    if (newZoom < 1) {
        newZoom = 1;
        translateX = 0;
        translateY = 0;
    }
    if (newZoom > 3) newZoom = 3;

    if (newZoom !== currentZoom) {
        currentZoom = newZoom;
        updatePhotoTransform(true);
    }
}, { passive: false });

async function handleFileSelect() {
    const file = photoInput.files[0];
    if (!file) return;

    if (!file.type.match('image.*')) {
        Swal.fire('Error', 'Solo se permiten archivos de imagen (JPG, PNG)', 'error');
        return;
    }

    const blobUrl = URL.createObjectURL(file);
    photoPreview.src = blobUrl;
    photoPreview.classList.remove('hidden');
    currentZoom = 1;
    currentRotation = 0;
    translateX = 0;
    translateY = 0;
    updatePhotoTransform(false);

    uploadPlaceholder.classList.add('hidden');
    document.getElementById('photo-actions').classList.remove('hidden');

    const dropZone = document.getElementById('photo-drop-zone');
    photoPreview.onload = () => {
        setTimeout(() => {
            dropZone.scrollTo({
                top: dropZone.scrollHeight,
                behavior: 'smooth'
            });
        }, 500);
    };

    document.getElementById('view-full-photo').href = blobUrl;

    const valType = document.querySelector('input[name="valType"]:checked')?.value;
    if (valType === 'pos' || valType === 'online') {
        runOCR(file, currentRotation);
    } else {
        valPhotoAmountInput.placeholder = '0.00';
    }
}

function getRotatedBase64(file, rotation) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                if (rotation % 180 === 0) {
                    canvas.width = img.width;
                    canvas.height = img.height;
                } else {
                    canvas.width = img.height;
                    canvas.height = img.width;
                }

                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.drawImage(img, -img.width / 2, -img.height / 2);

                resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

document.getElementById('remove-photo-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    photoInput.click();
});

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function parseIziPayVoucherData(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    let fecha = '';
    let hora = '';
    let monto = 0;
    let tipoPago = 'TARJETA';

    const fechaPatterns = [
        /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/,
        /(\d{2,4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/,
        /\b(\d{1,2})\s+de\s+([a-zA-Z]+)\s+de\s+(\d{4})\b/i,
        /\b(\d{1,2})\s+([a-zA-Z]{3,})[.\/]?\s+(\d{4})\b/i
    ];

    for (let line of lines) {
        for (let pattern of fechaPatterns) {
            const match = line.match(pattern);
            if (match) {
                fecha = match[0];
                break;
            }
        }
        if (fecha) break;
    }

    const horaPattern = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;
    for (let line of lines) {
        const match = line.match(horaPattern);
        if (match) {
            const nums = line.match(/\d+/g);
            if (nums && nums.length <= 3) {
                hora = match[0];
                break;
            }
        }
    }

    const montoPatterns = [
        /S\/?\s*[.\s]*([\d,]+\.?\d{0,2})/i,
        /Total\s*:?\s*S\/?\s*[.\s]*([\d,]+\.?\d{0,2})/i,
        /Monto\s*:?\s*S\/?\s*[.\s]*([\d,]+\.?\d{0,2})/i,
        /([\d,]+\.\d{2})\s*(?:PEN|S\/\.?|SOLES)/i,
        /(?:PEN|S\/\.?|SOLES)\s*([\d,]+\.?\d{0,2})/i
    ];

    for (let line of lines) {
        for (let pattern of montoPatterns) {
            const match = line.match(pattern);
            if (match) {
                let valor = match[1] || match[0];
                valor = valor.replace(/[^\d.,]/g, '').replace(',', '.');
                if (parseFloat(valor) > 0) {
                    monto = parseFloat(valor);
                    break; // Pasa al siguiente renglón una vez que encuentra un monto válido en este.
                }
            }
        }
        // Eliminado: if (monto > 0) break; para que lea hasta el final y atrape el ÚLTIMO monto.
    }

    const textLower = text.toLowerCase();
    if (textLower.includes('qr')) {
        tipoPago = 'QR';
    } else {
        tipoPago = 'TARJETA';
    }

    return { amount: monto, fecha, hora, tipoPago };
}

function processVoucherTimes(extractedFecha, extractedHora) {
    const fechaInput = document.getElementById('val-fecha-entrega');
    const horaInput = document.getElementById('val-hora-entrega');
    const elapsedEl = document.getElementById('val-tiempo-transcurrido');

    // 1. NORMALIZAR LA FECHA (Convertir DD/MM/YY o "26 feb. 2026" a DD/MM/YYYY)
    let fechaNormalizada = extractedFecha || '';
    if (fechaNormalizada) {
        // Chequear si contiene letras (es decir, viene en formato texto como "26 feb. 2026")
        if (/[a-zA-Z]/.test(fechaNormalizada)) {
            const meses = {
                'ene': '01', 'enero': '01',
                'feb': '02', 'febrero': '02',
                'mar': '03', 'marzo': '03',
                'abr': '04', 'abril': '04',
                'may': '05', 'mayo': '05',
                'jun': '06', 'junio': '06',
                'jul': '07', 'julio': '07',
                'ago': '08', 'agosto': '08',
                'sep': '09', 'set': '09', 'septiembre': '09', 'setiembre': '09',
                'oct': '10', 'octubre': '10',
                'nov': '11', 'noviembre': '11',
                'dic': '12', 'diciembre': '12'
            };

            // Extraer el número del día, la palabra del mes, y el año. (acepta puntos o barras como "feb/" o "feb.")
            const textMatch = fechaNormalizada.match(/(\d{1,2})\s+(?:de\s+)?([a-zA-Z]+)[.\/]?\s+(?:de\s+)?(\d{4})/i);

            if (textMatch) {
                const dia = textMatch[1].padStart(2, '0');
                const mesStr = textMatch[2].toLowerCase().substring(0, 3); // Tomar las 3 primeras letras para buscar
                const mes = meses[mesStr] || '01'; // Fallback a 01 si no encuentra
                const anio = textMatch[3];
                fechaNormalizada = `${dia}/${mes}/${anio}`;
            }
        } else {
            // Reemplazar guiones o puntos por barras en caso de que el OCR lea 23-02-26 numérico
            fechaNormalizada = fechaNormalizada.replace(/[\-\.]/g, '/');
            const partes = fechaNormalizada.split('/');

            if (partes.length >= 3) {
                let dia = partes[0].padStart(2, '0');
                let mes = partes[1].padStart(2, '0');
                let anio = partes[2];

                // Si el año tiene 2 dígitos (ej. "26"), convertir a 4 dígitos ("2026")
                if (anio.length === 2) {
                    anio = '20' + anio;
                }

                fechaNormalizada = `${dia}/${mes}/${anio}`;
            }
        }
    }

    // Asignar al input la fecha ya corregida
    fechaInput.value = fechaNormalizada;

    if (extractedHora) {
        const hm = extractedHora.split(':');
        if (hm.length >= 2) {
            horaInput.value = `${hm[0].padStart(2, '0')}:${hm[1].padStart(2, '0')}`;
        } else {
            horaInput.value = extractedHora;
        }
    } else {
        horaInput.value = '';
    }

    if (!currentOrderForValidation.fecha) return;

    try {
        const orderDateStr = new Date(currentOrderForValidation.fecha).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

        // Comparamos usando la fecha normalizada
        if (fechaNormalizada && orderDateStr !== fechaNormalizada) {
            Swal.fire({
                title: 'Atención con la Fecha',
                html: `La fecha del voucher (<b>${fechaNormalizada}</b>) no parece coincidir con la fecha original del pedido (<b>${orderDateStr}</b>). Por favor revise la imagen.`,
                icon: 'warning'
            });
        }
    } catch (e) { }

    if (extractedHora && currentOrderForValidation.fecha) {
        try {
            const hParts = extractedHora.split(':');
            const hh = parseInt(hParts[0] || '0', 10);
            const mm = parseInt(hParts[1] || '0', 10);

            // Fetch dates and build UTC points like in calculateLiveElapsedTime
            const dRegistro = new Date(currentOrderForValidation.fecha);

            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Lima',
                year: 'numeric', month: 'numeric', day: 'numeric',
                hour: 'numeric', minute: 'numeric', second: 'numeric',
                hour12: false
            });
            const parts = formatter.formatToParts(dRegistro);
            const getP = (type) => parseInt(parts.find(p => p.type === type).value, 10);

            let rH = getP('hour');
            if (rH === 24) rH = 0;

            let registroMs = Date.UTC(getP('year'), getP('month') - 1, getP('day'), rH, getP('minute'), 0);
            let entregaMs = Date.UTC(getP('year'), getP('month') - 1, getP('day'), hh, mm, 0);

            const diffMs = entregaMs - registroMs;
            if (diffMs > 0) {
                const diffMins = Math.round(diffMs / 60000); // Uso round igual que calculateLiveElapsedTime
                const h = Math.floor(diffMins / 60);
                const m = diffMins % 60;
                elapsedEl.textContent = h > 0 ? `${h}h ${m}m` : `${m} min`;
                elapsedEl.setAttribute('data-min', diffMins);
                elapsedEl.style.color = '#60a5fa';
            } else {
                elapsedEl.textContent = 'Hora anterior al pedido';
                elapsedEl.removeAttribute('data-min');
                elapsedEl.style.color = '#f87171';
            }
        } catch (e) {
            elapsedEl.textContent = '--';
            elapsedEl.removeAttribute('data-min');
        }
    }
}

async function runOCR(file, rotation = 0) {
    ocrOverlay.classList.remove('hidden');
    valPhotoAmountInput.value = '';
    valPhotoAmountInput.placeholder = 'Escaneando...';
    document.getElementById('val-fecha-entrega').value = '';
    document.getElementById('val-hora-entrega').value = '';
    document.getElementById('val-tiempo-transcurrido').textContent = '--';

    bestOCRData = { amount: 0, fecha: '', hora: '', tipoPago: 'TARJETA', esOnlineValido: false };
    let engine = '';
    const valType = document.querySelector('input[name="valType"]:checked')?.value;

    try {
        // 1. INTELIGENCIA GEMINI (Backend) - PRIORIDAD MÁXIMA (Igual que el Robot)
        if (API_URL) {
            try {
                const base64 = rotation === 0 ? await fileToBase64(file) : await getRotatedBase64(file, rotation);
                const response = await fetchAPI('processVoucherOCR', {
                    imageBase64: base64,
                    mimeType: file.type || 'image/jpeg'
                });

                if (response.success && response.data) {
                    const d = response.data;
                    bestOCRData = {
                        amount: parseFloat(d.total) || 0,
                        fecha: d.fecha || '',
                        hora: d.hora || '',
                        tipoPago: d.tipoPago || 'TARJETA',
                        esOnlineValido: !!d.esOnlineValido,
                        // NUEVO v6.1: Almacenar toda la metadata inteligente
                        idOperacion: d.idOperacion || '',
                        fechaPOS: d.fecha || '',
                        horaPOS: d.hora || '',
                        idCompras: d.idCompras || '',
                        esDuplicado: !!d.esDuplicado,
                        hallazgo: d.hallazgo || ''
                    };
                    engine = `Gemini (${d.model || 'AI'})`;
                }
            } catch (geminiErr) {
                console.warn('[OCR] Gemini backend error:', geminiErr.message);
            }
        }

        // 2. GOOGLE CLOUD VISION (Directo) - SEGUNDO RESPALDO (Menos inteligente)
        if (bestOCRData.amount <= 0 && (valType === 'pos' || valType === 'online')) {
            let apiKey = localStorage.getItem('gcp_api_key');
            if (apiKey) {
                try {
                    engine = 'Google Cloud Vision';
                    const base64 = rotation === 0 ? await fileToBase64(file) : await getRotatedBase64(file, rotation);
                    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            requests: [{
                                image: { content: base64 },
                                features: [
                                    { type: 'TEXT_DETECTION' },
                                    { type: 'DOCUMENT_TEXT_DETECTION' }
                                ]
                            }]
                        })
                    });

                    const data = await response.json();
                    if (!data.error) {
                        const textAnnotations = data.responses[0]?.textAnnotations;
                        if (textAnnotations && textAnnotations.length > 0) {
                            const fullText = textAnnotations[0].description.toLowerCase();
                            const parsed = parseIziPayVoucherData(textAnnotations[0].description);
                            bestOCRData = {
                                amount: parsed.amount || 0,
                                fecha: parsed.fecha || '',
                                hora: parsed.hora || '',
                                tipoPago: parsed.tipoPago || 'TARJETA',
                                esOnlineValido: fullText.includes('débito en línea') || fullText.includes('debito en linea'),
                                fechaPOS: parsed.fecha || '',
                                horaPOS: parsed.hora || ''
                            };
                        }
                    }
                } catch (cvErr) {
                    console.error('[OCR] Cloud Vision error:', cvErr);
                }
            }
        }

        // 3. TESSERACT.JS (Local) - ÚLTIMO RECURSO
        if (bestOCRData.amount <= 0 && (valType === 'pos' || valType === 'online')) {
            engine = 'Tesseract';
            function mergeData(passData) {
                if (passData.amount > 0 && bestOCRData.amount === 0) bestOCRData.amount = passData.amount;
                if (passData.fecha && !bestOCRData.fecha) {
                    bestOCRData.fecha = passData.fecha;
                    bestOCRData.fechaPOS = passData.fecha;
                }
                if (passData.hora && !bestOCRData.hora) {
                    bestOCRData.hora = passData.hora;
                    bestOCRData.horaPOS = passData.hora;
                }
                if (passData.tipoPago === 'QR') bestOCRData.tipoPago = 'QR';
            }

            const processedImage = await preprocessImage(file);
            mergeData(await ocrPass(processedImage, { tessedit_char_whitelist: '0123456789SsTtOoAaLl/., :', tessedit_pageseg_mode: '6' }, 'Pass 1'));
            if (bestOCRData.amount <= 0 || !bestOCRData.fecha || !bestOCRData.hora) {
                mergeData(await ocrPass(processedImage, { tessedit_pageseg_mode: '3' }, 'Pass 2'));
            }
        }

        if (bestOCRData.amount > 0) {
            valPhotoAmountInput.value = bestOCRData.amount.toFixed(2);
            itemDetected(bestOCRData.amount);
            processVoucherTimes(bestOCRData.fecha, bestOCRData.hora);

            if (valType === 'pos') {
                setPosType(bestOCRData.tipoPago);
            }

            showOcrInfoChips(bestOCRData);

            // Warning for ONLINE voucher if text is missing
            if (valType === 'online' && !bestOCRData.esOnlineValido) {
                Swal.fire({
                    title: 'Verificación ONLINE Fallida',
                    html: `El comprobante no contiene el texto exacto <b>"Tarjeta de crédito o débito en línea"</b>.<br>Por favor, compruebe que sea el comprobante correcto.`,
                    icon: 'warning'
                });
            } else {
                const Toast = Swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 4000,
                    timerProgressBar: true,
                });
                let detailParts = [`S/ ${bestOCRData.amount.toFixed(2)}`];
                if (bestOCRData.fecha) detailParts.push(`📅 ${bestOCRData.fecha}`);
                if (bestOCRData.hora) detailParts.push(`🕐 ${bestOCRData.hora}`);
                if (valType === 'online') {
                    detailParts.push('🌐 ONLINE Verificado');
                } else {
                    detailParts.push(bestOCRData.tipoPago === 'QR' ? '📱 QR' : '💳 Tarjeta');
                }
                if (bestOCRData.idTransaccion) detailParts.push(`🆔 ID: ${bestOCRData.idTransaccion}`); // NEW

                Toast.fire({
                    icon: 'success',
                    title: `${engine}: ${detailParts.join(' | ')}`
                });
            }
        } else {
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
            });
            Toast.fire({
                icon: 'info',
                title: 'No se detectó el monto. Ingrese manual.'
            });
            valPhotoAmountInput.placeholder = '0.00';
            valPhotoAmountInput.focus();
        }
    } catch (err) {
        console.error('OCR Error:', err);
        Swal.fire('Error OCR', 'No se pudo leer la imagen.', 'error');
    }

    ocrOverlay.classList.add('hidden');
    validateAmounts();
}


function showOcrInfoChips(data) {
    let container = document.getElementById('ocr-info-chips');
    if (!container) {
        container = document.createElement('div');
        container.id = 'ocr-info-chips';
        container.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; justify-content:center;';
        const photoActions = document.getElementById('photo-actions');
        if (photoActions) photoActions.parentNode.insertBefore(container, photoActions.nextSibling);
    }
    container.innerHTML = '';

    const chipStyle = 'display:inline-flex; align-items:center; gap:4px; padding:4px 10px; border-radius:16px; font-size:0.75em; font-weight:600; border:1px solid rgba(255,255,255,0.15);';

    if (data.fecha) {
        container.innerHTML += `<span style="${chipStyle} background:rgba(96,165,250,0.15); color:#60a5fa;"><i class="fa-solid fa-calendar"></i> ${data.fecha}</span>`;
    }
    if (data.hora) {
        container.innerHTML += `<span style="${chipStyle} background:rgba(167,139,250,0.15); color:#a78bfa;"><i class="fa-solid fa-clock"></i> ${data.hora}</span>`;
    }
    container.innerHTML += `<span style="${chipStyle} background:rgba(74,222,128,0.15); color:#4ade80;"><i class="fa-solid fa-${data.tipoPago === 'QR' ? 'qrcode' : 'credit-card'}"></i> ${data.tipoPago}</span>`;

    if (data.idOperacion) {
        container.innerHTML += `<span style="${chipStyle} background:rgba(251,191,36,0.15); color:#fbbf24;"><i class="fa-solid fa-hashtag"></i> Op: ${data.idOperacion}</span>`;
    }
    if (data.idCompras) {
        container.innerHTML += `<span style="${chipStyle} background:rgba(244,114,182,0.15); color:#f472b6;"><i class="fa-solid fa-receipt"></i> ID: ${data.idCompras}</span>`;
    }
    if (data.esDuplicado) {
        container.innerHTML += `<span style="${chipStyle} background:rgba(239,68,68,0.15); color:#ef4444;"><i class="fa-solid fa-copy"></i> DUPLICADO</span>`;
    }
}

async function ocrPass(image, params, label) {
    try {
        const worker = await Tesseract.createWorker();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        await worker.setParameters(params);

        const ret = await worker.recognize(image);
        await worker.terminate();

        const data = extractVoucherData(ret.data.text);
        return data;
    } catch (err) {
        console.warn(`[${label}] Failed:`, err.message);
        return { amount: 0, fecha: '', hora: '', tipoPago: 'TARJETA', idTransaccion: '' };
    }
}

function preprocessImage(file) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const sourceY = Math.floor(img.height * 0.40);
            const sourceEndY = Math.floor(img.height * 0.85);
            const sourceHeight = sourceEndY - sourceY;

            const scale = 3;
            canvas.width = img.width * scale;
            canvas.height = sourceHeight * scale;

            ctx.drawImage(img, 0, sourceY, img.width, sourceHeight, 0, 0, canvas.width, canvas.height);

            let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            let data = imageData.data;
            const grayValues = [];

            for (let i = 0; i < data.length; i += 4) {
                const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
                grayValues.push(gray);
            }
            ctx.putImageData(imageData, 0, 0);

            const threshold = otsuThreshold(grayValues);

            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            data = imageData.data;

            let darkPixels = 0;
            for (let i = 0; i < data.length; i += 4) {
                const val = data[i] > threshold ? 255 : 0;
                data[i] = val;
                data[i + 1] = val;
                data[i + 2] = val;
                if (val === 0) darkPixels++;
            }

            const totalPixels = data.length / 4;
            if (darkPixels > totalPixels * 0.6) {
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = 255 - data[i];
                    data[i + 1] = 255 - data[i + 1];
                    data[i + 2] = 255 - data[i + 2];
                }
            }

            ctx.putImageData(imageData, 0, 0);
            sharppenCanvas(canvas, ctx);
            resolve(canvas.toDataURL('image/png'));
        };
    });
}

function otsuThreshold(grayValues) {
    const histogram = new Array(256).fill(0);
    grayValues.forEach(v => histogram[Math.min(255, Math.max(0, v))]++);

    const total = grayValues.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];

    let sumB = 0, wB = 0, wF = 0;
    let maxVariance = 0, bestThreshold = 128;

    for (let t = 0; t < 256; t++) {
        wB += histogram[t];
        if (wB === 0) continue;
        wF = total - wB;
        if (wF === 0) break;

        sumB += t * histogram[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const variance = wB * wF * (mB - mF) * (mB - mF);

        if (variance > maxVariance) {
            maxVariance = variance;
            bestThreshold = t;
        }
    }
    return bestThreshold;
}

function sharppenCanvas(canvas, ctx) {
    const w = canvas.width, h = canvas.height;
    const src = ctx.getImageData(0, 0, w, h);
    const dst = ctx.createImageData(w, h);
    const sd = src.data, dd = dst.data;

    const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            for (let c = 0; c < 3; c++) {
                let val = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * w + (x + kx)) * 4 + c;
                        val += sd[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
                    }
                }
                const idx = (y * w + x) * 4 + c;
                dd[idx] = Math.min(255, Math.max(0, val));
            }
            dd[(y * w + x) * 4 + 3] = 255;
        }
    }
    ctx.putImageData(dst, 0, 0);
}

function extractVoucherData(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const fullText = lines.join(' ');

    let fecha = '';
    const fechaPattern = /[Ff]echa:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/;
    const fechaMatch = fullText.match(fechaPattern);
    if (fechaMatch) {
        fecha = fechaMatch[1].replace(/-/g, '/');
    }

    let hora = '';
    const horaPattern = /[Hh]ora:?\s*(\d{1,2}[:.]\d{2})/;
    const horaMatch = fullText.match(horaPattern);
    if (horaMatch) {
        hora = horaMatch[1].replace('.', ':');
    }

    let tipoPago = 'TARJETA';
    if (/\bQR\b/i.test(fullText) || /realizada\s+con\s+QR/i.test(fullText)) {
        tipoPago = 'QR';
    }
    if (/[Bb]illetera:?\s*(Yape|Plin|BBVA)/i.test(fullText)) {
        tipoPago = 'QR';
    }


    let amount = 0;

    const sPattern = /[Ss]\/?\.\?\s*(\d{1,3}(?:[,.]?\d{3})*[.,]\d{2})/;
    for (const line of lines) {
        const match = line.match(sPattern);
        if (match) {
            const val = parseMoneyString(match[1]);
            if (val > 0 && val < 50000) {
                amount = val;
                break;
            }
        }
    }

    if (amount === 0) {
        const totalPattern = /[Tt][o0][Tt]?[aAeE]?[lLiI1]/i;
        for (let i = 0; i < lines.length; i++) {
            if (totalPattern.test(lines[i])) {
                for (let j = i; j < Math.min(i + 3, lines.length); j++) {
                    const numMatch = lines[j].match(/(\d{1,3}(?:[,.]?\d{3})*[.,]\d{2})/);
                    if (numMatch) {
                        const val = parseMoneyString(numMatch[1]);
                        if (val > 0 && val < 50000) {
                            amount = val;
                            break;
                        }
                    }
                }
                if (amount > 0) break;
            }
        }
    }

    if (amount === 0) {
        const candidates = [];
        for (let i = 0; i < lines.length; i++) {
            const allMatches = lines[i].matchAll(/(\d{1,3}(?:[,.]?\d{3})*[.,]\d{2})/g);
            for (const m of allMatches) {
                const val = parseMoneyString(m[1]);
                if (val > 0 && val < 50000) {
                    candidates.push({ amount: val, lineIndex: i, lineTotal: lines.length });
                }
            }
        }
        if (candidates.length > 0) {
            candidates.sort((a, b) => {
                const scoreA = a.lineIndex / a.lineTotal + (a.amount > 10 ? 0.1 : 0);
                const scoreB = b.lineIndex / b.lineTotal + (b.amount > 10 ? 0.1 : 0);
                return scoreB - scoreA;
            });
            amount = candidates[0].amount;
        }
    }

    return { amount, fecha, hora, tipoPago };
}

function extractAmountFromText(text) {
    return extractVoucherData(text).amount;
}

function parseMoneyString(str) {
    if (!str) return 0;

    const dots = (str.match(/\./g) || []).length;
    const commas = (str.match(/,/g) || []).length;

    let cleaned = str;

    if (dots === 1 && commas === 0) {
        // already fine
    } else if (dots === 0 && commas === 1) {
        cleaned = str.replace(',', '.');
    } else if (dots > 0 && commas > 0) {
        const lastDot = str.lastIndexOf('.');
        const lastComma = str.lastIndexOf(',');
        if (lastDot > lastComma) {
            cleaned = str.replace(/,/g, '');
        } else {
            cleaned = str.replace(/\./g, '').replace(',', '.');
        }
    } else if (dots > 1) {
        const parts = str.split('.');
        const decimal = parts.pop();
        cleaned = parts.join('') + '.' + decimal;
    } else if (commas > 1) {
        const parts = str.split(',');
        const decimal = parts.pop();
        cleaned = parts.join('') + '.' + decimal;
    }

    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
}

valPhotoAmountInput.addEventListener('input', validateAmounts);

function validateAmounts() {
    const entered = parseFloat(valPhotoAmountInput.value) || 0;
    const registered = parseFloat(currentOrderForValidation.monto) || 0;
    updateValidationUI(entered, registered);
}

function updateValidationUI(photoAmount, registeredAmount) {
    const saveBtn = document.getElementById('btn-save-validation');
    const saveNextBtn = document.getElementById('btn-save-next');
    
    if (!currentOrderForValidation) return; // Seguridad v4.0
    
    // 1. Validar Fecha (PUNTO CRÍTICO)
    const fechaEntrega = document.getElementById('val-fecha-entrega').value;
    let dateMismatch = false;
    
    if (fechaEntrega && currentOrderForValidation.fecha) {
        const dEntrega = fechaEntrega.split('/'); // DD/MM/YYYY
        const dRegistroOrig = new Date(currentOrderForValidation.fecha);
        
        // Extraer DD/MM/YYYY de la fecha original en America/Lima
        const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Lima' }); // en-GB da DD/MM/YYYY
        const parts = fmt.formatToParts(dRegistroOrig);
        const getP = (type) => parts.find(p => p.type === type).value;
        
        const dayReg = getP('day').padStart(2, '0');
        const monthReg = getP('month').padStart(2, '0');
        const yearReg = getP('year');
        
        if (dEntrega[0] !== dayReg || dEntrega[1] !== monthReg || dEntrega[2] !== yearReg) {
            dateMismatch = true;
        }
    }

    if (dateMismatch) {
        validationStatusBox.className = 'validation-status-box invalid';
        document.getElementById('status-icon').className = 'fa-solid fa-calendar-times';
        document.getElementById('status-text').textContent = 'FECHA DIFIERE: BLOQUEADO';
        if (saveBtn) saveBtn.disabled = true;
        if (saveNextBtn) saveNextBtn.disabled = true;
        return;
    }

    if (!photoAmount) {
        validationStatusBox.className = 'validation-status-box';
        document.getElementById('status-icon').className = 'fa-solid fa-circle-question';
        document.getElementById('status-text').textContent = 'Pendiente de Validar';
        if (saveBtn) saveBtn.disabled = false;
        if (saveNextBtn) saveNextBtn.disabled = false;
        return;
    }

    // 3. Validar Flujo de Caja (Solo Efectivo v4.0)
    const valTypeRadio = document.querySelector('input[name="valType"]:checked');
    if (valTypeRadio && valTypeRadio.value === 'efectivo') {
        const montoPedido = registeredAmount;
        const montoVuelto = parseFloat(document.getElementById('val-vuelto-amount')?.value) || 0;
        const sugerido = montoPedido + montoVuelto;
        const recibido = parseFloat(document.getElementById('val-monto-recibido')?.value) || 0;
        
        const diffRecibido = Math.abs(recibido - sugerido);
        if (diffRecibido >= 0.001) {
            validationStatusBox.className = 'validation-status-box invalid';
            document.getElementById('status-icon').className = 'fa-solid fa-hand-holding-dollar';
            document.getElementById('status-text').textContent = 'RECIBIDO NO COINCIDE';
            if (saveBtn) saveBtn.disabled = true;
            if (saveNextBtn) saveNextBtn.disabled = true;
            return;
        }
    }

    // 2. Validar Monto (Exactitud Decimal Exacta v4.0)
    const diff = Math.abs(photoAmount - registeredAmount);
    if (diff < 0.001) { // Exacto
        validationStatusBox.className = 'validation-status-box valid';
        document.getElementById('status-icon').className = 'fa-solid fa-circle-check';
        document.getElementById('status-text').textContent = 'Monto Coincide: VALIDADO';
        if (saveBtn) saveBtn.disabled = false;
        if (saveNextBtn) saveNextBtn.disabled = false;
    } else {
        validationStatusBox.className = 'validation-status-box invalid';
        document.getElementById('status-icon').className = 'fa-solid fa-triangle-exclamation';
        document.getElementById('status-text').textContent = 'Monto Difiere: RECHAZAR';
        if (saveBtn) saveBtn.disabled = true; // Bloquear si no coincide
        if (saveNextBtn) saveNextBtn.disabled = true;
    }
}

function itemDetected(amount) {
    const registered = parseFloat(currentOrderForValidation.monto);
    if (Math.abs(amount - registered) > 0.5) {
        // Optional noise if mismatch
    }
}

// Save Validation
validateForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const valTypeRadio = document.querySelector('input[name="valType"]:checked');
    if (!valTypeRadio) {
        Swal.fire('Error', 'Debe seleccionar un Tipo de Pago (POS, Online o Efectivo).', 'warning');
        return;
    }
    const valType = valTypeRadio.value;
    const file = photoInput.files[0];
    let fileData = null;

    if (!file && !currentOrderForValidation.foto) {
        Swal.fire('Error', 'Debe subir una foto o captura de pantalla como evidencia.', 'warning');
        return;
    }

    if (file) {
        fileData = await toBase64(file);
    }

    const driverName = (document.getElementById('val-driver-name').value || '').trim();
    if (!driverName) {
        Swal.fire('Error', 'Debes consignar el nombre del Driver antes de validar.', 'warning');
        return;
    }

    // --- NUEVA VALIDACIÓN ESTRICTA DE FECHA Y HORA ---
    const fechaEntregaInput = document.getElementById('val-fecha-entrega').value;
    const horaEntregaInput = document.getElementById('val-hora-entrega').value;

    if (!fechaEntregaInput || !horaEntregaInput) {
        Swal.fire('Error', 'La Fecha y Hora de entrega son obligatorias.', 'warning');
        return;
    }

    try {
        const orderDateStr = new Date(currentOrderForValidation.fecha).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

        if (fechaEntregaInput !== orderDateStr && fechaEntregaInput !== orderDateStr.replace(/-/g, '/')) {
            Swal.fire('Fecha Inválida', `La fecha de entrega (${fechaEntregaInput}) debe ser exactamente igual a la fecha de creación del pedido (${orderDateStr}).`, 'error');
            return;
        }

        const dateParts = fechaEntregaInput.split('/');
        const [d, m, y] = dateParts;
        const isoEntrega = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${horaEntregaInput}:00`;
        const dateEntrega = new Date(isoEntrega);
        const dateRegistro = new Date(currentOrderForValidation.fecha);

        if (dateEntrega < dateRegistro) {
            const horaRegistroStr = dateRegistro.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
            Swal.fire('Hora Inválida', `La hora de entrega (${horaEntregaInput}) no puede ser anterior a la hora en que se registró el pedido (${horaRegistroStr}).`, 'error');
            return;
        }
    } catch (err) {
        Swal.fire('Error', 'Formato de fecha u hora incorrecto.', 'error');
        return;
    }
    // --- FIN NUEVA VALIDACIÓN ---


    const startUpload = async () => {
        Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });

        const montoFoto = parseFloat(valPhotoAmountInput.value);

        let tipoFinal = 'FOTO';
        if (valType === 'pos') {
            const posType = document.getElementById('val-pos-type').value;
            tipoFinal = posType;
        } else if (valType === 'online') {
            tipoFinal = 'ONLINE';
        } else if (valType === 'efectivo') {
            tipoFinal = 'EFECTIVO';
        }

        // Convert data-min to HH:MM:00
        const tiempoMins = parseInt(document.getElementById('val-tiempo-transcurrido').getAttribute('data-min'), 10);
        let timeFormatted = '';
        if (!isNaN(tiempoMins) && tiempoMins >= 0) {
            const h = String(Math.floor(tiempoMins / 60)).padStart(2, '0');
            const m = String(tiempoMins % 60).padStart(2, '0');
            timeFormatted = `${h}:${m}:00`;
        }

        const payload = {
            nro: currentOrderForValidation.nro,
            montoFoto: montoFoto,
            usuario: currentUser.usuario,
            tipo: tipoFinal,
            vuelto: (valType === 'efectivo') ? document.getElementById('val-vuelto-amount').value : '',
            montoRecibido: (valType === 'efectivo') ? document.getElementById('val-monto-recibido').value : '',
            envio: driverName,
            fechaEntrega: document.getElementById('val-fecha-entrega').value || '',
            horaEntrega: document.getElementById('val-hora-entrega').value || '',
            tiempoTranscurrido: timeFormatted,
            // NUEVO v6.1: Pasar inteligencia total al Backend (Columnas AA-AF)
            idOperacion: bestOCRData.idOperacion || '',
            fechaPOS: bestOCRData.fechaPOS || '',
            horaPOS: bestOCRData.horaPOS || '',
            idCompras: bestOCRData.idCompras || '',
            esDuplicado: bestOCRData.esDuplicado || false,
            hallazgo: bestOCRData.hallazgo || '',
            archivo: fileData ? {
                name: `pedido_${currentOrderForValidation.nro}_${Date.now()}.jpg`,
                type: file ? file.type : 'image/jpeg',
                data: fileData
            } : null
        };

        try {
            const res = await fetchAPI('validarPedido', payload);
            if (res.success) {
                Swal.close();
                const btnAutoNext = document.getElementById('val-auto-next');
                const shouldGoNext = btnAutoNext && btnAutoNext.checked;

                if (shouldGoNext && typeof currentFilteredOrders !== 'undefined') {
                    // Try to find the next order in the filtered list
                    const currentIndex = currentFilteredOrders.findIndex(o => o.nro == currentOrderForValidation.nro);
                    let nextOrder = null;
                    if (currentIndex !== -1) {
                        // Marcar como validado localmente para que no se repita en la búsqueda actual
                        currentFilteredOrders[currentIndex].estado = 'Validado';

                        for (let i = currentIndex + 1; i < currentFilteredOrders.length; i++) {
                            nextOrder = currentFilteredOrders[i];
                            break;
                        }
                    }
                    // Loop around eliminado a petición del usuario para que termine al llegar al final del barrido

                    if (nextOrder) {
                        Swal.fire({
                            toast: true, position: 'top-end', icon: 'success',
                            title: `Validado #${currentOrderForValidation.nro}`,
                            showConfirmButton: false, timer: 1500
                        });
                        // Recargar la data general y actualizar las vistas pasivamente en 2do plano
                        fetchAPI('obtenerPedidos', { adminScope: true, limit: 300 }).then(r => {
                            if (r.success) {
                                orders = r.data || [];
                                updateStats();
                                applyFilters();
                                if (typeof window.refreshDashboardIfVisible === 'function') window.refreshDashboardIfVisible();
                            }
                        });
                        // Abrir el siguiente de inmediato
                        window.openValidateModal(nextOrder.nro);
                    } else {
                        document.getElementById('modal-validate').classList.remove('active');
                        Swal.fire('¡Felicidades!', 'Ya no hay más pedidos por validar en la lista actual.', 'success');
                        loadOrders();
                    }
                } else {
                    document.getElementById('modal-validate').classList.remove('active');
                    loadOrders();
                }
            } else {
                Swal.fire('Error', res.message, 'error');
            }
        } catch (err) {
            Swal.fire('Error', 'Falló la conexión', 'error');
        }
    };

    startUpload();
});

// Listener for the new "Aprobar y Siguiente" button and Ctrl+Enter Hotkey
document.getElementById('btn-save-next')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('val-auto-next').checked = true;
    validateForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
});

document.getElementById('modal-validate')?.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('val-auto-next').checked = true;
        validateForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
});

// --- Utilities ---

function setPosType(tipo) {
    document.getElementById('val-pos-type').value = tipo;
    const btnTarjeta = document.getElementById('btn-pos-tarjeta');
    const btnQR = document.getElementById('btn-pos-qr');
    if (!btnTarjeta || !btnQR) return;
    if (tipo === 'TARJETA') {
        Object.assign(btnTarjeta.style, { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' });
        Object.assign(btnQR.style, { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.2)' });
    } else {
        Object.assign(btnQR.style, { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' });
        Object.assign(btnTarjeta.style, { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.2)' });
    }
}

async function fetchAPI(action, data = {}) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action, ...data })
    });
    return await response.json();
}

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = error => reject(error);
});

function setLoading(active) {
    document.getElementById('login-loading').style.display = active ? 'flex' : 'none';
}

function extractPhotoUrl(fotoStr) {
    if (!fotoStr || typeof fotoStr !== 'string') return '';
    let s = fotoStr.trim();
    if (s.startsWith('PAGO-') || s === '') return '';

    // Obtener solo el primer segmento (URL)
    let url = s.split(/\s+/)[0];

    // Si contiene un ID de Drive, devolvemos el link oficial para mayor estabilidad en clics
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch) {
        return `https://drive.google.com/uc?id=${idMatch[1]}&export=view`;
    }

    if (url.length >= 20 && url.length <= 60 && !url.includes('/') && !url.includes('.')) {
        return `https://drive.google.com/uc?id=${url}&export=view`;
    }

    return url;
}

// NUEVA FUNCION: Obtener URL directa para <img> con fallback
function getDirectPhotoUrl(fotoStr) {
    if (!fotoStr || typeof fotoStr !== 'string') return '';
    let s = fotoStr.trim();
    let url = s.split(/\s+/)[0];
    let id = '';

    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch) id = idMatch[1];
    else if (url.length >= 20 && url.length <= 60 && !url.includes('/') && !url.includes('.')) id = url;

    if (id) {
        // Opción 1: lh3 (Rápido pero propenso a 429)
        return `https://lh3.googleusercontent.com/d/${id}`;
    }
    return url;
}

// MANEJADOR DE ERRORES DE CARGA (Para bypass de 429)
async function handleImageError(img) {
    const src = img.src;
    const nro = img.getAttribute('data-nro');

    if (src.includes('lh3.googleusercontent.com')) {
        // Fallback 1: Probar con uc?id (Google Direct Download)
        const id = src.split('/').pop();
        console.warn("lh3 falló (posible 429). Probando fallback uc?id...");
        img.src = `https://drive.google.com/uc?id=${id}`;
    }
    else if (src.includes('drive.google.com/uc') && nro) {
        // Fallback 2: El "Ultimo Recurso" - Pedir Base64 al servidor (Bypassea todo)
        console.warn("uc?id falló. Iniciando descarga desde servidor...");
        try {
            const res = await fetchAPI('getPhotoBase64', { nro: nro });
            if (res.success) {
                img.src = `data:${res.mimeType};base64,${res.base64}`;
                console.log("Imagen cargada exitosamente via Servidor (Base64)");
            } else {
                console.error("Fallo total al cargar imagen:", res.message);
            }
        } catch (e) {
            console.error("Error en fallback de servidor:", e);
        }
    }
}

function formatMoney(amount) {
    return parseFloat(amount).toFixed(2);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';

    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);

        const datePart = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timePart = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });

        return `<div>${datePart}</div><div style="font-size:0.75em; color:rgba(255,255,255,0.6);">${timePart}</div>`;
    } catch (e) {
        return String(dateStr);
    }
}

function updateStats(data = orders) {
    let totalCount = 0, totalAmount = 0;
    let validCount = 0, validAmount = 0;
    let pendingCount = 0, pendingAmount = 0;
    let rejectedCount = 0, rejectedAmount = 0;

    let porValidarCount = 0, porValidarAmount = 0;
    let enCaminoCount = 0, enCaminoAmount = 0;

    data.forEach(o => {
        if (o.estado === 'Reservado') return;

        const monto = parseFloat(o.monto) || 0;

        totalCount++;
        totalAmount += monto;

        if (o.estado === 'Validado' || o.estado === 'Validado AG') {
            validCount++;
            validAmount += monto;
        } else if (o.estado === 'Pendiente') {
            pendingCount++;
            pendingAmount += monto;
        } else if (o.estado === 'En Camino') {
            enCaminoCount++;
            enCaminoAmount += monto;
        } else if (o.estado === 'Por Validar') {
            porValidarCount++;
            porValidarAmount += monto;
        } else if (o.estado === 'Cancelado' || o.estado === 'Rechazado') {
            rejectedCount++;
            rejectedAmount += monto;
        }
    });

    document.getElementById('stat-total-amount').textContent = `S/ ${formatMoney(totalAmount)}`;
    document.getElementById('stat-total-count').textContent = `${totalCount} pedidos`;

    document.getElementById('stat-pending-amount').textContent = `S/ ${formatMoney(pendingAmount)}`;
    document.getElementById('stat-pending-count').textContent = `${pendingCount} pedidos`;

    const ecAmountEl = document.getElementById('stat-encamino-amount');
    const ecCountEl = document.getElementById('stat-encamino-count');
    if (ecAmountEl) ecAmountEl.textContent = `S/ ${formatMoney(enCaminoAmount)}`;
    if (ecCountEl) ecCountEl.textContent = `${enCaminoCount} pedidos`;

    document.getElementById('stat-validated-amount').textContent = `S/ ${formatMoney(validAmount)}`;
    document.getElementById('stat-validated-count').textContent = `${validCount} pedidos`;

    document.getElementById('stat-rejected-amount').textContent = `S/ ${formatMoney(rejectedAmount)}`;
    document.getElementById('stat-rejected-count').textContent = `${rejectedCount} pedidos`;

    const pvAmountEl = document.getElementById('stat-porvalidar-amount');
    const pvCountEl = document.getElementById('stat-porvalidar-count');
    if (pvAmountEl) pvAmountEl.textContent = `S/ ${formatMoney(porValidarAmount)}`;
    if (pvCountEl) pvCountEl.textContent = `${porValidarCount} pedidos`;
}

function applyFilters() {
    const term = searchInput.value.toLowerCase();
    const filterDate = document.getElementById('date-filter').value;
    const hasRange = dateRange.start && dateRange.end;

    // (Lógica de Detalle v22 eliminada para favorecer multi-selección v24 de Estado y Pago)

    // 1. Primer paso: Filtrar solo por Estado y Fecha para determinar los repartidores disponibles (v18.1)
    const contextOrders = orders.filter(o => {
        let statusMatch = currentFilter === 'all' || o.estado === currentFilter;
        if (currentFilter === 'Cancelado') {
            statusMatch = o.estado === 'Cancelado' || o.estado === 'Rechazado';
        }

        let dateMatch = true;
        if (o.fecha) {
            const d = new Date(o.fecha);
            d.setHours(0, 0, 0, 0);

            if (hasRange) {
                const start = new Date(dateRange.start + 'T00:00:00');
                const end = new Date(dateRange.end + 'T00:00:00');
                dateMatch = d >= start && d <= end;
            } else if (filterDate) {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const oDateStr = `${year}-${month}-${day}`;
                dateMatch = oDateStr === filterDate;
            }
        }
        
        return statusMatch && dateMatch;
    });

    // 2. Actualizar el selector de repartidores con los nombres relevantes del contexto (v18.1)
    updateDriverFilterOptions(contextOrders);

    // 3. Actualizar filtros de Estado y Pago basados en Fecha (Cascada básica)
    const selectedDriver = document.getElementById('driver-filter')?.value || 'all';
    const driverContextOrders = contextOrders.filter(o => (selectedDriver === 'all' || (o.envio && o.envio.trim() === selectedDriver)));
    
    updateDynamicFilters(driverContextOrders);

    // 4. Obtener colecciones seleccionadas (Multi-select v24.1 con prefijo main)
    const getCheckedValues = (cls) => Array.from(document.querySelectorAll(`.${cls}:checked`)).map(cb => cb.value);
    const activeStatuses = getCheckedValues('main-status-cb');
    const activePayments = getCheckedValues('main-payment-cb');

    // 5. Filtrar la lista final aplicando Buscador, Repartidor, Estado y Pago
    const filtered = driverContextOrders.filter(o => {
        const searchMatch = o.llave.toLowerCase().includes(term) ||
            o.nro.toString().includes(term) ||
            o.estado.toLowerCase().includes(term);

        const statusMatch = activeStatuses.length === 0 || activeStatuses.includes(String(o.estado).trim());
        const paymentMatch = activePayments.length === 0 || activePayments.includes(String(o.pago).trim());

        return searchMatch && statusMatch && paymentMatch;
    });

    currentFilteredOrders = filtered;
    renderOrders(filtered);
    updateStats(filtered);
}

searchInput.addEventListener('input', applyFilters);

// --- EXPORTAR A EXCEL (v25) ---
const exportExcelBtn = document.getElementById('export-excel-btn');
if (exportExcelBtn) {
    exportExcelBtn.addEventListener('click', exportToExcel);
}

function exportToExcel() {
    if (!currentFilteredOrders || currentFilteredOrders.length === 0) {
        Swal.fire('Atención', 'No hay datos filtrados para exportar.', 'warning');
        return;
    }

    // Configurar cabeceras
    const headers = [
        "Nro", "Llave", "Fecha/Hora", "Monto", "Vuelto", "Tipo Pago", "Estado", "Repartidor", 
        "SLA (Min)", "SLA Real (Min)", "ID Viaje"
    ];

    // Procesar filas
    const rows = currentFilteredOrders.map(o => [
        o.nro,
        `"${o.llave}"`, // Comillas para evitar formato científico en Excel
        o.fecha,
        parseFloat(o.monto || 0).toFixed(2),
        parseFloat(o.vuelto || 0).toFixed(2),
        `"${o.pago || '-'}"`,
        o.estado,
        `"${o.envio || '-'}"`,
        `"${o.tiempo_transcurrido || '-'}"`,
        o.minutosReales || '-',
        `"${o.viaje_id || '-'}"`
    ]);

    // Crear contenido CSV (punto y coma es mejor para configuración regional de Excel en español)
    let csvContent = "\uFEFF"; // BOM para asegurar UTF-8 en Excel
    csvContent += headers.join(";") + "\r\n";
    rows.forEach(r => {
        csvContent += r.join(";") + "\r\n";
    });

    // Descargar archivo
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toLocaleDateString('es-PE').replace(/\//g, '-');
    
    link.setAttribute("href", url);
    link.setAttribute("download", `Reporte_Validacion_${dateStr}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
    });
    Toast.fire({
        icon: 'success',
        title: 'Excel generado con éxito'
    });
}

document.getElementById('date-filter').addEventListener('change', (e) => {
    const newDate = e.target.value;
    dateRange = { start: null, end: null };
    document.getElementById('range-display-text').textContent = '';

    // Sincronizar con Reportes
    const reportDateInput = document.getElementById('report-date-filter');
    if (reportDateInput) {
        reportDateInput.value = newDate;
        renderReportsTable();
    }

    // Sincronizar con Dashboard
    if (typeof window.syncDashboardDate === 'function') {
        window.syncDashboardDate(newDate);
    }

    // Sincronizar con Motorizados
    const mapaDateFilter = document.getElementById('mapa-date-filter');
    if (mapaDateFilter) {
        mapaDateFilter.value = newDate;
        if (typeof renderMapaMotorizados === 'function') renderMapaMotorizados();
    }

    // Sincronizar con Caja
    const cajaDateInput = document.getElementById('caja-date-picker');
    if (cajaDateInput) {
        cajaDateInput.value = newDate;
        // Si la pestaña Caja está visible, recargar datos inmediatamente
        const contentCaja = document.getElementById('caja-content');
        if (contentCaja && !contentCaja.classList.contains('hidden')) {
            if (typeof window.loadCajaData === 'function') window.loadCajaData();
        }
    }

    applyFilters();
});

// Listeners para filtros (v18 y v24)
if (driverFilterSelect) {
    driverFilterSelect.addEventListener('change', applyFilters);
}
// --- LÓGICA DE UI PARA FILTROS MULTI-SELECCIÓN (v24: Estado y Pago) ---
function initMultiSelect(prefix) {
    const btn = document.getElementById(`${prefix}-filter-btn`);
    const dropdown = document.getElementById(`${prefix}-filter-dropdown`);
    if (!btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Cerrar otros dropdowns si estuvieran abiertos
        document.querySelectorAll('.multi-select-dropdown').forEach(d => {
            if (d !== dropdown) d.classList.remove('active');
        });
        dropdown.classList.toggle('active');
    });

    // Cerrar al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });
}

function initAllFilters() {
    initMultiSelect('main-status');
    initMultiSelect('main-payment');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllFilters);
} else {
    initAllFilters();
}

// (Filtros de auditoría ahora se manejan automáticamente v24.2)
// -----------------------------------------------------------------------
// ----------------------------------------------

// v19.2: Auto-refresco automático cada 5 minutos (300,000ms)
setInterval(() => {
    console.log('🔄 Actualización automática de datos (v19.2)...');
    loadOrdersSilent(); // Usar la carga silenciosa para no interrumpir al usuario
}, 300000);

const modalRange = document.getElementById('modal-date-range');
const btnDateRange = document.getElementById('btn-date-range');

btnDateRange.addEventListener('click', () => {
    modalRange.classList.add('active');
});

['range-start', 'range-end'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('click', () => {
        if ('showPicker' in HTMLInputElement.prototype) {
            el.showPicker();
        }
    });
});

document.getElementById('range-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const start = document.getElementById('range-start').value;
    const end = document.getElementById('range-end').value;

    if (start && end) {
        dateRange = { start, end };
        document.getElementById('date-filter').value = '';

        const fmt = (s) => {
            if (!s) return '';
            const [y, m, d] = s.split('-');
            return `${d}/${m}/${y}`;
        };

        document.getElementById('range-display-text').textContent = `${fmt(start)} - ${fmt(end)}`;
        modalRange.classList.remove('active');
        applyFilters();
    }
});

document.getElementById('btn-clear-range').addEventListener('click', () => {
    dateRange = { start: null, end: null };
    document.getElementById('range-form').reset();

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('date-filter').value = `${yyyy}-${mm}-${dd}`;
    document.getElementById('range-display-text').textContent = '';

    modalRange.classList.remove('active');
    applyFilters();
});

document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.getAttribute('data-filter');
        applyFilters();
    });
});

refreshBtn.addEventListener('click', loadOrders);

window.rejectOrder = async (nro) => {
    const order = orders.find(o => o.nro == nro);
    if (!order) return;

    updateDriversDatalist();

    // ====== PASO 1: Seleccionar motivo ======
    const driverFieldHtml = order.envio
        ? `<div id="swal-driver-group" style="display:none; margin-top:15px; text-align:left;">
               <label style="display:block; margin-bottom:6px; color:#475569; font-weight: 600; font-size:0.95em;">Repartidor asignado:</label>
               <div style="padding:10px 15px; background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius:8px; display:flex; align-items:center; gap:10px;">
                   <i class="fa-solid fa-motorcycle" style="color:#3b82f6; font-size:1.2em;"></i> 
                   <span style="color: #0f172a !important; font-weight: 700; font-size: 1.1em;">${order.envio}</span>
               </div>
           </div>`
        : `<div id="swal-driver-group" style="display:none; margin-top:15px; text-align:left;">
               <label style="display:block; margin-bottom:6px; color:#475569; font-weight: 600; font-size:0.95em;">Nombre del Driver:</label>
               <input id="swal-driver" class="swal2-input" placeholder="Escribe o selecciona..."
                   list="drivers-list"
                   style="margin: 0; width: 100%; box-sizing: border-box; background: #ffffff; border: 1px solid #cbd5e1; color: #0f172a !important; font-size: 1rem; border-radius: 8px;">
           </div>`;

    const { value: step1Values, isConfirmed: step1Confirmed } = await Swal.fire({
        title: '¿Por qué se cancela el pedido?',
        icon: 'warning',
        html: `
            <div class="swal-custom-container" style="text-align: left;">
                <label style="display:block; margin-bottom:5px;">Motivo:</label>
                <div class="swal-radio-group" style="margin-bottom:15px;">
                    <label style="display:block; margin-bottom:5px;"><input type="radio" name="swal-motivo" value="Por consumidor" checked> 🙋 Por consumidor</label>
                    <label style="display:block; margin-bottom:5px;"><input type="radio" name="swal-motivo" value="Por Punto de Venta"> 🏪 Por Punto de Venta</label>
                    <label style="display:block; margin-bottom:5px;"><input type="radio" name="swal-motivo" value="Por Repartidor"> 🚴 Por Repartidor</label>
                </div>
                ${driverFieldHtml}
            </div>
        `,
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#666',
        confirmButtonText: '<i class="fa-solid fa-arrow-right"></i> Continuar',
        cancelButtonText: 'Volver',
        didOpen: () => {
            document.querySelectorAll('input[name="swal-motivo"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const driverGroup = document.getElementById('swal-driver-group');
                    if (driverGroup) {
                        driverGroup.style.display = e.target.value === 'Por Repartidor' ? 'block' : 'none';
                    }
                });
            });
        },
        preConfirm: () => {
            const motivo = document.querySelector('input[name="swal-motivo"]:checked').value;
            if (motivo === 'Por Repartidor') {
                let driver = '';
                if (order.envio) {
                    driver = order.envio;
                } else {
                    const driverInput = document.getElementById('swal-driver');
                    driverInput?.blur();
                    driver = (driverInput?.value || '').trim();
                    if (!driver) {
                        Swal.showValidationMessage('Debes consignar el nombre del Driver');
                        return false;
                    }
                }
                return { motivo, driver };
            }
            return { motivo, driver: '' };
        }
    });

    if (!step1Confirmed || !step1Values) return;
    const { motivo, driver } = step1Values;

    // ====== Para Consumidor y Punto de Venta: cancelar directo ======
    if (motivo !== 'Por Repartidor') {
        Swal.fire({ title: 'Cancelando...', didOpen: () => Swal.showLoading() });

        // v18.4: Registrar solo la fecha internamente (sin hora ni tiempo)
        const sysDate = new Date().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

        try {
            const res = await fetchAPI('rechazarPedido', {
                nro,
                usuario: currentUser.usuario,
                motivo,
                envio: driver,
                fechaEntrega: sysDate,
                horaEntrega: '',
                tiempoTranscurrido: ''
            });
            if (res.success) {
                Swal.fire('Cancelado', `Pedido cancelado: <strong>${motivo}</strong>`, 'success');
                loadOrders();
            } else { Swal.fire('Error', res.message, 'error'); }
        } catch (e) { Swal.fire('Error', 'Error de conexión', 'error'); }
        return;
    }

    // ====== PASO 2 (solo Por Repartidor): Ventana de evidencia ======
    // Usar fecha/hora de cuando el repartidor subió la foto (columnas P y Q)
    let fechaHora = 'Sin registro de fecha';
    if (order.fecha_entrega || order.hora_entrega) {
        const fe = order.fecha_entrega || '';
        const he = order.hora_entrega || '';
        fechaHora = (fe + (fe && he ? ' — ' : '') + he) || 'Sin registro';
    } else if (order.fecha) {
        // Fallback: fecha del pedido
        try {
            const d = new Date(order.fecha);
            fechaHora = d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' })
                + ' — ' + d.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: true });
        } catch (e) { fechaHora = 'Sin registro'; }
    }

    // Obtener URL de la foto ya subida por el repartidor
    const stableLink = extractPhotoUrl(order.foto);
    const directPreview = getDirectPhotoUrl(order.foto);
    const hasFoto = directPreview && directPreview.length > 10;

    const fotoHtml = hasFoto
        ? `<div style="border:2px solid #22c55e; border-radius:16px; padding:8px; background:#f0fdf4; text-align:center;">
               <img src="${directPreview}" data-nro="${order.nro}" style="max-height:350px; max-width:100%; border-radius:12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);" 
                onerror="handleImageError(this)">
               <div style="margin-top:8px; font-size:0.8em; color:#16a34a; font-weight:600;">
                    <i class="fa-solid fa-circle-check"></i> Foto subida por el repartidor 
                    <br>
                    <a href="${stableLink}" target="_blank" style="color:#2563eb; text-decoration:underline; display:inline-block; margin-top:5px;">
                        <i class="fa-solid fa-up-right-from-square"></i> Ver en Google Drive
                    </a>
               </div>
           </div>`
        : `<div style="border:2px dashed #ef4444; border-radius:16px; padding:40px; text-align:center; background:#fef2f2;">
               <i class="fa-solid fa-image" style="font-size:3em; color:#fca5a5; margin-bottom:12px; display:block;"></i>
               <span style="color:#ef4444; font-weight:600; font-size:1.1em; display:block;">El repartidor aún no ha subido la evidencia</span>
               <span style="color:#94a3b8; font-size:0.85em;">La foto debe aparecer en la columna "Foto" del pedido</span>
           </div>`;

    const { isConfirmed: step2Confirmed } = await Swal.fire({
        title: '📷 Evidencia del Repartidor',
        width: 600,
        html: `
            <div style="text-align:left;">
                <div style="display:flex; justify-content:space-between; gap:12px; margin-bottom:16px;">
                    <div style="flex:1; background:#f1f5f9; border-radius:10px; padding:12px; border:1px solid #e2e8f0;">
                        <div style="font-size:0.75em; color:#64748b; text-transform:uppercase; font-weight:600; margin-bottom:4px;">Pedido</div>
                        <div style="font-weight:700; font-size:1.1em; color:#0f172a;">${order.llave || '#' + order.nro}</div>
                    </div>
                    <div style="flex:1; background:#f1f5f9; border-radius:10px; padding:12px; border:1px solid #e2e8f0;">
                        <div style="font-size:0.75em; color:#64748b; text-transform:uppercase; font-weight:600; margin-bottom:4px;">Repartidor</div>
                        <div style="font-weight:700; font-size:1.1em; color:#0f172a;"><i class="fa-solid fa-motorcycle" style="color:#3b82f6;"></i> ${driver}</div>
                    </div>
                </div>
                <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:10px; padding:10px 14px; margin-bottom:16px;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                        <i class="fa-solid fa-calendar-check" style="color:#d97706; font-size:1.2em;"></i>
                        <div style="font-size:0.75em; color:#92400e; text-transform:uppercase; font-weight:600;">Registro de Evidencia</div>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <input type="text" id="cancel-fecha-ev" value="${order.fecha_entrega || ''}" placeholder="dd/mm/aaaa" style="flex:1; padding:8px; border-radius:6px; border:1px solid #fcd34d; background:#fff; color:#000; font-weight:700; text-align:center;">
                        <input type="time" id="cancel-hora-ev" value="${order.hora_entrega || ''}" style="flex:1; padding:8px; border-radius:6px; border:1px solid #fcd34d; background:#fff; color:#000; font-weight:700; text-align:center;">
                    </div>
                </div>

                <div id="cancel-elapsed-container" style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:10px 14px; margin-bottom:16px; display:flex; align-items:center; gap:10px; display:none;">
                    <i class="fa-solid fa-hourglass-half" style="color:#3b82f6; font-size:1.2em;"></i>
                    <div>
                        <div style="font-size:0.75em; color:#1e40af; text-transform:uppercase; font-weight:600;">Tiempo Transcurrido</div>
                        <div id="cancel-elapsed-text" style="font-weight:700; color:#1e3a8a; font-size:1.05em;">--</div>
                    </div>
                </div>

                <label style="display:block; margin-bottom:8px; color:#475569; font-weight:600; font-size:0.95em;">
                    <i class="fa-solid fa-image"></i> Evidencia de llamadas:
                </label>
                ${fotoHtml}
            </div>
        `,
        showCancelButton: true,
        confirmButtonColor: hasFoto ? '#d33' : '#94a3b8',
        cancelButtonColor: '#666',
        confirmButtonText: hasFoto ? '<i class="fa-solid fa-check"></i> Confirmar Cancelación' : '<i class="fa-solid fa-ban"></i> Cancelar sin foto',
        cancelButtonText: 'Volver',
        didOpen: () => {
            const hInput = document.getElementById('cancel-hora-ev');
            const fInput = document.getElementById('cancel-fecha-ev');
            const elapsedText = document.getElementById('cancel-elapsed-text');
            const elapsedContainer = document.getElementById('cancel-elapsed-container');

            const calculate = () => {
                const horaVal = hInput?.value;
                const fechaVal = fInput?.value;
                if (!horaVal || !order.fecha) {
                    if (elapsedContainer) elapsedContainer.style.display = 'none';
                    return;
                }
                try {
                    const hParts = horaVal.split(':');
                    const hh = parseInt(hParts[0] || '0', 10);
                    const mm = parseInt(hParts[1] || '0', 10);
                    const dRegistro = new Date(order.fecha);

                    const formatter = new Intl.DateTimeFormat('en-US', {
                        timeZone: 'America/Lima',
                        year: 'numeric', month: 'numeric', day: 'numeric',
                        hour: 'numeric', minute: 'numeric', second: 'numeric',
                        hour12: false
                    });
                    const parts = formatter.formatToParts(dRegistro);
                    const getP = (type) => parseInt(parts.find(p => p.type === type).value, 10);

                    let rH = getP('hour'); if (rH === 24) rH = 0;
                    let registroMs = Date.UTC(getP('year'), getP('month') - 1, getP('day'), rH, getP('minute'), 0);
                    let entregaMs = Date.UTC(getP('year'), getP('month') - 1, getP('day'), hh, mm, 0);

                    const diffMs = entregaMs - registroMs;
                    if (diffMs > 0 && elapsedText && elapsedContainer) {
                        const diffMins = Math.round(diffMs / 60000);
                        const h = Math.floor(diffMins / 60);
                        const m = diffMins % 60;
                        elapsedText.textContent = h > 0 ? `${h}h ${m}m` : `${m} min`;
                        elapsedContainer.style.display = 'flex';
                    } else if (elapsedContainer) {
                        elapsedContainer.style.display = 'none';
                    }
                } catch (e) { console.error('Error calculando tiempo:', e); }
            };

            hInput?.addEventListener('input', calculate);
            fInput?.addEventListener('input', calculate);
            calculate(); // Ejecutar al abrir
        }
    });

    if (!step2Confirmed) return;

    // Obtener los valores (posiblemente editados)
    const fechaFinal = document.getElementById('cancel-fecha-ev')?.value || '';
    const horaFinal = document.getElementById('cancel-hora-ev')?.value || '';
    let durationFormatted = "";

    // Calcular duración final para guardar en columna R
    if (horaFinal && order.fecha) {
        try {
            const hParts = horaFinal.split(':');
            const hh = parseInt(hParts[0] || '0', 10);
            const mm = parseInt(hParts[1] || '0', 10);
            const dRegistro = new Date(order.fecha);
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Lima',
                year: 'numeric', month: 'numeric', day: 'numeric',
                hour: 'numeric', minute: 'numeric', second: 'numeric',
                hour12: false
            });
            const parts = formatter.formatToParts(dRegistro);
            const getP = (type) => parseInt(parts.find(p => p.type === type).value, 10);
            let rH = getP('hour'); if (rH === 24) rH = 0;
            let registroMs = Date.UTC(getP('year'), getP('month') - 1, getP('day'), rH, getP('minute'), 0);
            let entregaMs = Date.UTC(getP('year'), getP('month') - 1, getP('day'), hh, mm, 0);

            const diffMs = entregaMs - registroMs;
            if (diffMs >= 0) {
                const totalSecs = Math.floor(diffMs / 1000);
                const h = Math.floor(totalSecs / 3600);
                const m = Math.floor((totalSecs % 3600) / 60);
                const s = totalSecs % 60;
                durationFormatted = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            }
        } catch (e) { console.error('Error calculando duración final:', e); }
    }

    // ====== Enviar cancelación ======
    Swal.fire({ title: 'Cancelando...', didOpen: () => Swal.showLoading() });
    try {
        const payload = {
            nro,
            usuario: currentUser.usuario,
            motivo,
            envio: driver,
            fechaEntrega: fechaFinal,
            horaEntrega: horaFinal,
            tiempoTranscurrido: durationFormatted
        };

        // Si hay una foto pegada, incluirla
        if (window.lastPastedEvidence) {
            payload.archivo = window.lastPastedEvidence;
        }

        const res = await fetchAPI('rechazarPedido', payload);
        
        // Limpiar evidencia después del intento
        window.lastPastedEvidence = null;

        if (res.success) {
            Swal.fire('Cancelado', `Pedido cancelado: <strong>${motivo}</strong><br><small>Evidencia registrada ✅</small>`, 'success');
            loadOrders();
        } else { Swal.fire('Error', res.message, 'error'); }
    } catch (e) { 
        window.lastPastedEvidence = null;
        Swal.fire('Error', 'Error de conexión', 'error'); 
    }
}

window.marcarPorValidarManual = async (nro) => {
    const { isConfirmed } = await Swal.fire({
        title: '¿Pasar a "Por Validar"?',
        text: "Usa esto solo si el repartidor no pudo usar la App. El pedido pasará a la lista de espera para validación manual.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3b82f6',
        confirmButtonText: 'Sí, mover',
        cancelButtonText: 'Cancelar'
    });

    if (isConfirmed) {
        setLoading(true);
        try {
            const res = await fetchAPI('marcarPorValidar', { nro });
            if (res.success) {
                Swal.fire('Listo', 'Pedido movido a "Por Validar"', 'success');
                loadOrders();
                // Si estamos en el monitor de motorizados, refrescar también
                if (typeof renderMapaMotorizados === 'function') {
                    renderMapaMotorizados();
                }
            } else {
                Swal.fire('Error', res.message || 'No se pudo mover el pedido', 'error');
            }
        } catch (e) {
            Swal.fire('Error', 'Error de conexión', 'error');
        }
        setLoading(false);
    }
};


// --- Bulk Import Logic ---

let allParsedOrders = [];

const importBtnEl = document.getElementById('import-btn');
if (importBtnEl) {
    importBtnEl.addEventListener('click', () => {
        document.getElementById('modal-import').classList.add('active');

        document.getElementById('import-file').value = '';
        document.getElementById('import-preview-container').classList.add('hidden');
        document.getElementById('import-drop-zone').querySelector('.upload-placeholder').classList.remove('hidden');
        document.getElementById('btn-confirm-import').disabled = true;
        allParsedOrders = [];
    });
}

document.getElementById('import-file').addEventListener('click', (e) => e.stopPropagation());

document.getElementById('import-drop-zone').addEventListener('click', () => document.getElementById('import-file').click());
document.getElementById('import-file').addEventListener('change', handleImportFileSelect);

async function handleImportFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('import-preview-container').classList.remove('hidden');
    document.getElementById('import-table-body').innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Leyendo archivo CSV...</td></tr>';

    try {
        const text = await file.text();
        const extractedOrders = parseCSV(text);
        allParsedOrders = extractedOrders;
        renderImportTable(extractedOrders);
    } catch (err) {
        Swal.fire('Error', 'No se pudo leer el archivo: ' + err.message, 'error');
        document.getElementById('import-preview-container').classList.add('hidden');
    }
    e.target.value = '';
}

function parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/);
    const ordersFound = [];

    lines.forEach((line, index) => {
        if (!line.trim()) return;

        const parts = line.split(',');

        if (parts.length < 3) return;

        if (parts[0].toLowerCase().includes('fecha') && parts[1].toLowerCase().includes('llave')) return;

        const rawDate = parts[0].trim();
        const key = parts[1].trim().toUpperCase();
        let amountStr = parts[2].trim();
        let envio = parts[3] ? parts[3].trim().replace(/\r/g, '') : "";
        let pago = parts[4] ? parts[4].trim().replace(/\r/g, '') : "";

        amountStr = amountStr.replace(/S\//gi, '').replace(/\s/g, '');

        const amount = parseFloat(amountStr);
        if (isNaN(amount)) return;

        const isoDate = parseSpanishDate(rawDate);
        const finalDate = isoDate || rawDate;

        ordersFound.push({
            llave: key,
            fecha: finalDate,
            monto: amount,
            envio: envio,
            pago: pago,
            raw: line
        });
    });

    return ordersFound.reverse();
}

function parseSpanishDate(dateString) {
    const months = {
        'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
        'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
    };

    const dateTimeMatch = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (dateTimeMatch) {
        return dateString;
    }

    const match = dateString.match(/(\d{1,2})\s+([a-zA-Z]{3})\.?\s+(\d{4})/i);
    if (match) {
        const day = match[1].padStart(2, '0');
        const monthAbbr = match[2].toLowerCase();
        const year = match[3];
        const month = months[monthAbbr];
        if (month) {
            return `${year}-${month}-${day}`;
        }
    }

    const slashMatch = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashMatch) {
        const day = slashMatch[1].padStart(2, '0');
        const month = slashMatch[2].padStart(2, '0');
        const year = slashMatch[3];
        return `${year}-${month}-${day}`;
    }

    return null;
}

function renderImportTable(importedOrders) {
    const tbody = document.getElementById('import-table-body');
    tbody.innerHTML = '';

    if (importedOrders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No se encontraron pedidos legibles en el PDF.</td></tr>';
        document.getElementById('btn-confirm-import').disabled = true;
        document.getElementById('import-count').textContent = '0';
        return;
    }

    document.getElementById('import-count').textContent = importedOrders.length;
    document.getElementById('btn-confirm-import').disabled = false;

    importedOrders.forEach((order, index) => {
        const isDupe = orders.some(o => o.llave === order.llave);
        const status = isDupe ? '<span class="badge Rechazado">Duplicado</span>' : '<span class="badge Pendiente">Nuevo</span>';

        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td><input type="checkbox" class="import-check" data-llave="${order.llave}" ${isDupe ? '' : 'checked'}></td>
            <td>${order.llave}</td>
            <td>${order.fecha}</td>
            <td>S/ ${order.monto}</td>
            <td>${order.envio || ''}</td>
            <td>${order.pago || ''}</td>
            <td>${status}</td>
        `;
        tbody.appendChild(tr);
        tr.querySelector('.import-check').orderData = order;
    });
}

document.getElementById('btn-confirm-import').addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('.import-check:checked');
    if (checkboxes.length === 0) {
        Swal.fire('Error', 'Selecciona al menos un pedido', 'warning');
        return;
    }

    const selectedOrders = [];

    checkboxes.forEach(cb => {
        if (cb.orderData) {
            selectedOrders.push({
                llave: cb.orderData.llave,
                fecha: cb.orderData.fecha,
                monto: cb.orderData.monto,
                envio: cb.orderData.envio,
                pago: cb.orderData.pago || '',
                nro: null
            });
        }
    });

    Swal.fire({
        title: 'Importando...',
        text: `Enviando ${selectedOrders.length} pedidos`,
        didOpen: () => Swal.showLoading()
    });

    try {
        const res = await fetchAPI('crearPedidosMasivos', {
            orders: selectedOrders,
            usuario: currentUser.usuario
        });

        if (res.success) {
            Swal.fire('Éxito', res.message, 'success');
            document.getElementById('modal-import').classList.remove('active');
            loadOrders();
        } else {
            Swal.fire('Error', res.message, 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Falló la conexión o el procesamiento', 'error');
    }
});

// --- Bulk Import Text (Paste) Logic ---

let allParsedTextOrders = [];
const importTextModal = document.getElementById('modal-import-text');
const importTextBtn = document.getElementById('import-text-btn');
const importTextDropZone = document.getElementById('import-text-drop-zone');
const importTextPreviewContainer = document.getElementById('import-text-preview-container');
const importTextTableBody = document.getElementById('import-text-table-body');
const btnConfirmImportText = document.getElementById('btn-confirm-import-text');
const importTextPlaceholder = document.getElementById('import-text-placeholder');

importTextBtn.addEventListener('click', () => {
    importTextModal.classList.add('active');
    resetImportTextModal();
});

function resetImportTextModal() {
    importTextPreviewContainer.classList.add('hidden');
    importTextPlaceholder.style.display = 'block';
    btnConfirmImportText.disabled = true;
    allParsedTextOrders = [];

    setTimeout(() => {
        importTextDropZone.focus();
    }, 100);
}

document.addEventListener('paste', (e) => {
    // Verificar si el modal de importar texto está abierto (visible)
    const isModalOpen = importTextModal.classList.contains('active') || importTextModal.classList.contains('flex') || importTextModal.style.display === 'flex';

    if (isModalOpen) {
        // Omitir si el usuario está escribiendo en algún input (aunque en este modal no hay inputs, por seguridad)
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
        if (pastedText) {
            e.preventDefault();
            processPastedText(pastedText);
        }
    }
});

function processPastedText(text) {
    const extractedOrders = parseRawCopiedText(text);
    allParsedTextOrders = extractedOrders;

    importTextPlaceholder.style.display = 'none';
    renderImportTextTable(extractedOrders);
}

function parseRawCopiedText(text) {
    const ordersFound = [];
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');

    const keyRegex = /^[A-Z0-9]{8,11}$/;
    const dateRegex = /(\d{1,2})\s+de\s+([a-zA-Z]+)\s+de\s+(\d{4})|(\d{1,2})\s+([a-zA-Z]{3})\.?\s+(\d{4})|Hoy|ayer/i;
    const timeRegex = /(\d{1,2}):(\d{2})(\s*[ap]\.?\s*m\.?)?|(\d{1,2}):(\d{2})\s*horas\.?/i;

    let i = 0;
    while (i < lines.length) {
        let line = lines[i];

        if (keyRegex.test(line)) {
            const llave = line;
            let fechaStr = '';
            let horaStr = '';
            let status = '';
            let envio = '';
            let monto = 0;
            let pago = '';

            i++; // saltar llave

            // 1. Saltar el Nombre del Cliente
            if (i < lines.length && !dateRegex.test(lines[i]) && !keyRegex.test(lines[i])) {
                i++;
            }

            // 2. Buscar Fecha
            while (i < lines.length && !dateRegex.test(lines[i]) && !keyRegex.test(lines[i])) { i++; }
            if (i < lines.length && dateRegex.test(lines[j = i])) { // j is just for testing
                const dMatch = lines[i].match(dateRegex);
                if (lines[i].toLowerCase().includes('hoy')) {
                    const t = new Date();
                    fechaStr = `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`;
                } else if (lines[i].toLowerCase().includes('ayer')) {
                    const t = new Date(); t.setDate(t.getDate() - 1);
                    fechaStr = `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`;
                } else if (dMatch) {
                    let day, monthStr, year;
                    if (dMatch[1]) {
                        day = dMatch[1].padStart(2, '0');
                        monthStr = dMatch[2].toLowerCase();
                        year = dMatch[3];
                    } else if (dMatch[4]) {
                        day = dMatch[4].padStart(2, '0');
                        monthStr = dMatch[5].toLowerCase();
                        year = dMatch[6];
                    }
                    const months = { 'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06', 'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12' };
                    const m = months[monthStr ? monthStr.substring(0, 3).replace('set', 'sep') : ''] || '01';
                    fechaStr = `${day}/${m}/${year}`;
                }
                i++;
            }

            // 3. Buscar Hora
            while (i < lines.length && !timeRegex.test(lines[i]) && !keyRegex.test(lines[i])) { i++; }
            if (i < lines.length && timeRegex.test(lines[i])) {
                const tMatch = lines[i].match(timeRegex);
                let hour = parseInt(tMatch[1] || tMatch[4]);
                const min = tMatch[2] || tMatch[5];
                const ampm = (tMatch[3] || '').toLowerCase();

                if (ampm.includes('p') && hour < 12) hour += 12;
                if (ampm.includes('a') && hour === 12) hour = 0;

                horaStr = `${String(hour).padStart(2, '0')}:${min}`;
                i++;
            }

            // 4. Buscar Status (Terminado, Aceptado, Cancelado, etc.)
            const statusKeywords = ['Terminado', 'Aceptado', 'En tránsito', 'Cancelado', 'En preparacion', '---'];
            while (i < lines.length && !keyRegex.test(lines[i])) {
                const isStatus = statusKeywords.some(kw => lines[i].toLowerCase().includes(kw.toLowerCase()));
                if (isStatus || lines[i].includes('S/')) { // Detenerse si encontramos el monto
                    if (isStatus) {
                        status = lines[i];
                        i++;
                    }
                    break;
                }
                i++;
            }

            // 5. Envío (Nombre de Repartidor) - La línea siguiente si no es monto
            if (i < lines.length && !lines[i].includes('S/') && !keyRegex.test(lines[i])) {
                envio = lines[i];
                i++;
            }

            // 6. Monto
            while (i < lines.length && !lines[i].includes('S/') && !keyRegex.test(lines[i])) { i++; }
            if (i < lines.length && lines[i].includes('S/')) {
                const amountClean = lines[i].replace(/[^\d.,]/g, '').replace(',', '.');
                monto = parseFloat(amountClean).toFixed(2);
                i++;
            }

            // 7. Pago (La siguiente línea si existe y no es llave)
            if (i < lines.length && !keyRegex.test(lines[i]) && !lines[i].includes('S/')) {
                pago = lines[i];
                i++;
            }

            // 7. Pago
            if (i < lines.length && !keyRegex.test(lines[i])) {
                pago = lines[i];
                i++;
            }

            let finalDate = fechaStr;
            if (fechaStr && horaStr) finalDate = `${fechaStr} ${horaStr}`;

            ordersFound.push({
                llave: llave,
                fecha: finalDate,
                monto: monto,
                envio: envio,
                pago: pago,
                originalStatus: status
            });

        } else {
            i++;
        }
    }

    return ordersFound;
}

function renderImportTextTable(importedOrders) {
    importTextPreviewContainer.classList.remove('hidden');
    importTextTableBody.innerHTML = '';

    if (importedOrders.length === 0) {
        importTextTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No se encontró texto compatible. Asegúrese de copiar las filas directamente desde el origen web.</td></tr>';
        btnConfirmImportText.disabled = true;
        document.getElementById('import-text-count').textContent = '0';
        return;
    }

    document.getElementById('import-text-count').textContent = importedOrders.length;
    btnConfirmImportText.disabled = false;

    const checkAllBox = document.getElementById('import-text-check-all');
    checkAllBox.checked = true;
    checkAllBox.onchange = (e) => {
        const cbs = document.querySelectorAll('.import-text-check');
        cbs.forEach(cb => {
            if (!cb.disabled) cb.checked = e.target.checked;
        });
    };

    importedOrders.forEach((order) => {
        const isDupe = orders.some(o => o.llave === order.llave);

        let statusHTML = '';
        if (isDupe) {
            statusHTML = '<span class="badge Rechazado" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);">Duplicado en Sistema</span>';
        } else {
            statusHTML = '<span class="badge Pendiente" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3);">Pendiente</span>';
        }

        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td><input type="checkbox" class="import-text-check" data-llave="${order.llave}" ${isDupe ? '' : 'checked'} ${isDupe ? 'disabled' : ''}></td>
            <td style="font-weight: bold;">${order.llave}</td>
            <td>${order.fecha}</td>
            <td style="color:var(--success);">S/ ${order.monto}</td>
            <td>${order.envio || '<span class="text-muted">-</span>'}</td>
            <td style="font-size:0.85em; opacity:0.85;">${order.pago || '<span class="text-muted">-</span>'}</td>
            <td>${statusHTML}</td>
        `;
        importTextTableBody.appendChild(tr);
        tr.querySelector('.import-text-check').orderData = order;
    });
}

btnConfirmImportText.addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('.import-text-check:checked');
    if (checkboxes.length === 0) {
        Swal.fire('Error', 'Selecciona al menos un pedido nuevo para importar', 'warning');
        return;
    }

    const selectedOrders = [];
    checkboxes.forEach(cb => {
        if (cb.orderData) {
            selectedOrders.push({
                llave: cb.orderData.llave,
                fecha: cb.orderData.fecha,
                monto: cb.orderData.monto,
                envio: cb.orderData.envio,
                pago: cb.orderData.pago || '',
                nro: null
            });
        }
    });

    selectedOrders.reverse();

    Swal.fire({
        title: 'Importando...',
        text: `Enviando ${selectedOrders.length} pedidos a BD`,
        didOpen: () => Swal.showLoading()
    });

    try {
        const res = await fetchAPI('crearPedidosMasivos', {
            orders: selectedOrders,
            usuario: currentUser.usuario
        });

        if (res.success) {
            Swal.fire('Éxito', res.message, 'success');
            importTextModal.classList.remove('active');
            loadOrders();
        } else {
            Swal.fire('Error', res.message, 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Falló la conexión masiva', 'error');
    }
});

// Validated Card Breakdown Interaction
document.getElementById('card-validated')?.addEventListener('click', () => {
    let cash = 0, cashCount = 0;
    let online = 0, onlineCount = 0;
    let voucher = 0, voucherCount = 0;

    if (!currentFilteredOrders) return;

    currentFilteredOrders.forEach(o => {
        if (o.estado === 'Validado') {
            const m = parseFloat(o.monto) || 0;
            const t = (o.tipo_pago || '').toString().trim().toUpperCase();

            if (['TARJETA', 'QR', 'POS'].includes(t)) {
                voucher += m;
                voucherCount++;
            } else if (t === 'EFECTIVO') {
                cash += m;
                cashCount++;
            } else if (t === 'ONLINE') {
                online += m;
                onlineCount++;
            } else {
                if (o.foto === 'PAGO-EFECTIVO') {
                    cash += m;
                    cashCount++;
                } else if (o.foto === 'PAGO-ONLINE') {
                    online += m;
                    onlineCount++;
                } else {
                    voucher += m;
                    voucherCount++;
                }
            }
        }
    });

    Swal.fire({
        title: 'Detalle de Validados',
        html: `
            <div style="text-align: left; padding: 10px; font-size: 1.1rem;">
                <div style="margin-bottom: 15px; text-align: center; color: var(--success); font-weight: bold;">
                    Total: S/ ${formatMoney(cash + online + voucher)}
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                     <span><i class="fa-solid fa-camera"></i> Voucher</span>
                     <span>S/ ${formatMoney(voucher)} <small>(${voucherCount})</small></span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                     <span><i class="fa-solid fa-money-bill-wave"></i> Efectivo</span>
                     <span>S/ ${formatMoney(cash)} <small>(${cashCount})</small></span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                     <span><i class="fa-solid fa-cloud"></i> Online</span>
                     <span>S/ ${formatMoney(online)} <small>(${onlineCount})</small></span>
                </div>
            </div>
        `,
        background: '#1e1b4b',
        color: '#fff',
        showCloseButton: true,
        focusConfirm: false,
        confirmButtonText: 'Cerrar',
        customClass: {
            popup: 'glass-panel'
        }
    });
});
// --- Draggable Modals Utility ---
function makeDraggable(modalId) {
    const modalBackdrop = document.getElementById(modalId);
    if (!modalBackdrop) return;

    const modalCard = modalBackdrop.querySelector('.modal-card');
    if (!modalCard) return;

    // Ahora el "handle" es estrictamente el encabezado (h2) para no asobrar/bloquear el contenido (fotos, inputs interactivos)
    const handle = modalCard.querySelector('h2') || modalCard;

    // Solo cambiar el cursor al header, no a toda la tarjeta
    handle.style.cursor = 'move';

    let isDragging = false;
    let startX, startY;
    let initialTop, initialLeft;

    handle.addEventListener('mousedown', (e) => {
        // Solo arrastrar con botón primario
        if (e.button !== 0) return;

        // Si el click fue específicamente dentro del área de la foto (o es la foto), no iniciar drag del modal general
        if (e.target.closest('.photo-upload-area') || e.target.id === 'photo-preview') return;

        // IMPORTANTE: No arrastrar si el clic fue en un input, botón, select o textarea
        const tag = e.target.tagName.toLowerCase();
        const isInteractive = ['input', 'button', 'select', 'textarea', 'a', 'i', 'label'].includes(tag) ||
            e.target.closest('button') ||
            e.target.closest('a');

        if (isInteractive) return;

        isDragging = true;

        // Obtener posición inicial (considerando que puede haber sido movido antes)
        const style = window.getComputedStyle(modalCard);
        initialTop = parseInt(style.top) || 0;
        initialLeft = parseInt(style.left) || 0;

        startX = e.clientX;
        startY = e.clientY;

        handle.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none'; // Evitar selección de texto global

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        modalCard.style.top = `${initialTop + dy}px`;
        modalCard.style.left = `${initialLeft + dx}px`;
    }

    function onMouseUp() {
        if (!isDragging) return;
        isDragging = false;
        handle.style.cursor = 'move';
        document.body.style.userSelect = '';

        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    // Reset position when modal is closed (optional but recommended)
    const closeBtns = modalBackdrop.querySelectorAll('.close-modal');
    closeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modalCard.style.top = '0px';
            modalCard.style.left = '0px';
        });
    });
}

// Initialize draggability for all modals
document.addEventListener('DOMContentLoaded', () => {
    ['modal-validate', 'modal-new-order', 'modal-import', 'modal-import-text', 'modal-date-range', 'modal-manage-drivers'].forEach(makeDraggable);
});

// Helper para calcular minutos reales desde Hora TADA
function calculateRealTimeMinutes(horaTadaStr, now) {
    if (!horaTadaStr || horaTadaStr === '---') return null;
    try {
        let [time, modifier] = horaTadaStr.split(' ');
        let [hours, minutes] = time.split(':').map(Number);

        if (modifier) {
            modifier = modifier.replace(/\./g, "").toLowerCase(); // "a. m." -> "am"
            if (modifier.includes('p') && hours < 12) hours += 12;
            if (modifier.includes('a') && hours === 12) hours = 0;
        }

        // Crear objeto fecha para hoy con esa hora en Lima
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/Lima',
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric',
            hour12: false
        });
        const parts = formatter.formatToParts(now);
        const getP = (type) => parseInt(parts.find(p => p.type === type).value, 10);

        // Hora TADA en UTC-LIMA para comparación
        const tadaUtc = Date.UTC(getP('year'), getP('month') - 1, getP('day'), hours, minutes, 0);

        // Hora ACTUAL en UTC-LIMA
        let nH = getP('hour'); if (nH === 24) nH = 0;
        const nowUtc = Date.UTC(getP('year'), getP('month') - 1, getP('day'), nH, getP('minute'), 0);

        let diff = Math.floor((nowUtc - tadaUtc) / 60000);
        if (diff < -720) diff += 1440; // Caso cruce de medianoche (Tada ayer tarde vs Hoy temprano)
        return diff;
    } catch (e) {
        console.error("Error parseando Hora TADA Dashboard:", e);
        return null;
    }
}

// --- Sidebar Toggle Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('main-sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    const isCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
    if (isCollapsed && sidebar) sidebar.classList.add('collapsed');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed'));
        });
    }
});

// --- Auditoría POS Module ---
let auditFilesData = [];
let auditPosData = [];
let auditSystemData = [];
let matchedSysIds = new Set();
let currentAuditPosTotal = 0;
let currentAuditSysTotal = 0;

function openAuditoriaModal() {
    const modal = document.getElementById('modal-auditoria');
    modal.classList.add('active');
    
    // Poblar select de repartidores
    const select = document.getElementById('audit-driver');
    if (select) {
        select.innerHTML = '<option value="">Seleccionar Repartidor...</option>';
        if (window.allDriversList) {
            window.allDriversList.forEach(d => {
                select.innerHTML += `<option value="${d}">${d}</option>`;
            });
        }
    }
    
    // Resetear vistas
    document.getElementById('audit-upload-zone').classList.add('hidden');
    document.getElementById('audit-comparison-zone').classList.add('hidden');
    auditFilesData = [];
    document.getElementById('audit-previews').innerHTML = '';
}

function closeAuditoriaModal() {
    document.getElementById('modal-auditoria').classList.remove('active');
}

async function loadAuditData() {
    const driver = document.getElementById('audit-driver').value;
    const dateInput = document.getElementById('audit-date').value;
    
    if (!driver || !dateInput) {
        Swal.fire('Atención', 'Seleccione Repartidor y Fecha primero.', 'warning');
        return;
    }
    
    Swal.fire({ title: 'Consultando Sistema...', didOpen: () => Swal.showLoading() });
    
    try {
        const res = await fetchAPI('obtenerDataSistemaAudit', { 
            fecha: dateInput, 
            motorizado: driver 
        });
        
        if (res.success) {
            const rawData = res.data || [];
            
            // --- NUEVO: FILTRO ESTRICTO AUDITORÍA (v24.2) ---
            const allowedStatuses = ['validado', 'validado ag'];
            const allowedPayments = ['yape', 'plin', 'tarjeta'];
            
            auditSystemData = rawData.filter(s => {
                const est = (s.estado || '').toString().trim().toLowerCase();
                const pg = (s.pago || '').toString().trim().toLowerCase();
                
                const matchStatus = allowedStatuses.some(st => est === st);
                const matchPayment = allowedPayments.some(met => pg.includes(met));
                
                return matchStatus && matchPayment;
            });

            if (auditSystemData.length === 0) {
                Swal.fire('Atención', 'No se encontraron pedidos VALIDADOS con Tarjeta/QR para este repartidor.', 'info');
            } else {
                Swal.close();
                renderAuditTables();
            }
            document.getElementById('audit-upload-zone').classList.remove('hidden');
            document.getElementById('audit-comparison-zone').classList.add('hidden'); // Resetear vista previa
        } else {
            Swal.fire('Error', res.message || 'Error al consultar sistema', 'error');
        }
    } catch (e) {
        console.error("Error en loadAuditData:", e);
        Swal.fire('Error', 'Fallo de conexión al consultar sistema', 'error');
    }
}

async function handleAuditFiles(input) {
    const files = Array.from(input.files);
    if (files.length === 0) return;
    
    const previewContainer = document.getElementById('audit-previews');
    previewContainer.innerHTML = '';
    auditFilesData = [];

    Swal.fire({ title: 'Cargando imágenes...', didOpen: () => Swal.showLoading() });

    for (let file of files) {
        try {
            const b64_raw = await toBase64(file);
            const b64 = `data:${file.type};base64,${b64_raw}`;
            auditFilesData.push(b64);
            
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.style = 'position:relative; width:80px; height:80px; flex-shrink:0;';
            div.innerHTML = `
                <img src="${b64}" style="width:100%; height:100%; object-fit:cover; border-radius:8px; border:1px solid #60a5fa;">
            `;
            previewContainer.appendChild(div);
        } catch (e) {
            console.error("Error cargando imagen:", e);
        }
    }
    
    Swal.close();
    if (auditFilesData.length > 0) {
        processAuditImages();
    }
}

async function processAuditImages() {
    Swal.fire({ 
        title: 'IA Analizando Imágenes...', 
        text: 'Detectando pagos y eliminando repetidos por traslape.',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading() 
    });
    
    try {
        const res = await fetchAPI('extraerListaPOS', { imageBase64Array: auditFilesData });
        if (res.success) {
            auditPosData = res.data || [];
            document.getElementById('audit-comparison-zone').classList.remove('hidden');
            renderAuditTables();
            Swal.close();
        } else {
            Swal.fire('Error', res.message || 'Error al procesar imágenes', 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'Fallo de conexión con el servidor', 'error');
    }
}

function renderAuditTables() {
    const posTbody = document.getElementById('audit-pos-tbody');
    const sysTbody = document.getElementById('audit-system-tbody');
    
    posTbody.innerHTML = '';
    sysTbody.innerHTML = '';
    
    let totalPOS = 0;
    let totalSys = 0;
    matchedSysIds = new Set();

    // -- Detección de duplicados --
    const posMontoCounts = {};
    const posDigitsCounts = {};
    auditPosData.forEach(p => {
        posMontoCounts[p.monto] = (posMontoCounts[p.monto] || 0) + 1;
        if (p.tarjeta) posDigitsCounts[p.tarjeta] = (posDigitsCounts[p.tarjeta] || 0) + 1;
    });

    // -- Filtros Multi-selección Auditoría (Ahora AUTO v24.2) --
    // Ya vienen filtrados desde loadAuditData por ahorro de procesamiento
    const filteredSystemData = auditSystemData;

    const sysMontoCounts = {};
    const sysLlaveCounts = {};

    filteredSystemData.forEach(s => {
        const m = parseFloat(s.monto).toFixed(2);
        sysMontoCounts[m] = (sysMontoCounts[m] || 0) + 1;
        sysLlaveCounts[s.llave] = (sysLlaveCounts[s.llave] || 0) + 1;
    });

    // -- Agrupar POS por Página --
    const posByPage = {};
    auditPosData.forEach(p => {
        const pag = p.pagina || 1;
        if (!posByPage[pag]) posByPage[pag] = [];
        posByPage[pag].push(p);
    });

    const pages = Object.keys(posByPage).sort((a,b) => a-b);
    const allPosIds = [...new Set(auditPosData.map(p => p.posId).filter(id => id))];
    
    // 1. Mostrar lo que dice el POS (con agrupamiento por página)
    pages.forEach(pagNum => {
        const items = posByPage[pagNum];
        const isComplete = items.length === 10 || pagNum == pages[pages.length-1];
        const pagColor = isComplete ? '#60a5fa' : '#fbbf24'; 
        
        posTbody.innerHTML += `<tr style="background: rgba(0,0,0,0.3); font-weight: bold; border-left: 4px solid ${pagColor};">
            <td colspan="3" style="color: ${pagColor}; padding: 8px;">
                <i class="fa-solid fa-file-lines"></i> PÁGINA ${pagNum} (${items.length} registros)
                ${!isComplete ? ' - <small style="color:#fbbf24;">(Incompleta - Verificar)</small>' : ''}
            </td>
        </tr>`;

        items.forEach(pos => {
            totalPOS += pos.monto;
            const matchIdx = filteredSystemData.findIndex((sys, idx) => 
                !matchedSysIds.has(idx) && Math.abs(parseFloat(sys.monto) - pos.monto) < 0.01
            );
            
            let statusHtml = '<span style="color:#f87171;"><i class="fa-solid fa-xmark"></i> No en Sistema</span>';
            let matchedVoucherTime = '';
            if (matchIdx !== -1) {
                matchedSysIds.add(matchIdx);
                const matchedSys = filteredSystemData[matchIdx];
                matchedSys.matchedTime = pos.hora; // Guardar hora vinculada
                matchedVoucherTime = matchedSys.horaVoucher || '';
                statusHtml = '<span style="color:#4ade80;"><i class="fa-solid fa-check"></i> Conciliado</span>';
            }

            const montoDupe = posMontoCounts[pos.monto] > 1 ? 'background: rgba(245, 158, 11, 0.4);' : '';
            const posIdDiff = (allPosIds.length > 1) ? 'color: #fbbf24; border-bottom: 1px dashed;' : '';
            
            posTbody.innerHTML += `<tr>
                <td style="${montoDupe}">S/ ${pos.monto.toFixed(2)}<br><small style="color:#4ade80; font-weight:bold;">${matchedVoucherTime ? `<i class="fa-solid fa-receipt"></i> ${matchedVoucherTime}` : ''}</small></td>
                <td>
                    <span style="${posDigitsCounts[pos.tarjeta]>1?'color:#f87171;':''}">${pos.tarjeta ? '*' + pos.tarjeta : ''}</span>
                    <br><small style="${posIdDiff} opacity:0.7;">${pos.posId || 'POS-?'}</small>
                </td>
                <td>${statusHtml}</td>
            </tr>`;
        });
    });
    
    // 2. Mostrar lo que dice el Sistema (Filtrado)
    filteredSystemData.forEach((sys, idx) => {
        const montoFix = parseFloat(sys.monto).toFixed(2);
        totalSys += parseFloat(sys.monto);
        const isMatched = matchedSysIds.has(idx);

        const montoDupe = sysMontoCounts[montoFix] > 1 ? 'background: rgba(245, 158, 11, 0.4);' : '';
        sysTbody.innerHTML += `<tr>
            <td style="font-weight: bold;">
                ${sys.llave}
                <br><small style="opacity:0.6; font-size:0.8em;"><i class="fa-solid fa-clock"></i> TADA: ${sys.hora || ''}</small>
                <br><small style="color:#fbbf24; font-size:0.8em; font-weight:bold;"><i class="fa-solid fa-clock"></i> PEDIDO: ${sys.horaPedido || ''}</small>
            </td>
            <td style="${montoDupe}">S/ ${montoFix}</td>
            <td>${isMatched ? '<span style="color:#4ade80;">✅ SÍ</span>' : '<span style="color:#f87171;">❌ NO</span>'}</td>
        </tr>`;
    });
    
    // 3. Totales resaltados con Conteo y Conciliados (v25)
    currentAuditPosTotal = totalPOS;
    currentAuditSysTotal = totalSys;
    
    posTbody.innerHTML += `<tr style="background: rgba(96, 165, 250, 0.2); font-weight: bold; border-top: 2px solid #60a5fa;">
        <td style="color:#fff;">S/ ${totalPOS.toFixed(2)}</td>
        <td style="color:#fff;">${auditPosData.length} REGISTROS (POS)</td>
        <td>-</td>
    </tr>`;

    sysTbody.innerHTML += `<tr style="background: rgba(74, 222, 128, 0.2); font-weight: bold; border-top: 2px solid #4ade80;">
        <td style="color:#fff;">${filteredSystemData.length} REGISTROS (SISTEMA)</td>
        <td style="color:#fff;">S/ ${totalSys.toFixed(2)}</td>
        <td>-</td>
    </tr>`;

    // Calcular suma de montos conciliados
    let sumMatched = 0;
    matchedSysIds.forEach(idx => {
        sumMatched += (parseFloat(filteredSystemData[idx].monto) || 0);
    });

    const diff = totalPOS - totalSys;
    
    // Actualizar Pie de Resumen (v25)
    document.getElementById('summary-pos-total').innerHTML = `
        POS: S/ ${totalPOS.toFixed(2)} (${auditPosData.length} items) 
        <span style="color:#60a5fa; font-size:0.85em; margin-left:10px; font-weight: bold;">
            [Conc: S/ ${sumMatched.toFixed(2)} (${matchedSysIds.size})]
        </span>`;
    
    document.getElementById('summary-sys-total').innerHTML = `
        TADA: S/ ${totalSys.toFixed(2)} (${filteredSystemData.length} items)
        <span style="color:#4ade80; font-size:0.85em; margin-left:10px; font-weight: bold;">
            [Conc: S/ ${sumMatched.toFixed(2)} (${matchedSysIds.size})]
        </span>`;

    const diffEl = document.getElementById('summary-diff-total');
    diffEl.innerHTML = `Diferencia: S/ ${diff.toFixed(2)}`;
    diffEl.style.color = Math.abs(diff) < 0.05 ? '#4ade80' : '#f87171';
}

async function saveAuditReport() {
    const driver = document.getElementById('audit-driver').value;
    const date = document.getElementById('audit-date').value;
    
    const payload = {
        fechaReporte: date,
        repartidor: driver,
        montoSistema: currentAuditSysTotal,
        montoPOS: currentAuditPosTotal,
        conciliadosCount: matchedSysIds.size,
        faltantesPOS: auditPosData.length - matchedSysIds.size,
        faltantesSistema: auditSystemData.length - matchedSysIds.size,
        detalles: { pos: auditPosData, sistema: auditSystemData },
        usuario: currentUser.usuario,
        imagenes: auditFilesData // v23: Enviar fotos para archivo en Drive
    };
    
    Swal.fire({ title: 'Guardando reporte...', didOpen: () => Swal.showLoading() });
    
    try {
        const res = await fetchAPI('guardarAuditoriaPOS', payload);
        if (res.success) {
            Swal.fire('¡Éxito!', 'Reporte de auditoría guardado correctamente.', 'success');
            closeAuditoriaModal();
        } else {
            Swal.fire('Error', res.message, 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'Fallo al guardar reporte', 'error');
    }
}
