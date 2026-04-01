const GAS_URL = 'https://script.google.com/macros/s/AKfycbzRM_e3jV8RhHM7paQlanQPOtI9mmiTcLBOrQy25MfdY1Xna1eiOgeb9DcWaoAt7HRm/exec';

let currentNro = null;
let currentDriver = "";
let lastDashboardData = [];

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);

    // Cargar dashboard inicial
    loadFullDashboard();

    // Intervalo de actualización (60s) para estabilidad
    setInterval(() => {
        loadFullDashboard();
        if (currentNro) loadOrderData(currentNro);
    }, 60000);

    const urlParams = new URLSearchParams(window.location.search);
    const nro = urlParams.get('nro');
    if (nro) {
        currentNro = nro;
        loadOrderData(nro);
    }
});

function updateClock() {
    const now = new Date();
    const clock = document.getElementById('digital-clock');
    if (clock) {
        clock.textContent = now.toLocaleTimeString('es-PE', { hour12: false });
    }
}

// Función global para el buscador
window.buscarPedido = function (nroInput) {
    const input = document.getElementById('manual-search');
    const nro = nroInput || input.value.trim();
    if (nro) {
        currentNro = nro;
        const header = document.getElementById('current-order-id');
        if (header) header.textContent = '#' + nro;
        // Marcar visualmente en la grid
        const cards = document.querySelectorAll('.order-card');
        cards.forEach(c => c.classList.remove('active'));
        const activeCard = document.querySelector(`.order-card[data-nro="${nro}"]`);
        if (activeCard) activeCard.classList.add('active');

        loadOrderData(nro);
    }
};

async function loadFullDashboard() {
    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'obtenerDashboardTrazabilidad' })
        });
        const result = await response.json();
        if (result.success) {
            renderFullDashboard(result.orders);
            updateDriversGrid(result.drivers, result.noProgramados);
            updateFifoQueue(result.drivers);
        }
    } catch (e) {
        console.error("Error dashboard:", e);
    }
}

function renderFullDashboard(orders) {
    const grid = document.getElementById('active-orders-grid');
    const countEl = document.getElementById('orders-count');
    if (!grid) return;

    if (!orders || orders.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:50px; color:#94a3b8;">No hay pedidos activos hoy.</div>';
        if (countEl) countEl.textContent = '0';
        return;
    }

    if (countEl) countEl.textContent = orders.length;

    grid.innerHTML = orders.map(ord => {
        const bdColor = getIconColor(ord.ultimoHito);
        return `
        <div class="order-card ${currentNro == ord.nro ? 'active' : ''}" data-nro="${ord.nro}" onclick="currentDriver='${ord.driver || ''}'; buscarPedido('${ord.nro}')">
            <div class="order-nro">${ord.llave || ord.nro}</div>
            <div class="order-status" style="background: ${bdColor}22; color: ${bdColor}; padding: 4px 10px; border-radius: 12px; font-weight: 900; letter-spacing: 0.5px; font-size: 0.70rem; display: inline-block; margin: 4px 0; border: 1px dashed ${bdColor}55;">${ord.ultimoHito}</div>
            <div class="order-meta">
                <span><i class="fa-solid fa-clock"></i> ${ord.minutos} min</span>
                <span>S/ ${ord.monto}</span>
            </div>
            <div style="font-size:0.7rem; margin-top:5px; color:#94a3b8;"><i class="fa-solid fa-user"></i> ${ord.driver || '---'}</div>
        </div>
        `;
    }).join('');
}

function getStatusClass(hito) {
    if (hito.includes('CREACIÓN')) return 'pendiente';
    if (hito.includes('ASIGNADO') || hito.includes('EN CAMINO')) return 'ruta';
    if (hito.includes('VALIDADO') || hito.includes('ENTREGADO')) return 'validado';
    return 'pendiente';
}

async function loadOrderData(nro) {
    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'obtenerTrazabilidad', nro: nro })
        });
        const result = await response.json();
        if (result.success) {
            const realNro = result.nro || nro;
            renderTimeline(result.data, realNro);
            const header = document.getElementById('current-order-id');
            if (header) header.textContent = '#' + realNro;
            currentNro = realNro;
            // --- ACTUALIZAR CONDUCTOR ---
            if (result.data && result.data.length > 0) {
                const ult = result.data.find(r => r.driver && r.driver !== "");
                if (ult) currentDriver = ult.driver;
            }
            // --- MOSTRAR LA LLAVE EN EL HEADER ---
            if (header) header.textContent = result.llave || '#' + nro;
        }
    } catch (e) {
        console.error("Error timeline:", e);
    }
}

