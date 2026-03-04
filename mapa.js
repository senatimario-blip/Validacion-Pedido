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
    const mapaDateFilter = document.getElementById('mapa-date-filter');
    if (mapaDateFilter) {
        mapaDateFilter.addEventListener('change', () => {
            renderMapaMotorizados();
        });
    }

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

    // Lógica para Gestión de Repartidores
    const btnManageDrivers = document.getElementById('btn-manage-drivers');
    const modalManageDrivers = document.getElementById('modal-manage-drivers');
    if (btnManageDrivers && modalManageDrivers) {
        btnManageDrivers.addEventListener('click', () => {
            modalManageDrivers.classList.add('active');
        });
    }

    const newDriverForm = document.getElementById('new-driver-form');
    if (newDriverForm) {
        newDriverForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('new-driver-name').value;
            const pass = document.getElementById('new-driver-pass').value;

            Swal.fire({
                title: 'Guardando Repartidor...',
                didOpen: () => Swal.showLoading(),
                allowOutsideClick: false
            });

            try {
                const response = await fetchAPI('crearMotorizado', { user: name, pass: pass });
                if (response.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Repartidor Creado',
                        text: response.message,
                        timer: 2000
                    });
                    newDriverForm.reset();
                    if (modalManageDrivers) modalManageDrivers.classList.remove('active');

                    // Actualizar la lista de repartidores en los dropdowns
                    if (typeof updateDriverFilterOptions === 'function') {
                        updateDriverFilterOptions();
                    }
                } else {
                    Swal.fire('Error', response.message, 'error');
                }
            } catch (err) {
                console.error(err);
                Swal.fire('Error', 'Fallo de red al conectar con la API', 'error');
            }
        });
    }
});


function renderMapaMotorizados() {
    const activeContainer = document.getElementById('mapa-grid');
    const viajesContainer = document.getElementById('viajes-grid');
    const countEl = document.getElementById('mapa-active-count');
    if (!activeContainer) return;

    // 1. Obtener todos los motorizados únicos
    const motorizadosMap = {};
    const uniqueDrivers = new Set();

    if (typeof orders !== 'undefined') {
        orders.forEach(o => {
            if (o.envio && o.envio.trim() !== '') {
                uniqueDrivers.add(o.envio.trim().toUpperCase());
            }
        });

        uniqueDrivers.forEach(dName => {
            const originalName = orders.find(o => o.envio && o.envio.trim().toUpperCase() === dName).envio.trim();
            motorizadosMap[dName] = {
                name: originalName,
                orders: [],
                totalMoney: 0
            };
        });
    }

    // 2. Filtrar por la fecha seleccionada en el Monitor
    const filterEl = document.getElementById('mapa-date-filter');
    let targetDate = filterEl ? filterEl.value : "";

    // Si no hay fecha en el filtro, usamos HOY como fallback
    if (!targetDate) {
        const now = new Date();
        targetDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    }

    // Función auxiliar para obtener la fecha YYYY-MM-DD en Lima para cualquier pedido
    const getOrderDateLima = (dateStr) => {
        try {
            return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(dateStr));
        } catch (e) { return ""; }
    };

    const allOrders = (typeof orders !== 'undefined' ? orders : []).filter(o => {
        if (!o.fecha) return false;
        return getOrderDateLima(o.fecha) === targetDate;
    });

    // Solo mostramos pedidos SI no tienen viaje
    // (Ahora SI mostramos los Validados y Cancelados para que puedan ser armados en Viajes)
    const activeOrders = allOrders.filter(o => !o.viaje_id);

    // Pedidos que ya pertenecen a un viaje (de cualquier estado hoy)
    const tripOrders = allOrders.filter(o => o.viaje_id);

    // 2.5 Crear categoría para No Asignados en el monitor activo
    motorizadosMap['___SIN_ASIGNAR___'] = {
        name: '⚠️ SIN ASIGNAR',
        orders: [],
        totalMoney: 0,
        isUnassigned: true
    };

    // 3. Asignar pedidos activos a sus repartidores
    activeOrders.forEach(o => {
        let dName = (o.envio && o.envio.trim() !== '') ? o.envio.trim().toUpperCase() : '___SIN_ASIGNAR___';
        if (motorizadosMap[dName]) {
            motorizadosMap[dName].orders.push(o);
            motorizadosMap[dName].totalMoney += (parseFloat(o.monto) || 0);
        }
    });

    if (motorizadosMap['___SIN_ASIGNAR___'].orders.length === 0) {
        delete motorizadosMap['___SIN_ASIGNAR___'];
    }

    // 4. Renderizar Monitor Activo
    renderActiveMonitor(motorizadosMap, activeContainer, countEl);

    // 5. Renderizar Sección de Viajes
    renderViajesSection(tripOrders, viajesContainer);

    // 6. Reinicializar Drag & Drop
    initDragAndDrop();
    initTripDropZone();
}

