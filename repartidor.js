const API_URL = 'https://script.google.com/macros/s/AKfycbw0rSapCV9vhSSY5vW7z4JQFvjlcsLlEpPUdZqQLCtDx4T1LWFppLJriiW-4OyPl-IX/exec';

// State
let currentUser = localStorage.getItem('repartidor_user') || null;
let currentOrders = [];
let sortableInstance = null; // Instancia global de SortableJS
let activeTimers = {};
let selectedOrderForCapture = null;
let selectedCaptureMode = 'pos'; // 'pos', 'efectivo', 'online'
let isAdminListView = false; // Feature flag for testing
let quickShareOrder = null;
let quickShareMode = 'salida'; // 'salida' o 'devolucion'

// DOM Elements
const pantallaLogin = document.getElementById('pantalla-login');
const pantallaRuta = document.getElementById('pantalla-ruta');
const pantallaMapa = document.getElementById('pantalla-mapa');
const inputDriver = document.getElementById('driver-name-input');
const inputDriverPass = document.getElementById('driver-pass-input');
const btnTogglePass = document.getElementById('btn-toggle-pass');
const btnIngresar = document.getElementById('btn-ingresar');
const lblDriverName = document.getElementById('lbl-driver-name');
const lblPedidosCount = document.getElementById('lbl-pedidos-count');
const btnActualizar = document.getElementById('btn-actualizar');
const btnCerrarRuta = document.getElementById('btn-cerrar-ruta');
const containerPedidos = document.getElementById('lista-pedidos-container');
const loadingPedidos = document.getElementById('loading-pedidos');
const btnSwitchView = document.getElementById('btn-switch-to-list');
const inputQuickShare = document.getElementById('input-quick-share');

// Modal Elements
const modalCaptura = document.getElementById('modal-captura');
const btnCerrarModal = document.getElementById('btn-cerrar-modal');
const lblModalLlave = document.getElementById('lbl-modal-llave');
const lblTipoPagoModal = document.getElementById('lbl-tipo-pago-modal');
const btnEnviarWsp = document.getElementById('btn-enviar-wsp');

// Photo Inputs
const inputPos = document.getElementById('input-foto-pos');
const btnUiPos = document.getElementById('btn-ui-pos');
const iconPos = document.getElementById('icon-pos');
const previewPos = document.getElementById('preview-pos');

const inputEvidencia = document.getElementById('input-foto-evidencia');
const btnUiEvidencia = document.getElementById('btn-ui-evidencia');
const iconEvidencia = document.getElementById('icon-evidencia');
const previewEvidencia = document.getElementById('preview-evidencia');

// Data
let photoPosFile = null;
let photoEvidenciaFile = null;

// Cancel Modal Elements
const modalCancelacion = document.getElementById('modal-cancelacion');
const btnCerrarCancel = document.getElementById('btn-cerrar-cancel');
const lblCancelLlave = document.getElementById('lbl-cancel-llave');
const btnEnviarCancel = document.getElementById('btn-enviar-cancel');

// Cancel Photo Inputs
const inputCancelEvidencia = document.getElementById('input-cancel-evidencia');
const btnUiCancelEvidencia = document.getElementById('btn-ui-cancel-evidencia');
const iconCancelEvidencia = document.getElementById('icon-cancel-evidencia');
const previewCancelEvidencia = document.getElementById('preview-cancel-evidencia');

const inputCancelFachada = document.getElementById('input-cancel-fachada');
const btnUiCancelFachada = document.getElementById('btn-ui-cancel-fachada');
const iconCancelFachada = document.getElementById('icon-cancel-fachada');
const previewCancelFachada = document.getElementById('preview-cancel-fachada');