function renderTimeline(eventos, nro) {
    const timeline = document.getElementById('order-timeline');
    if (!timeline) return;

    if (!eventos || eventos.length === 0) {
        timeline.innerHTML = `
            <div class="timeline-item" style="border: 2px dashed rgba(96, 165, 250, 0.3); border-radius: 16px; padding: 20px; text-align: center;">
                <div style="font-size: 0.9rem; margin-bottom: 10px; color: #94a3b8;">
                    Pedido #${nro} requiere activación.
                </div>
                <button onclick="iniciarTrazabilidadManual('${nro}')" style="background:#60a5fa; color:black; font-weight:700; border:none; padding:8px 15px; border-radius:20px; cursor:pointer; font-size:0.75rem;">
                    ACTIVAR AHORA
                </button>
            </div>`;
        return;
    }

    const sorted = [...eventos].sort((a, b) => {
        const timeA = new Date(`1970/01/01 ${a.hora}`).getTime();
        const timeB = new Date(`1970/01/01 ${b.hora}`).getTime();
        return timeB - timeA;
    });

    timeline.innerHTML = sorted.map(ev => {
        const dotColor = getIconColor(ev.hito);
        return `
        <div class="timeline-item">
            <div class="timeline-dot" style="background: ${dotColor}; box-shadow: 0 0 10px ${dotColor};"></div>
            <div class="timeline-content">
                <span class="min-badge" style="background: rgba(0, 0, 0, 0.2); color: ${dotColor}; border: 1px solid ${dotColor}80; font-weight: 800;">${ev.minutos} min</span>
                <div class="time-label" style="color: ${dotColor}; font-weight: 800;">${ev.hora}</div>
                <div class="event-name" style="font-weight: bold; color: #f8fafc; font-size: 1.05em; margin-bottom: 2px;">${ev.hito}</div>
                <div class="event-detail" style="color: rgba(255, 255, 255, 0.6);">${(ev.driver && ev.driver !== 'undefined') ? ev.driver : (ev.usuario && ev.usuario !== 'undefined' ? ev.usuario : '')}</div>
            </div>
        </div>
        `;
    }).join('');
}

function getIconColor(hito) {
    const text = String(hito || '').toUpperCase();
    if (text.includes('CREACIÓN') || text.includes('CREACION')) return '#60a5fa'; // Azul
    if (text.includes('ASIGNAC') || text.includes('ASIGNADO')) return '#f59e0b'; // Naranja
    if (text.includes('EVIDENCIA')) return '#10b981'; // Verde Esmeralda
    if (text.includes('VALIDADO')) return '#8b5cf6'; // Morado
    if (text.includes('LLEGADA')) return '#0ea5e9'; // Celeste brillante
    if (text.includes('CIERRE')) return '#f43f5e'; // Fucsia/Rosa
    if (text.includes('ENTREGA')) return '#22c55e'; // Verde claro
    if (text.includes('CANCELADO') || text.includes('RECHAZADO')) return '#ef4444'; // Rojo alarma
    return '#94a3b8'; // Gris por defecto
}

/**
 * Renderiza la cola de disponibilidad por orden de llegada (FIFO).
 */
