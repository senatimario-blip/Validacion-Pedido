const GAS_URL = 'https://script.google.com/macros/s/AKfycbwHcoS-lpxyMDE4SC6PKlGMLyc8bv279gDZOZ2SDqw5NoHn_RTQHUWHNdI4puLQfM0F/exec';

let currentNro = null;
let currentDriver = "";
let lastDashboardData = [];

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);

    // Cargar dashboard inicial
    loadFullDashboard();
    
    // Intervalo de actualización (10s)
    setInterval(() => {
        loadFullDashboard();
        if (currentNro) loadOrderData(currentNro);
    }, 10000);

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
window.buscarPedido = function(nroInput) {
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
            updateDriversGrid(result.drivers);
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

    grid.innerHTML = orders.map(ord => `
        <div class="order-card ${currentNro == ord.nro ? 'active' : ''}" data-nro="${ord.nro}" onclick="currentDriver='${ord.driver || ''}'; buscarPedido('${ord.nro}')">
            <div class="order-nro">${ord.llave || ord.nro}</div>
            <div class="order-status status-${getStatusClass(ord.ultimoHito)}">${ord.ultimoHito}</div>
            <div class="order-meta">
                <span><i class="fa-solid fa-clock"></i> ${ord.minutos} min</span>
                <span>S/ ${ord.monto}</span>
            </div>
            <div style="font-size:0.7rem; margin-top:5px; color:#94a3b8;"><i class="fa-solid fa-user"></i> ${ord.driver || '---'}</div>
        </div>
    `).join('');
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

    timeline.innerHTML = sorted.map(ev => `
        <div class="timeline-item">
            <div class="timeline-dot" style="background: ${getIconColor(ev.hito)}; box-shadow: 0 0 10px ${getIconColor(ev.hito)};"></div>
            <div class="timeline-content">
                <span class="min-badge">${ev.minutos} min</span>
                <div class="time-label">${ev.hora}</div>
                <div class="event-name">${ev.hito}</div>
                <div class="event-detail">${(ev.driver && ev.driver !== 'undefined') ? ev.driver : (ev.usuario && ev.usuario !== 'undefined' ? ev.usuario : '')}</div>
            </div>
        </div>
    `).join('');
}

function getIconColor(hito) {
    if (hito.includes('CREACIÓN')) return '#60a5fa';
    if (hito.includes('ASIGNADO')) return '#f59e0b';
    if (hito.includes('EVIDENCIA')) return '#10b981';
    if (hito.includes('VALIDADO')) return '#8b5cf6';
    return '#64748b';
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
 * Actualiza el panel lateral de conductores.
 */
function updateDriversGrid(drivers) {
    const grid = document.getElementById('drivers-list');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (!drivers || Object.keys(drivers).length === 0) {
        grid.innerHTML = '<div style="color:#94a3b8; font-size:0.85rem; text-align:center; padding:20px;">Sin conductores activos hoy</div>';
        return;
    }

    // Convertir objeto en array para manejarlo mejor
    const driversList = [];
    for (const name in drivers) {
        driversList.push({
            name: name,
            status: drivers[name].status,
            time: drivers[name].time
        });
    }

    // Ordenar: DISPONIBLES de más antiguo → más reciente (quien espera más arriba)
    //          EN RUTA de más reciente → más antiguo (quien salió último arriba)
    driversList.sort((a, b) => {
        const aDisp = a.status === 'DISPONIBLE';
        const bDisp = b.status === 'DISPONIBLE';
        if (aDisp && !bDisp) return -1; // disponibles siempre antes
        if (!aDisp && bDisp) return 1;
        if (aDisp && bDisp) {
            // Ambos disponibles: más antiguo (hora menor) arriba → ascendente
            return String(a.time).localeCompare(String(b.time));
        }
        // Ambos EN RUTA: más reciente (hora mayor) arriba → descendente
        return String(b.time).localeCompare(String(a.time));
    });

    driversList.forEach(d => {
        const div = document.createElement('div');
        div.className = 'driver-card';
        const isDisponible = d.status === 'DISPONIBLE';
        div.innerHTML = `
            <div>
                <div style="font-weight:600; font-size:0.9rem; color:white;">${d.name}</div>
                <div style="font-size:0.7rem; color:#94a3b8; margin-top:3px;"><i class="far fa-clock"></i> ${d.time || '--:--'}</div>
            </div>
            <span class="status-pill ${isDisponible ? 'status-available' : 'status-route'}">
                ${isDisponible ? '✅ DISPONIBLE' : '🛵 EN RUTA'}
            </span>
        `;
        grid.appendChild(div);
    });
}

window.iniciarTrazabilidadManual = async function(nro) {
    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'iniciarTrazabilidadManual', nro: nro })
        });
        const result = await response.json();
        if (result.success) loadOrderData(nro);
    } catch (e) { console.error("Error iniciar:", e); }
};

window.registrarLlegadaManual = async function() {
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