// Cancel Data
let photoCancelEvidenciaFile = null;
let photoCancelFachadaFile = null;
let selectedOrderForCancel = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.loadOrders = fetchDriverOrders; // For mapa.js compatibility
    // Compatibility for mapa.js which relies on fetchAPI from app.js
    window.fetchAPI = async function (action, data = {}) {
        const payload = { action, ...data };
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        return await response.json();
    };

    // Check if previously logged in
    const savedDriver = localStorage.getItem('activeDriver');
    if (savedDriver) {
        autoLoginData(savedDriver);
    }

    if (btnTogglePass) {
        btnTogglePass.addEventListener('click', () => {
            const type = inputDriverPass.getAttribute('type') === 'password' ? 'text' : 'password';
            inputDriverPass.setAttribute('type', type);
            btnTogglePass.querySelector('i').classList.toggle('fa-eye');
            btnTogglePass.querySelector('i').classList.toggle('fa-eye-slash');
        });
    }

    inputDriver.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && inputDriverPass) inputDriverPass.focus();
    });

    if (inputDriverPass) {
        inputDriverPass.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') btnIngresar.click();
        });
    }

    btnIngresar.addEventListener('click', () => {
        const name = inputDriver.value.trim();
        const pass = inputDriverPass.value.trim();
        if (name && pass) {
            loginDriver(name, pass);
        } else {
            Swal.fire({ icon: 'warning', title: 'Atención', text: 'Ingresa nombre y contraseña', confirmButtonColor: '#3085d6' });
        }
    });

    btnCerrarRuta.addEventListener('click', () => {
        Swal.fire({
            title: '¿Terminar Ruta?',
            text: "Saldrás de tu sesión actual.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Sí, salir'
        }).then((result) => {
            if (result.isConfirmed) {
                localStorage.removeItem('activeDriver');
                currentUser = null;
                stopAllTimers();
                pantallaRuta.classList.add('hidden');
                pantallaRuta.classList.remove('flex');
                pantallaLogin.classList.remove('hidden');
                pantallaLogin.classList.add('flex');
                inputDriver.value = '';
                inputDriverPass.value = '';
            }
        });
    });

    const btnCerrarMapa = document.getElementById('btn-cerrar-mapa');
    if (btnCerrarMapa) {
        btnCerrarMapa.addEventListener('click', () => {
            Swal.fire({
                title: '¿Cerrar sesión?',
                text: "Saldrás de la vista de administrador.",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Sí, salir'
            }).then((result) => {
                if (result.isConfirmed) {
                    localStorage.removeItem('activeDriver');
                    currentUser = null;
                    pantallaMapa.classList.add('hidden');
                    pantallaMapa.classList.remove('flex');
                    pantallaLogin.classList.remove('hidden');
                    pantallaLogin.classList.add('flex');
                    inputDriver.value = '';
                    inputDriverPass.value = '';
                }
            });
        });
    }

    btnActualizar.addEventListener('click', () => {
        if (currentUser) fetchDriverOrders();
    });

    // Modal Close
    btnCerrarModal.addEventListener('click', () => {
        modalCaptura.classList.add('hidden');
        modalCaptura.classList.remove('flex');
        resetModalState();
    });

    // File Inputs Handlers
    inputPos.addEventListener('change', (e) => handlePhotoCapture(e, 'pos'));
    inputEvidencia.addEventListener('change', (e) => handlePhotoCapture(e, 'evidencia'));

    // Respaldo: clic programático en los botones visuales para abrir la cámara
    // (el overlay con opacity-0 no siempre funciona en móviles)
    btnUiPos.addEventListener('click', () => inputPos.click());
    btnUiEvidencia.addEventListener('click', () => inputEvidencia.click());

    // Share to WhatsApp
    btnEnviarWsp.addEventListener('click', handleSendToWhatsApp);

    // --- Cancel Modal Listeners ---
    btnCerrarCancel.addEventListener('click', () => {
        modalCancelacion.classList.add('hidden');
        modalCancelacion.classList.remove('flex');
        resetCancelModalState();
    });

    inputCancelEvidencia.addEventListener('change', (e) => handleCancelPhotoCapture(e, 'evidencia'));
    inputCancelFachada.addEventListener('change', (e) => handleCancelPhotoCapture(e, 'fachada'));
    btnUiCancelEvidencia.addEventListener('click', () => inputCancelEvidencia.click());
    btnUiCancelFachada.addEventListener('click', () => inputCancelFachada.click());
    btnEnviarCancel.addEventListener('click', handleSendCancelToWhatsApp);

    // Quick Share Listener
    if (inputQuickShare) {
        inputQuickShare.addEventListener('change', (e) => processQuickShare(e));
    }

    // Switch View Listener (Admin only)
    if (btnSwitchView) {
        btnSwitchView.addEventListener('click', toggleAdminView);
    }

    // v19.2: Auto-refresco automático de pedidos cada 5 minutos
    setInterval(() => {
        if (currentUser) {
            console.log('🔄 Auto-refrescando pedidos asignados...');
            fetchDriverOrders();
        }
    }, 300000);
});

function autoLoginData(name) {
    currentUser = name;

    pantallaLogin.classList.add('hidden');
    pantallaLogin.classList.remove('flex');

    // UNIFICADO: Todos los usuarios van directo a la vista de LISTA (Ruta)
    lblDriverName.textContent = name;
    pantallaRuta.classList.remove('hidden');
    pantallaRuta.classList.add('flex');

    // Ocultar mapa por ahora para evitar conflictos
    if (pantallaMapa) {
        pantallaMapa.classList.add('hidden');
        pantallaMapa.classList.remove('flex');
    }

    if (btnSwitchView) btnSwitchView.classList.add('hidden'); // Ocultar switch de modo
    fetchDriverOrders();
}

function toggleAdminView() {
    isAdminListView = !isAdminListView;
    if (isAdminListView) {
        pantallaMapa.classList.add('hidden');
        pantallaMapa.classList.remove('flex');
        pantallaRuta.classList.remove('hidden');
        pantallaRuta.classList.add('flex');
        lblDriverName.textContent = "Admin Mode";
        btnSwitchView.innerHTML = '<i class="fa-solid fa-map"></i>';
    } else {
        pantallaRuta.classList.add('hidden');
        pantallaRuta.classList.remove('flex');
        pantallaMapa.classList.remove('hidden');
        pantallaMapa.classList.add('flex');
        btnSwitchView.innerHTML = '<i class="fa-solid fa-list-check"></i>';
    }
    fetchDriverOrders();
}

async function loginDriver(name, pass) {
    btnIngresar.disabled = true;
    const originalText = btnIngresar.innerHTML;
    btnIngresar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Validando...</span>';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'loginMotorizado', user: name, pass: pass })
        });
        const data = await response.json();

        if (data.success) {
            localStorage.setItem('activeDriver', data.user);
            autoLoginData(data.user);
        } else {
            Swal.fire({ icon: 'error', title: 'Error', text: data.message || 'Credenciales incorrectas', confirmButtonColor: '#3085d6' });
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo conectar con el servidor', confirmButtonColor: '#3085d6' });
    } finally {
        btnIngresar.disabled = false;
        btnIngresar.innerHTML = originalText;
    }
}

