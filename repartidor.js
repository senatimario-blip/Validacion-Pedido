const API_URL = 'https://script.google.com/macros/s/AKfycbwHcoS-lpxyMDE4SC6PKlGMLyc8bv279gDZOZ2SDqw5NoHn_RTQHUWHNdI4puLQfM0F/exec';
let bestAdminOCRData = {}; // v6.1: Almacén global para data extraída por OCR (Admin)

// SweetAlert2 Toast configuration (Lazy initialization)
let Toast = null;
function getToast() {
    if (!Toast && typeof Swal !== 'undefined') {
        Toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 4000,
            timerProgressBar: true,
        });
    }
    return Toast;
}

// Helper para obtener YYYY-MM-DD en Zona Horaria Lima (Consistente con Admin/Monitor)
function getYMDLima(rawDate) {
    if (!rawDate) return "";
    let d;

    // Si ya es un String
    if (typeof rawDate === 'string') {
        const s = rawDate.trim();
        // Caso 1: YYYY-MM-DD PURA (Solo si tiene exactamente 10 caracteres y formato YYYY-MM-DD)
        const ymdMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (ymdMatch) return ymdMatch[0];

        // Caso 2: DD/MM/YYYY
        if (s.includes('/')) {
            const parts = s.split(' ')[0].split('/');
            if (parts.length === 3) {
                const day = parts[0].padStart(2, '0');
                const month = parts[1].padStart(2, '0');
                let year = parts[2];
                if (year.length === 2) year = "20" + year;
                return `${year}-${month}-${day}`;
            }
        }
        d = new Date(s);
    } else if (rawDate instanceof Date) {
        d = rawDate;
    } else {
        d = new Date(rawDate);
    }

    if (!d || isNaN(d.getTime())) return "";

    try {
        // Usar Intl para asegurar que siempre sea Lima
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Lima',
            year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(d);
    } catch (e) {
        // Fallback local (menos preciso si el browser no está en Lima)
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
}


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
let selectedDriverForAdmin = null; // null = ver todos los repartidores (resumen), "Nombre" = ver solo ese
let selectedDriverForHistoryAdmin = null; // null = resumen historial, "Nombre" = detalle historial
let currentLocation = { lat: null, lng: null, accuracy: null, timestamp: null };


// Helper local para obtener drivers de pedidos actuales (v1.21)
function getUniqueDriversLocal() {
    if (!window.orders) return [];
    const set = new Set();
    window.orders.forEach(o => {
        if (o.envio) set.add(String(o.envio).trim());
    });
    return [...set].sort();
}

// Admin Global Features
let adminSubView = 'summary'; // 'summary' or 'global'
let adminSelectedDate = getYMDLima(new Date());
window.allDriversList = []; // v1.21: Lista completa de motorizados desde DB

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

let photoCancelEvidenciaFile = null;
let photoCancelFachadaFile = null;
let selectedOrderForCancel = null;

// Admin Validation Elements & State
// Admin Validation Elements & State
let modalValidarAdmin, valAdminNro, valAdminLlave, valAdminMontoOrig, valAdminChips, valAdminPhotoInput, valAdminPreview, valAdminPlaceholder, valAdminOcrOverlay, valAdminPhotoAmount, valAdminDriver, valAdminDate, valAdminTime, valAdminOcrTrigger;

let currentOrderForAdminValidation = null;
let valAdminPhotoFileData = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Admin Validation Init
    modalValidarAdmin = document.getElementById('modal-validar-admin');
    valAdminNro = document.getElementById('val-admin-nro');
    valAdminLlave = document.getElementById('val-admin-llave');
    valAdminMontoOrig = document.getElementById('val-admin-monto-orig');
    valAdminChips = document.getElementById('val-admin-chips');
    valAdminPhotoInput = document.getElementById('val-admin-photo-input');
    valAdminPreview = document.getElementById('val-admin-preview');
    valAdminPlaceholder = document.getElementById('val-admin-placeholder');
    valAdminOcrOverlay = document.getElementById('val-admin-ocr-overlay');
    valAdminPhotoAmount = document.getElementById('val-admin-photo-amount');
    valAdminDriver = document.getElementById('val-admin-driver');
    valAdminDate = document.getElementById('val-admin-date');
    valAdminTime = document.getElementById('val-admin-time');
    valAdminOcrTrigger = document.getElementById('btn-val-admin-ocr-trigger');

    if (valAdminOcrTrigger) {
        valAdminOcrTrigger.addEventListener('click', async () => {
            const file = valAdminPhotoInput.files[0];
            if (file) {
                runAdminOCR(file, 0);
            } else if (valAdminPreview.src && !valAdminPreview.classList.contains('hidden')) {
                // Si la foto ya está previsualizada (viene del servidor)
                try {
                    Swal.fire({ title: 'Descargando imagen...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
                    const res = await window.fetchAPI('getPhotoBase64', { nro: currentOrderForAdminValidation.nro });
                    Swal.close();

                    if (res.success) {
                        const byteString = atob(res.base64);
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
                        const blob = new Blob([ab], { type: res.mimeType });
                        const virtualFile = new File([blob], "voucher.jpg", { type: res.mimeType });

                        runAdminOCR(virtualFile, 0);
                    } else {
                        Swal.fire('Error', 'No se pudo obtener la imagen del servidor: ' + res.message, 'error');
                    }
                } catch (err) {
                    Swal.fire('Error', 'Error al conectar con el servidor.', 'error');
                }
            } else {
                Swal.fire('Info', 'Sube o pega una foto primero para poder escanearla.', 'info');
            }
        });
    }

    window.addEventListener('paste', async (e) => {
        if (!modalValidarAdmin || modalValidarAdmin.classList.contains('hidden')) return;

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
            const dt = new DataTransfer();
            dt.items.add(imageFile);
            valAdminPhotoInput.files = dt.files;

            // Simular el handleValAdminPhoto
            valAdminPlaceholder.classList.add('hidden');
            valAdminPreview.classList.remove('hidden');
            valAdminPreview.src = URL.createObjectURL(imageFile);

            const reader = new FileReader();
            reader.onload = (event) => {
                valAdminPhotoFileData = event.target.result.split(',')[1];
                runAdminOCR(imageFile, 0);
            };
            reader.readAsDataURL(imageFile);
        }
    });

    window.loadOrders = fetchDriverOrders; // For mapa.js compatibility
    // Compatibility for mapa.js which relies on fetchAPI from app.js
    window.fetchAPI = async function (action, data = {}) {
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action, ...data })
            });
            const text = await response.text();
            return JSON.parse(text);
        } catch (e) {
            console.error("Error en fetchAPI (Repartidor):", e);
            throw e;
        }
    };

    // Check if previously logged in
    const savedDriver = localStorage.getItem('activeDriver');
    if (savedDriver) {
        autoLoginData(savedDriver);
    }

    // Admin Date Filter Listener
    const adminDateFilter = document.getElementById('admin-date-filter');
    if (adminDateFilter) {
        adminDateFilter.value = adminSelectedDate;
        adminDateFilter.addEventListener('change', () => {
            adminSelectedDate = adminDateFilter.value;
            fetchDriverOrders();
        });
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
                document.getElementById('pantalla-historial').classList.add('hidden');
                document.getElementById('pantalla-historial').classList.remove('flex');
                document.getElementById('nav-footer').classList.add('hidden');
                pantallaLogin.classList.remove('hidden');
                pantallaLogin.classList.add('flex');
                inputDriver.value = '';
                inputDriverPass.value = '';
            }
        });
    });

    const btnCerrarRutaActive = document.getElementById('btn-cerrar-ruta-active');
    if (btnCerrarRutaActive) {
        btnCerrarRutaActive.addEventListener('click', () => btnCerrarRuta.click());
    }


    btnActualizar.addEventListener('click', () => {
        if (currentUser) {
            const icon = btnActualizar.querySelector('i');
            if (icon) icon.classList.add('fa-spin-fast');
            fetchDriverOrders().finally(() => {
                if (icon) icon.classList.remove('fa-spin-fast');
            });
        }
    });

    const btnRefreshHistory = document.getElementById('btn-refresh-history');
    if (btnRefreshHistory) {
        btnRefreshHistory.addEventListener('click', () => {
            if (currentUser) {
                const icon = btnRefreshHistory.querySelector('i');
                if (icon) icon.classList.add('fa-spin-fast');
                // Verificamos si es admin para mostrar controles
                const adminControls = document.getElementById('admin-ruta-controls');
                if (adminControls) {
                    if (currentUser && currentUser.toLowerCase() === 'admin') {
                        adminControls.classList.remove('hidden');
                    } else {
                        adminControls.classList.add('hidden');
                    }
                }
                fetchDriverOrders().finally(() => {
                    if (icon) icon.classList.remove('fa-spin-fast');
                });
            }
        });
    }

    const btnSaveEditDelivery = document.getElementById('btn-save-edit-delivery');
    if (btnSaveEditDelivery) {
        btnSaveEditDelivery.addEventListener('click', saveManualDelivery);
    }

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

    // --- New Features Initialization ---
    initConnectivityMonitoring();
    initPullToRefresh();

    // Inicializar filtro de fecha de historial a hoy (Lima)
    const historyDateFilter = document.getElementById('history-date-filter');
    if (historyDateFilter) {
        console.log("📅 Inicializando filtro de fecha de historial (Lima)...");
        const todayStr = getYMDLima(new Date());
        historyDateFilter.value = todayStr;
        console.log("📅 Valor inicial del filtro:", todayStr);

        historyDateFilter.addEventListener('change', () => {
            console.log("📅 Cambio de fecha detectado:", historyDateFilter.value);
            renderHistory();
        });
    } else {
        console.warn("⚠️ No se encontró el elemento 'history-date-filter' en el DOM.");
    }
});

// --- Tab Switching ---
function switchTab(tab) {
    const pantallaRuta = document.getElementById('pantalla-ruta');
    const pantallaHistorial = document.getElementById('pantalla-historial');
    const pantallaValidar = document.getElementById('pantalla-validar');
    const pantallaAuditoria = document.getElementById('pantalla-auditoria');

    const btnRuta = document.getElementById('nav-btn-ruta');
    const btnHistorial = document.getElementById('nav-btn-historial');
    const btnValidar = document.getElementById('nav-btn-validar');
    const btnAuditoria = document.getElementById('nav-btn-auditoria');

    // Reset all
    [pantallaRuta, pantallaHistorial, pantallaValidar, pantallaAuditoria].forEach(p => {
        if (p) {
            p.classList.add('hidden');
            p.classList.remove('flex');
        }
    });
    [btnRuta, btnHistorial, btnValidar, btnAuditoria].forEach(b => {
        if (b) {
            b.classList.remove('text-primary');
            b.classList.add('text-slate-500');
        }
    });

    if (tab === 'ruta') {
        pantallaRuta.classList.remove('hidden');
        pantallaRuta.classList.add('flex');
        btnRuta.classList.add('text-primary');
        btnRuta.classList.remove('text-slate-500');
        renderOrders();
    } else if (tab === 'historial') {
        pantallaHistorial.classList.remove('hidden');
        pantallaHistorial.classList.add('flex');
        btnHistorial.classList.add('text-primary');
        btnHistorial.classList.remove('text-slate-500');
        renderHistory();
    } else if (tab === 'validar') {
        pantallaValidar.classList.remove('hidden');
        pantallaValidar.classList.add('flex');
        btnValidar.classList.add('text-primary');
        btnValidar.classList.remove('text-slate-500');
        renderValidationTab();
    } else if (tab === 'auditoria') {
        pantallaAuditoria.classList.remove('hidden');
        pantallaAuditoria.classList.add('flex');
        btnAuditoria.classList.add('text-primary');
        btnAuditoria.classList.remove('text-slate-500');
        initAuditTabPWA();
    }
}

// --- Connectivity Monitoring ---
function initConnectivityMonitoring() {
    const banner = document.getElementById('offline-banner');

    function updateStatus() {
        if (navigator.onLine) {
            banner.style.display = 'none';
        } else {
            banner.style.display = 'block';
        }
    }

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus(); // Initial check
}