function renderActiveMonitor(motorizadosMap, container, countEl) {
    const allKeys = Object.keys(motorizadosMap);
    const motorizadosKeys = allKeys.sort((a, b) => {
        if (a === '___SIN_ASIGNAR___') return -1;
        if (b === '___SIN_ASIGNAR___') return 1;
        const diff = motorizadosMap[b].orders.length - motorizadosMap[a].orders.length;
        if (diff !== 0) return diff;
        return a.localeCompare(b);
    });

    let activeDriversKeys = motorizadosKeys.filter(k => k !== '___SIN_ASIGNAR___');
    const totalActivos = activeDriversKeys.filter(k => motorizadosMap[k].orders.length > 0).length;

    if (countEl) {
        countEl.innerHTML = `<i class="fa-solid fa-motorcycle"></i> ${totalActivos} Activos / ${activeDriversKeys.length} Total`;
    }

    if (motorizadosKeys.length === 0) {
        container.innerHTML = `<div class="p-10 text-center opacity-40">Sin pedidos activos</div>`;
        return;
    }

    let htmlBody = '';
    motorizadosKeys.forEach(mKey => {
        const data = motorizadosMap[mKey];
        // Ordenar pedidos: prioritizar driverSortState (sesión actual), luego orden_ruta (base de datos)
        if (driverSortState[mKey]) {
            data.orders.sort((a, b) => {
                let indexA = driverSortState[mKey].indexOf(String(a.nro));
                let indexB = driverSortState[mKey].indexOf(String(b.nro));

                // Si no están en la lista guardada (pedidos nuevos), mandarlos al final (9999)
                if (indexA === -1) indexA = 9999;
                if (indexB === -1) indexB = 9999;

                if (indexA !== indexB) return indexA - indexB;
                return b.nro - a.nro; // Fallback al más nuevo
            });
        } else {
            data.orders.sort((a, b) => {
                const orderA = (a.orden_ruta !== "" && a.orden_ruta !== null) ? Number(a.orden_ruta) : 999999;
                const orderB = (b.orden_ruta !== "" && b.orden_ruta !== null) ? Number(b.orden_ruta) : 999999;
                if (orderA !== orderB) return orderA - orderB;
                return b.nro - a.nro; // Fallback al más nuevo si no hay orden
            });
        }

        const ordersHtml = data.orders.map((o, index) => {
            const timeInfo = calculateElapsedTimeForMap(o.fecha);
            let tipoPagoDisplay = (o.pago || 'POS/DESC...').toUpperCase();
            let pColor = tipoPagoDisplay.includes('EFECTIVO') ? '#4ADE80' :
                (tipoPagoDisplay.includes('QR') ? '#22D3EE' :
                    (tipoPagoDisplay.includes('TARJETA') ? '#A78BFA' : '#60A5FA'));

            const isManualSort = driverSortState[mKey] ? true : false;
            const seqNum = index + 1;

            let assignmentHtml = data.isUnassigned ? `
                <div style="margin-top: 8px; display:flex; gap:6px;">
                    <select id="sel-assign-${o.nro}" onchange="asignarMotorizadoDesdeMapa(${o.nro})" style="flex:1; background:rgba(0,0,0,0.5); color:white; border:1px solid rgba(255,255,255,0.2); border-radius:4px; padding:4px; font-size:0.85em;">
                        <option value="">-- Asignar --</option>
                        ${activeDriversKeys.map(k => `<option value="${motorizadosMap[k].name}">${motorizadosMap[k].name}</option>`).join('')}
                    </select>
                </div>` : '';

            let borderColor = o.estado === 'Validado' ? 'rgba(74, 222, 128, 0.4)' : (o.estado === 'Cancelado' || o.estado === 'Rechazado' ? 'rgba(248, 113, 113, 0.4)' : 'rgba(255,255,255,0.1)');
            let bgColor = o.estado === 'Validado' ? 'rgba(74, 222, 128, 0.1)' : (o.estado === 'Cancelado' || o.estado === 'Rechazado' ? 'rgba(248, 113, 113, 0.1)' : 'rgba(0,0,0,0.4)');
            let statusBadge = '';
            if (o.estado === 'Validado') {
                statusBadge = `<span style="font-size: 0.75em; background: rgba(74, 222, 128, 0.2); color: #4ADE80; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 8px;"><i class="fa-solid fa-check-circle"></i> V</span>`;
            } else if (o.estado === 'Cancelado' || o.estado === 'Rechazado') {
                statusBadge = `<span style="font-size: 0.75em; background: rgba(248, 113, 113, 0.2); color: #F87171; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-left: 8px;"><i class="fa-solid fa-ban"></i> C</span>`;
            }
            let boxShadow = o.estado === 'Validado' ? '0 0 8px rgba(74, 222, 128, 0.2)' : (o.estado === 'Cancelado' || o.estado === 'Rechazado' ? '0 0 8px rgba(248, 113, 113, 0.2)' : 'none');

            return `
                <div class="motorizado-order-card" data-driver="${mKey}" data-nro="${o.nro}" draggable="true" style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 8px; padding: 12px; margin-bottom: 8px; font-size: 0.85em; display: flex; gap: 12px; align-items: center; cursor: grab; position: relative; box-shadow: ${boxShadow};">
                    <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                        <span style="font-weight: 800; color: ${isManualSort ? '#A78BFA' : 'rgba(255,255,255,0.2)'}; font-size: 0.9em;">[${seqNum}]</span>
                        <div style="color: rgba(255,255,255,0.3);"><i class="fa-solid fa-grip-vertical"></i></div>
                    </div>
                    <div style="flex: 1;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px; align-items:center;">
                            <strong style="color: #fff; font-size: 1.1em; display:flex; align-items:center;">
                                ${o.llave || '#' + o.nro}
                                ${statusBadge}
                            </strong>
                            <strong style="color: #4ADE80; font-size: 1.1em;">S/ ${parseFloat(o.monto || 0).toFixed(2)}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="color: ${pColor}; font-weight: 600;"><i class="fa-solid fa-wallet"></i> ${tipoPagoDisplay}</span>
                            <span style="color: ${timeInfo.color}; background: ${timeInfo.bg}; padding: 2px 6px; border-radius: 4px; font-weight: bold;">
                                <i class="fa-solid fa-clock"></i> ${timeInfo.text}
                            </span>
                        </div>
                        ${assignmentHtml}
                    </div>
                </div>`;
        }).join('');

        const bgPanelColor = data.orders.length > 0 ? (data.isUnassigned ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255,255,255,0.03)') : 'rgba(0,0,0,0.2)';
        const avatarIconColor = data.orders.length > 0 ? (data.isUnassigned ? '#ef4444' : '#60A5FA') : 'rgba(255,255,255,0.3)';

        htmlBody += `
            <div style="background: ${bgPanelColor}; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px; display:flex; flex-direction:column;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed rgba(255,255,255,0.1);">
                    <div style="display:flex; align-items:center; gap: 10px;">
                        <div style="width: 38px; height: 38px; border-radius: 50%; background: rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; color: ${avatarIconColor}; border: 1px solid rgba(255,255,255,0.1);">
                            <i class="fa-solid ${data.isUnassigned ? 'fa-triangle-exclamation' : 'fa-helmet-safety'}"></i>
                        </div>
                        <div>
                            <h3 style="margin: 0; font-size: 1em; font-weight: 700;">${data.name}</h3>
                            <span style="font-size: 0.8em; color: rgba(255,255,255,0.5);">${data.orders.length} pedidos</span>
                        </div>
                    </div>
                    ${!data.isUnassigned && data.orders.length > 0 ? `
                        <button onclick="crearViajeDesdeMonitor('${data.name.replace(/'/g, "\\'")}')" class="btn-primary small" style="padding: 4px 10px; font-size: 0.75em; border-radius: 12px; background: var(--primary);">
                            <i class="fa-solid fa-route"></i> Crear Viaje
                        </button>
                    ` : ''}
                </div>
                <div style="flex: 1; min-height: 100px;" class="driver-order-list" data-driver-name="${data.name}">
                    ${ordersHtml || '<div class="text-center p-4 opacity-20 text-xs">Sin pedidos asignados</div>'}
                </div>
            </div>`;
    });
    container.innerHTML = htmlBody;
}