async function fetchDriverOrders() {
    if (currentUser && currentUser.toLowerCase() === 'admin') {
        const loadingMapa = document.getElementById('loading-mapa');
        if (loadingMapa) loadingMapa.classList.remove('hidden');
    } else {
        containerPedidos.innerHTML = '';
        containerPedidos.appendChild(loadingPedidos);
        loadingPedidos.classList.remove('hidden');
    }
    stopAllTimers();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'listarPedidos' })
        });
        const data = await response.json();

        if (data && data.success) {
            const rawOrders = Array.isArray(data.data) ? data.data : [];
            window.orders = rawOrders; // Global for mapa.js

            // DEBUG: Ver qué llega del servidor
            console.log('📦 Total pedidos recibidos:', rawOrders.length);
            console.log('👤 currentUser:', currentUser);

            // UNIFICADO: Siempre renderizar modo LISTA para todos
            if (true) {
                currentOrders = rawOrders.filter(o => {
                    const statusOk = (o.estado === 'Pendiente' || o.estado === 'En Camino' || o.estado === 'Reservado' || o.estado === '');
                    // Si es Admin (o modo admin list), ve TODO lo activo. Si es repartidor, solo lo suyo.
                    const isUserAdmin = (currentUser && currentUser.toLowerCase() === 'admin');
                    if (isAdminListView || isUserAdmin) return statusOk;
                    return statusOk && o.envio && String(o.envio).trim().toLowerCase() === String(currentUser).trim().toLowerCase();
                }).sort((a, b) => {
                    // Try to extract strict numbers, fallback to large number if not set or invalid
                    const orderA = a.orden_ruta !== undefined && a.orden_ruta !== '' && !isNaN(a.orden_ruta) ? parseInt(a.orden_ruta, 10) : Number.MAX_SAFE_INTEGER;
                    const orderB = b.orden_ruta !== undefined && b.orden_ruta !== '' && !isNaN(b.orden_ruta) ? parseInt(b.orden_ruta, 10) : Number.MAX_SAFE_INTEGER;

                    // Compare valid assigned routes
                    if (orderA !== Number.MAX_SAFE_INTEGER && orderB !== Number.MAX_SAFE_INTEGER) {
                        return orderA - orderB;
                    }

                    // Put assigned routes BEFORE unassigned ones
                    if (orderA !== Number.MAX_SAFE_INTEGER) return -1;
                    if (orderB !== Number.MAX_SAFE_INTEGER) return 1;

                    // If neither has an assigned route from the backend, sort by nro descending (newest first)
                    return b.nro - a.nro;
                });

                renderOrders();
            }
        } else {
            console.warn('Servidor respondió sin éxito o data es null', data);
            throw new Error(data ? data.message : 'Error parseando datos');
        }
    } catch (error) {
        console.error("Fetch error capturado:", error);
        if (!pantallaRuta.classList.contains('hidden') || (pantallaMapa && !pantallaMapa.classList.contains('hidden'))) {
            Swal.fire({
                icon: 'warning',
                toast: true,
                position: 'top-end',
                title: 'Conexión débil o sin datos',
                showConfirmButton: false,
                timer: 3000
            });
        }
    } finally {
        loadingPedidos.classList.add('hidden');
        const loadingMapa = document.getElementById('loading-mapa');
        if (loadingMapa) loadingMapa.classList.add('hidden');
    }
}