// --- Pull to Refresh Logic (Touch Events) ---
function initPullToRefresh() {
    const container = document.getElementById('lista-pedidos-container');
    const ptrIndicator = document.getElementById('ptr-indicator');
    const ptrIcon = document.getElementById('ptr-icon');
    const ptrText = document.getElementById('ptr-text');

    let startY = 0;
    let pulling = false;

    container.addEventListener('touchstart', (e) => {
        // Only allow pull if at the top of the container
        if (container.scrollTop === 0) {
            startY = e.touches[0].pageY;
            pulling = true;
        }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (!pulling) return;

        const currentY = e.touches[0].pageY;
        const diff = currentY - startY;

        if (diff > 0) {
            // Prevent default scrolling when pulling down
            if (diff > 10) {
                container.classList.add('ptr-active');
            }

            if (diff > 80) {
                ptrIcon.className = 'fa-solid fa-rotate fa-spin mr-2';
                ptrText.textContent = 'Suelta para actualizar';
            } else {
                ptrIcon.className = 'fa-solid fa-arrow-down-long mr-2';
                ptrText.textContent = 'Desliza para actualizar';
            }
        }
    }, { passive: true });

    container.addEventListener('touchend', () => {
        if (!pulling) return;

        const diff = container.classList.contains('ptr-active');
        if (diff) {
            const ptrHeight = ptrIndicator.offsetHeight;
            if (ptrHeight >= 50) {
                ptrText.textContent = 'Actualizando...';
                fetchDriverOrders().finally(() => {
                    setTimeout(() => {
                        container.classList.remove('ptr-active');
                        ptrText.textContent = 'Desliza para actualizar';
                        ptrIcon.className = 'fa-solid fa-arrow-down-long mr-2';
                    }, 500);
                });
            } else {
                container.classList.remove('ptr-active');
            }
        }
        pulling = false;
    });
}

// --- Copy to Clipboard Utility ---
async function copyToClipboard(text, btn) {
    try {
        await navigator.clipboard.writeText(text);
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check text-emerald-500"></i> Copiado';
        btn.classList.add('bg-emerald-500/10', 'border-emerald-500/20');

        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.classList.remove('bg-emerald-500/10', 'border-emerald-500/20');
        }, 2000);

        if (navigator.vibrate) navigator.vibrate(50);
    } catch (err) {
        console.error('Failed to copy: ', err);
    }
}

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
    document.getElementById('nav-footer').classList.remove('hidden');

    // Admin Controls Check
    const adminControls = document.getElementById('admin-ruta-controls');
    const navBtnValidar = document.getElementById('nav-btn-validar');

    if (name.toLowerCase() === 'admin') {
        if (adminControls) adminControls.classList.remove('hidden');
        if (navBtnValidar) navBtnValidar.classList.remove('hidden');
        const navBtnAuditoria = document.getElementById('nav-btn-auditoria');
        if (navBtnAuditoria) navBtnAuditoria.classList.remove('hidden');
        
        // REGULARIZACIÓN: Permitir acceso a galería para el Admin en el modal de repartidor
        const inputPos = document.getElementById('input-foto-pos');
        const inputEvidencia = document.getElementById('input-foto-evidencia');
        if (inputPos) inputPos.removeAttribute('capture');
        if (inputEvidencia) inputEvidencia.removeAttribute('capture');
        console.log("🔓 [ADMIN] Acceso a galería desbloqueado para regularización.");
    } else {
        if (adminControls) adminControls.classList.add('hidden');
        if (navBtnValidar) navBtnValidar.classList.add('hidden');
        
        // Restaurar modo cámara para repartidores normales
        const inputPos = document.getElementById('input-foto-pos');
        const inputEvidencia = document.getElementById('input-foto-evidencia');
        if (inputPos) inputPos.setAttribute('capture', 'environment');
        if (inputEvidencia) inputEvidencia.setAttribute('capture', 'environment');
    }

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
    const isUserAdmin = (currentUser && currentUser.toLowerCase() === 'admin');

    if (isUserAdmin && !isAdminListView) {
        const loadingMapa = document.getElementById('loading-mapa');
        if (loadingMapa) loadingMapa.classList.remove('hidden');
    } else {
        containerPedidos.innerHTML = '';
        containerPedidos.appendChild(loadingPedidos);
        loadingPedidos.classList.remove('hidden');
    }

    // v1.21: Si es Admin, cargar lista completa de motorizados
    if (isUserAdmin && (!window.allDriversList || window.allDriversList.length === 0)) {
        console.log("🔍 Detectado Admin sin lista de motorizados. Iniciando loadAllDrivers...");
        loadAllDrivers();
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
                // Leer devoluciones pendientes para incluir pedidos "Por Validar" que aún esperan foto devolución
                let devPendientesFilter = [];
                try { devPendientesFilter = JSON.parse(localStorage.getItem('devoluciones_pendientes') || '[]'); } catch (e) { }

                currentOrders = rawOrders.filter(o => {
                    const statusOk = (o.estado === 'Pendiente' || o.estado === 'En Camino' || o.estado === 'Reservado' || o.estado === '' || (o.estado === 'Por Validar' && devPendientesFilter.includes(o.nro)));
                    // Si es Admin (o modo admin list), ve TODO lo activo. Si es repartidor, solo lo suyo.
                    const isUserAdmin = (currentUser && currentUser.toLowerCase() === 'admin');

                    // Filter by Date (Admin Only)
                    if (isUserAdmin) {
                        const orderYMD = getYMDLima(o.fecha);
                        if (orderYMD !== adminSelectedDate) return false;
                        return statusOk;
                    }

                    if (isAdminListView) return statusOk;

                    const sheetName = String(o.envio || '').trim().toLowerCase();
                    const loginName = String(currentUser || '').trim().toLowerCase();
                    const nameMatch = sheetName === loginName || (sheetName.startsWith(loginName) && loginName.length > 2);

                    return statusOk && nameMatch;
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

                // Restaurar devoluciones pendientes desde localStorage
                try {
                    const devPendientes = JSON.parse(localStorage.getItem('devoluciones_pendientes') || '[]');
                    currentOrders.forEach(o => {
                        if (devPendientes.includes(o.nro)) {
                            o.esperandoDevolucion = true;
                        }
                    });
                } catch (e) { }

                renderOrders();
                renderHistory(); // Asegurar que el historial también se refresque

                // RE-VERIFICAR VISIBILIDAD DE CONTROLES ADMIN
                const adminControls = document.getElementById('admin-ruta-controls');
                if (adminControls && currentUser && currentUser.toLowerCase() === 'admin') {
                    adminControls.classList.remove('hidden');
                }
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

    const isUserAdmin = (currentUser && currentUser.toLowerCase() === 'admin');

    if (isUserAdmin || isAdminListView) {
        if (!selectedDriverForAdmin) {
            // VISTA 1: RESUMEN DE REPARTIDORES (Lista de nombres con contadores)
            if (adminSubView === 'summary') {
                renderAdminSummary(currentOrders);
            } else {
                renderAdminGlobalChronological(currentOrders);
            }
        } else {
            // VISTA 2: DETALLE DE UN REPARTIDOR ESPECÍFICO
            renderAdminDriverDetail(currentOrders, selectedDriverForAdmin);
        }
    } else {
        // VISTA NORMAL REPARTIDOR (Lista plana)
        currentOrders.forEach((order, index) => {
            renderSingleOrderCard(order, index);
        });
    }

    // --- Drag and Drop Sorting Logic ---
    // Deshabilitar Drag & Drop si es Admin para evitar conflictos con la agrupación visual
    if (window.Sortable && !isUserAdmin && !isAdminListView) {
        // Limpiar instancia previa para evitar duplicados o pérdida de eventos táctiles
        if (sortableInstance) {
            sortableInstance.destroy();
        }

        sortableInstance = Sortable.create(containerPedidos, {
            animation: 300,
            handle: '.handle',
            ghostClass: 'bg-slate-700',
            chosenClass: 'scale-[1.02]',
            dragClass: 'opacity-100',
            forceFallback: true,
            fallbackOnBody: true,
            swapThreshold: 0.65,
            onEnd: function (evt) {
                if (evt.oldIndex === evt.newIndex) return;

                const movedItem = currentOrders.splice(evt.oldIndex, 1)[0];
                currentOrders.splice(evt.newIndex, 0, movedItem);

                saveOrderRouteToServer();
            }
        });
    }
}

function renderSingleOrderCard(order, index) {
    // Parse time for the clock
    let registerDate = null;
    if (order.fecha) {
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

    // --- CARD STYLE: muted/compact para devolución, normal para el resto ---
    if (order.esperandoDevolucion) {
        card.className = 'bg-slate-900/60 rounded-xl p-3 shadow border border-orange-500/20 mb-3 transition-all';
        card.style.opacity = '0.75';

        card.innerHTML = `
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="text-xs text-orange-400/70 font-medium uppercase tracking-wider">Entregado</span>
                    <span class="text-lg font-bold text-slate-300">${order.llave || 'PED-' + order.nro}</span>
                    <span class="text-sm text-slate-500 font-mono">S/ ${monto.toFixed(2)}</span>
                </div>
                <div class="flex items-center gap-2">
                    <button class="btn-devolucion-pedido w-9 h-9 rounded-full bg-orange-500/80 border border-orange-400/60 text-white flex items-center justify-center text-sm active:scale-90 transition-all"
                            onclick="event.stopPropagation(); startQuickShare(${index}, 'devolucion')" title="Foto Devolución">
                        <i class="fa-solid fa-rotate-left"></i>
                    </button>
                    <button class="btn-finalizar-pedido w-9 h-9 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400/80 flex items-center justify-center text-sm active:scale-90 transition-all"
                            onclick="event.stopPropagation(); finalizarSinDevolucion(${index})" title="Sin devolución - Finalizar">
                        <i class="fa-solid fa-check"></i>
                    </button>
                </div>
            </div>
        `;
        containerPedidos.appendChild(card);
        return;
    }

    // --- CARD NORMAL (Pendiente / En Camino) ---
    const cardClass = order.estado === 'En Camino' ? 'bg-slate-900 border-blue-500/30' : 'bg-cardDark border-slate-700/50';
    card.className = `${cardClass} rounded-2xl p-4 shadow-lg border active:scale-[0.98] transition-all cursor-pointer mb-4`;

    // Card click → abrir flujo de entrega
    card.onclick = (e) => {
        if (e.target.closest('.btn-cancelar-pedido')) return;
        openActionSelector(order);
    };

    const isFirst = index === 0;
    const isLast = index === currentOrders.length - 1;

    card.innerHTML = `
        <div class="flex justify-between items-start mb-3">
            <div class="flex items-center gap-2">
                <!-- Controles de Orden (Flechas + Grip) -->
                ${!(currentUser && currentUser.toLowerCase() === 'admin') ? `
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
                </div>` : ''}

                <button class="w-10 h-10 rounded-full bg-blue-500 border border-blue-400 text-white flex items-center justify-center transition-all active:scale-95 shadow-lg shadow-blue-500/30 ${order.estado !== 'Pendiente' ? 'hidden' : ''}" 
                        onclick="event.stopPropagation(); startQuickShare(${index}, 'salida')" title="Paso 1: Salida">
                    <i class="fa-solid fa-upload text-xl"></i>
                </button>
                
                <div class="ml-1">
                    <span class="text-xs text-slate-400 font-medium uppercase tracking-wider block mb-0.5">Llave</span>
                    <div class="flex items-center gap-2">
                        <span class="text-2xl font-bold tracking-tight text-white">${order.llave || 'PED-' + order.nro}</span>
                        ${order.validado_por ? `<span class="text-[10px] text-blue-400 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">${order.validado_por.includes(':') ? order.validado_por.split(':')[0].trim() : order.validado_por}</span>` : ''}
                        ${order.direccion ? `
                        <button onclick="event.stopPropagation(); window.open('https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.direccion)}', '_blank')" class="btn-copy text-primary" title="Ver en Mapa">
                            <i class="fa-solid fa-location-dot"></i>
                        </button>` : ''}
                    </div>
                </div>
            </div>
            <div class="text-right flex items-center gap-3">
                <div>
                    <span class="text-xs text-slate-400 font-medium uppercase tracking-wider block mb-1">A Cobrar</span>
                    <span class="text-2xl font-bold text-amber-400">S/ ${monto.toFixed(2)}</span>
                </div>
                <div class="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-600 text-lg" title="Devolución (después de entrega)">
                    <i class="fa-solid fa-rotate-left"></i>
                </div>
            </div>
        </div>
        
        <div class="flex items-center justify-between mt-4">
            <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold ${tipoColor}">
                <i class="fa-solid fa-${tipoIcon}"></i>
                ${tipoPagoDisplay}
            </span>

            ${(currentUser && currentUser.toLowerCase() === 'admin' && adminSubView === 'global') ? `
                <div class="flex flex-col gap-1" onclick="event.stopPropagation()">
                    <span class="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1">
                        <i class="fa-solid fa-user-gear text-primary text-[10px]"></i>
                        Driver:
                    </span>
                    <select class="text-[11px] bg-slate-900/80 text-white border border-slate-700/50 rounded-lg px-2 py-1.5 outline-none focus:border-primary/50 transition-all font-medium min-w-[120px]"
                            onchange="asignarMotorizadoDirecto(${order.nro}, this.value)">
                        <option value="">-- Sin Asignar --</option>
                        ${(() => {
                const dbDrivers = window.allDriversList || [];
                const activeDrivers = getUniqueDriversLocal();
                const combined = [...new Set([...dbDrivers, ...activeDrivers])].sort();
                return combined.map(d => `<option value="${d}" ${d === order.envio ? 'selected' : ''}>${d}</option>`).join('');
            })()}
                    </select>
                </div>
            ` : ''}
            
            <div class="flex items-center gap-3">
                <button type="button" class="btn-cancelar-pedido w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 hover:text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-all shadow-lg" onclick="event.stopPropagation(); openCancelModal(currentOrders[${index}])" title="Cancelar Pedido">
                    <i class="fa-solid fa-ban text-lg"></i>
                </button>
                <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800" id="timer-box-${order.nro}">
                    <i class="fa-solid fa-clock text-slate-400" id="timer-icon-${order.nro}"></i>
                    <span class="font-mono font-bold text-slate-300" id="timer-text-${order.nro}">--:--</span>
                </div>
            </div>
        </div>
    `;

    containerPedidos.appendChild(card);

    if (registerDate && !isNaN(registerDate)) {
        startTimer(order.nro, registerDate, order.llave || `PED-${order.nro}`);
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

    // Iniciar captura de GPS en paralelo (v4.0 Anti-Cheat)
    startLocationCapture();
}

function startLocationCapture() {
    currentLocation = { lat: null, lng: null, accuracy: null, timestamp: null };
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                currentLocation = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    timestamp: new Date().toISOString()
                };
                console.log("📍 Ubicación capturada:", currentLocation);
            },
            (err) => {
                console.warn("⚠️ No se pudo obtener GPS:", err.message);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    }
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

            // --- MARCA DE AGUA (MODO SOMBRA: ACTIVADO) ---
            const now = new Date();
            const timeStr = now.toLocaleString('es-PE', { hour12: false });
            const locStr = currentLocation.lat ? `${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)} (±${Math.round(currentLocation.accuracy)}m)` : 'GPS no disponible';
            const watermarkText = `VALIDADO: ${timeStr} | ${locStr}`;

            ctx.font = 'bold 24px Arial';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 4;
            const textWidth = ctx.measureText(watermarkText).width;

            // Recuadro semi-transparente de fondo
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(10, canvas.height - 40, textWidth + 20, 30);

            ctx.fillStyle = '#4ade80'; // Verde brillante para la marca
            ctx.fillText(watermarkText, 20, canvas.height - 18);
            // -------------------------------------------------------------
            // ----------------------------------------------

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
                    fotoBase64: base64Str,
                    lat: currentLocation.lat,
                    lng: currentLocation.lng,
                    accuracy: currentLocation.accuracy,
                    phoneTimestamp: currentLocation.timestamp
                });

                // Wait for the response to see if there's an error
                const response = await fetch(API_URL, {
                    method: 'POST',
                    body: jsonPayload
                });
                const result = await response.json();
                console.log("Resultado de Google Drive subida silenciosa:", result);
                if (!result.success) {
                    console.error("❌ Error de Google Drive (Sombra):", result.msg || 'Desconocido');
                    resolve(false);
                    return;
                }
                resolve(true);
            } catch (e) {
                console.error("❌ Error catched en uploadPosSilently (Sombra):", e);
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

    const numMoney = parseFloat(String(orderRef.monto || '0').replace(/[^0-9.-]+/g, ''));
    const strPagoOrig = String(orderRef.pago || '').toUpperCase();

    // Tarea B: Marcar como "Por Validar" en el Excel (o disparar OCR automático)
    // CAMBIO: Ahora esperamos a que la subida a Drive termine para evitar que el OCR intente leer un pedido sin foto (Race Condition)
    uploadPosSilently(posFileRef, orderRef.llave).then(res => {
        if (!res) {
            console.error("❌ Falló la subida a Drive, no se puede auto-validar.");
            return;
        }
        console.log("✅ Foto guardada en Drive, disparando auto-validación...");
        
        const payloadValidar = { action: 'marcarPorValidar', nro: orderRef.nro };
        
        // Si el pago es POS (Tarjeta), QR o En Línea, solicitamos validación automática por OCR
        // He mejorado el filtro para que acepte variaciones como "o débito", "/ débito" y pagos "en línea"
        const isAuto = (strPagoOrig.includes('QR') || strPagoOrig.includes('YAPE') || strPagoOrig.includes('PLIN') || 
                        strPagoOrig.includes('CRÉDITO') || strPagoOrig.includes('DÉBITO') || 
                        strPagoOrig.includes('TARJETA') || strPagoOrig.includes('ONLINE') || strPagoOrig.includes('LÍNEA'));
        
        console.log("🔍 Pago Detectado:", strPagoOrig, "-> ¿Disparar OCR?:", isAuto);
        if (isAuto) {
            payloadValidar.isAutoValidated = true;
        }

        // Siempre enviar fecha y hora de entrega (hora Lima) para todos los modos
        const nowLima = new Date().toLocaleString('en-US', { timeZone: 'America/Lima' });
        const limaDate = new Date(nowLima);
        payloadValidar.fechaEntrega = limaDate.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        payloadValidar.horaEntrega = limaDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false });

        // Incluir GPS en el registro (Anti-Cheat)
        payloadValidar.lat = currentLocation.lat;
        payloadValidar.lng = currentLocation.lat;
        payloadValidar.accuracy = currentLocation.accuracy;
        payloadValidar.phoneTimestamp = currentLocation.timestamp;

        fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payloadValidar)
        })
        .then(r => r.json())
        .then(resValid => {
            if (resValid.success) {
                console.log("✅ Servidor procesó marcarPorValidar con éxito:", resValid);
                // Si es auto-validado pero el estado sigue siendo "Por Validar", avisar que el OCR falló
                if (isAuto && resValid.status === 'Por Validar') {
                    console.warn("⚠️ El OCR no pudo validar automáticamente (ver logs en Excel).");
                    // Opcional: comentar si no quieres distraer al repartidor
                    // alert("El OCR no pudo auto-validar. Se validará manual.");
                }
            } else {
                console.error("❌ El servidor devolvió error en marcarPorValidar:", resValid.message);
            }
        })
        .catch(e => console.error("📡 Error de Red en marcarPorValidar:", e));
    });

    let posIcon = '💳'; // Default (e.g. Tarjeta física)
    if (strPagoOrig.includes('CONTADO') || strPagoOrig.includes('EFECTIVO')) {
        posIcon = '💵'; // Dólar
    } else if (strPagoOrig.includes('LÍNEA') || strPagoOrig.includes('LINEA') || strPagoOrig.includes('ONLINE')) {
        posIcon = '🌐'; // Mundo
    } else if (strPagoOrig.includes('QR') || strPagoOrig.includes('YAPE') || strPagoOrig.includes('PLIN')) {
        posIcon = '🔳'; // Código QR
    } else if (strPagoOrig.includes('CRÉDITO / DÉBITO') || strPagoOrig.includes('CREDITO / DEBITO')) {
        posIcon = '💳'; // Tarjeta
    }

    const llave = orderRef.llave || `PED-${orderRef.nro}`;
    const msgText = `PEDIDO ENTREGADO\n📦 ${llave}\n${posIcon} S/ ${numMoney.toFixed(2)}\n🏍️ ${userRef}`;

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
                    // Envío directo a app nativa (Intento de saltar selector si hay chat reciente)
                    window.location.href = `whatsapp://send?text=${encodeURIComponent(msgText)}`;
                }

                // 3. Auto-marcar como esperando devolución (sin popup)
                const order = currentOrders.find(o => o.nro === orderRef.nro);
                if (order) {
                    order.esperandoDevolucion = true;
                    try {
                        const devPendientes = JSON.parse(localStorage.getItem('devoluciones_pendientes') || '[]');
                        if (!devPendientes.includes(orderRef.nro)) {
                            devPendientes.push(orderRef.nro);
                            localStorage.setItem('devoluciones_pendientes', JSON.stringify(devPendientes));
                        }
                    } catch (e) { }
                    renderOrders();
                }

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
    const msgText = `PEDIDO CANCELADO\n📦 ${llave}\n🏍️ ${userRef}`;

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

                    // Envío directo a app nativa
                    window.location.href = `whatsapp://send?text=${encodeURIComponent(msgText)}`;
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
// --- FINALIZAR SIN DEVOLUCIÓN ---
// =========================================================================