function updateFifoQueue(drivers) {
    const container = document.getElementById('fifo-queue-container');
    const list = document.getElementById('fifo-queue-list');
    if (!container || !list) return;

    // Filtrar solo conductores DISPONIBLES
    const available = [];
    for (const name in drivers) {
        if (drivers[name].status === 'DISPONIBLE') {
            available.push({ name: name, time: drivers[name].time || '00:00:00' });
        }
    }

    // Ordenar por hora de llegada (quien llegó primero sale primero)
    available.sort((a, b) => a.time.localeCompare(b.time));

    if (available.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    list.innerHTML = available.map((d, index) => `
        <div class="fifo-badge">
            <div class="fifo-num">${index + 1}</div>
            <div class="fifo-name">${d.name}</div>
            <div class="fifo-time">${d.time}</div>
        </div>
    `).join('');
}

/**
 * Actualiza el panel lateral de conductores dividiéndolo en 3 secciones.
 */
function updateDriversGrid(drivers, noProgramados = []) {
    const grid = document.getElementById('drivers-list');
    if (!grid) return;

    grid.innerHTML = '';

    // Contenedores de secciones
    const sectionDisponibles = document.createElement('div');
    sectionDisponibles.className = 'section-drivers';
    sectionDisponibles.innerHTML = '<div class="section-title text-green-400" style="color:#10b981;">🟢 Disponibles (Cola)</div>';

    const sectionEnRuta = document.createElement('div');
    sectionEnRuta.className = 'section-drivers';
    sectionEnRuta.innerHTML = '<div class="section-title text-yellow-400" style="color:#f59e0b;">🛵 En Ruta</div>';

    const sectionNoProgramados = document.createElement('div');
    sectionNoProgramados.className = 'section-drivers';
    sectionNoProgramados.innerHTML = '<div class="section-title text-gray-400">❌ No Programados</div>';

    let countDisponibles = 0;
    let countEnRuta = 0;

    // Procesar activos (Disponibles y En Ruta)
    if (drivers && Object.keys(drivers).length > 0) {
        const driversList = [];
        for (const name in drivers) {
            driversList.push({ name: name, status: drivers[name].status, time: drivers[name].time });
        }

        const listDisponibles = driversList.filter(d => d.status === 'DISPONIBLE').sort((a, b) => String(a.time).localeCompare(String(b.time)));
        const listEnRuta = driversList.filter(d => d.status === 'EN RUTA').sort((a, b) => String(b.time).localeCompare(String(a.time)));

        listDisponibles.forEach(d => {
            countDisponibles++;
            sectionDisponibles.appendChild(createDriverElement(d.name, d.time, 'DISPONIBLE'));
        });

        listEnRuta.forEach(d => {
            countEnRuta++;
            sectionEnRuta.appendChild(createDriverElement(d.name, d.time, 'EN RUTA'));
        });
    }

    // Procesar inactivos (No programados)
    noProgramados.sort((a, b) => a.localeCompare(b));
    noProgramados.forEach(dName => {
        sectionNoProgramados.appendChild(createDriverElement(dName, null, 'NO_PROGRAMADO'));
    });

    if (countDisponibles === 0) sectionDisponibles.innerHTML += '<div style="color:#64748b;font-size:0.75rem;">Cola vacía</div>';
    if (countEnRuta === 0) sectionEnRuta.innerHTML += '<div style="color:#64748b;font-size:0.75rem;">Sin rutas actuales</div>';
    if (noProgramados.length === 0) sectionNoProgramados.innerHTML += '<div style="color:#64748b;font-size:0.75rem;">Todos están activos</div>';

    grid.appendChild(sectionDisponibles);
    grid.appendChild(sectionEnRuta);
    grid.appendChild(sectionNoProgramados);
}

function createDriverElement(name, time, type) {
    const div = document.createElement('div');
    div.className = 'driver-card';

    let html = `
        <div class="driver-info">
            <span style="font-weight:600; font-size:0.85rem; color:white;">${name}</span>
            <span class="status-pill ${type === 'DISPONIBLE' ? 'status-available' : (type === 'EN RUTA' ? 'status-route' : '')}" style="${type === 'NO_PROGRAMADO' ? 'background:#334155;color:#94a3b8;' : ''}">
                ${type === 'DISPONIBLE' ? '✅ DISPONIBLE' : (type === 'EN RUTA' ? '🛵 EN RUTA' : '❌ INACTIVO')}
            </span>
            ${time ? `<div style="font-size:0.65rem; color:#94a3b8; margin-top:2px;"><i class="far fa-clock"></i> ${time}</div>` : ''}
        </div>
        <div class="driver-actions">
    `;

    if (type === 'NO_PROGRAMADO') {
        html += `<button class="btn-bala btn-activar" onclick="accionMotorizadoBala('${name}', 'activarConductor')"><i class="fa-solid fa-play"></i> Activar</button>`;
    } else if (type === 'DISPONIBLE') {
        html += `<button class="btn-bala btn-pausar" onclick="accionMotorizadoBala('${name}', 'desactivarConductor')"><i class="fa-solid fa-power-off"></i> Pausar</button>`;
    } else if (type === 'EN RUTA') {
        html += `<button class="btn-bala btn-llego" onclick="accionMotorizadoBala('${name}', 'llegadaConductor')"><i class="fa-solid fa-flag-checkered"></i> Llegó</button>`;
    }

    html += `</div>`;
    div.innerHTML = html;
    return div;
}

window.accionMotorizadoBala = async function (driver, action) {
    const loader = document.getElementById('drivers-loader');
    if (loader) loader.style.display = 'inline-block';

    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: action, driver: driver })
        });
        const result = await response.json();
        if (result.success) {
            // Recargar Dashboard Inmediatamente
            loadFullDashboard();
        } else {
            alert("Error: " + (result.message || result.error || "Desconocido"));
        }
    } catch (e) {
        alert("Error de conexión: " + e.toString());
    } finally {
        if (loader) loader.style.display = 'none';
    }
}

window.iniciarTrazabilidadManual = async function (nro) {
    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'iniciarTrazabilidadManual', nro: nro })
        });
        const result = await response.json();
        if (result.success) loadOrderData(nro);
    } catch (e) { console.error("Error iniciar:", e); }
};

window.registrarLlegadaManual = async function () {
    if (!currentNro) return alert("Selecciona un pedido primero.");
    const driver = currentDriver || '';
    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'registrarLlegadaManual', nro: currentNro, driver: driver, usuario: 'Admin' })
        });
        const result = await response.json();
        if (result.success) {
            currentNro = null;
            loadFullDashboard();
            const timeline = document.getElementById('order-timeline');
            if (timeline) timeline.innerHTML = '<div style="text-align:center; padding:50px; color:#94a3b8;">Pedido Despachado con éxito.</div>';
        }
    } catch (e) { alert("Error: " + e.toString()); }
};