function renderOrders() {
    containerPedidos.innerHTML = '';
    lblPedidosCount.textContent = currentOrders.length;

    if (currentOrders.length === 0) {
        containerPedidos.innerHTML = `
            <div class="text-center py-12 px-4 border border-dashed border-slate-700 rounded-2xl">
                <i class="fa-solid fa-mug-hot text-4xl text-slate-500 mb-4"></i>
                <h3 class="text-xl font-bold text-slate-300">Sin Pedidos</h3>
                <p class="text-slate-500 mt-2">No tienes pedidos pendientes de entrega asignados a tu nombre.</p>
            </div>
        `;
        return;
    }

    currentOrders.forEach((order, index) => {
        // Parse time for the clock
        let registerDate = null;
        if (order.fecha) {
            // Try to parse the ISO string or similar format from the Google server
            registerDate = new Date(order.fecha);
        }

        const tipoPagoDisplay = (order.pago || 'Desconocido').toUpperCase();
        let tipoIcon = 'wallet';
        let tipoColor = 'text-slate-400 bg-slate-800';

        if (tipoPagoDisplay.includes('EFECTIVO')) {
            tipoIcon = 'money-bill';
            tipoColor = 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
        } else if (tipoPagoDisplay.includes('TARJETA') || tipoPagoDisplay.includes('POS')) {
            tipoIcon = 'credit-card';
            tipoColor = 'text-purple-400 bg-purple-400/10 border-purple-400/20';
        } else if (tipoPagoDisplay.includes('QR') || tipoPagoDisplay.includes('YAPE') || tipoPagoDisplay.includes('PLIN')) {
            tipoIcon = 'qrcode';
            tipoColor = 'text-teal-400 bg-teal-400/10 border-teal-400/20';
        } else if (tipoPagoDisplay.includes('ONLINE')) {
            tipoIcon = 'globe';
            tipoColor = 'text-blue-400 bg-blue-400/10 border-blue-400/20';
        }

        const monto = parseFloat(order.monto) || 0;

        const card = document.createElement('div');
        card.className = 'bg-cardDark rounded-2xl p-4 shadow-lg border border-slate-700/50 active:scale-[0.98] transition-all cursor-pointer';

        // --- LOGICA VISTA MINIMAL (DEVOLUCION) ---
        if (order.esperandoDevolucion) {
            card.innerHTML = `
                <div class="flex items-center justify-between">
                    <div>
                        <span class="text-xs text-orange-400 font-medium uppercase tracking-wider block mb-1">Pendiente Devolución</span>
                        <span class="text-2xl font-bold tracking-tight text-white">${order.llave || `PED-${order.nro}`}</span>
                    </div>
                    </div>
                    <button class="w-12 h-12 rounded-full bg-orange-500 border-2 border-orange-400 text-white flex items-center justify-center text-xl shadow-lg active:scale-90 transition-all" 
                            onclick="event.stopPropagation(); startQuickShare(${index}, 'devolucion')" title="Paso 3: Foto Devolución">
                        <i class="fa-solid fa-rotate-left"></i>
                    </button>
                </div>
            `;
            containerPedidos.appendChild(card);
            return;
        }

        card.onclick = (e) => {
            // Si se hizo clic en el botón cancelar, no abrir el modal de entrega
            if (e.target.closest('.btn-cancelar-pedido')) return;
            openActionSelector(order);
        };

        const isFirst = index === 0;
        const isLast = index === currentOrders.length - 1;

        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div class="flex items-center gap-2">
                    <!-- Controles de Orden (Flechas + Grip) -->
                    <div class="flex flex-col items-center gap-1 pr-2 border-r border-slate-700/50">
                        <button onclick="event.stopPropagation(); moveOrderManual(${index}, -1)" 
                                class="w-8 h-7 flex items-center justify-center text-slate-500 hover:text-white transition-colors ${isFirst ? 'opacity-0 pointer-events-none' : ''}">
                            <i class="fa-solid fa-chevron-up text-xs"></i>
                        </button>
                        <div class="handle w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 cursor-grab active:cursor-grabbing hover:bg-slate-700 transition-colors border border-slate-700 shadow-sm" style="touch-action: none;">
                            <i class="fa-solid fa-grip-lines text-lg text-slate-500"></i>
                        </div>
                        <button onclick="event.stopPropagation(); moveOrderManual(${index}, 1)" 
                                class="w-8 h-7 flex items-center justify-center text-slate-500 hover:text-white transition-colors ${isLast ? 'opacity-0 pointer-events-none' : ''}">
                            <i class="fa-solid fa-chevron-down text-xs"></i>
                        </button>
                    </div>

                    <button class="w-12 h-12 rounded-full bg-blue-500 border-2 border-blue-400 text-white flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-blue-500/20 ${order.estado !== 'Pendiente' ? 'hidden' : ''}" 
                            onclick="event.stopPropagation(); startQuickShare(${index}, 'salida')" title="Paso 1: Salida">
                        <i class="fa-solid fa-upload text-xl"></i>
                    </button>
                    
                    <div class="ml-1">
                        <span class="text-xs text-slate-400 font-medium uppercase tracking-wider block mb-0.5">Llave</span>
                        <span class="text-2xl font-bold tracking-tight text-white">${order.llave || `PED-${order.nro}`}</span>
                    </div>
                </div>
                <div class="text-right flex flex-col items-end">
                    <span class="text-xs text-slate-400 font-medium uppercase tracking-wider block mb-1">A Cobrar</span>
                    <span class="text-2xl font-bold text-amber-400">S/ ${monto.toFixed(2)}</span>
                </div>
            </div>
            
            <div class="flex items-center justify-between mt-4">
                <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold ${tipoColor}">
                    <i class="fa-solid fa-${tipoIcon}"></i>
                    ${tipoPagoDisplay}
                </span>
                
                <div class="flex items-center gap-3">
                    <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800" id="timer-box-${order.nro}">
                        <i class="fa-solid fa-clock text-slate-400" id="timer-icon-${order.nro}"></i>
                        <span class="font-mono font-bold text-slate-300" id="timer-text-${order.nro}">--:--</span>
                    </div>
                    <button class="btn-cancelar-pedido w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 text-red-400/60 hover:text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-all text-sm" onclick="event.stopPropagation(); openCancelModal(currentOrders[${index}])" title="Cancelar Pedido">
                        <i class="fa-solid fa-ban"></i>
                    </button>
                </div>
            </div>
        `;

        containerPedidos.appendChild(card);

        if (registerDate && !isNaN(registerDate)) {
            startTimer(order.nro, registerDate, order.llave || `PED-${order.nro}`);
        }
    });
    // --- Drag and Drop Sorting Logic ---
    if (window.Sortable) {
        // Limpiar instancia previa para evitar duplicados o pérdida de eventos táctiles
        if (sortableInstance) {
            sortableInstance.destroy();
        }

        sortableInstance = Sortable.create(containerPedidos, {
            animation: 300,            // Animación suave de 300ms
            handle: '.handle',         // Solo permite arrastrar desde el icono
            ghostClass: 'bg-slate-700', // Sombra de donde viene
            chosenClass: 'scale-[1.02]', // Efecto de selección
            dragClass: 'opacity-100',   // Opacidad total al arrastrar
            forceFallback: true,        // Mejora estabilidad en iOS/Android
            fallbackOnBody: true,
            swapThreshold: 0.65,        // Hace que el intercambio sea más intuitivo
            onEnd: function (evt) {
                if (evt.oldIndex === evt.newIndex) return;

                // 1. Sincronizar el array local inmediatamente
                const movedItem = currentOrders.splice(evt.oldIndex, 1)[0];
                currentOrders.splice(evt.newIndex, 0, movedItem);

                // 2. Guardar el nuevo orden en el servidor (Columna S)
                saveOrderRouteToServer();
            }
        });
    }
}

async function saveOrderRouteToServer() {
    if (!currentUser) return;

    // Extraer solo los IDs (Nro) en el orden actual de la pantalla
    const orderedIds = currentOrders.map(o => String(o.nro));

    console.log("💾 Guardando nuevo orden de ruta para:", currentUser);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'guardarOrdenRutaMotorizado',
                responsable: currentUser,
                orderedIds: orderedIds
            })
        });
        const res = await response.json();
        if (res.success) {
            console.log("✅ Orden de ruta guardado en el servidor");
        }
    } catch (err) {
        console.error("❌ Error guardando orden de ruta:", err);
    }
}

function moveOrderManual(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= currentOrders.length) return;

    // Intercambiar elementos
    const item = currentOrders.splice(index, 1)[0];
    currentOrders.splice(newIndex, 0, item);

    // Re-renderizar lista
    renderOrders();

    // Guardar en servidor
    saveOrderRouteToServer();
}

// --- Timers Logic ---
const audioAlerta = new Audio('data:audio/mp3;base64,//OExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'); // Minimal silent audio to initialize object
// A simple oscillator beep function as fallback for mobile without actual sound files
// Sonido suave para zona naranja (advertencia)
function playBeepSoft() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime); // Tono bajo suave (La4)
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime); // Volumen muy suave
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        setTimeout(() => osc.stop(), 500);
    } catch (e) { console.log("Audio not supported"); }
}

// Pitido urgente para zona roja (¡atención!)
function playBeepUrgent() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // Triple pitido urgente: pip-pip-pip
        [0, 0.25, 0.5].forEach(delay => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'square'; // Onda cuadrada = más agresivo
            osc.frequency.setValueAtTime(1200, audioCtx.currentTime + delay); // Tono alto urgente
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + 0.15);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(audioCtx.currentTime + delay);
            osc.stop(audioCtx.currentTime + delay + 0.15);
        });
    } catch (e) { console.log("Audio not supported"); }
}

// Track which orders already showed the 30-min alert popup
const alertedOrders30 = new Set();

function startTimer(orderId, startTime, llave) {
    let lastVibratedMinute = -1; // Track to vibrate once per minute, not every 10s

    const updateTime = () => {
        const now = new Date();
        const diffMs = now - startTime;
        const diffMins = Math.floor(diffMs / 60000);

        const box = document.getElementById(`timer-box-${orderId}`);
        const text = document.getElementById(`timer-text-${orderId}`);
        const icon = document.getElementById(`timer-icon-${orderId}`);

        if (!box || !text) return;

        text.textContent = `${diffMins} min`;

        if (diffMins >= 30) {
            // ROJO: ¡Retrasado! Parpadeo + pitido urgente
            box.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/50 animate-pulse';
            text.className = 'font-mono font-bold text-red-500';
            icon.className = 'fa-solid fa-clock text-red-500';

            // Alerta popup UNA SOLA VEZ cuando cruza los 30 min
            if (!alertedOrders30.has(orderId)) {
                alertedOrders30.add(orderId);
                if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);
                playBeepUrgent();
                Swal.fire({
                    icon: 'warning',
                    title: '🔥 ¡No quemes la Llave!',
                    html: `<b>${llave}</b> lleva <b>${diffMins} minutos</b>.<br>¡Apúrate!`,
                    confirmButtonColor: '#ef4444',
                    confirmButtonText: 'Entendido',
                    timer: 8000,
                    timerProgressBar: true
                });
            }

            // Vibración + pitido cada minuto (no cada 10s)
            if (diffMins !== lastVibratedMinute) {
                lastVibratedMinute = diffMins;
                playBeepUrgent();
                if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
            }
        } else if (diffMins >= 20) {
            // NARANJA: Advertencia, apúrate
            box.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/20 border border-orange-500/50';
            text.className = 'font-mono font-bold text-orange-500';
            icon.className = 'fa-solid fa-clock text-orange-500';
            // Vibración suave cada minuto
            if (diffMins !== lastVibratedMinute) {
                lastVibratedMinute = diffMins;
                playBeepSoft();
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            }
        } else {
            // VERDE: Todo bien, a tiempo
            box.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20';
            text.className = 'font-mono font-bold text-emerald-400';
            icon.className = 'fa-solid fa-clock text-emerald-400';
        }
    };

    updateTime(); // Initial update
    activeTimers[orderId] = setInterval(updateTime, 10000); // Update every 10 seconds to save battery
}

function stopAllTimers() {
    Object.values(activeTimers).forEach(clearInterval);
    activeTimers = {};
}

// --- Action Selector Logic ---
function openActionSelector(order) {
    selectedOrderForCapture = order;

    // Mapeo Automático Basado en "Pago Original"
    const pStr = (order.pago || '').toString().trim().toUpperCase();
    let autoMode = null;

    if (pStr.includes('CONTADO')) {
        autoMode = 'efectivo';
    } else if (pStr.includes('LÍNEA') || pStr.includes('LINEA')) {
        autoMode = 'online';
    } else if (pStr.includes('YAPE') || pStr.includes('PLIN') || pStr.includes('QR') || pStr.includes('TARJETA') || pStr.includes('POS')) {
        autoMode = 'pos';
    }

    if (autoMode) {
        selectAction(autoMode);
        return;
    }

    // Si no se reconoce (o por si acaso), mostrar el selector manual
    document.getElementById('lbl-selector-llave').textContent = order.llave || `PED-${order.nro}`;
    const modal = document.getElementById('modal-selector-accion');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeActionSelector() {
    const modal = document.getElementById('modal-selector-accion');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

function selectAction(mode) {
    closeActionSelector();
    if (mode === 'cancelar') {
        openCancelModal(selectedOrderForCapture);
    } else {
        selectedCaptureMode = mode;
        openCaptureModal(selectedOrderForCapture);
    }
}

// --- Capture Modal Logic ---
function openCaptureModal(order) {
    selectedOrderForCapture = order;
    lblModalLlave.textContent = order.llave || `PED-${order.nro}`;

    if (selectedCaptureMode === 'online') {
        lblTipoPagoModal.textContent = 'Evidencia Online';
    } else if (selectedCaptureMode === 'efectivo') {
        lblTipoPagoModal.textContent = 'Pago en Efectivo';
    } else {
        lblTipoPagoModal.textContent = 'Voucher POS';
    }

    resetModalState();
    modalCaptura.classList.remove('hidden');
    modalCaptura.classList.add('flex');
}

function resetModalState() {
    photoPosFile = null;
    photoEvidenciaFile = null;

    // Reset UI POS
    btnUiPos.className = `btn-ui bg-slate-800 border-2 border-dashed border-slate-600 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-colors`;
    iconPos.className = `w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-2xl`;
    iconPos.innerHTML = '<i class="fa-solid fa-receipt"></i>';
    previewPos.classList.add('hidden');
    previewPos.src = '';

    // Reset UI Evidencia
    btnUiEvidencia.className = `btn-ui bg-slate-800 border-2 border-dashed border-slate-600 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-colors`;
    iconEvidencia.className = `w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-2xl`;
    iconEvidencia.innerHTML = '<i class="fa-solid fa-box-open"></i>';
    previewEvidencia.classList.add('hidden');
    previewEvidencia.src = '';

    checkReadyToShare();
}

function handlePhotoCapture(e, type) {
    const file = e.target.files[0];
    if (!file) return;

    // Compress image slightly to save data
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200; // Reasonable for whatsapp
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Get compressed image
            canvas.toBlob((blob) => {
                const compressedFile = new File([blob], `photo_${type}.jpg`, { type: 'image/jpeg' });
                const blobUrl = URL.createObjectURL(compressedFile);

                if (type === 'evidencia') {
                    photoEvidenciaFile = compressedFile;
                    previewEvidencia.src = blobUrl;
                    previewEvidencia.classList.remove('hidden');
                    // Style change
                    btnUiEvidencia.classList.replace('border-slate-600', 'border-emerald-500');
                    btnUiEvidencia.classList.replace('border-dashed', 'border-solid');
                    iconEvidencia.classList.replace('bg-slate-700', 'bg-emerald-500');
                    iconEvidencia.classList.replace('text-slate-300', 'text-white');
                    iconEvidencia.innerHTML = '<i class="fa-solid fa-check"></i>';
                } else {
                    photoPosFile = compressedFile;
                    previewPos.src = blobUrl;
                    previewPos.classList.remove('hidden');
                    // Style change
                    btnUiPos.classList.replace('border-slate-600', 'border-emerald-500');
                    btnUiPos.classList.replace('border-dashed', 'border-solid');
                    iconPos.classList.replace('bg-slate-700', 'bg-emerald-500');
                    iconPos.classList.replace('text-slate-300', 'text-white');
                    iconPos.innerHTML = '<i class="fa-solid fa-check"></i>';
                }

                checkReadyToShare();
            }, 'image/jpeg', 0.8);
        }
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function checkReadyToShare() {
    if (photoPosFile && photoEvidenciaFile) {
        btnEnviarWsp.removeAttribute('disabled');
        btnEnviarWsp.classList.add('animate-pulse');

        // --- AUTOMATIZACIÓN PASO 2 ---
        // Al capturar la segunda foto, disparamos el envío de inmediato (background)
        console.log("⚡ Auto-disparando envío de WhatsApp...");
        handleSendToWhatsApp();
    } else {
        btnEnviarWsp.setAttribute('disabled', 'true');
        btnEnviarWsp.classList.remove('animate-pulse');
    }
}

// --- WhatsApp Fusion and Share Logic ---
async function uploadPosSilently(file, orderKey) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async () => {
            const base64Str = reader.result.split(',')[1];
            try {
                // Post silent hidden backup to keep OCR intact
                const jsonPayload = JSON.stringify({
                    action: 'guardarFotoOcr',
                    llave: orderKey,
                    fotoBase64: base64Str
                });

                // Wait for the response to see if there's an error
                const response = await fetch(API_URL, {
                    method: 'POST',
                    body: jsonPayload
                });
                const result = await response.json();
                console.log("Resultado de Google Drive subida silenciosa:", result);
                if (!result.success) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error de Google Drive',
                        text: 'TÓMALE CAPTURA A ESTO: ' + (result.msg || 'Desconocido'),
                        confirmButtonText: 'Entendido'
                    });
                    resolve(false); // Indicates failure
                    return;
                }
                resolve(true); // Indicates success
            } catch (e) {
                console.error("Error catched en uploadPosSilently:", e);
                Swal.fire({
                    icon: 'error',
                    title: 'Error de Red Silencioso',
                    text: 'TÓMALE CAPTURA A ESTO: ' + e.toString(),
                    confirmButtonText: 'Entendido'
                });
                resolve(false);
            }
        };
        reader.readAsDataURL(file);
    });
}
async function handleSendToWhatsApp() {
    // Capturamos los datos actuales para que la tarea de fondo no se confunda si el usuario cambia de pedido
    const orderRef = { ...selectedOrderForCapture };
    const posFileRef = photoPosFile;
    const eviFileRef = photoEvidenciaFile;
    const modeRef = selectedCaptureMode;
    const userRef = currentUser;

    // 1. INICIAR TAREAS DE FONDO (SIN AWAIT)
    console.log("🚀 Iniciando tareas de servidor en segundo plano para:", orderRef.llave);

    // Tarea A: Subida silenciosa a Google Drive
    uploadPosSilently(posFileRef, orderRef.llave).then(res => {
        if (!res) console.error("❌ Falló la subida a Drive en segundo plano");
        else console.log("✅ Foto guardada en Drive exitosamente (background)");
    });

    // Tarea B: Marcar como "Por Validar" en el Excel
    const payloadValidar = { action: 'marcarPorValidar', nro: orderRef.nro };
    if (modeRef === 'efectivo' || modeRef === 'online') {
        const nowLima = new Date().toLocaleString('en-US', { timeZone: 'America/Lima' });
        const limaDate = new Date(nowLima);
        payloadValidar.fechaEntrega = limaDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        payloadValidar.horaEntrega = limaDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(payloadValidar)
    }).catch(e => console.warn('⚠️ Error background marcando Por Validar', e));

    // 2. FLUJO INMEDIATO DE WHATSAPP (SIN ESPERAR AL SERVIDOR)
    const money = parseFloat(orderRef.monto).toFixed(2);
    const llave = orderRef.llave || `PED-${orderRef.nro}`;
    const msgText = `✅ PEDIDO ENTREGADO\n📦 Llave: ${llave}\n💵 Monto: S/ ${money}\n🏍️ Repartidor: ${userRef}`;

    // Enviamos las fotos por separado (juntas en la acción de compartir) pero manteniendo el texto único
    const filesToSend = [posFileRef, eviFileRef];

    // Escondemos el modal de la cámara de inmediato
    modalCaptura.classList.add('hidden');
    modalCaptura.classList.remove('flex');

    Swal.fire({
        title: `¡Listo para enviar!`,
        text: `La evidencia de ${llave} se está guardando. Ya puedes enviarla por WhatsApp.`,
        icon: 'success',
        confirmButtonText: '<i class="fa-brands fa-whatsapp pt-1"></i> Ir a WhatsApp',
        confirmButtonColor: '#25D366',
        allowOutsideClick: false
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                if (navigator.canShare && navigator.canShare({ files: filesToSend })) {
                    await navigator.share({
                        title: 'Evidencia de Entrega',
                        text: msgText,
                        files: filesToSend
                    });
                } else {
                    // Fallback si no soporta compartir archivos
                    try { await navigator.clipboard.writeText(msgText); } catch (e) { }
                    window.location.href = `https://wa.me/?text=${encodeURIComponent(msgText)}`;
                }

                // 3. Preguntar si hay devolución
                Swal.fire({
                    title: '¿Tienes devolución?',
                    text: `¿El cliente de "${llave}" entregó envases vacíos?`,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Si, hay envases',
                    cancelButtonText: 'No, todo conforme',
                    confirmButtonColor: '#f59e0b',
                    cancelButtonColor: '#10b981',
                    allowOutsideClick: false
                }).then((qaResult) => {
                    if (qaResult.isConfirmed) {
                        const order = currentOrders.find(o => o.nro === orderRef.nro);
                        if (order) {
                            order.esperandoDevolucion = true;
                            renderOrders();
                        }
                    } else {
                        currentOrders = currentOrders.filter(o => o.nro !== orderRef.nro);
                        renderOrders();
                    }
                });

            } catch (shareError) {
                if (shareError.name !== 'AbortError') {
                    console.error('Error Compartiendo:', shareError);
                }
            }
        }
    });
}