function finalizarSinDevolucion(index) {
    const order = currentOrders[index];
    if (!order) return;

    Swal.fire({
        title: '¿Sin devolución?',
        text: `¿Confirmas que "${order.llave || 'PED-' + order.nro}" NO tiene envases para devolver?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: '✓ Sí, finalizar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b',
        allowOutsideClick: false
    }).then((result) => {
        if (result.isConfirmed) {
            // Limpiar de localStorage
            try {
                const devPendientes = JSON.parse(localStorage.getItem('devoluciones_pendientes') || '[]');
                localStorage.setItem('devoluciones_pendientes', JSON.stringify(devPendientes.filter(n => n !== order.nro)));
            } catch (e) { }
            // Quitar de la lista local
            currentOrders = currentOrders.filter(o => o.nro !== order.nro);
            renderOrders();

            Swal.fire({
                title: '¡Listo!',
                text: 'Pedido finalizado correctamente.',
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
        }
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
        const label = (quickShareMode === 'salida') ? 'SALIDA' : 'RETORNO';
        const msgText = (quickShareMode === 'salida')
            ? `SALIDA\n📦 ${quickShareOrder.llave || `PED-${quickShareOrder.nro}`}\n🏍️ ${currentUser}`
            : `RETORNO\n📦 ${quickShareOrder.llave || `PED-${quickShareOrder.nro}`}\n🏍️ ${currentUser}`;

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
                    // Envío directo a app nativa
                    window.location.href = `whatsapp://send?text=${encodeURIComponent(msgText)}`;
                }

                // Si es salida, marcamos como "En Camino" en el servidor para ocultar el botón
                if (quickShareMode === 'salida') {
                    marcarSalidaEnServidor(quickShareOrder.nro);
                }

                // Si es devolución, cerramos tras compartir y limpiamos localStorage
                if (quickShareMode === 'devolucion') {
                    try {
                        const devPendientes = JSON.parse(localStorage.getItem('devoluciones_pendientes') || '[]');
                        localStorage.setItem('devoluciones_pendientes', JSON.stringify(devPendientes.filter(n => n !== quickShareOrder.nro)));
                    } catch (e) { }
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

function renderHistory() {
    const container = document.getElementById('lista-historial-container');
    const lblSummary = document.getElementById('lbl-history-summary');
    if (!container || !lblSummary) return;
    container.innerHTML = '';
    window.debugCount = 0; // Reset counter for logs

    // 1. Obtener fecha objetivo del filtro UI
    const filterEl = document.getElementById('history-date-filter');
    let targetDateStr = filterEl ? filterEl.value : "";

    if (!targetDateStr) {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        targetDateStr = `${y}-${m}-${d}`;
    }

    const isUserAdmin = (currentUser && currentUser.toLowerCase() === 'admin');

    // 2. Filtrar pedidos por estado, fecha y repartidor
    const historyOrders = window.orders ? window.orders.filter(o => {
        const stateMatch = (o.estado === 'Por Validar' || o.estado === 'Validado' || o.estado === 'Cancelado');

        // Comparación robusta Multi-Formato unificada con Admin (Lima Time)
        const orderYMD = getYMDLima(o.fecha);
        const dateMatch = (orderYMD === targetDateStr);

        if (window.debugCount < 10 && dateMatch) {
            console.log(`PWA_MATCH: [${o.llave}] match con "${o.fecha}" -> YMD="${orderYMD}"`);
            window.debugCount++;
        }

        const sheetName = String(o.envio || '').trim().toLowerCase();
        const loginName = String(currentUser || '').trim().toLowerCase();
        const nameMatch = sheetName === loginName || (sheetName.startsWith(loginName) && loginName.length > 2);

        if (isUserAdmin) return stateMatch && dateMatch;
        return stateMatch && nameMatch && dateMatch;
    }) : [];

    console.log(`📜 Historial filtrado para ${currentUser} en ${targetDateStr}: ${historyOrders.length} pedidos found`);

    lblSummary.textContent = `${historyOrders.length} entregas procesadas`;

    if (isUserAdmin) {
        if (!selectedDriverForHistoryAdmin) {
            // VISTA 1: RESUMEN HISTORIAL ADMIN
            renderAdminHistorySummary(historyOrders);
            return;
        } else {
            // VISTA 2: DETALLE HISTORIAL UN REPARTIDOR
            renderAdminHistoryDriverDetail(historyOrders, selectedDriverForHistoryAdmin);
            return;
        }
    }

    if (historyOrders.length === 0) {
        container.innerHTML = `
        <div class="text-center py-12 px-4 border border-dashed border-slate-700 rounded-2xl">
            <i class="fa-solid fa-clock-rotate-left text-4xl text-slate-600 mb-4"></i>
            <h3 class="text-xl font-bold text-slate-500">Historial Vacío</h3>
            <p class="text-slate-600 mt-2">No tienes pedidos finalizados o por validar aún.</p>
        </div>
    `;
        return;
    }

    historyOrders.sort((a, b) => b.nro - a.nro).forEach(order => {
        const div = document.createElement('div');
        const isDelivered = order.estado === 'Validado' || order.estado === 'Por Validar';
        const statusColor = order.estado === 'Validado' ? 'text-emerald-400 bg-emerald-500/10' :
            (order.estado === 'Cancelado' ? 'text-red-400 bg-red-500/10' : 'text-orange-400 bg-orange-500/10');
        const statusLabel = order.estado === 'Validado' ? 'VALIDADO' : (order.estado === 'Cancelado' ? 'CANCELADO' : 'POR VALIDAR');

        const withinSLA = isWithinSLA(order);
        const isCancelled = order.estado === 'Cancelado';

        // Determinar texto de SLA
        let slaHTML = '';
        if (!isCancelled) {
            if (withinSLA) {
                slaHTML = `<span class="text-emerald-500 font-bold uppercase tracking-tight"><i class="fa-solid fa-circle-check mr-1"></i> Entrega Exitosa</span>`;
            } else {
                slaHTML = `<span class="text-red-500 font-bold uppercase tracking-tight"><i class="fa-solid fa-circle-exclamation mr-1"></i> Entrega Fuera de Tiempo</span>`;
            }
        }

        let horaPedido = '--:--';
        if (order.fecha) {
            try {
                const dateObj = new Date(order.fecha);
                horaPedido = new Intl.DateTimeFormat('es-PE', {
                    timeZone: 'America/Lima',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                }).format(dateObj).toLowerCase().replace(' ', '');
            } catch (e) { }
        }

        div.className = 'bg-cardDark border border-slate-700/50 rounded-2xl p-4 shadow-sm';
        div.innerHTML = `
        <div class="flex justify-between items-start mb-2">
            <div>
                <span class="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">LLAVE</span>
                <span class="text-lg font-bold text-white">${order.llave || `PED-${order.nro}`}</span>
            </div>
            <div class="text-right">
                <span class="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">HORA</span>
                <span class="text-lg font-bold text-amber-400">${horaPedido}</span>
            </div>
        </div>
        
        <div class="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
            <span class="px-2 py-0.5 rounded text-[10px] font-black tracking-tighter ${statusColor}">${statusLabel}</span>
            <div class="text-[10px]">
                ${slaHTML}
            </div>
        </div>
    `;
        container.appendChild(div);
    });
}

function isWithinSLA(order) {
    if (!order.fecha || !order.hora_entrega) return false;
    try {
        const start = new Date(order.fecha);
        // La hora_entrega viene como HH:mm. La combinamos con la fecha del pedido.
        const [h, m] = order.hora_entrega.split(':');
        const end = new Date(order.fecha);
        end.setHours(parseInt(h), parseInt(m), 0);

        const diffMs = end - start;
        const diffMins = diffMs / 60000;
        return diffMins <= 35 && diffMins >= 0;
    } catch (e) {
        return false;
    }
}

// --- Admin Profile Summary Functions ---

function renderAdminSummary(orders) {
    const container = document.getElementById('lista-pedidos-container');
    container.innerHTML = '';

    // Agrupar pedidos por repartidor
    const grouped = {};
    orders.forEach(order => {
        const driver = (order.envio || 'Sin Asignar').trim();
        if (!grouped[driver]) grouped[driver] = [];
        grouped[driver].push(order);
    });

    const drivers = Object.keys(grouped).sort((a, b) => {
        if (a === 'Sin Asignar') return 1;
        if (b === 'Sin Asignar') return -1;
        return a.localeCompare(b);
    });

    drivers.forEach(driverName => {
        const count = grouped[driverName].length;
        const div = document.createElement('div');
        div.className = 'bg-cardDark border border-slate-700/50 rounded-2xl p-5 mb-3 flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer hover:border-primary/50';

        div.innerHTML = `
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-xl">
                    <i class="fa-solid fa-user-tie"></i>
                </div>
                <div>
                    <h3 class="font-bold text-slate-200 text-lg">${driverName}</h3>
                    <p class="text-sm text-slate-400">${count} pedido${count !== 1 ? 's' : ''} asignado${count !== 1 ? 's' : ''}</p>
                </div>
            </div>
            <div class="text-primary">
                <i class="fa-solid fa-chevron-right"></i>
            </div>
        `;

        div.onclick = () => {
            selectedDriverForAdmin = driverName;
            renderOrders();
        };

        container.appendChild(div);
    });
}

// --- Admin Global Chronological View ---
function renderAdminGlobalChronological(orders) {
    const container = document.getElementById('lista-pedidos-container');
    container.innerHTML = '';

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 px-4 border border-dashed border-slate-700 rounded-2xl">
                <i class="fa-solid fa-clock text-4xl text-slate-500 mb-4"></i>
                <h3 class="text-xl font-bold text-slate-300">No hay pedidos</h3>
                <p class="text-slate-500 mt-2">No se encontraron pedidos para la fecha seleccionada.</p>
            </div>
        `;
        return;
    }

    // Sort by Registration Date (Older/More urgent first)
    const sorted = [...orders].sort((a, b) => {
        const dateA = new Date(a.fecha || 0);
        const dateB = new Date(b.fecha || 0);
        return dateA - dateB;
    });

    sorted.forEach((order, index) => {
        // We pass the index relative to the sorted list for the card's data access
        renderSingleOrderCard(order, index);
    });
}

function setAdminSubView(view) {
    adminSubView = view;

    // Update UI Buttons
    const btnSummary = document.getElementById('admin-view-summary');
    const btnGlobal = document.getElementById('admin-view-global');

    if (view === 'summary') {
        btnSummary.className = 'flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all bg-primary text-white';
        btnGlobal.className = 'flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all text-slate-400';
    } else {
        btnGlobal.className = 'flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all bg-primary text-white';
        btnSummary.className = 'flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all text-slate-400';
    }

    renderOrders();
}

function renderAdminDriverDetail(orders, driverName) {

    const container = document.getElementById('lista-pedidos-container');
    container.innerHTML = '';

    // Header de navegación interna para Admin
    const backBtn = document.createElement('div');
    backBtn.className = 'flex items-center gap-2 mb-6 p-4 bg-primary/10 border border-primary/20 rounded-xl cursor-pointer text-primary hover:bg-primary/20 transition-all';
    backBtn.innerHTML = `
        <i class="fa-solid fa-arrow-left"></i>
        <span class="font-bold uppercase tracking-wider text-xs">Volver a lista de repartidores</span>
    `;
    backBtn.onclick = () => {
        selectedDriverForAdmin = null;
        renderOrders();
    };
    container.appendChild(backBtn);

    const driverOrders = orders.filter(o => (o.envio || 'Sin Asignar').trim() === driverName);

    // Título del repartidor seleccionado
    const title = document.createElement('div');
    title.className = 'px-2 mb-4 text-slate-400 font-medium flex items-center gap-2';
    title.innerHTML = `
        <i class="fa-solid fa-motorcycle text-primary"></i>
        Pedidos de <span class="text-white font-bold">${driverName}</span>
    `;
    container.appendChild(title);

    driverOrders.forEach(order => {
        const idxInAll = orders.indexOf(order);
        renderSingleOrderCard(order, idxInAll);
    });
}

// --- Admin History Summary Functions ---

function renderAdminHistorySummary(orders) {
    const container = document.getElementById('lista-historial-container');
    container.innerHTML = '';

    // Agrupar historial por repartidor
    const grouped = {};
    orders.forEach(order => {
        const driver = (order.envio || 'Sin Asignar').trim();
        if (!grouped[driver]) grouped[driver] = [];
        grouped[driver].push(order);
    });

    const drivers = Object.keys(grouped).sort((a, b) => {
        if (a === 'Sin Asignar') return 1;
        if (b === 'Sin Asignar') return -1;
        return a.localeCompare(b);
    });

    drivers.forEach(driverName => {
        const count = grouped[driverName].length;
        const div = document.createElement('div');
        div.className = 'bg-cardDark border border-slate-700/50 rounded-2xl p-5 mb-3 flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer hover:border-emerald-500/50';

        div.innerHTML = `
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-xl">
                    <i class="fa-solid fa-clock-rotate-left"></i>
                </div>
                <div>
                    <h3 class="font-bold text-slate-200 text-lg">${driverName}</h3>
                    <p class="text-sm text-slate-400">${count} entrega${count !== 1 ? 's' : ''} hoy</p>
                </div>
            </div>
            <div class="text-emerald-500">
                <i class="fa-solid fa-chevron-right"></i>
            </div>
        `;

        div.onclick = () => {
            selectedDriverForHistoryAdmin = driverName;
            renderHistory();
        };

        container.appendChild(div);
    });
}

function renderAdminHistoryDriverDetail(orders, driverName) {
    const container = document.getElementById('lista-historial-container');
    container.innerHTML = '';

    // Header de navegación interna para Historial Admin
    const backBtn = document.createElement('div');
    backBtn.className = 'flex items-center gap-2 mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl cursor-pointer text-emerald-500 hover:bg-emerald-500/20 transition-all';
    backBtn.innerHTML = `
        <i class="fa-solid fa-arrow-left"></i>
        <span class="font-bold uppercase tracking-wider text-xs">Volver a resumen de historial</span>
    `;
    backBtn.onclick = () => {
        selectedDriverForHistoryAdmin = null;
        renderHistory();
    };
    container.appendChild(backBtn);

    const driverOrders = orders.filter(o => (o.envio || 'Sin Asignar').trim() === driverName);

    // Título del repartidor seleccionado en Historial
    const title = document.createElement('div');
    title.className = 'px-2 mb-4 text-slate-400 font-medium flex items-center gap-2';
    title.innerHTML = `
        <i class="fa-solid fa-clock-rotate-left text-emerald-500"></i>
        Historial de <span class="text-white font-bold">${driverName}</span>
    `;
    container.appendChild(title);

    driverOrders.sort((a, b) => b.nro - a.nro).forEach(order => {
        const div = document.createElement('div');
        const statusColor = order.estado === 'Validado' ? 'text-emerald-400 bg-emerald-500/10' :
            (order.estado === 'Cancelado' ? 'text-red-400 bg-red-500/10' : 'text-orange-400 bg-orange-500/10');
        const statusLabel = order.estado === 'Validado' ? 'VALIDADO' : (order.estado === 'Cancelado' ? 'CANCELADO' : 'POR VALIDAR');
        const withinSLA = isWithinSLA(order);
        const isCancelled = order.estado === 'Cancelado';

        let slaHTML = '';
        if (!isCancelled) {
            if (withinSLA) {
                slaHTML = `<span class="text-emerald-500 font-bold uppercase tracking-tight"><i class="fa-solid fa-circle-check mr-1"></i> Entrega Exitosa</span>`;
            } else {
                slaHTML = `<span class="text-red-500 font-bold uppercase tracking-tight"><i class="fa-solid fa-circle-exclamation mr-1"></i> Entrega Fuera de Tiempo</span>`;
            }
        }

        let horaPedido = '--:--';
        if (order.fecha) {
            try {
                const dateObj = new Date(order.fecha);
                horaPedido = new Intl.DateTimeFormat('es-PE', {
                    timeZone: 'America/Lima',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                }).format(dateObj).toLowerCase().replace(' ', '');
            } catch (e) { }
        }

        div.className = 'bg-cardDark border border-slate-700/50 rounded-2xl p-4 shadow-sm mb-3 active:scale-[0.98] transition-all cursor-pointer hover:border-emerald-500/30';
        div.onclick = () => openModalEditDelivery(order);

        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div>
                    <span class="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">LLAVE</span>
                    <span class="text-lg font-bold text-white">${order.llave || `PED-${order.nro}`}</span>
                </div>
                <div class="text-right">
                    <span class="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">HORA</span>
                    <span class="text-lg font-bold text-amber-400">${horaPedido}</span>
                </div>
            </div>
        <div class="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
            <span class="px-2 py-0.5 rounded text-[10px] font-black tracking-tighter ${statusColor}">${statusLabel}</span>
            <div class="text-[10px]">
                ${slaHTML}
            </div>
        </div>
    `;
        container.appendChild(div);
    });
}

// --- Manual Delivery Correction (Admin) ---

function openModalEditDelivery(order) {
    // Solo permitir editar si es Admin
    if (!currentUser || currentUser.toLowerCase() !== 'admin') return;

    document.getElementById('edit-delivery-nro').value = order.nro;

    // Preparar valores actuales de fecha y hora
    let currentDate = "";
    let currentTime = "";

    if (order.fecha_entrega) {
        // Formato esperado DD/MM/YYYY -> YYYY-MM-DD
        const parts = order.fecha_entrega.split('/');
        if (parts.length === 3) currentDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }

    if (order.hora_entrega) {
        currentTime = order.hora_entrega;
    }

    // Si no hay datos, usar hoy y ahora como sugerencia
    if (!currentDate) currentDate = new Date().toISOString().split('T')[0];
    if (!currentTime) {
        const now = new Date();
        currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    document.getElementById('edit-delivery-date').value = currentDate;
    document.getElementById('edit-delivery-time').value = currentTime;

    const modal = document.getElementById('modal-edit-delivery');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

async function saveManualDelivery() {
    const nro = document.getElementById('edit-delivery-nro').value;
    const rawDate = document.getElementById('edit-delivery-date').value; // YYYY-MM-DD
    const rawTime = document.getElementById('edit-delivery-time').value; // HH:mm

    console.log("💾 Intentando guardar corrección manual:", { nro, rawDate, rawTime });

    if (!rawDate || !rawTime) {
        Swal.fire({ icon: 'warning', title: 'Atención', text: 'Fecha y hora son obligatorias' });
        return;
    }

    // Convertir YYYY-MM-DD a DD/MM/YYYY para Google Sheets
    const [y, m, d] = rawDate.split('-');
    const formattedDate = `${d}/${m}/${y}`;

    const btn = document.getElementById('btn-save-edit-delivery');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Guardando...';

    try {
        const payload = {
            action: 'corregirEntrega',
            nro: nro,
            fechaEntrega: formattedDate,
            horaEntrega: rawTime
        };
        console.log("📡 Enviando payload a GAS:", payload);

        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Error de red: " + response.status);

        const res = await response.json();
        console.log("✅ Respuesta del servidor:", res);

        if (res.success) {
            Swal.fire({
                icon: 'success',
                title: '¡Listo!',
                text: 'Entrega corregida correctamente',
                timer: 1500,
                showConfirmButton: false
            });
            document.getElementById('modal-edit-delivery').classList.add('hidden');
            fetchDriverOrders(); // Refrescar datos
        } else {
            throw new Error(res.message || "Error desconocido");
        }
    } catch (e) {
        console.error("❌ Error en saveManualDelivery:", e);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar: ' + e.message });
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
// --- Driver Assignment for Admin ---
window.asignarMotorizadoDirecto = async (nro, driver) => {
    if (!driver) return;

    const confirm = await Swal.fire({
        title: '¿Confirmar asignación?',
        text: `Se asignará el pedido #${nro} a ${driver}`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, asignar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#3b82f6'
    });

    if (!confirm.isConfirmed) {
        // Recargar para resetear el select si canceló
        renderOrders();
        return;
    }

    Swal.fire({
        title: 'Procesando...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
    });

    try {
        const res = await fetchAPI('asignarMotorizado', { nro: nro, envio: driver });
        if (res.success) {
            Swal.fire({
                icon: 'success',
                title: '¡Asignado!',
                text: `El pedido #${nro} ahora pertenece a ${driver}`,
                timer: 1500,
                showConfirmButton: false
            });

            // Recargar datos y refrescar vista
            if (typeof loadOrders === 'function') {
                await loadOrders();
            } else if (typeof renderOrders === 'function') {
                renderOrders();
            }
        } else {
            Swal.fire('Error', res.message || 'No se pudo completar la asignación', 'error');
            renderOrders();
        }
    } catch (e) {
        console.error("Error en asignarMotorizadoDirecto:", e);
        Swal.fire('Error', 'Error de red o servidor', 'error');
        renderOrders();
    }
};

async function loadAllDrivers() {
    try {
        console.log("🛠️ Intentando obtener lista de motorizados desde el servidor...");
        const res = await window.fetchAPI('obtenerNombresMotorizados');
        console.log("📡 [DEBUG] Respuesta raw de motorizados:", JSON.stringify(res));

        if (res.success && res.data) {
            window.allDriversList = res.data;
            console.log("✅ [REPARTIDOR] Lista completa de motorizados cargada:", window.allDriversList.length, window.allDriversList);

            // Refrescar si estamos en modo Admin para ver la lista en los selects
            if (currentUser && currentUser.toLowerCase() === 'admin') {
                console.log("🔄 [REPARTIDOR] Refrescando vista para mostrar motorizados...");
                if (typeof renderOrders === 'function') {
                    renderOrders();
                }
            }
        } else {
            console.error("❌ [REPARTIDOR] Fallo al cargar motorizados:", res.message || "Sin mensaje de error");
        }
    } catch (e) {
        console.error("💥 [REPARTIDOR] Error crítico en loadAllDrivers:", e);
    }
}


window.openValidateModalAdmin = (nro) => {
    const order = (window.orders || []).find(o => o.nro == nro);
    if (!order) return;

    currentOrderForAdminValidation = order;
    valAdminNro.textContent = order.nro;
    valAdminLlave.textContent = `Llave: ${order.llave || '---'}`;
    valAdminMontoOrig.textContent = parseFloat(order.monto || 0).toFixed(2);

    // Reset fields
    valAdminPhotoAmount.value = '';
    valAdminDriver.value = order.envio || '';
    valAdminPhotoFileData = null;
    bestAdminOCRData = {}; // NUEVO v6.1: Reset metadata OCR
    const ocrChipsAdmin = document.getElementById('ocr-info-chips-admin');
    if (ocrChipsAdmin) ocrChipsAdmin.innerHTML = '';

    // --- PHOTO LOADING (PRE-CARGA) ---
    const cleanUrl = extractPhotoUrl(order.foto);
    if (cleanUrl && (order.estado === 'Validado' || order.estado === 'Por Validar')) {
        valAdminPreview.setAttribute('data-nro', order.nro);
        valAdminPreview.src = getDirectPhotoUrl(order.foto);
        valAdminPreview.classList.remove('hidden');
        valAdminPlaceholder.classList.add('hidden');
        valAdminPreview.onerror = () => handleImageError(valAdminPreview);
    } else {
        valAdminPreview.src = '';
        valAdminPreview.classList.add('hidden');
        valAdminPlaceholder.classList.remove('hidden');
    }

    valAdminOcrOverlay.classList.add('hidden');

    // Chips
    valAdminChips.innerHTML = '';
    if (order.pago) {
        valAdminChips.innerHTML += `<span class="px-2 py-0.5 rounded-md bg-slate-700/50 text-[10px] font-bold text-slate-300 border border-slate-600/30 uppercase">${order.pago}</span>`;
    }
    if (order.canal) {
        valAdminChips.innerHTML += `<span class="px-2 py-0.5 rounded-md bg-primary/10 text-[10px] font-bold text-primary border border-primary/20 uppercase">${order.canal}</span>`;
    }

    // --- Robot Findings (Column Z/H) ---
    const robotContainer = document.getElementById('val-admin-robot-findings-container');
    if (robotContainer) {
        const fullVal = (order.validado_por || '').toString();
        const columnZFindings = (order.minutosReales || '').toString();

        let findingMsg = '';
        if (columnZFindings && isNaN(parseFloat(columnZFindings))) {
            findingMsg = columnZFindings;
        } else if (fullVal.includes(':')) {
            findingMsg = fullVal.split(':').slice(1).join(':').trim();
        }

        if (findingMsg) {
            robotContainer.classList.remove('hidden');
            const isError = findingMsg.toLowerCase().includes('novalidado') || findingMsg.toLowerCase().includes('err:');
            robotContainer.className = `p-4 mt-4 rounded-xl text-xs flex flex-col gap-1 border ${isError ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-blue-500/10 border-blue-500/30 text-blue-300'}`;
            robotContainer.innerHTML = `
                <div class="flex items-center gap-2 font-bold mb-1">
                    <i class="fa-solid fa-circle-info"></i>
                    <span>Hallazgos del Robot</span>
                </div>
                <p class="leading-relaxed">${findingMsg}</p>
            `;
        } else {
            robotContainer.classList.add('hidden');
            robotContainer.innerHTML = '';
        }
    }

    // --- PRIORIDAD OBLIGATORIA: 1. Extracción Robot (AB/AC), 2. Manual (P/Q), 3. Hora Actual ---
    const robotFecha = (order.fechaPos || '').toString().trim();
    const manualFecha = (order.fecha_entrega || '').toString().trim();
    const rawFecha = robotFecha || manualFecha;

    if (rawFecha) {
        if (rawFecha.includes('/') && rawFecha.split('/').length === 3) {
            let partes = rawFecha.split('/');
            if (partes[2].length === 2) partes[2] = '20' + partes[2];
            valAdminDate.value = partes.join('/');
        } else {
            const d = new Date(rawFecha);
            if (!isNaN(d.getTime())) {
                const dayF = String(d.getDate()).padStart(2, '0');
                const monthF = String(d.getMonth() + 1).padStart(2, '0');
                valAdminDate.value = `${dayF}/${monthF}/${d.getFullYear()}`;
            } else {
                valAdminDate.value = rawFecha;
            }
        }
    } else {
        const nowF = new Date();
        const dayN = String(nowF.getDate()).padStart(2, '0');
        const monthN = String(nowF.getMonth() + 1).padStart(2, '0');
        valAdminDate.value = `${dayN}/${monthN}/${nowF.getFullYear()}`;
    }

    const robotHora = (order.horaPos || '').toString().trim();
    const manualHora = (order.hora_entrega || '').toString().trim();
    const rawHora = robotHora || manualHora;

    if (rawHora) {
        if (rawHora.includes('T')) {
            let dT = new Date(rawHora);
            if (!isNaN(dT.getTime())) {
                dT.setUTCFullYear(2000); 
                valAdminTime.value = dT.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });
            } else {
                valAdminTime.value = rawHora;
            }
        } else if (rawHora.includes(':')) {
            const parts = rawHora.split(':');
            const hh = parts[0].padStart(2, '0');
            const mm = parts[1].padStart(2, '0');
            valAdminTime.value = `${hh}:${mm}`;
        } else {
            valAdminTime.value = rawHora;
        }
    } else {
        valAdminTime.value = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });
    }

    // Show modal
    modalValidarAdmin.classList.remove('hidden');
    modalValidarAdmin.classList.add('flex', 'slide-up');
    document.body.style.overflow = 'hidden';

    // Initial toggle
    toggleValAdminOptions();

    // --- REFUERZO DE VALIDACIÓN (Mirror app.js) ---
    // Limpiar estados previos
    document.getElementById('val-admin-status-monto').classList.add('hidden');
    document.getElementById('val-admin-status-fecha').classList.add('hidden');
    
    // Escuchar cambios para validar en tiempo real
    const inputsToWatch = [
        valAdminPhotoAmount, valAdminDate, 
        document.getElementById('val-admin-monto-recibido'),
        document.getElementById('val-admin-vuelto')
    ];
    
    inputsToWatch.forEach(input => {
        if (input) {
            input.removeEventListener('input', updateValidationUIAdmin);
            input.addEventListener('input', updateValidationUIAdmin);
        }
    });

    // Escuchar cambios de radio "valAdminType"
    document.querySelectorAll('input[name="valAdminType"]').forEach(radio => {
        radio.removeEventListener('change', updateValidationUIAdmin);
        radio.addEventListener('change', updateValidationUIAdmin);
    });

    // Ejecutar validación inicial
    updateValidationUIAdmin();
};

function updateValidationUIAdmin() {
    if (!currentOrderForAdminValidation) return;
    const order = currentOrderForAdminValidation;

    const valType = document.querySelector('input[name="valAdminType"]:checked').value;
    const montoValidado = parseFloat(valAdminPhotoAmount.value || 0);
    const montoSistema = parseFloat(order.monto || 0);

    // 1. VALIDACIÓN DE MONTO (Exacta con margen 0.001)
    const statusMonto = document.getElementById('val-admin-status-monto');
    if (montoValidado > 0) {
        statusMonto.classList.remove('hidden');
        const diff = Math.abs(montoValidado - montoSistema);
        if (diff < 0.001) {
            statusMonto.innerHTML = '<span class="text-[9px] font-black text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">MONTO COINCIDE: VALIDADO</span>';
        } else {
            statusMonto.innerHTML = '<span class="text-[9px] font-black text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">MONTO DIFIERE</span>';
        }
    } else {
        statusMonto.classList.add('hidden');
    }

    // 2. VALIDACIÓN DE FECHA
    const statusFecha = document.getElementById('val-admin-status-fecha');
    const fechaInputRaw = valAdminDate.value.trim();
    if (fechaInputRaw) {
        statusFecha.classList.remove('hidden');
        const fechaPedidoYMD = getYMDLima(order.fecha);
        const [d, m, y] = fechaInputRaw.split('/');
        const fechaInputYMD = (d && m && y) ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : "";

        if (fechaInputYMD === fechaPedidoYMD) {
            statusFecha.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-500 text-sm"></i>';
        } else {
            statusFecha.innerHTML = '<i class="fa-solid fa-circle-exclamation text-red-500 text-sm" title="Fecha no coincide con pedido"></i>';
        }
    } else {
        statusFecha.classList.add('hidden');
    }

    // 3. LÓGICA DE EFECTIVO (Sugerido vs Recibido)
    const btnConfirmar = document.getElementById('btn-confirm-val-admin');
    let blockByCash = false;

    if (valType === 'efectivo') {
        const recibido = parseFloat(document.getElementById('val-admin-monto-recibido').value || 0);
        const vuelto = parseFloat(document.getElementById('val-admin-vuelto').value || 0);
        const sugeridoRedondo = montoSistema + vuelto;

        if (recibido > 0) {
            const diffCash = Math.abs(recibido - sugeridoRedondo);
            if (diffCash >= 0.01) {
                blockByCash = true;
            }
        } else {
            blockByCash = true; // No permitir confirmar sin recibo
        }
    }

    // 4. BLOQUEO DE BOTÓN FINAL
    const diffMonto = Math.abs(montoValidado - montoSistema);
    const montoOk = montoValidado > 0 && diffMonto < 0.001;
    
    // Validar fecha solo si es POS u ONLINE (Efectivo a veces es posterior)
    const fechaPedidoYMD = getYMDLima(order.fecha);
    const [dd, mm, yy] = fechaInputRaw.split('/');
    const fechaInputYMD = (dd && mm && yy) ? `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}` : "";
    const fechaOk = (fechaInputYMD === fechaPedidoYMD);

    if (montoOk && fechaOk && !blockByCash) {
        btnConfirmar.disabled = false;
        btnConfirmar.classList.remove('opacity-50', 'grayscale');
    } else {
        btnConfirmar.disabled = true;
        btnConfirmar.classList.add('opacity-50', 'grayscale');
    }
}

window.closeValidateModalAdmin = () => {
    modalValidarAdmin.classList.add('hidden');
    modalValidarAdmin.classList.remove('flex', 'slide-up');
    document.body.style.overflow = '';
    currentOrderForAdminValidation = null;
};

window.toggleValAdminOptions = () => {
    const type = document.querySelector('input[name="valAdminType"]:checked').value;
    const posOpts = document.getElementById('val-admin-pos-options');
    const cashOpts = document.getElementById('val-admin-efectivo-options');

    posOpts.classList.add('hidden');
    cashOpts.classList.add('hidden');

    if (type === 'pos') posOpts.classList.remove('hidden');
    if (type === 'efectivo') cashOpts.classList.remove('hidden');
};

window.setValAdminPosType = (tipo) => {
    document.getElementById('val-admin-pos-sub-type').value = tipo;
    const btnTarjeta = document.getElementById('btn-val-admin-tarjeta');
    const btnQR = document.getElementById('btn-val-admin-qr');

    if (tipo === 'TARJETA') {
        btnTarjeta.className = 'p-3 rounded-lg border border-primary bg-primary/10 text-primary font-bold text-xs flex items-center justify-center gap-2';
        btnQR.className = 'p-3 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-400 font-bold text-xs flex items-center justify-center gap-2';
    } else {
        btnQR.className = 'p-3 rounded-lg border border-primary bg-primary/10 text-primary font-bold text-xs flex items-center justify-center gap-2';
        btnTarjeta.className = 'p-3 rounded-lg border border-slate-700 bg-slate-800/50 text-slate-400 font-bold text-xs flex items-center justify-center gap-2';
    }
};

window.handleValAdminPhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    valAdminPlaceholder.classList.add('hidden');
    valAdminPreview.classList.remove('hidden');
    valAdminPreview.src = URL.createObjectURL(file);

    // Convert to base64 for upload
    const reader = new FileReader();
    reader.onload = (event) => {
        valAdminPhotoFileData = event.target.result.split(',')[1];
        // Trigger OCR
        runAdminOCR(file);
    };
    reader.readAsDataURL(file);
};

