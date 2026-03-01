// ============================================================
// mapa.js — Monitor de Motorizados y sus rutas
// ============================================================

// Local storage key para guardar el orden personalizado de los pedidos por motorizado
const SORT_STATE_KEY = 'motorizado_order_sort_state';
let driverSortState = JSON.parse(localStorage.getItem(SORT_STATE_KEY) || '{}');

function saveDriverSortState() {
    localStorage.setItem(SORT_STATE_KEY, JSON.stringify(driverSortState));
}

document.addEventListener('DOMContentLoaded', () => {
    const btnRefreshMapa = document.getElementById('btn-refresh-mapa');
    if (btnRefreshMapa) {
        btnRefreshMapa.addEventListener('click', async () => {
            btnRefreshMapa.querySelector('i').classList.add('fa-spin');

            // Re-use logic from app.js loadOrders
            try {
                if (typeof loadOrders === 'function') {
                    await loadOrders(); // This fetches everything and saves to `orders` global
                }
            } catch (e) { console.error(e); }

            btnRefreshMapa.querySelector('i').classList.remove('fa-spin');

            // The nav element click will trigger render, or we can force it here
            renderMapaMotorizados();
        });
    }
});

function renderMapaMotorizados() {
    const container = document.getElementById('mapa-grid');
    const countEl = document.getElementById('mapa-active-count');
    if (!container) return;

    // 1. Obtener todos los motorizados únciso de toda la historia disponible para dibujarlos siempre
    const motorizadosMap = {};
    if (typeof orders !== 'undefined') {
        const uniqueDrivers = new Set();
        orders.forEach(o => {
            if (o.envio && o.envio.trim() !== '') {
                uniqueDrivers.add(o.envio.trim().toUpperCase());
            }
        });

        uniqueDrivers.forEach(dName => {
            // Find the original casing for the name
            const originalName = orders.find(o => o.envio && o.envio.trim().toUpperCase() === dName).envio.trim();
            motorizadosMap[dName] = {
                name: originalName,
                orders: [],
                totalMoney: 0
            };
        });
    }

    // 2. Filter only active orders (Pendiente, En Camino, Reservado, empty)
    const activeOrders = (typeof orders !== 'undefined' ? orders : []).filter(o =>
        o.estado !== 'Validado' &&
        o.estado !== 'Cancelado' &&
        o.estado !== 'Rechazado' &&
        o.estado !== 'Por Validar'
    );

    // 2.5 Crear categoría para No Asignados
    motorizadosMap['___SIN_ASIGNAR___'] = {
        name: '⚠️ SIN ASIGNAR',
        orders: [],
        totalMoney: 0,
        isUnassigned: true
    };

    // 3. Asignar los pedidos activos a sus respectivos motorizados
    activeOrders.forEach(o => {
        let dName = (o.envio && o.envio.trim() !== '') ? o.envio.trim().toUpperCase() : '___SIN_ASIGNAR___';
        if (motorizadosMap[dName]) {
            motorizadosMap[dName].orders.push(o);
            motorizadosMap[dName].totalMoney += (parseFloat(o.monto) || 0);
        }
    });

    // Remove empty SIN ASIGNAR if no pending orders are unassigned
    if (motorizadosMap['___SIN_ASIGNAR___'].orders.length === 0) {
        delete motorizadosMap['___SIN_ASIGNAR___'];
    }

    // 4. Separar activos (con pedidos) de inactivos (sin pedidos) y ordenarlos alfabéticamente dentro de su grupo
    const allKeys = Object.keys(motorizadosMap);
    const motorizadosKeys = allKeys.sort((a, b) => {
        if (a === '___SIN_ASIGNAR___') return -1;
        if (b === '___SIN_ASIGNAR___') return 1;

        // Primero por cantidad de pedidos (descendente)
        const diff = motorizadosMap[b].orders.length - motorizadosMap[a].orders.length;
        if (diff !== 0) return diff;
        // Si tienen igual cantidad, orden alfabético
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
    });

    // Update the counter
    let activeDriversKeys = motorizadosKeys.filter(k => k !== '___SIN_ASIGNAR___');
    const totalActivos = activeDriversKeys.filter(k => motorizadosMap[k].orders.length > 0).length;

    // Update the counter
    if (countEl) {
        countEl.innerHTML = `<i class="fa-solid fa-motorcycle"></i> ${totalActivos} Activos / ${activeDriversKeys.length} Total`;
    }

    if (motorizadosKeys.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 40px; color: rgba(255,255,255,0.4);">
                <i class="fa-solid fa-users-slash text-4xl mb-4" style="font-size:3em; margin-bottom:15px;"></i>
                <h3 style="font-size:1.2em; font-weight:600;">Sin Motorizados Registrados</h3>
                <p>No hay registro histórico de ningún motorizado en el sistema aún.</p>
            </div>
        `;
        return;
    }

    let htmlBody = '';

    motorizadosKeys.forEach(mKey => {
        const data = motorizadosMap[mKey];

        // 1. Sort initially by newest (nro)
        data.orders.sort((a, b) => b.nro - a.nro);

        // 2. Sort by priority: Local manual reorder > Backend orden_ruta > default
        const savedOrderKeys = driverSortState[mKey] || [];

        data.orders.sort((a, b) => {
            // PRIORITY 1: If user has manually reordered this driver during this session, use that order
            if (savedOrderKeys.length > 0) {
                const indexA = savedOrderKeys.indexOf(a.nro.toString());
                const indexB = savedOrderKeys.indexOf(b.nro.toString());
                if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
            }

            // PRIORITY 2: Backend orden_ruta (from Google Sheet column S)
            const orderA = a.orden_ruta !== undefined && a.orden_ruta !== '' ? Number(a.orden_ruta) : -1;
            const orderB = b.orden_ruta !== undefined && b.orden_ruta !== '' ? Number(b.orden_ruta) : -1;

            if (orderA !== -1 && orderB !== -1) return orderA - orderB;
            if (orderA !== -1) return -1;
            if (orderB !== -1) return 1;

            return 0; // Natural fallback
        });

        let ordersHtml = data.orders.map((o, index) => {
            const timeInfo = calculateElapsedTimeForMap(o.fecha);

            // Payment type logic based on recent change (order.pago default)
            let tipoPagoDisplay = (o.pago || 'POS/DESC...').toUpperCase();
            let pColor = 'rgba(255,255,255,0.7)';

            if (tipoPagoDisplay.includes('EFECTIVO')) pColor = '#4ADE80';
            else if (tipoPagoDisplay.includes('QR') || tipoPagoDisplay.includes('YAPE') || tipoPagoDisplay.includes('PLIN')) pColor = '#22D3EE';
            else if (tipoPagoDisplay.includes('TARJETA') || tipoPagoDisplay.includes('POS')) pColor = '#A78BFA';
            else if (tipoPagoDisplay.includes('ONLINE')) pColor = '#60A5FA';

            let assignmentHtml = '';
            if (data.isUnassigned) {
                const driverOptions = activeDriversKeys.map(k => `<option value="${motorizadosMap[k].name}">${motorizadosMap[k].name}</option>`).join('');
                assignmentHtml = `
                <div style="margin-top: 8px; display:flex; gap:6px;">
                    <select id="sel-assign-${o.nro}" onchange="asignarMotorizadoDesdeMapa(${o.nro})" style="flex:1; background:rgba(0,0,0,0.5); color:white; border:1px solid rgba(255,255,255,0.2); border-radius:4px; padding:4px; font-size:0.85em;">
                        <option value="">-- Seleccionar --</option>
                        ${driverOptions}
                    </select>
                </div>`;
            }

            const isFirst = index === 0;
            const isLast = index === data.orders.length - 1;

            return `
                <div class="motorizado-order-card" data-driver="${mKey}" data-nro="${o.nro}" draggable="true" style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; font-size: 0.85em; display: flex; gap: 10px; align-items: center; transition: all 0.2s ease;">
                    
                    <!-- Sorting Controls -->
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; padding-right: 8px; border-right: 1px solid rgba(255,255,255,0.1);">
                        <button onclick="moveMotorizadoOrder('${mKey}', '${o.nro}', -1)" style="background: none; border: none; color: ${isFirst ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)'}; cursor: ${isFirst ? 'default' : 'pointer'}; padding: 2px;" ${isFirst ? 'disabled' : ''}>
                            <i class="fa-solid fa-chevron-up"></i>
                        </button>
                        <div class="drag-handle" style="color: rgba(255,255,255,0.5); cursor: grab; padding: 4px;">
                            <i class="fa-solid fa-grip-lines"></i>
                        </div>
                        <button onclick="moveMotorizadoOrder('${mKey}', '${o.nro}', 1)" style="background: none; border: none; color: ${isLast ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.7)'}; cursor: ${isLast ? 'default' : 'pointer'}; padding: 2px;" ${isLast ? 'disabled' : ''}>
                            <i class="fa-solid fa-chevron-down"></i>
                        </button>
                    </div>

                    <!-- Order Content -->
                    <div style="flex: 1;">
                        <div id="controls-top-${o.nro}" style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <strong style="color: #fff; font-size: 1.1em;">${o.llave || '#' + o.nro}</strong>
                            <div style="display:flex; gap:6px;">
                                <button onclick="marcarPorValidarManual(${o.nro})" title="Forzar 'Por Validar' (Excepción)" style="background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.4); color: #60a5fa; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 0.9em;">
                                    <i class="fa-solid fa-motorcycle"></i>
                                </button>
                                <strong style="color: #4ADE80; font-size: 1.1em;">S/ ${parseFloat(o.monto || 0).toFixed(2)}</strong>
                            </div>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="color: ${pColor}; font-weight: 600; font-size:0.9em;"><i class="fa-solid fa-wallet"></i> ${tipoPagoDisplay}</span>
                            <span style="color: ${timeInfo.color}; background: ${timeInfo.bg}; padding: 2px 6px; border-radius: 4px; font-weight: bold;">
                                <i class="fa-solid fa-clock"></i> ${timeInfo.text}
                            </span>
                        </div>
                        ${assignmentHtml}
                    </div>
                </div>
            `;
        }).join('');

        if (data.orders.length === 0) {
            ordersHtml = `
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 20px 0; color: rgba(255,255,255,0.3); text-align:center;">
                    <i class="fa-solid fa-bed text-2xl mb-2" style="font-size: 2em; margin-bottom: 8px;"></i>
                    <span style="font-size: 0.9em;">En espera / Sin ruta</span>
                </div>
            `;
        }

        const bgPanelColor = data.orders.length > 0 ? (data.isUnassigned ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255,255,255,0.03)') : 'rgba(0,0,0,0.2)';
        const borderColor = data.orders.length > 0 ? (data.isUnassigned ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.1)') : 'rgba(255,255,255,0.02)';
        const avatarBgColor = data.orders.length > 0 ? (data.isUnassigned ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)') : 'rgba(255,255,255,0.05)';
        const avatarBorderColor = data.orders.length > 0 ? (data.isUnassigned ? 'rgba(239, 68, 68, 0.5)' : 'rgba(59, 130, 246, 0.5)') : 'rgba(255,255,255,0.1)';
        const avatarIconColor = data.orders.length > 0 ? (data.isUnassigned ? '#ef4444' : '#60A5FA') : 'rgba(255,255,255,0.3)';
        const titleColor = data.orders.length > 0 ? (data.isUnassigned ? '#ef4444' : '#fff') : 'rgba(255,255,255,0.4)';
        const amountColor = data.orders.length > 0 ? '#4ADE80' : 'rgba(255,255,255,0.2)';
        const iconClass = data.isUnassigned ? 'fa-triangle-exclamation' : 'fa-helmet-safety';

        htmlBody += `
            <div style="background: ${bgPanelColor}; border: 1px solid ${borderColor}; border-radius: 12px; padding: 16px; display:flex; flex-direction:column;">
                
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed ${borderColor};">
                    <div style="display:flex; align-items:center; gap: 10px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: ${avatarBgColor}; border: 1px solid ${avatarBorderColor}; display:flex; align-items:center; justify-content:center; color: ${avatarIconColor};">
                            <i class="fa-solid ${iconClass} text-xl" style="font-size:1.2em;"></i>
                        </div>
                        <div>
                            <h3 style="margin: 0; font-size: 1.1em; font-weight: 700; color: ${titleColor};">${data.name}</h3>
                            <span style="font-size: 0.8em; color: rgba(255,255,255,0.5);">${data.orders.length} ${data.isUnassigned ? 'pedidos sin repartidor' : 'pedidos en ruta'}</span>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size: 0.75em; color: rgba(255,255,255,0.5); text-transform: uppercase;">A Cobrar</div>
                        <div style="font-size: 1.1em; font-weight: 700; color: ${amountColor};">S/ ${data.totalMoney.toFixed(2)}</div>
                    </div>
                </div>

                <div style="flex: 1; overflow-y: auto; max-height: 400px; padding-right: 4px;" class="no-scrollbar driver-order-list" data-driver="${mKey}">
                    ${ordersHtml}
                </div>
            </div>
        `;
    });

    container.innerHTML = htmlBody;

    // Initialize Drag and Drop Event Listeners
    initDragAndDrop();
}

// Handler for manual up/down arrows
window.moveMotorizadoOrder = function (driverKey, orderNro, direction) {
    if (!driverSortState[driverKey]) {
        // Initialize state based on current DOM order if not set
        const listContainer = document.querySelector(`.driver-order-list[data-driver="${driverKey}"]`);
        if (!listContainer) return;
        const items = Array.from(listContainer.querySelectorAll('.motorizado-order-card'));
        driverSortState[driverKey] = items.map(el => el.getAttribute('data-nro'));
    }

    const stateArr = driverSortState[driverKey];
    const currentIndex = stateArr.indexOf(orderNro.toString());

    if (currentIndex === -1) return;
    const newIndex = currentIndex + direction;

    if (newIndex >= 0 && newIndex < stateArr.length) {
        // Swap
        const temp = stateArr[currentIndex];
        stateArr[currentIndex] = stateArr[newIndex];
        stateArr[newIndex] = temp;

        // saveDriverSortState(); // Removed local storage save
        renderMapaMotorizados(); // Re-render to show changes

        // Sync to Backend
        syncRutaBackend(driverKey, stateArr);
    }
};

function initDragAndDrop() {
    const draggables = document.querySelectorAll('.motorizado-order-card');
    const containers = document.querySelectorAll('.driver-order-list');

    draggables.forEach(draggable => {
        draggable.addEventListener('dragstart', () => {
            draggable.classList.add('dragging');
        });

        draggable.addEventListener('dragend', () => {
            draggable.classList.remove('dragging');

            // Save new order state after drop
            const driverKey = draggable.getAttribute('data-driver');
            const listContainer = document.querySelector(`.driver-order-list[data-driver="${driverKey}"]`);
            if (listContainer) {
                const items = Array.from(listContainer.querySelectorAll('.motorizado-order-card'));
                const newArr = items.map(el => el.getAttribute('data-nro'));
                driverSortState[driverKey] = newArr; // Update local state for immediate re-render
                // saveDriverSortState(); // Removed local storage save
                renderMapaMotorizados(); // Re-render to fix arrows disabled state

                // Sync to Backend
                syncRutaBackend(driverKey, newArr);
            }
        });
    });

    containers.forEach(container => {
        container.addEventListener('dragover', e => {
            e.preventDefault();
            const draggingEl = document.querySelector('.dragging');
            if (!draggingEl) return;

            // Allow dragging only within the same driver's list
            if (draggingEl.getAttribute('data-driver') !== container.getAttribute('data-driver')) {
                return;
            }

            const afterElement = getDragAfterElement(container, e.clientY);

            if (afterElement == null) {
                container.appendChild(draggingEl);
            } else {
                container.insertBefore(draggingEl, afterElement);
            }
        });
    });
}

// Function to send sort update to Backend
async function syncRutaBackend(driverKey, orderedIds) {
    if (typeof fetchAPI !== 'function') return;

    // Optional: show a mini toast to say "Syncing..."

    try {
        const response = await fetchAPI('guardarOrdenRutaMotorizado', {
            responsable: driverKey,
            orderedIds: orderedIds
        });

        if (response && response.success) {
            console.log(`Ruta guardada para: ${driverKey}`, response);
            // Optionally, we could loadOrders() here to refresh the DB truth, but since
            // it refreshes every 60s anyway, avoiding it makes the UI faster.
        } else {
            console.error('Failed to sync ruta', response);
        }
    } catch (e) {
        console.error('Error syncing ruta:', e);
    }
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.motorizado-order-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Helper time formatting tool for the map
function calculateElapsedTimeForMap(fechaStr) {
    let result = { text: '-- min', color: 'rgba(255,255,255,0.5)', bg: 'transparent' };

    if (!fechaStr) return result;

    try {
        let orderDate = null;
        const dOrig = new Date(fechaStr);
        if (!isNaN(dOrig.getTime())) {
            // Attempt to treat it as Lima zone, standard logic repeated from app.js
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Lima',
                year: 'numeric', month: 'numeric', day: 'numeric',
                hour: 'numeric', minute: 'numeric', second: 'numeric',
                hour12: false
            });
            const parts = formatter.formatToParts(dOrig);
            const getP = (type) => parseInt(parts.find(p => p.type === type).value, 10);

            let rH = getP('hour'); if (rH === 24) rH = 0;
            orderDate = new Date(Date.UTC(getP('year'), getP('month') - 1, getP('day'), rH, getP('minute'), 0));
        }

        if (orderDate && !isNaN(orderDate.getTime())) {
            const now = new Date();
            const formatterNow = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Lima',
                year: 'numeric', month: 'numeric', day: 'numeric',
                hour: 'numeric', minute: 'numeric', second: 'numeric',
                hour12: false
            });
            const pN = formatterNow.formatToParts(now);
            const getPN = (type) => parseInt(pN.find(p => p.type === type).value, 10);

            let nH = getPN('hour'); if (nH === 24) nH = 0;
            const limaNowUtc = Date.UTC(getPN('year'), getPN('month') - 1, getPN('day'), nH, getPN('minute'), 0);

            let diffMs = limaNowUtc - orderDate.getTime();
            if (diffMs < 0) diffMs = 0;

            const mins = Math.floor(diffMs / 60000);
            result.text = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;

            if (mins >= 35) {
                result.color = '#F87171'; // Red
                result.bg = 'rgba(248, 113, 113, 0.15)';
            } else if (mins >= 30) {
                result.color = '#FB923C'; // Orange
                result.bg = 'rgba(251, 146, 60, 0.15)';
            } else {
                result.color = '#4ADE80'; // Green
                result.bg = 'rgba(74, 222, 128, 0.1)';
            }
        }
    } catch (e) { }

    return result;
}

// Make sure to add the timer auto-refresher once the view is opened
setInterval(() => {
    const mapaGrid = document.getElementById('mapa-grid');
    if (mapaGrid && mapaGrid.offsetParent !== null) {
        renderMapaMotorizados(); // Tick the timers on screen dynamically
    }
}, 60000); // 1 minute

// Handler for the Assign button explicitly called from HTML
window.asignarMotorizadoDesdeMapa = async function (nro) {
    const selectEl = document.getElementById(`sel-assign-${nro}`);
    if (!selectEl) return;

    const newDriver = selectEl.value;
    if (!newDriver || newDriver.trim() === '') {
        return;
    }

    Swal.fire({
        title: 'Asignando repartidor...',
        allowEscapeKey: false,
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // Requires fetchAPI from app.js which is already loaded
        const response = await fetchAPI('asignarMotorizado', {
            nro: nro,
            envio: newDriver,
            usuario: (typeof currentUser !== 'undefined' && currentUser.usuario) ? currentUser.usuario : 'Admin'
        });

        if (response.success) {
            Swal.fire('Éxito', 'Repartidor asignado', 'success');
            // Refresh main order list, which updates the view everywhere
            if (typeof loadOrders === 'function') {
                await loadOrders();
                renderMapaMotorizados();
            }
        } else {
            Swal.fire('Error', response.message || 'Error al asignar motorizado', 'error');
        }
    } catch (error) {
        Swal.fire('Error', 'Error de red', 'error');
    }
};