// =========================================================================
// --- CANCEL MODAL LOGIC ---
// =========================================================================

function openCancelModal(order) {
    selectedOrderForCancel = order;
    lblCancelLlave.textContent = order.llave || `PED-${order.nro}`;
    resetCancelModalState();
    modalCancelacion.classList.remove('hidden');
    modalCancelacion.classList.add('flex');
}

function resetCancelModalState() {
    photoCancelEvidenciaFile = null;
    photoCancelFachadaFile = null;

    // Reset UI Evidencia Cancelación
    btnUiCancelEvidencia.className = 'bg-slate-800 border-2 border-dashed border-red-500/40 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-colors';
    iconCancelEvidencia.className = 'w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 text-2xl';
    iconCancelEvidencia.innerHTML = '<i class="fa-solid fa-phone-slash"></i>';
    previewCancelEvidencia.classList.add('hidden');
    previewCancelEvidencia.src = '';

    // Reset UI Fachada
    btnUiCancelFachada.className = 'bg-slate-800 border-2 border-dashed border-red-500/40 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-colors';
    iconCancelFachada.className = 'w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 text-2xl';
    iconCancelFachada.innerHTML = '<i class="fa-solid fa-building"></i>';
    previewCancelFachada.classList.add('hidden');
    previewCancelFachada.src = '';

    checkReadyToCancel();
}