async function runAdminOCR(file, rotation = 0) {
    valAdminOcrOverlay.classList.remove('hidden');
    valAdminPhotoAmount.value = '';
    valAdminPhotoAmount.placeholder = 'Escaneando...';

    bestAdminOCRData = { amount: 0, fecha: '', hora: '', tipoPago: 'TARJETA', esOnlineValido: false };
    let engine = '';
    const valType = document.querySelector('input[name="valAdminType"]:checked')?.value;

    try {
        // 1. INTELIGENCIA GEMINI (Backend) - PRIORIDAD MÁXIMA (Igual que el Robot)
        try {
            const base64 = rotation === 0 ? await fileToBase64(file) : await getRotatedBase64(file, rotation);
            const response = await window.fetchAPI('processVoucherOCR', {
                imageBase64: base64,
                mimeType: file.type || 'image/jpeg'
            });

            if (response.success && response.data) {
                const d = response.data;
                bestAdminOCRData = {
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

        // 2. GOOGLE CLOUD VISION (Directo) - SEGUNDO RESPALDO (Menos inteligente)
        if (bestAdminOCRData.amount <= 0 && (valType === 'pos' || valType === 'online')) {
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
                            bestAdminOCRData = {
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
        if (bestAdminOCRData.amount <= 0 && window.Tesseract && (valType === 'pos' || valType === 'online')) {
            engine = 'Tesseract';
            function mergeData(passData) {
                if (passData.amount > 0 && bestAdminOCRData.amount === 0) bestAdminOCRData.amount = passData.amount;
                if (passData.fecha && !bestAdminOCRData.fecha) {
                    bestAdminOCRData.fecha = passData.fecha;
                    bestAdminOCRData.fechaPOS = passData.fecha;
                }
                if (passData.hora && !bestAdminOCRData.hora) {
                    bestAdminOCRData.hora = passData.hora;
                    bestAdminOCRData.horaPOS = passData.hora;
                }
                if (passData.tipoPago === 'QR') bestAdminOCRData.tipoPago = 'QR';
            }

            const processedImage = await preprocessImage(file);
            mergeData(await ocrPass(processedImage, { tessedit_char_whitelist: '0123456789SsTtOoAaLl/., :', tessedit_pageseg_mode: '6' }, 'Pass 1'));
            if (bestAdminOCRData.amount <= 0 || !bestAdminOCRData.fecha || !bestAdminOCRData.hora) {
                mergeData(await ocrPass(processedImage, { tessedit_pageseg_mode: '3' }, 'Pass 2'));
            }
        }

        if (bestAdminOCRData.amount > 0) {
            valAdminPhotoAmount.value = bestAdminOCRData.amount.toFixed(2);
            processAdminVoucherTimes(bestAdminOCRData.fecha, bestAdminOCRData.hora);

            if (valType === 'pos') {
                setValAdminPosType(bestAdminOCRData.tipoPago);
            }

            if (valType === 'online' && !bestAdminOCRData.esOnlineValido) {
                Swal.fire({
                    title: 'Verificación ONLINE Fallida',
                    html: `El comprobante no contiene el texto exacto <b>"Tarjeta de crédito o débito en línea"</b>.<br>Por favor, compruebe que sea el comprobante correcto.`,
                    icon: 'warning'
                });
            } else {
                getToast().fire({
                    icon: 'success',
                    title: `${engine}: S/ ${bestAdminOCRData.amount.toFixed(2)}`
                });
            }
            showAdminOcrInfoChips(bestAdminOCRData);
        } else {
            getToast().fire({
                icon: 'info',
                title: 'No se detectó el monto. Ingrese manual.'
            });
            valAdminPhotoAmount.placeholder = '0.00';
            valAdminPhotoAmount.focus();
        }
    } catch (err) {
        console.error('OCR Error:', err);
        Swal.fire('Error OCR', 'No se pudo leer la imagen.', 'error');
    }

    valAdminOcrOverlay.classList.add('hidden');
    updateValidationUIAdmin();
}

window.confirmarValidacionAdmin = async () => {
    if (!currentOrderForAdminValidation) return;

    const type = document.querySelector('input[name="valAdminType"]:checked').value;
    let tipoFinal = 'FOTO';
    if (type === 'pos') tipoFinal = document.getElementById('val-admin-pos-sub-type').value;
    else if (type === 'online') tipoFinal = 'ONLINE';
    else if (type === 'efectivo') tipoFinal = 'EFECTIVO';

    const montoValidado = parseFloat(valAdminPhotoAmount.value || 0);
    const montoSistema = parseFloat(currentOrderForAdminValidation.monto || 0);
    const diffMonto = Math.abs(montoValidado - montoSistema);

    if (montoValidado <= 0 || diffMonto >= 0.001) {
        Swal.fire({
            title: 'Monto No Coincide',
            text: `El monto validado (S/ ${montoValidado.toFixed(2)}) no coincide exactamente con el monto del sistema (S/ ${montoSistema.toFixed(2)}). Corrija antes de continuar.`,
            icon: 'error'
        });
        return;
    }

    // Validación de fecha (doble check)
    const fechaInputRaw = valAdminDate.value.trim();
    const fechaPedidoYMD = getYMDLima(currentOrderForAdminValidation.fecha);
    const [d, m, y] = fechaInputRaw.split('/');
    const fechaInputYMD = (d && m && y) ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : "";

    if (fechaInputYMD !== fechaPedidoYMD) {
        Swal.fire('Fecha Incorrecta', 'La fecha del comprobante no coincide con el pedido.', 'error');
        return;
    }

    if (type === 'efectivo') {
        const recibido = parseFloat(document.getElementById('val-admin-monto-recibido').value || 0);
        const vuelto = parseFloat(document.getElementById('val-admin-vuelto').value || 0);
        const sugeridoRedondo = montoSistema + vuelto;
        if (Math.abs(recibido - sugeridoRedondo) >= 0.01) {
            Swal.fire('Error en Efectivo', 'El monto recibido debe ser igual al Sugerido Redondo (Monto + Vuelto).', 'error');
            return;
        }
    }

    Swal.fire({ title: 'Confirmando...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    // Payload exactly like app.js
    const payload = {
        nro: currentOrderForAdminValidation.nro,
        montoFoto: montoValidado,
        usuario: currentUser,
        tipo: tipoFinal,
        vuelto: (type === 'efectivo') ? document.getElementById('val-admin-vuelto').value : '',
        montoRecibido: (type === 'efectivo') ? document.getElementById('val-admin-monto-recibido').value : '',
        envio: currentOrderForAdminValidation.envio || '',
        fechaEntrega: valAdminDate.value,
        horaEntrega: valAdminTime.value,
        tiempoTranscurrido: '',
        // NUEVO v6.1: Inteligencia total (Columnas AA-AF)
        idOperacion: bestAdminOCRData.idOperacion || '',
        fechaPOS: bestAdminOCRData.fechaPOS || '',
        horaPOS: bestAdminOCRData.horaPOS || '',
        idCompras: bestAdminOCRData.idCompras || '',
        esDuplicado: !!bestAdminOCRData.esDuplicado,
        hallazgo: bestAdminOCRData.hallazgo || '',
        archivo: valAdminPhotoFileData ? {
            name: `admin_val_${currentOrderForAdminValidation.nro}_${Date.now()}.jpg`,
            type: 'image/jpeg',
            data: valAdminPhotoFileData
        } : null
    };

    try {
        const res = await window.fetchAPI('validarPedido', payload);
        if (res.success) {
            Swal.fire({ icon: 'success', title: '¡Validado!', text: 'Pedido actualizado correctamente', timer: 1500, showConfirmButton: false });
            closeValidateModalAdmin();
            fetchDriverOrders();
        } else {
            Swal.fire('Error', res.message || 'Error al validar', 'error');
        }
    } catch (err) {
        Swal.fire('Error', 'Error de conexión', 'error');
    }
};
function playBeepSoft() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.12);
    } catch (e) { }
}

function renderValidationTab() {
    const container = document.getElementById('lista-validar-container');
    const lblSummary = document.getElementById('lbl-validar-summary');
    const allOrders = window.orders || [];

    // Filtrar pedidos con estado "Por Validar" (Columna G)
    const pendingValidation = allOrders.filter(o => o.estado && o.estado.toLowerCase() === 'por validar');

    lblSummary.textContent = `${pendingValidation.length} pedidos por procesar`;
    container.innerHTML = '';

    if (pendingValidation.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 px-4 border border-dashed border-slate-700 rounded-2xl">
                <i class="fa-solid fa-circle-check text-4xl text-emerald-500/50 mb-4"></i>
                <h3 class="text-xl font-bold text-slate-300">¡Todo al día!</h3>
                <p class="text-slate-500 mt-2">No hay pedidos pendientes de validación en este momento.</p>
            </div>
        `;
        return;
    }

    pendingValidation.forEach(order => {
        const card = document.createElement('div');
        card.className = 'bg-cardDark border border-slate-700/50 rounded-2xl p-4 shadow-lg active:scale-[0.98] transition-all cursor-pointer';
        card.onclick = () => openValidateModalAdmin(order.nro);

        const monto = parseFloat(order.monto || 0);

        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div class="flex items-center gap-2">
                    <span class="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                        ${order.nro}
                    </span>
                    <div>
                        <h4 class="font-bold text-white leading-none">${order.llave || 'Sin Llave'}</h4>
                        <p class="text-[10px] text-slate-500 uppercase mt-1">Driver: ${order.envio || '---'}</p>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-lg font-black text-amber-400">S/ ${monto.toFixed(2)}</span>
                </div>
            </div>
            
            <div class="flex items-center justify-between pt-3 border-t border-slate-800/50">
                <div class="flex gap-1.5">
                    <span class="px-2 py-0.5 rounded-md bg-slate-800 text-[9px] font-bold text-slate-400 border border-slate-700 uppercase">
                        ${order.pago || '---'}
                    </span>
                    <span class="px-2 py-0.5 rounded-md bg-primary/10 text-[9px] font-bold text-primary border border-primary/20 uppercase">
                        ${order.canal || 'PWA'}
                    </span>
                </div>
                <button class="bg-primary/20 text-primary px-3 py-1.5 rounded-lg text-[10px] font-black uppercase flex items-center gap-1">
                    <i class="fa-solid fa-check-double"></i>
                    Validar Ahora
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}
// --- Photo Utilities (Ported from app.js) ---

function extractPhotoUrl(fotoStr) {
    if (!fotoStr || typeof fotoStr !== 'string') return '';
    let s = fotoStr.trim();
    if (s.startsWith('PAGO-') || s === '') return '';
    let url = s.split(/\s+/)[0];
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch) return `https://drive.google.com/uc?id=${idMatch[1]}&export=view`;
    if (url.length >= 20 && url.length <= 60 && !url.includes('/') && !url.includes('.')) {
        return `https://drive.google.com/uc?id=${url}&export=view`;
    }
    return url;
}

function getDirectPhotoUrl(fotoStr) {
    if (!fotoStr || typeof fotoStr !== 'string') return '';
    let s = fotoStr.trim();
    let url = s.split(/\s+/)[0];
    let id = '';
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch) id = idMatch[1];
    else if (url.length >= 20 && url.length <= 60 && !url.includes('/') && !url.includes('.')) id = url;
    if (id) return `https://lh3.googleusercontent.com/d/${id}`;
    return url;
}

async function handleImageError(img) {
    const src = img.src;
    const nro = img.getAttribute('data-nro');
    if (src.includes('lh3.googleusercontent.com')) {
        const id = src.split('/').pop();
        console.warn("lh3 falló. Probando fallback uc?id...");
        img.src = `https://drive.google.com/uc?id=${id}`;
    } else if (src.includes('drive.google.com/uc') && nro) {
        console.warn("uc?id falló. Iniciando descarga desde servidor...");
        try {
            const res = await window.fetchAPI('getPhotoBase64', { nro: nro });
            if (res.success) {
                img.src = `data:${res.mimeType};base64,${res.base64}`;
            }
        } catch (e) { console.error(e); }
    }
}

// --- OCR Helpers ---

function parseIziPayVoucherData(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    let fecha = '', hora = '', monto = 0, tipoPago = 'TARJETA';

    const fechaPatterns = [/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/, /([a-zA-Z]+)\s+(\d{1,2})[\/\-\.](\d{4})/i];
    for (let line of lines) {
        for (let p of fechaPatterns) {
            const m = line.match(p);
            if (m) { fecha = m[0]; break; }
        }
        if (fecha) break;
    }

    const horaPattern = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;
    for (let line of lines) {
        const m = line.match(horaPattern);
        if (m) { hora = m[0]; break; }
    }

    const montoPatterns = [/S\/?\s*[.\s]*([\d,]+\.?\d{0,2})/i, /Total\s*:?\s*S\/?\s*[.\s]*([\d,]+\.?\d{0,2})/i];
    for (let line of lines) {
        for (let p of montoPatterns) {
            const m = line.match(p);
            if (m) {
                let v = (m[1] || m[0]).replace(/[^\d.,]/g, '').replace(',', '.');
                if (parseFloat(v) > 0) monto = parseFloat(v);
            }
        }
    }
    if (text.toLowerCase().includes('qr')) tipoPago = 'QR';
    return { amount: monto, fecha, hora, tipoPago };
}

function showAdminOcrInfoChips(data) {
    let container = document.getElementById('ocr-info-chips-admin');
    if (!container) {
        container = document.createElement('div');
        container.id = 'ocr-info-chips-admin';
        container.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; justify-content:center;';
        const photoSection = document.getElementById('val-admin-photo-section') || document.querySelector('.modal-card');
        photoSection.appendChild(container);
    }
    container.innerHTML = '';

    const chipStyle = 'display:inline-flex; align-items:center; gap:4px; padding:4px 10px; border-radius:16px; font-size:0.75em; font-weight:600; border:1px solid rgba(255,255,255,0.15);';

    if (data.fecha) {
        container.innerHTML += `<span style="${chipStyle} background:rgba(96,165,250,0.15); color:#60a5fa;"><i class="fa-solid fa-calendar"></i> ${data.fecha}</span>`;
    }
    if (data.hora) {
        container.innerHTML += `<span style="${chipStyle} background:rgba(167,139,250,0.15); color:#a78bfa;"><i class="fa-solid fa-clock"></i> ${data.hora}</span>`;
    }
    container.innerHTML += `<span style="${chipStyle} background:rgba(74,222,128,0.15); color:#4ade80;"><i class="fa-solid fa-${data.tipoPago === 'QR' ? 'qrcode' : 'credit-card'}"></i> ${data.tipoPago || 'TARJETA'}</span>`;

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

function processAdminVoucherTimes(extractedFecha, extractedHora) {
    if (extractedFecha) {
        let f = extractedFecha.replace(/[\-\.]/g, '/');
        const parts = f.split('/');
        if (parts.length >= 3) {
            let dia = parts[0].padStart(2, '0');
            let mes = parts[1].padStart(2, '0');
            let anio = parts[2];
            if (anio.length === 2) anio = '20' + anio;
            valAdminDate.value = `${dia}/${mes}/${anio}`;
        }
    }
    if (extractedHora) {
        const hm = extractedHora.split(':');
        if (hm.length >= 2) valAdminTime.value = `${hm[0].padStart(2, '0')}:${hm[1].padStart(2, '0')}`;
    }
}

function preprocessImage(file) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const sY = Math.floor(img.height * 0.40);
            const sH = Math.floor(img.height * 0.45);
            canvas.width = img.width * 2; canvas.height = sH * 2;
            ctx.drawImage(img, 0, sY, img.width, sH, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/png'));
        };
    });
}

async function ocrPass(image, params, label) {
    try {
        const worker = await Tesseract.createWorker();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        await worker.setParameters(params);
        const ret = await worker.recognize(image);
        await worker.terminate();
        return parseIziPayVoucherData(ret.data.text);
    } catch (err) { return { amount: 0, fecha: '', hora: '', tipoPago: 'TARJETA' }; }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function getRotatedBase64(file, rotation) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (rotation % 180 === 0) { canvas.width = img.width; canvas.height = img.height; }
                else { canvas.width = img.height; canvas.height = img.width; }
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate((rotation * Math.PI) / 180);
                ctx.drawImage(img, -img.width / 2, -img.height / 2);
                resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}
async function loadAllDrivers() {
    try {
        const res = await window.fetchAPI('obtenerNombresMotorizados');
        if (res.success && res.data) {
            window.allDriversList = res.data;
            console.log("✅ Lista completa de motorizados cargada:", window.allDriversList.length);
            
            // Poblar datalist id="drivers-list"
            const dl = document.getElementById('drivers-list');
            if (dl) {
                dl.innerHTML = '';
                res.data.forEach(name => {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name; // Mejor soporte para móviles
                    opt.label = name;       // Mejor soporte para móviles
                    dl.appendChild(opt);
                });
            }

            if (typeof renderOrders === 'function') renderOrders();
        }
    } catch (e) {
        console.error("Error al cargar lista de motorizados:", e);
    }
}

// ==========================================
// 🛡️ LÓGICA DE AUDITORÍA POS (ADMIN MOBILE)
// ==========================================
let auditPosData = [];
let auditSystemData = [];
let matchedSysIds = new Set();
let currentAuditPosTotal = 0;
let currentAuditSysTotal = 0;

function initAuditTabPWA() {
    const auditDate = document.getElementById('audit-date');
    const auditDriver = document.getElementById('audit-driver');
    
    // Set date to today (Lima)
    if (auditDate && !auditDate.value) {
        auditDate.value = getYMDLima(new Date());
    }
    
    // Fill driver datalist if needed (already should be filled by drivers-list global)
    // No specific initialization needed for results until photos are uploaded
}

async function processAuditPhotos(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const auditDate = document.getElementById('audit-date').value;
    const auditDriver = document.getElementById('audit-driver').value;

    if (!auditDate) {
        Swal.fire('Error', 'Debes seleccionar una fecha para la auditoría', 'warning');
        return;
    }

    Swal.fire({
        title: 'Procesando Imágenes',
        text: 'Gemini está leyendo los vouchers del POS...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    try {
        const base64Images = [];
        for (const file of files) {
            const b64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result); // Data URI completo
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            base64Images.push(b64);
        }

        // 1. Extraer data del POS via Gemini (Backend espera 'imageBase64Array')
        const resPos = await window.fetchAPI('extraerListaPOS', { imageBase64Array: base64Images });
        if (!resPos.success) throw new Error(resPos.message || 'Error en Gemini');

        // 2. Obtener data del Sistema (TADA)
        const resSys = await window.fetchAPI('obtenerDataSistemaAudit', { 
            fecha: auditDate, 
            motorizado: auditDriver // Opcional, si está vacío trae todos
        });
        if (!resSys.success) throw new Error(resSys.message || 'Error al obtener data del sistema');

        auditPosData = resPos.data || [];
        auditSystemData = resSys.data || [];

        renderAuditTablesPWA();
        Swal.close();

        // Mostrar box de resultados
        document.getElementById('audit-summary-box').classList.remove('hidden');
        document.getElementById('audit-results-container').classList.remove('hidden');

    } catch (e) {
        console.error(e);
        Swal.fire('Error', e.message || 'Error al procesar la auditoría', 'error');
    }
}

async function loadAuditDataPWA() {
    const auditDate = document.getElementById('audit-date').value;
    const auditDriver = document.getElementById('audit-driver').value;

    if (!auditDate) {
        Swal.fire('Error', 'Debes seleccionar una fecha', 'warning');
        return;
    }

    Swal.fire({ title: 'Consultando Sistema...', didOpen: () => { Swal.showLoading(); } });

    try {
        const resSys = await window.fetchAPI('obtenerDataSistemaAudit', { 
            fecha: auditDate, 
            motorizado: auditDriver
        });
        
        if (!resSys.success) throw new Error(resSys.message);
        
        auditSystemData = resSys.data || [];
        renderAuditTablesPWA();
        
        document.getElementById('audit-summary-box').classList.remove('hidden');
        document.getElementById('audit-results-container').classList.remove('hidden');
        Swal.close();

        if (auditSystemData.length === 0) {
            Swal.fire('Atención', 'No se encontraron pedidos con tarjeta/QR para los filtros seleccionados', 'info');
        }
    } catch (e) {
        Swal.fire('Error', e.message || 'Error al consultar sistema', 'error');
    }
}

function renderAuditTablesPWA() {
    const posTbody = document.getElementById('audit-pos-tbody');
    const sysTbody = document.getElementById('audit-system-tbody');
    
    posTbody.innerHTML = '';
    sysTbody.innerHTML = '';
    
    let totalPOS = 0;
    let totalSys = 0;
    matchedSysIds = new Set();

    // Detección de duplicados simple para UI
    const posMontoCounts = {};
    const posDigitsCounts = {};
    (auditPosData || []).forEach(p => {
        posMontoCounts[p.monto] = (posMontoCounts[p.monto] || 0) + 1;
        if (p.tarjeta) posDigitsCounts[p.tarjeta] = (posDigitsCounts[p.tarjeta] || 0) + 1;
    });

    const sysMontoCounts = {};
    (auditSystemData || []).forEach(s => {
        const m = parseFloat(s.monto).toFixed(2);
        sysMontoCounts[m] = (sysMontoCounts[m] || 0) + 1;
    });

    // --- RENDER POS ---
    const posByPage = {};
    (auditPosData || []).forEach(p => {
        const pag = p.pagina || 1;
        if (!posByPage[pag]) posByPage[pag] = [];
        posByPage[pag].push(p);
    });

    const pages = Object.keys(posByPage).sort((a,b) => a-b);
    const allPosIds = [...new Set((auditPosData || []).map(p => p.posId).filter(id => id))];

    pages.forEach(pagNum => {
        const items = posByPage[pagNum];
        const isComplete = items.length === 10 || pagNum == pages[pages.length-1];
        const borderColor = isComplete ? 'border-blue-500' : 'border-amber-500';

        posTbody.innerHTML += `
            <tr class="bg-slate-800/80 font-bold border-l-4 ${borderColor}">
                <td colspan="2" class="p-3 text-slate-300">
                    <i class="fa-solid fa-file-lines"></i> PÁGINA ${pagNum} (${items.length} regs)
                    ${!isComplete ? ' - <small class="text-amber-400">(Incompleta)</small>' : ''}
                </td>
            </tr>
        `;

        items.forEach(pos => {
            totalPOS += pos.monto;
            const matchIdx = auditSystemData.findIndex((sys, idx) => 
                !matchedSysIds.has(idx) && Math.abs(parseFloat(sys.monto) - pos.monto) < 0.01
            );
            
            let statusIcon = '<i class="fa-solid fa-circle-xmark text-red-400"></i>';
            if (matchIdx !== -1) {
                matchedSysIds.add(matchIdx);
                auditSystemData[matchIdx].matchedTime = pos.hora;
                statusIcon = '<i class="fa-solid fa-circle-check text-emerald-400"></i>';
            }

            const montoDupe = posMontoCounts[pos.monto] > 1 ? 'bg-amber-500/20' : '';
            const posIdDiff = (allPosIds.length > 1) ? 'text-amber-400' : 'text-slate-500';

            posTbody.innerHTML += `
                <tr class="${montoDupe}">
                    <td class="p-3">
                        <div class="font-bold flex items-center gap-2">
                            ${statusIcon} S/ ${pos.monto.toFixed(2)}
                        </div>
                        <div class="text-[10px] text-slate-500 ml-5">${pos.hora || '--:--'}</div>
                    </td>
                    <td class="p-3 text-right">
                        <div class="font-medium ${posDigitsCounts[pos.tarjeta]>1?'text-red-400':''}">
                            ${pos.tarjeta ? '*' + pos.tarjeta : 'N/A'}
                        </div>
                        <div class="text-[10px] ${posIdDiff}">${pos.posId || 'POS-?'}</div>
                    </td>
                </tr>
            `;
        });
    });

    // Row de Resumen POS
    if ((auditPosData || []).length > 0) {
        posTbody.innerHTML += `
            <tr class="bg-blue-500/20 font-black border-t-2 border-blue-500">
                <td class="p-4 text-white font-bold">S/ ${totalPOS.toFixed(2)}</td>
                <td class="p-4 text-right text-white font-bold">${auditPosData.length} VOUCHERS</td>
            </tr>
        `;
    }

    // --- RENDER SISTEMA ---
    (auditSystemData || []).forEach((sys, idx) => {
        const montoFix = parseFloat(sys.monto).toFixed(2);
        totalSys += parseFloat(sys.monto);
        const isMatched = matchedSysIds.has(idx);
        const montoDupe = sysMontoCounts[montoFix] > 1 ? 'bg-amber-500/10' : '';

        sysTbody.innerHTML += `
            <tr class="${montoDupe}">
                <td class="p-3">
                    <div class="font-bold text-slate-200">${sys.llave}</div>
                    <div class="text-[9px] text-slate-500 font-medium"><i class="fa-solid fa-clock"></i> TADA: ${sys.hora || '--:--'}</div>
                    ${sys.matchedTime ? `<div class="text-[9px] text-emerald-400 font-bold"><i class="fa-solid fa-receipt"></i> POS: ${sys.matchedTime}</div>` : ''}
                </td>
                <td class="p-3 text-right">
                    <div class="font-black ${isMatched ? 'text-emerald-400' : 'text-red-400'}">S/ ${montoFix}</div>
                    <div class="text-[10px] uppercase font-bold text-slate-600">${isMatched ? 'Conciliado' : 'No Encontrado'}</div>
                </td>
            </tr>
        `;
    });

    // Row de Resumen Sistema
    if ((auditSystemData || []).length > 0) {
        sysTbody.innerHTML += `
            <tr class="bg-emerald-500/20 font-black border-t-2 border-emerald-500">
                <td class="p-4 text-white">${auditSystemData.length} PEDIDOS</td>
                <td class="p-4 text-right text-white">S/ ${totalSys.toFixed(2)}</td>
            </tr>
        `;
    }

    // Actualizar Totales del Sub-Header
    currentAuditPosTotal = totalPOS;
    currentAuditSysTotal = totalSys;
    const diff = totalPOS - totalSys;

    document.getElementById('summary-pos-total').textContent = `S/ ${totalPOS.toFixed(2)}`;
    document.getElementById('summary-sys-total').textContent = `S/ ${totalSys.toFixed(2)}`;
    
    const diffElem = document.getElementById('summary-diff-total');
    diffElem.textContent = `S/ ${diff.toFixed(2)}`;
    diffElem.className = `text-xl font-black ${Math.abs(diff) < 0.1 ? 'text-emerald-400' : 'text-red-400'}`;
}

async function saveAuditReportPWA() {
    const auditDate = document.getElementById('audit-date').value;
    const auditDriver = document.getElementById('audit-driver').value;
    const notes = `Auditoría via PWA - ${auditDriver || 'Global'}`;

    const { isConfirmed } = await Swal.fire({
        title: '¿Guardar Auditoría?',
        text: `Se registrará un reporte por S/ ${currentAuditPosTotal.toFixed(2)}`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, guardar',
        cancelButtonText: 'Revisar'
    });

    if (!isConfirmed) return;

    Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    try {
        const payload = {
            fecha: auditDate,
            motorizado: auditDriver,
            totalPos: currentAuditPosTotal,
            totalSys: currentAuditSysTotal,
            diferencia: currentAuditPosTotal - currentAuditSysTotal,
            notas: notes,
            detallePos: JSON.stringify(auditPosData),
            detalleSys: JSON.stringify(auditSystemData)
        };

        const res = await window.fetchAPI('guardarReporteAuditoria', payload);
        if (res.success) {
            Swal.fire('¡Éxito!', 'El reporte ha sido guardado en Google Sheets.', 'success');
            switchTab('ruta'); // Volver a la ruta
        } else {
            throw new Error(res.message);
        }
    } catch (e) {
        Swal.fire('Error', e.message || 'Fallo al guardar reporte', 'error');
    }
}
