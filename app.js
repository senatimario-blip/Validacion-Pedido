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

// State
let currentUser = null;
let orders = [];
let API_URL = localStorage.getItem('api_url') || '';
let currentFilter = 'all';
let currentFilteredOrders = [];
let dateRange = { start: null, end: null };

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (API_URL) apiUrlInput.value = API_URL;

    // Set Date Filter to Today
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('date-filter').value = `${yyyy}-${mm}-${dd}`;

    checkSession();
});

// --- Authentication ---

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

function showApp() {
    loginSection.classList.add('hidden');
    appSection.style.display = 'grid'; // Grid layout
    document.getElementById('user-name-display').textContent = currentUser.nombre;

    // Role based UI
    if (currentUser.rol !== 'Admin') {
        newOrderBtn.style.display = 'none';
        document.getElementById('import-btn').style.display = 'none';
        document.getElementById('import-text-btn').style.display = 'none';
    } else {
        newOrderBtn.style.display = 'flex';
        document.getElementById('import-btn').style.display = 'flex';
        document.getElementById('import-text-btn').style.display = 'flex';
    }

    loadOrders();
}

document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('user');
    location.reload();
});

// --- Navigation ---
const navPedidos = document.getElementById('nav-pedidos');
const navReportes = document.getElementById('nav-reportes');
const contentPedidos = document.getElementById('app-content');
const contentReportes = document.getElementById('reports-content');

navPedidos.addEventListener('click', (e) => {
    e.preventDefault();
    navPedidos.classList.add('active');
    navReportes.classList.remove('active');
    document.getElementById('nav-dashboard').classList.remove('active');
    contentPedidos.style.display = 'block';
    contentReportes.classList.add('hidden');
    const dv = document.getElementById('dashboard-view');
    if (dv) dv.style.display = 'none';
});

navReportes.addEventListener('click', (e) => {
    e.preventDefault();
    navReportes.classList.add('active');
    navPedidos.classList.remove('active');
    document.getElementById('nav-dashboard').classList.remove('active');
    contentPedidos.style.display = 'none';
    contentReportes.style.display = '';
    contentReportes.classList.remove('hidden');
    const dv = document.getElementById('dashboard-view');
    if (dv) dv.style.display = 'none';

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('report-date-filter').value = `${yyyy}-${mm}-${dd}`;

    renderReportsTable();
});

// --- Orders Management ---