function handleCancelPhotoCapture(e, type) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            canvas.toBlob((blob) => {
                const compressedFile = new File([blob], `cancel_${type}.jpg`, { type: 'image/jpeg' });
                const blobUrl = URL.createObjectURL(compressedFile);

                if (type === 'fachada') {
                    photoCancelFachadaFile = compressedFile;
                    previewCancelFachada.src = blobUrl;
                    previewCancelFachada.classList.remove('hidden');
                    btnUiCancelFachada.classList.replace('border-dashed', 'border-solid');
                    btnUiCancelFachada.classList.replace('border-red-500/40', 'border-red-500');
                    iconCancelFachada.classList.replace('bg-red-500/10', 'bg-red-500');
                    iconCancelFachada.classList.replace('text-red-400', 'text-white');
                    iconCancelFachada.innerHTML = '<i class="fa-solid fa-check"></i>';
                } else {
                    photoCancelEvidenciaFile = compressedFile;
                    previewCancelEvidencia.src = blobUrl;
                    previewCancelEvidencia.classList.remove('hidden');
                    btnUiCancelEvidencia.classList.replace('border-dashed', 'border-solid');
                    btnUiCancelEvidencia.classList.replace('border-red-500/40', 'border-red-500');
                    iconCancelEvidencia.classList.replace('bg-red-500/10', 'bg-red-500');
                    iconCancelEvidencia.classList.replace('text-red-400', 'text-white');
                    iconCancelEvidencia.innerHTML = '<i class="fa-solid fa-check"></i>';
                }

                checkReadyToCancel();
            }, 'image/jpeg', 0.8);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function checkReadyToCancel() {
    if (photoCancelEvidenciaFile && photoCancelFachadaFile) {
        btnEnviarCancel.removeAttribute('disabled');
        btnEnviarCancel.classList.add('animate-pulse');
    } else {
        btnEnviarCancel.setAttribute('disabled', 'true');
        btnEnviarCancel.classList.remove('animate-pulse');
    }
}