function renderViajesSection(tripOrders, container) {
    if (!container) return;

    // 1. Agrupar por viaje_id primero
    const tripsMap = {};
    tripOrders.forEach(o => {
        if (!tripsMap[o.viaje_id]) {
            tripsMap[o.viaje_id] = {
                id: o.viaje_id,
                driver: (o.envio || 'Desconocido').trim().toUpperCase(),
                originalDriverName: (o.envio || 'Desconocido'),
                orders: [],
                tripPayout: 0
            };
        }
        tripsMap[o.viaje_id].orders.push(o);
    });

    // 2. Agrupar viajes por Repartidor y calcular totales
    const driversMap = {};
    Object.values(tripsMap).forEach(trip => {
        const dName = trip.driver;
        if (!driversMap[dName]) {
            driversMap[dName] = {
                name: trip.originalDriverName,
                trips: [],
                driverTotal: 0,
                latestTripId: 0
            };
        }

        // Calcular pago del viaje
        trip.orders.sort((a, b) => a.nro - b.nro);
        let tripTotal = 0;
        trip.orders.forEach((o, idx) => {
            tripTotal += calculateOrderPayment(o, idx + 1);
        });
        trip.tripPayout = tripTotal;

        driversMap[dName].trips.push(trip);
        driversMap[dName].driverTotal += tripTotal;

        const tId = parseInt(trip.id) || 0;
        if (tId > driversMap[dName].latestTripId) {
            driversMap[dName].latestTripId = tId;
        }
    });

    // 3. Ordenar repartidores por su viaje más reciente (el último al inicio)
    const sortedDrivers = Object.values(driversMap).sort((a, b) => b.latestTripId - a.latestTripId);

    if (sortedDrivers.length === 0) {
        container.innerHTML = `<div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: rgba(255,255,255,0.2); border: 2px dashed rgba(255,255,255,0.05); border-radius: 20px;">
            <i class="fa-solid fa-route" style="font-size: 3em; margin-bottom: 15px; display: block;"></i>
            No hay viajes registrados hoy todavía.
        </div>`;
        return;
    }

    // --- CALCULOS GLOBALES ---
    let globalTrips = Object.values(tripsMap).length;
    let globalOrders = 0;
    let globalValidado = 0;
    let globalPorValidar = 0;
    let globalCancelado = 0;
    let globalMoney = 0;

    Object.values(driversMap).forEach(d => {
        globalMoney += d.driverTotal;
        d.trips.forEach(t => {
            globalOrders += t.orders.length;
            t.orders.forEach(o => {
                if (o.estado === 'Validado') globalValidado++;
                else if (o.estado === 'Por Validar' || o.estado === 'En Camino') globalPorValidar++;
                else if (o.estado === 'Cancelado' || o.estado === 'Rechazado') globalCancelado++;
            });
        });
    });

    let html = `
    <!-- RESUMEN GENERAL -->
    <div style="grid-column: 1 / -1; margin-bottom: 25px; padding: 20px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 15px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px;">
        <div style="display: flex; align-items: center; gap: 15px;">
            <div style="width: 50px; height: 50px; border-radius: 12px; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.5em; color: white; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                <i class="fa-solid fa-chart-line"></i>
            </div>
            <div>
                <h2 style="margin: 0; font-size: 1.4em; font-weight: 800;">RESUMEN DE VIAJES</h2>
                <p style="margin: 0; font-size: 0.85em; color: rgba(255,255,255,0.5);">${globalTrips} Viajes realizados | ${globalOrders} Pedidos totales</p>
            </div>
        </div>
        <div style="display: flex; gap: 25px; align-items: center; flex-wrap: wrap;">
            <div style="text-align: center; padding: 0 15px; border-right: 1px solid rgba(255,255,255,0.1);">
                <span style="font-size: 0.7em; color: rgba(255,255,255,0.4); display: block; text-transform: uppercase; margin-bottom: 2px;">Validados</span>
                <strong style="font-size: 1.25em; color: #4ade80;">${globalValidado}</strong>
            </div>
            <div style="text-align: center; padding: 0 15px; border-right: 1px solid rgba(255,255,255,0.1);">
                <span style="font-size: 0.7em; color: rgba(255,255,255,0.4); display: block; text-transform: uppercase; margin-bottom: 2px;">Por Validar</span>
                <strong style="font-size: 1.25em; color: #60a5fa;">${globalPorValidar}</strong>
            </div>
            <div style="text-align: center; padding: 0 15px; border-right: 1px solid rgba(255,255,255,0.1);">
                <span style="font-size: 0.7em; color: rgba(255,255,255,0.4); display: block; text-transform: uppercase; margin-bottom: 2px;">Cancelados</span>
                <strong style="font-size: 1.25em; color: #f87171;">${globalCancelado}</strong>
            </div>
            <div style="text-align: right; margin-left:10px;">
                <span style="font-size: 0.75em; color: rgba(255,255,255,0.4); display: block; text-transform: uppercase; margin-bottom: 2px;">Pago Total General</span>
                <strong style="font-size: 1.6em; color: #4ade80; font-family: monospace;">S/ ${globalMoney.toFixed(2)}</strong>
            </div>
        </div>
    </div>`;

    sortedDrivers.forEach(driver => {
        // Calcular resumen de estados
        let totalOrders = 0;
        let countValidado = 0;
        let countPorValidar = 0;
        let countCancelado = 0;

        driver.trips.forEach(t => {
            totalOrders += t.orders.length;
            t.orders.forEach(o => {
                if (o.estado === 'Validado') countValidado++;
                else if (o.estado === 'Por Validar' || o.estado === 'En Camino') countPorValidar++;
                else if (o.estado === 'Cancelado' || o.estado === 'Rechazado') countCancelado++;
            });
        });

        // Ordenar sus viajes: más recientes primero (usando ID como timestamp)
        driver.trips.sort((a, b) => {
            const idA = String(a.id || "");
            const idB = String(b.id || "");
            return idB.localeCompare(idA);
        });

        html += `
        <div class="driver-trip-group" style="margin-bottom: 30px; grid-column: 1 / -1;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px; padding: 12px 20px; background: rgba(96, 165, 250, 0.1); border-left: 4px solid #60a5fa; border-radius: 8px;">
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <h3 style="margin:0; font-size:1.25em; font-weight:700; color:#fff; display:flex; align-items:center; gap:10px;">
                        <i class="fa-solid fa-user-tag" style="color:#60a5fa;"></i> ${driver.name}
                        <span style="font-size:0.65em; background:rgba(255,255,255,0.1); padding:2px 8px; border-radius:10px; color:rgba(255,255,255,0.6); font-weight:400;">
                            ${driver.trips.length} ${driver.trips.length === 1 ? 'Viaje' : 'Viajes'} | ${totalOrders} Pedidos
                        </span>
                    </h3>
                    <div style="display:flex; gap:12px; font-size:0.75em; color:rgba(255,255,255,0.5);">
                        ${countValidado > 0 ? `<span><i class="fa-solid fa-circle-check" style="color:#4ade80;"></i> ${countValidado} Validados</span>` : ''}
                        ${countPorValidar > 0 ? `<span><i class="fa-solid fa-circle-info" style="color:#60a5fa;"></i> ${countPorValidar} Por Validar</span>` : ''}
                        ${countCancelado > 0 ? `<span><i class="fa-solid fa-circle-xmark" style="color:#f87171;"></i> ${countCancelado} Cancelados</span>` : ''}
                    </div>
                </div>
                <div style="text-align:right;">
                    <span style="font-size:0.75em; color:rgba(255,255,255,0.4); display:block; text-transform:uppercase; letter-spacing:0.5px;">Pago Total del Día</span>
                    <strong style="font-size:1.4em; color:#4ade80; font-family: monospace;">S/ ${driver.driverTotal.toFixed(2)}</strong>
                </div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 16px;">
                ${driver.trips.map(trip => {
            let ordersHtml = trip.orders.map((o, index) => {
                const payment = calculateOrderPayment(o, index + 1);
                let statusClass = 'status-pendiente';
                if (o.estado === 'Validado') statusClass = 'status-validado';
                else if (o.estado === 'En Camino' || o.estado === 'Por Validar') statusClass = 'status-camino';
                else if (o.estado === 'Cancelado') statusClass = 'status-cancelado';

                return `
                            <div class="trip-order-item">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <span class="trip-order-status ${statusClass}">${o.estado}</span>
                                    <strong style="color:#fff;">${o.llave || '#' + o.nro}</strong>
                                </div>
                                <div class="trip-order-payment">S/ ${payment.toFixed(2)}</div>
                            </div>`;
            }).join('');

            const tripDate = new Date(parseInt(trip.id));
            const timeStr = isNaN(tripDate.getTime()) ? "---" : tripDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return `
                        <div class="trip-card" data-trip-id="${trip.id}">
                            <div class="trip-header">
                                <div class="trip-driver-info">
                                    <div class="trip-avatar"><i class="fa-solid fa-clock"></i></div>
                                    <div>
                                        <h3 style="margin:0; font-size:1em; font-weight:700; color:#fff;">Viaje #${String(trip.id).slice(-4)}</h3>
                                        <span style="font-size:0.8em; color:rgba(255,255,255,0.4);">${timeStr}</span>
                                    </div>
                                </div>
                                <div class="trip-payment-summary">
                                    <div class="trip-payment-label">Subtotal</div>
                                    <div class="trip-payment-value">S/ ${trip.tripPayout.toFixed(2)}</div>
                                </div>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                ${ordersHtml}
                            </div>
                        </div>`;
        }).join('')}
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

function calculateOrderPayment(order, position) {
    if (order.estado === 'Cancelado' || order.estado === 'Rechazado') {
        return 5.00;
    }
    // Reglas: 1ero 7.5, 2do 7.0, 3ro+ 6.5
    if (position === 1) return 7.50;
    if (position === 2) return 7.00;
    return 6.50;
}

function initTripDropZone() {
    const dropZone = document.getElementById('trip-drop-zone');
    if (!dropZone) return;

    // 1. Zona de "Nuevo Viaje"
    dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', async e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');

        const draggingEl = document.querySelector('.dragging');
        if (!draggingEl) return;

        const nro = draggingEl.getAttribute('data-nro');
        const driverName = draggingEl.closest('.driver-order-list').getAttribute('data-driver-name');

        if (!driverName || driverName.includes('SIN ASIGNAR')) {
            Swal.fire('Atención', 'Primero asigna el pedido a un repartidor.', 'warning');
            return;
        }

        await crearViajeConPedidos([nro]);
    });

    // 2. Delegación para tarjetas de viaje existentes
    const viajesGrid = document.getElementById('viajes-grid');
    if (viajesGrid) {
        viajesGrid.addEventListener('dragover', e => {
            const tripCard = e.target.closest('.trip-card');
            if (tripCard) {
                e.preventDefault();
                tripCard.classList.add('dragover');
            }
        });

        viajesGrid.addEventListener('dragleave', e => {
            const tripCard = e.target.closest('.trip-card');
            if (tripCard) {
                tripCard.classList.remove('dragover');
            }
        });

        viajesGrid.addEventListener('drop', async e => {
            const tripCard = e.target.closest('.trip-card');
            if (tripCard) {
                e.preventDefault();
                tripCard.classList.remove('dragover');

                const draggingEl = document.querySelector('.dragging');
                if (!draggingEl) return;

                const nro = draggingEl.getAttribute('data-nro');
                const existingTripId = tripCard.getAttribute('data-trip-id');

                await crearViajeConPedidos([nro], existingTripId);
            }
        });
    }
}

async function crearViajeConPedidos(nros, existingTripId = null) {
    const tripId = existingTripId || Date.now().toString();

    Swal.fire({
        title: existingTripId ? 'Agregando al Viaje...' : 'Creando Viaje...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
    });

    try {
        const response = await fetchAPI('asignarViajePedido', {
            nros: nros.map(n => Number(n)),
            viajeId: tripId
        });

        if (response.success) {
            // Optimización: Actualizar localmente sin recargar todo el servidor
            if (typeof orders !== 'undefined') {
                nros.forEach(nro => {
                    const orderIndex = orders.findIndex(o => o.nro == nro);
                    if (orderIndex !== -1) {
                        orders[orderIndex].viaje_id = tripId;
                    }
                });
            }

            Swal.fire({
                icon: 'success',
                title: existingTripId ? 'Pedido Agregado' : 'Viaje Creado',
                toast: true,
                position: 'top-end',
                timer: 2000,
                showConfirmButton: false
            });

            // Renderizado inmediato
            renderMapaMotorizados();

            // Opcional: Refrescar la tabla principal silenciosamente en segundo plano
            if (typeof loadOrdersSilent === 'function') {
                loadOrdersSilent();
            }
        } else {
            Swal.fire('Error', response.message || 'Error al procesar viaje', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Error de red', 'error');
    }
}

window.crearViajeDesdeMonitor = async function (driverKey) {
    const listContainer = Array.from(document.querySelectorAll('.driver-order-list'))
        .find(el => el.getAttribute('data-driver-name') === driverKey);

    if (!listContainer) {
        console.error("No se encontró el contenedor para el repartidor:", driverKey);
        return;
    }

    const cards = Array.from(listContainer.querySelectorAll('.motorizado-order-card'));
    if (cards.length === 0) {
        Swal.fire('Atención', 'No hay pedidos en la ruta de este repartidor.', 'info');
        return;
    }

    // Preparar el HTML para las casillas de verificación
    let htmlContent = `<div style="text-align: left; max-height: 300px; overflow-y: auto; padding-right: 10px;">
        <p style="margin-bottom: 15px; font-size: 0.9em; color: #aaa;">Selecciona los pedidos a incluir en el viaje. Desmarca los pedidos 'Pendientes' si deseas dejarlos para después.</p>`;

    cards.forEach(c => {
        const nro = c.getAttribute('data-nro');
        // Buscar info del pedido
        const o = orders.find(x => x.nro == nro);
        if (!o) return;

        let labelColor = '#fff';
        let badgeHtml = '';
        if (o.estado === 'Pendiente') {
            badgeHtml = `<span style="font-size:0.7em; background:rgba(234,179,8,0.2); color:#EAB308; padding:2px 4px; border-radius:4px; margin-left:6px;">Pendiente</span>`;
        } else if (o.estado === 'Validado') {
            badgeHtml = `<span style="font-size:0.7em; background:rgba(74,222,128,0.2); color:#4ADE80; padding:2px 4px; border-radius:4px; margin-left:6px;">Validado</span>`;
        }

        htmlContent += `
        <label style="display: flex; align-items: center; justify-content: space-between; padding: 10px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; margin-bottom: 8px; cursor: pointer; background: rgba(0,0,0,0.2);">
            <div style="display: flex; align-items: center; gap: 10px;">
                <input type="checkbox" checked value="${nro}" class="trip-order-checkbox" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary);">
                <span style="color: ${labelColor}; font-weight: bold;">${o.llave || '#' + o.nro}</span>
            </div>
            ${badgeHtml}
        </label>`;
    });
    htmlContent += `</div>`;

    const result = await Swal.fire({
        title: `Armando Viaje: ${driverKey}`,
        html: htmlContent,
        width: '450px',
        showCancelButton: true,
        confirmButtonText: '<i class="fa-solid fa-route"></i> Crear Viaje Definitivo',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            // Recoger los checkbox marcados
            const checkedBoxes = Array.from(Swal.getPopup().querySelectorAll('.trip-order-checkbox:checked'));
            if (checkedBoxes.length === 0) {
                Swal.showValidationMessage('Debes seleccionar al menos un pedido para el viaje');
                return false;
            }
            // Retornar los nros seleccionados, PRESREVANDO el orden original en el que estaban en pantalla
            const selectedSet = new Set(checkedBoxes.map(cb => cb.value));
            const nrosEnOrdenOriginal = cards.map(c => c.getAttribute('data-nro')).filter(nro => selectedSet.has(nro));
            return nrosEnOrdenOriginal;
        }
    });

    if (result.isConfirmed && result.value && result.value.length > 0) {
        await crearViajeConPedidos(result.value); // result.value es el array de nros seleccionados
        // Limpiar el estado de ordenamiento manual local para este driver ya que ahora son un viaje
        const mKey = driverKey.toUpperCase();
        if (driverSortState[mKey]) {
            delete driverSortState[mKey];
        }
    }
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

        draggable.addEventListener('dragend', async () => {
            draggable.classList.remove('dragging');

            const nro = draggable.getAttribute('data-nro');
            const targetList = draggable.closest('.driver-order-list');
            if (!targetList) return;

            const newDriverName = targetList.getAttribute('data-driver-name');
            const newDriverKey = newDriverName.trim().toUpperCase();

            // 1. Si cambió de repartidor, primero sincronizar asignación
            const oldDriverKey = draggable.getAttribute('data-driver');
            if (oldDriverKey !== newDriverKey) {
                // Actualizar repartidor en la base de datos
                try {
                    await fetchAPI('asignarMotorizado', { nro: nro, envio: newDriverName });
                    // Actualizar estado local de orders
                    const o = orders.find(x => x.nro == nro);
                    if (o) o.envio = newDriverName;
                } catch (e) { console.error("Error reasignando:", e); }
            }

            // 2. Obtener nuevo orden de la lista destino
            const items = Array.from(targetList.querySelectorAll('.motorizado-order-card'));
            const newArr = items.map(el => el.getAttribute('data-nro'));

            // Actualizar estado local de ordenamiento
            driverSortState[newDriverKey] = newArr;

            // Refrescar UI (esto unificará el data-driver del elemento movido)
            renderMapaMotorizados();

            // Sincronizar secuencia al Excel
            syncRutaBackend(newDriverKey, newArr);
        });
    });

    containers.forEach(container => {
        container.addEventListener('dragover', e => {
            e.preventDefault();
            const draggingEl = document.querySelector('.dragging');
            if (!draggingEl) return;

            // ELIMINADO: Restricción de mismo repartidor
            // Ahora permitimos reasignar arrastrando de un panel a otro

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