async function loadOrders() {
    document.getElementById('loading-indicator').classList.remove('hidden');
    try {
        const response = await fetchAPI('listarPedidos');
        if (response.success) {
            orders = response.data.sort((a, b) => b.nro - a.nro);
            applyFilters();
            if (typeof window.refreshDashboardIfVisible === 'function') {
                window.refreshDashboardIfVisible();
            }
        }
    } catch (error) {
        Swal.fire('Error', 'Error cargando pedidos', 'error');
    }
    // AQUÍ ESTABA EL ERROR: Borré el link de github que estaba pegado al final
    document.getElementById('loading-indicator').classList.add('hidden');
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
        } else if (order.estado === 'Validado') {
            const tipo = (order.tipo_pago_val || order.tipo_pago || '').toString().toUpperCase();
            if (tipo.includes('EFECTIVO')) detalleHtml = '<span style="color:#4ade80; font-weight:bold; font-size:0.85em;">💵 EFECTIVO</span>';
            else if (tipo.includes('ONLINE')) detalleHtml = '<span style="color:#60a5fa; font-weight:bold; font-size:0.85em;">🌐 ONLINE</span>';
            else if (tipo.includes('TARJETA')) detalleHtml = '<span style="color:#a78bfa; font-weight:bold; font-size:0.85em;">💳 TARJETA</span>';
            else if (tipo.includes('QR') || tipo.includes('YAPE') || tipo.includes('PLIN')) detalleHtml = '<span style="color:#2dd4bf; font-weight:bold; font-size:0.85em;">📱 QR</span>';
            else if (tipo !== '') detalleHtml = `<span style="color:#cbd5e1; font-weight:bold; font-size:0.85em;">${tipo}</span>`;
        }

        // 2. LÓGICA DE COLUMNA "TIEMPO" (Azul/Rojo)
        let tiempoHtml = '<span class="text-muted">-</span>';

        try {
            let orderDate = null;

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

            if (orderDate && !isNaN(orderDate.getTime())) {
                let diffMs = null;
                let staticMins = null; // Para cuando viene de HH:MM:SS de Google Sheets

                // Usamos el tiempo guardado si ya está Validado y existe la columna
                if (order.estado === 'Validado' && order.tiempo_transcurrido) {
                    let valTiempo = order.tiempo_transcurrido;

                    // Si viene como string HH:MM:SS
                    if (typeof valTiempo === 'string' && valTiempo.includes(':') && !valTiempo.includes('T')) {
                        let parts = valTiempo.split(':');
                        let h = parseInt(parts[0] || '0', 10);
                        let m = parseInt(parts[1] || '0', 10);
                        if (!isNaN(h) && !isNaN(m)) {
                            staticMins = (h * 60) + m;
                        }
                    }
                    // Si viene desde Google Sheets como un objeto Date / ISO String (1899-12-30T00:26:00.000Z)
                    else {
                        try {
                            const d = new Date(valTiempo);
                            if (!isNaN(d.getTime())) {
                                // En Sheets las duraciones base 1899 se guardan y devuelven relativas a UTC
                                // Extraemos directamente la hora/minuto en formato UTC para ignorar los timezone locales de la laptop
                                staticMins = (d.getUTCHours() * 60) + d.getUTCMinutes();
                            }
                        } catch (e) { }
                    }
                }
                // Si no hay tiempo estático, calculamos dinámicamente o por fecha entrega (legacy/fallbacks)
                else if (order.estado === 'Validado' && order.hora_entrega) {
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
                } else if (order.estado === 'Pendiente') {
                    // Calcular against now(Lima) solo para Pendientes
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

                    // --- NUEVA LÓGICA DE COLORES ---
                    let color, bg;

                    if (order.estado === 'Pendiente') {
                        // VERDE SUAVE si está a tiempo, ROJO si pasó los 35 min
                        color = mins <= 35 ? '#4ade80' : '#f87171';
                        bg = mins <= 35 ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)';
                    } else {
                        // AZUL SUAVE si está a tiempo, NARANJA si pasó los 35 min
                        color = mins <= 35 ? '#60a5fa' : '#fb923c';
                        bg = mins <= 35 ? 'rgba(96, 165, 250, 0.1)' : 'rgba(251, 146, 60, 0.1)';
                    }
                    // -------------------------------

                    let text = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
                    tiempoHtml = `<span style="color:${color}; font-weight:bold; background:${bg}; padding: 3px 8px; border-radius: 6px; white-space: nowrap;"><i class="fa-solid fa-clock"></i> ${text}</span>`;
                }
            }
        } catch (e) { }

        // 3. CONSTRUIR LA FILA DE LA TABLA (11 Columnas exactas)
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${dynamicCorrelative}</td>
            <td>${formatDate(order.fecha)}</td>
            <td>${order.llave}</td>
            <td>S/ ${formatMoney(order.monto)}</td>
            <td><span class="badge ${order.estado.replace(' ', '-')}">${order.estado}</span></td>
            <td>${detalleHtml}</td>
            <td style="font-size:0.9em;">${order.envio || '<span class="text-muted">-</span>'}</td>
            <td>${tiempoHtml}</td>
            <td>
                ${order.foto === 'PAGO-EFECTIVO' ?
                '<span class="badge" style="background:rgba(16, 185, 129, 0.2); color:#4ade80; border:1px solid rgba(74, 222, 128, 0.3); cursor:default"><i class="fa-solid fa-money-bill-wave"></i> Efectivo</span>' :
                (order.foto === 'PAGO-ONLINE' ? '<span class="badge" style="background:rgba(59, 130, 246, 0.2); color:#60a5fa; border:1px solid rgba(96, 165, 250, 0.3); cursor:default"><i class="fa-solid fa-globe"></i> Online</span>' :
                    (order.foto ? `<a href="${extractPhotoUrl(order.foto)}" target="_blank" class="btn-icon-small"><i class="fa-solid fa-image"></i></a>` : '<span class="text-muted">-</span>'))}
            </td>
            <td style="font-size: 0.85em; color: rgba(255,255,255,0.8);">
                ${order.validado_por || '<span class="text-muted">-</span>'}
            </td>
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
                </button>` : ''}`}
            </td>
        `;
        ordersTableBody.appendChild(tr);
    });
}

window.toggleSLA = async (nro) => {
    try {
        const res = await fetchAPI('marcarSLAFuera', { nro, usuario: currentUser.usuario });
        if (res.success) {
            loadOrders();
        } else {
            Swal.fire('Error', res.message, 'error');
        }
    } catch (e) {
        Swal.fire('Error', 'Error de conexión', 'error');
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
}

// --- Modals & Forms ---

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

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
    });
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

function getUniqueDrivers() {
    const drivers = new Set();
    orders.forEach(order => {
        if (order.envio && order.envio.trim() !== '') {
            drivers.add(order.envio.trim());
        }
    });
    return Array.from(drivers).sort();
}

function updateDriversDatalist() {
    const datalist = document.getElementById('drivers-list');
    if (!datalist) return;
    const drivers = getUniqueDrivers();
    datalist.innerHTML = drivers.map(d => `<option value="${d}">`).join('');
}

window.openValidateModal = (nro) => {
    const order = orders.find(o => o.nro == nro);
    if (!order) return;

    currentOrderForValidation = order;
    document.getElementById('val-nro-display').textContent = order.nro;
    document.getElementById('val-key-display').textContent = order.llave;
    document.getElementById('val-amount-display').textContent = formatMoney(order.monto);
    document.getElementById('val-id').value = order.nro;

    const extraInfoDiv = document.getElementById('val-extra-info');
    extraInfoDiv.innerHTML = '';
    const chipStyle = 'display:inline-flex; align-items:center; gap:5px; padding:3px 10px; border-radius:20px; font-size:0.78em; font-weight:600; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:rgba(255,255,255,0.85);';

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
        extraInfoDiv.innerHTML += `<span style="${chipStyle}"><i class="fa-solid fa-credit-card" style="color:#4ade80;"></i> ${order.pago}</span>`;
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
    valPhotoAmountInput.value = '';

    updateDriversDatalist();
    document.getElementById('val-driver-name').value = order.envio || '';

    const valFechaEntrega = document.getElementById('val-fecha-entrega');
    const valHoraEntrega = document.getElementById('val-hora-entrega');

    if (order.fecha_entrega) {
        const d = new Date(order.fecha_entrega);
        if (!isNaN(d.getTime())) {
            const fmt = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Lima',
                year: 'numeric', month: '2-digit', day: '2-digit'
            });
            const parts = fmt.formatToParts(d);
            const getP = (type) => parts.find(p => p.type === type).value;
            valFechaEntrega.value = `${getP('day')}/${getP('month')}/${getP('year')}`;
        } else {
            valFechaEntrega.value = order.fecha_entrega;
        }
    } else {
        valFechaEntrega.value = '';
    }

    if (order.hora_entrega) {
        let hStr = String(order.hora_entrega).trim();
        if (hStr.includes('T')) {
            let dT = new Date(hStr);
            if (!isNaN(dT.getTime())) {
                dT.setUTCFullYear(2000); // Fix para evitar descuento de 13 mins por zona horaria de 1899
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
                valHoraEntrega.value = hStr;
            }
        } else if (hStr.includes(':')) {
            const parts = hStr.split(':');
            const hh = parts[0].padStart(2, '0');
            const mm = parts[1].padStart(2, '0');
            valHoraEntrega.value = `${hh}:${mm}`;
        } else {
            valHoraEntrega.value = hStr;
        }
    } else {
        valHoraEntrega.value = '';
    }
    calculateLiveElapsedTime();

    document.querySelectorAll('input[name="valType"]').forEach(r => r.checked = false);
    updateValidationMode(null);

    const cleanUrl = extractPhotoUrl(order.foto);
    const tipoPago = (order.tipo_pago || '').toString().trim().toUpperCase();
    if (tipoPago === 'EFECTIVO') {
        document.querySelector('input[name="valType"][value="efectivo"]').checked = true;
        updateValidationMode('efectivo');
        if (order.vuelto !== '' && order.vuelto !== null && order.vuelto !== undefined) {
            document.getElementById('val-vuelto-amount').value = parseFloat(order.vuelto) || '';
        }
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

    if (cleanUrl) {
        photoPreview.src = cleanUrl;
        photoPreview.classList.remove('hidden');
        uploadPlaceholder.classList.add('hidden');
        document.getElementById('photo-actions').classList.remove('hidden');
        document.getElementById('view-full-photo').href = cleanUrl;
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

    document.getElementById('modal-validate').classList.add('active');
};

const valTypeRadios = document.querySelectorAll('input[name="valType"]');
valTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        updateValidationMode(e.target.value);
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
            const h = Math.floor(diffMin / 60);
            const m = diffMin % 60;
            display.textContent = h > 0 ? `${h}h ${m}m` : `${m} min`;
            display.setAttribute('data-min', diffMin);
            display.style.color = '#60a5fa';
        } else {
            display.textContent = 'Hora anterior al registro';
            display.removeAttribute('data-min');
            display.style.color = '#f87171';
        }
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

    if (mode === 'efectivo') {
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
    } else {
        if (currentOrderForValidation && valPhotoAmountInput.value === parseFloat(currentOrderForValidation.monto).toFixed(2)) {
            valPhotoAmountInput.value = '';
            validateAmounts();
        }
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
    const validateModal = document.getElementById('modal-validate');
    if (!validateModal || !validateModal.classList.contains('active')) return;

    if (currentUser && currentUser.rol !== 'Admin') return;

    const valType = document.querySelector('input[name="valType"]:checked');
    if (!valType) {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'warning',
            title: 'Seleccione un tipo (POS, Online, Efectivo) primero',
            showConfirmButton: false,
            timer: 3000
        });
        return;
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
        const dt = new DataTransfer();
        dt.items.add(imageFile);
        photoInput.files = dt.files;
        handleFileSelect();
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

document.getElementById('ocr-trigger-btn')?.addEventListener('click', () => {
    const file = photoInput.files[0];
    if (file) {
        runOCR(file, currentRotation);
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
        /\b(\d{1,2})\s+de\s+([a-zA-Z]+)\s+de\s+(\d{4})\b/i
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
                    break;
                }
            }
        }
        if (monto > 0) break;
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

    // 1. NORMALIZAR LA FECHA (Convertir DD/MM/YY a DD/MM/YYYY)
    let fechaNormalizada = extractedFecha || '';
    if (fechaNormalizada) {
        // Reemplazar guiones o puntos por barras en caso de que el OCR lea 23-02-26
        fechaNormalizada = fechaNormalizada.replace(/[\-\.]/g, '/');
        const partes = fechaNormalizada.split('/');

        if (partes.length === 3) {
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

    let bestData = { amount: 0, fecha: '', hora: '', tipoPago: 'TARJETA' };
    let engine = '';
    const valType = document.querySelector('input[name="valType"]:checked')?.value;

    try {
        if (valType === 'pos') {
            let apiKey = localStorage.getItem('gcp_api_key');
            if (!apiKey) {
                const { value: key } = await Swal.fire({
                    title: 'Api Key Requerida',
                    input: 'password',
                    inputLabel: 'Ingresa tu API Key de Google Cloud Vision',
                    inputPlaceholder: 'AIzaSy...',
                    showCancelButton: true
                });
                if (key) {
                    localStorage.setItem('gcp_api_key', key);
                    apiKey = key;
                } else {
                    ocrOverlay.classList.add('hidden');
                    return;
                }
            }

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

                if (data.error) throw new Error(data.error.message);

                const textAnnotations = data.responses[0]?.textAnnotations;
                if (!textAnnotations || textAnnotations.length === 0) throw new Error('No se detectó texto en la imagen');

                const parsed = parseIziPayVoucherData(textAnnotations[0].description);
                bestData = {
                    amount: parsed.amount || 0,
                    fecha: parsed.fecha || '',
                    hora: parsed.hora || '',
                    tipoPago: parsed.tipoPago || 'TARJETA'
                };
            } catch (err) {
                console.error('[OCR] Google Cloud Vision error:', err);
                if (err.message && err.message.includes('API key not valid')) {
                    localStorage.removeItem('gcp_api_key');
                    Swal.fire('API Key Inválida', 'La clave ingresada no es válida. Intente nuevamente.', 'error');
                }
                throw err;
            }
        } else {
            if (API_URL) {
                try {
                    const base64 = rotation === 0 ? await fileToBase64(file) : await getRotatedBase64(file, rotation);
                    const response = await fetchAPI('processVoucherOCR', {
                        imageBase64: base64,
                        mimeType: file.type || 'image/jpeg'
                    });

                    if (response.success && response.data) {
                        const d = response.data;
                        bestData = {
                            amount: parseFloat(d.total) || 0,
                            fecha: d.fecha || '',
                            hora: d.hora || '',
                            tipoPago: d.tipoPago || 'TARJETA'
                        };
                        engine = `Gemini (${d.model || 'AI'})`;
                    }
                } catch (geminiErr) {
                    console.warn('[OCR] Gemini backend error:', geminiErr.message);
                }
            }

            if (bestData.amount <= 0) {
                engine = 'Tesseract';

                function mergeData(passData) {
                    if (passData.amount > 0 && bestData.amount === 0) bestData.amount = passData.amount;
                    if (passData.fecha && !bestData.fecha) bestData.fecha = passData.fecha;
                    if (passData.hora && !bestData.hora) bestData.hora = passData.hora;
                    if (passData.tipoPago === 'QR') bestData.tipoPago = 'QR';
                }

                const processedImage = await preprocessImage(file);
                mergeData(await ocrPass(processedImage, { tessedit_char_whitelist: '0123456789SsTtOoAaLl/., :', tessedit_pageseg_mode: '6' }, 'Pass 1'));
                if (bestData.amount <= 0 || !bestData.fecha || !bestData.hora) mergeData(await ocrPass(processedImage, { tessedit_pageseg_mode: '3' }, 'Pass 2'));
            }
        }

        if (bestData.amount > 0) {
            valPhotoAmountInput.value = bestData.amount.toFixed(2);
            itemDetected(bestData.amount);
            processVoucherTimes(bestData.fecha, bestData.hora);

            if (valType === 'pos') {
                setPosType(bestData.tipoPago);
            }

            showOcrInfoChips(bestData);

            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 4000,
                timerProgressBar: true,
            });
            let detailParts = [`S/ ${bestData.amount.toFixed(2)}`];
            if (bestData.fecha) detailParts.push(`📅 ${bestData.fecha}`);
            if (bestData.hora) detailParts.push(`🕐 ${bestData.hora}`);
            detailParts.push(bestData.tipoPago === 'QR' ? '📱 QR' : '💳 Tarjeta');
            Toast.fire({
                icon: 'success',
                title: `${engine}: ${detailParts.join(' | ')}`
            });
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
        return { amount: 0, fecha: '', hora: '', tipoPago: 'TARJETA' };
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
    if (!photoAmount) {
        validationStatusBox.className = 'validation-status-box';
        document.getElementById('status-icon').className = 'fa-solid fa-circle-question';
        document.getElementById('status-text').textContent = 'Pendiente de Validar';
        return;
    }

    const diff = Math.abs(photoAmount - registeredAmount);
    if (diff < 0.05) {
        validationStatusBox.className = 'validation-status-box valid';
        document.getElementById('status-icon').className = 'fa-solid fa-circle-check';
        document.getElementById('status-text').textContent = 'Monto Coincide: VALIDADO';
    } else {
        validationStatusBox.className = 'validation-status-box invalid';
        document.getElementById('status-icon').className = 'fa-solid fa-triangle-exclamation';
        document.getElementById('status-text').textContent = 'Monto Difiere: RECHAZAR';
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
            envio: driverName,
            fechaEntrega: document.getElementById('val-fecha-entrega').value || '',
            horaEntrega: document.getElementById('val-hora-entrega').value || '',
            tiempoTranscurrido: timeFormatted,
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
                document.getElementById('modal-validate').classList.remove('active');
                loadOrders();
            } else {
                Swal.fire('Error', res.message, 'error');
            }
        } catch (err) {
            Swal.fire('Error', 'Falló la conexión', 'error');
        }
    };

    startUpload();
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
        mode: 'cors',
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
    if (fotoStr.startsWith('PAGO-')) return '';

    let url = fotoStr.split(' ')[0];

    if (url.includes('drive.google.com')) {
        const idMatch = url.match(/\/d\/(.+?)\//) || url.match(/id=(.+?)(&|$)/);
        if (idMatch) {
            return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
        }
    }

    return url;
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

    data.forEach(o => {
        if (o.estado === 'Reservado') return;

        const monto = parseFloat(o.monto) || 0;

        totalCount++;
        totalAmount += monto;

        if (o.estado === 'Validado') {
            validCount++;
            validAmount += monto;
        } else if (o.estado === 'Pendiente') {
            pendingCount++;
            pendingAmount += monto;
        } else if (o.estado === 'Cancelado' || o.estado === 'Rechazado') {
            rejectedCount++;
            rejectedAmount += monto;
        }
    });

    document.getElementById('stat-total-amount').textContent = `S/ ${formatMoney(totalAmount)}`;
    document.getElementById('stat-total-count').textContent = `${totalCount} pedidos`;

    document.getElementById('stat-pending-amount').textContent = `S/ ${formatMoney(pendingAmount)}`;
    document.getElementById('stat-pending-count').textContent = `${pendingCount} pedidos`;

    document.getElementById('stat-validated-amount').textContent = `S/ ${formatMoney(validAmount)}`;
    document.getElementById('stat-validated-count').textContent = `${validCount} pedidos`;

    document.getElementById('stat-rejected-amount').textContent = `S/ ${formatMoney(rejectedAmount)}`;
    document.getElementById('stat-rejected-count').textContent = `${rejectedCount} pedidos`;
}

function applyFilters() {
    const term = searchInput.value.toLowerCase();
    const filterDate = document.getElementById('date-filter').value;

    const hasRange = dateRange.start && dateRange.end;

    const filtered = orders.filter(o => {
        let statusMatch = currentFilter === 'all' || o.estado === currentFilter;
        if (currentFilter === 'Cancelado') {
            statusMatch = o.estado === 'Cancelado' || o.estado === 'Rechazado';
        }

        const searchMatch = o.llave.toLowerCase().includes(term) ||
            o.nro.toString().includes(term) ||
            o.estado.toLowerCase().includes(term);

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

        return statusMatch && searchMatch && dateMatch;
    });
    currentFilteredOrders = filtered;
    renderOrders(filtered);
    updateStats(filtered);
}

searchInput.addEventListener('input', applyFilters);
document.getElementById('date-filter').addEventListener('change', () => {
    dateRange = { start: null, end: null };
    document.getElementById('range-display-text').textContent = '';
    applyFilters();
});

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

    const { value: formValues, isConfirmed } = await Swal.fire({
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
        confirmButtonText: '<i class="fa-solid fa-ban"></i> Cancelar Pedido',
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
                if (order.envio) {
                    return { motivo, driver: order.envio };
                }
                const driverInput = document.getElementById('swal-driver');
                driverInput?.blur();
                const driver = (driverInput?.value || '').trim();
                if (!driver) {
                    Swal.showValidationMessage('Debes consignar el nombre del Driver');
                    return false;
                }
                return { motivo, driver };
            }

            return { motivo, driver: '' };
        }
    });

    if (isConfirmed && formValues) {
        const { motivo, driver } = formValues;
        Swal.fire({ title: 'Cancelando...', didOpen: () => Swal.showLoading() });
        try {
            const res = await fetchAPI('rechazarPedido', {
                nro,
                usuario: currentUser.usuario,
                motivo: motivo,
                envio: driver
            });
            if (res.success) {
                Swal.fire('Cancelado', `Pedido cancelado: <strong>${motivo}</strong>`, 'success');
                loadOrders();
            } else {
                Swal.fire('Error', res.message, 'error');
            }
        } catch (e) {
            Swal.fire('Error', 'Error de conexión', 'error');
        }
    }
}

// --- Bulk Import Logic ---

let allParsedOrders = [];

document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('modal-import').classList.add('active');

    document.getElementById('import-file').value = '';
    document.getElementById('import-preview-container').classList.add('hidden');
    document.getElementById('import-drop-zone').querySelector('.upload-placeholder').classList.remove('hidden');
    document.getElementById('btn-confirm-import').disabled = true;
    allParsedOrders = [];
});

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
            selectedOrders.push(cb.orderData);
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

importTextDropZone.addEventListener('paste', (e) => {
    e.preventDefault();
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');

    if (pastedText) {
        processPastedText(pastedText);
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

    const keyRegex = /^[A-Z0-9]{9}$/;
    const dateRegex = /(\d{1,2})\s+([a-zA-Z]{3})\.?\s+(\d{4})/;
    const timeRegex = /(\d{1,2}):(\d{2})\s+([ap]\.?\s*m\.?)/i;

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

            i++;

            while (i < lines.length && !dateRegex.test(lines[i])) { i++; }
            if (i < lines.length && dateRegex.test(lines[i])) {
                const dMatch = lines[i].match(dateRegex);
                const dtIso = parseSpanishDate(dMatch[0]);
                if (dtIso) {
                    const [y, m, d] = dtIso.split('-');
                    fechaStr = `${d}/${m}/${y}`;
                }
                i++;
            }

            if (i < lines.length && timeRegex.test(lines[i])) {
                const tMatch = lines[i].match(timeRegex);
                let hour = parseInt(tMatch[1]);
                const min = tMatch[2];
                const ampm = tMatch[3].toLowerCase();
                if (ampm.includes('p') && hour < 12) hour += 12;
                if (ampm.includes('a') && hour === 12) hour = 0;
                horaStr = `${String(hour).padStart(2, '0')}:${min}`;
                i++;
            }

            if (i < lines.length) {
                status = lines[i];
                i++;
            }

            if (i < lines.length) {
                if (lines[i].startsWith('S/')) {
                    const amountClean = lines[i].replace(/[^\d.,]/g, '').replace(',', '.');
                    monto = parseFloat(amountClean).toFixed(2);
                    envio = '';
                    i++;
                } else {
                    envio = lines[i];
                    i++;
                    if (i < lines.length && lines[i].startsWith('S/')) {
                        const amountClean = lines[i].replace(/[^\d.,]/g, '').replace(',', '.');
                        monto = parseFloat(amountClean).toFixed(2);
                        i++;
                    }
                }
            }

            let finalDate = fechaStr;
            if (fechaStr && horaStr) finalDate = `${fechaStr} ${horaStr}`;

            let pago = '';
            if (i < lines.length && !keyRegex.test(lines[i])) {
                pago = lines[i];
                i++;
            }

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
        const statusHTML = isDupe ? '<span class="badge Rechazado">Duplicado en Sistema</span>' : `<span class="badge" style="background: rgba(255,255,255,0.1)">${order.originalStatus}</span>`;

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