async function handleSendCancelToWhatsApp() {
    // 1. Capturar referencias para evitar pérdida de datos si el modal se cierra
    const orderRef = { ...selectedOrderForCancel };
    const filesToSend = [photoCancelEvidenciaFile, photoCancelFachadaFile];
    const evidenceFileRef = photoCancelEvidenciaFile;
    const userRef = currentUser;
    const llave = orderRef.llave || `PED-${orderRef.nro}`;
    const msgText = `❌ PEDIDO CANCELADO\n📦 Llave: ${llave}\n🏍️ Repartidor: ${userRef}\n📋 Evidencias adjuntas\n`;

    console.log("🚀 Iniciando cancelación en segundo plano para:", llave);

    // 2. TAREAS DE FONDO (SIN AWAIT)
    // Tarea A: Subir la foto de evidencia a Google Drive
    uploadPosSilently(evidenceFileRef, llave).then(res => {
        if (!res) console.error("❌ Falló subida de cancelación a Drive");
        else console.log("✅ Evidencia de cancelación guardada en Drive");
    });

    // Tarea B: Marcar el pedido como "Por Validar" con fecha/hora Lima
    const nowLima = new Date().toLocaleString('en-US', { timeZone: 'America/Lima' });
    const limaDate = new Date(nowLima);
    const fechaCancel = limaDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaCancel = limaDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });

    fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({
            action: 'marcarPorValidar',
            nro: orderRef.nro,
            fechaEntrega: fechaCancel,
            horaEntrega: horaCancel
        })
    }).catch(e => console.warn('⚠️ Error background marcando Cancelación', e));

    // 3. FLUJO INMEDIATO DE WHATSAPP
    // Cerrar el modal de cancelación de inmediato
    modalCancelacion.classList.add('hidden');
    modalCancelacion.classList.remove('flex');

    Swal.fire({
        title: `¿Confirmar: ${llave}?`,
        text: 'Se enviará el reporte de cancelación por WhatsApp mientras guardamos la evidencia.',
        icon: 'warning',
        iconColor: '#ef4444',
        confirmButtonText: '<i class="fa-brands fa-whatsapp pt-1"></i> Enviar Cancelación',
        confirmButtonColor: '#dc2626',
        showCancelButton: true,
        cancelButtonText: 'Volver',
        cancelButtonColor: '#64748b',
        allowOutsideClick: false
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                if (navigator.canShare && navigator.canShare({ files: filesToSend })) {
                    await navigator.share({
                        title: 'Cancelación de Pedido',
                        text: msgText,
                        files: filesToSend
                    });
                } else {
                    // Fallback
                    try { await navigator.clipboard.writeText(msgText); } catch (e) { }

                    // Descargas manuales si no soporta share múltiple
                    const a1 = document.createElement('a');
                    a1.href = URL.createObjectURL(filesToSend[0]);
                    a1.download = `cancel_evidencia_${llave}.jpg`;
                    document.body.appendChild(a1); a1.click(); document.body.removeChild(a1);

                    const a2 = document.createElement('a');
                    a2.href = URL.createObjectURL(filesToSend[1]);
                    a2.download = `cancel_fachada_${llave}.jpg`;
                    document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);

                    window.location.href = `https://wa.me/?text=${encodeURIComponent(msgText)}`;
                }

                // Eliminar el pedido de la lista visual tras compartir
                currentOrders = currentOrders.filter(o => o.nro !== orderRef.nro);
                renderOrders();

            } catch (shareError) {
                if (shareError.name !== 'AbortError') {
                    console.error('Error Compartiendo Cancelación:', shareError);
                }
            }
        } else {
            // Si cancela el Swal, reabrir modal con fotos (las referencias siguen vivas en el scope de la función anterior pero aquí las perdemos si no las guardamos)
            // Re-abrimos para que el usuario no pierda lo capturado
            modalCancelacion.classList.remove('hidden');
            modalCancelacion.classList.add('flex');
        }

        // Restaurar estado del botón por si acaso
        btnEnviarCancel.innerHTML = '<i class="fa-brands fa-whatsapp text-xl"></i><span class="text-lg">Enviar Cancelación a WhatsApp</span>';
        btnEnviarCancel.removeAttribute('disabled');
    });
}
// =========================================================================
// --- QUICK SHARE LOGIC (STEP 1 & 3) ---
// =========================================================================

function startQuickShare(index, mode) {
    quickShareOrder = currentOrders[index];
    quickShareMode = mode;
    inputQuickShare.click();
}

async function processQuickShare(e) {
    const file = e.target.files[0];
    if (!file || !quickShareOrder) return;

    try {
        const label = (quickShareMode === 'salida') ? '📦 SALIDA DE RUTA' : '🔄 DEVOLUCIÓN';
        const msgText = `${label}\n📦 Llave: ${quickShareOrder.llave || `PED-${quickShareOrder.nro}`}\n🏍️ Repartidor: ${currentUser}`;

        // Para asegurar compatibilidad en Android/iOS, usamos un modal intermedio con un botón.
        // Los navegadores bloquean el 'share' si no viene de una acción DIRECTA del usuario (un clic).
        Swal.fire({
            title: label,
            text: 'Haz clic para compartir el reporte a WhatsApp',
            icon: 'info',
            confirmButtonText: '<i class="fa-brands fa-whatsapp pt-1"></i> Enviar a WhatsApp',
            confirmButtonColor: '#25D366',
            allowOutsideClick: false
        }).then(async (result) => {
            if (result.isConfirmed) {
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            title: label,
                            text: msgText,
                            files: [file]
                        });
                    } catch (eShare) { console.log("Share cancelado o error", eShare); }
                } else {
                    // Fallback para PC
                    try { await navigator.clipboard.writeText(msgText); } catch (e1) { }
                    window.location.href = `https://wa.me/?text=${encodeURIComponent(msgText)}`;
                }

                // Si es salida, marcamos como "En Camino" en el servidor para ocultar el botón
                if (quickShareMode === 'salida') {
                    marcarSalidaEnServidor(quickShareOrder.nro);
                }

                // Si es devolución, cerramos tras compartir
                if (quickShareMode === 'devolucion') {
                    currentOrders = currentOrders.filter(o => o.nro !== quickShareOrder.nro);
                    renderOrders();
                }
            }
        });
    } catch (err) {
        console.log("Error en quickShare:", err);
    } finally {
        inputQuickShare.value = '';
    }
}

async function marcarSalidaEnServidor(nro) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'marcarEnCamino',
                nro: nro
            })
        });
        const res = await response.json();
        if (res.success) {
            console.log("🚀 Pedido marcado En Camino");
            // Actualizar localmente el estado para que desaparezca el botón
            const orderIndex = currentOrders.findIndex(o => o.nro === nro);
            if (orderIndex !== -1) {
                currentOrders[orderIndex].estado = 'En Camino';
                renderOrders();
            }
        }
    } catch (e) {
        console.error("Error marcando salida:", e);
    }
}

async function combineTwoPhotos(file1, file2, fileName) {
    return new Promise((resolve, reject) => {
        const img1 = new Image();
        const img2 = new Image();
        let loaded = 0;

        const onImgLoad = () => {
            loaded++;
            if (loaded === 2) {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Ajustar al ancho máximo de la imagen más ancha
                const maxWidth = Math.max(img1.width, img2.width);
                const scale1 = maxWidth / img1.width;
                const scale2 = maxWidth / img2.width;

                const h1 = img1.height * scale1;
                const h2 = img2.height * scale2;

                canvas.width = maxWidth;
                canvas.height = h1 + h2;

                ctx.drawImage(img1, 0, 0, maxWidth, h1);
                ctx.drawImage(img2, 0, h1, maxWidth, h2);

                canvas.toBlob((blob) => {
                    resolve(new File([blob], fileName, { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.85);
            }
        };

        img1.onload = onImgLoad;
        img2.onload = onImgLoad;
        img1.onerror = reject;
        img2.onerror = reject;

        const reader1 = new FileReader();
        const reader2 = new FileReader();

        reader1.onload = (e) => img1.src = e.target.result;
        reader2.onload = (e) => img2.src = e.target.result;

        reader1.readAsDataURL(file1);
        reader2.readAsDataURL(file2);
    });
}
