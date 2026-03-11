// ============================================================
// mapa.js — Monitor de Motorizados y sus rutas
// ============================================================

// Local storage key para guardar el orden personalizado de los pedidos por motorizado
const SORT_STATE_KEY = 'motorizado_order_sort_state';
const BOX_SORT_STATE_KEY = 'monitor_box_sort_state';
let driverSortState = JSON.parse(localStorage.getItem(SORT_STATE_KEY) || '{}');
let boxSortState = JSON.parse(localStorage.getItem(BOX_SORT_STATE_KEY) || '[]');

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

                    // Actualizar la lista de repartidores en los dropdowns y monitor
                    if (typeof loadAllDrivers === 'function') {
                        await loadAllDrivers();
                    }
                    if (typeof updateDriverFilterOptions === 'function') {
                        updateDriverFilterOptions();
                    }
                    renderMapaMotorizados();
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


// Almacén temporal obsoleto (removido para usar BD)
window.hiddenCanceledOrders = [];

window.limpiarCancelados = async function (idsArray) {
    if (!idsArray || !idsArray.length) return;

    const result = await Swal.fire({
        title: '¿Archivar estos pedidos?',
        text: "Desaparecerán permanentemente de tu monitor de Motorizados. Se les asignará un código interno de viaje cancelado en la base de datos.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#F87171',
        cancelButtonColor: '#6B7280',
        confirmButtonText: 'Sí, archivar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        try {
            Swal.fire({ title: 'Archivando en base de datos...', allowEscapeKey: false, didOpen: () => Swal.showLoading() });

            // Usamos el mismo endpoint de crear viaje, pero le asignamos un ID de viaje 'basura'
            const res = await fetchAPI('asignarViajePedido', {
                nros: idsArray,
                viajeId: 'CANCELADOS_ARCHIVADOS'
            });

            if (res.success) {
                Swal.fire('¡Archivados!', 'Los pedidos cancelados fueron limpiados de la vista de forma permanente.', 'success');
                // Recargar todos los datos desde Excel ya que modificamos la BD
                if (typeof loadOrders === 'function') {
                    loadOrders();
                }
            } else {
                Swal.fire('Error', res.message || res.msg, 'error');
            }
        } catch (e) {
            Swal.fire('Error', 'Fallo de red al archivar', 'error');
        }
    }
};

// --- STATE PERSISTENCE (v5.0) ---
// Guardamos asignaciones locales que aún no han sido confirmadas 100% por el servidor
// para evitar el efecto "regreso" durante los refrescos silenciosos.
window.pendingAssignments = window.pendingAssignments || {};

function renderMapaMotorizados() {
    const activeContainer = document.getElementById('mapa-grid');
    const viajesContainer = document.getElementById('viajes-grid');
    if (!activeContainer || !viajesContainer) return;

    // --- LOGICA DE PERSISTENCIA OPTIMISTA ---
    // Clonamos u obtenemos pedidos para no mutar el array original de app.js permanentemente
    let currentOrders = (typeof orders !== 'undefined' ? [...orders] : []);

    // Aplicar sobrescritura de "Verdad Local" sobre "Verdad de Servidor"
    currentOrders.forEach(o => {
        const pending = window.pendingAssignments[o.nro];
        if (pending) {
            // Solo aplicamos si el cambio es reciente (menos de 15 seg)
            // o si el servidor aún no refleja el cambio solicitado
            const now = Date.now();
            if (now - pending.timestamp < 25000) {
                o.envio = pending.envio;
                o.viaje_id = pending.viaje_id;
                o.isPendingAssignment = true;
            } else {
                // Si ya pasó mucho tiempo, asumimos que el servidor ya sincronizó o falló
                delete window.pendingAssignments[o.nro];
            }
        }
    });

    const motorizadosMap = {};
    // 1. Obtener todos los motorizados únicos (Prioridad: Lista maestra del Excel v1.21)
    let officialDrivers = (window.allDriversList && window.allDriversList.length > 0)
        ? window.allDriversList
        : [];

    // --- FALLBACK (v5.11): Si la lista oficial falla, extraer de los pedidos actuales ---
    if (officialDrivers.length === 0 && typeof orders !== 'undefined') {
        const fallbackSet = new Set();
        orders.forEach(o => {
            if (o.envio && o.envio.trim() !== "") fallbackSet.add(o.envio.trim());
        });
        officialDrivers = Array.from(fallbackSet).sort();
    }

    // Inicializar el mapa con los nombres oficiales siempre para que aparezcan sus cajas
    officialDrivers.forEach(dName => {
        const key = dName.trim().toUpperCase();
        motorizadosMap[key] = {
            name: dName.trim(),
            orders: [],
            totalMoney: 0
        };
    });

    // Si hay nombres en los pedidos que no están en la lista oficial, 
    // se tratarán como "Sin Asignar" más adelante para evitar cajas fantasma.

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

    const allOrders = currentOrders.filter(o => {
        if (!o.fecha) return false;
        return getOrderDateLima(o.fecha) === targetDate;
    });

    // (REGLA ACTUALIZADA: Monitor Activo incluye SIN viaje Y viajes temporales "AUTO_...")
    // Esto mantiene el ciclo de vida en la caja superior.
    const activeOrders = allOrders.filter(o => {
        const vId = String(o.viaje_id || "").trim();
        return vId === "" || vId === "null" || vId === "undefined" || vId.includes("AUTO_");
    });

    // Pedidos que ya pertenecen a un viaje DEFINITIVO (archivado o liquidado para historial)
    const tripOrders = allOrders.filter(o => {
        const vId = String(o.viaje_id || "").trim();
        return vId !== "" && vId !== "null" && vId !== "undefined" && !vId.includes("AUTO_");
    });

    // 2.5 Crear categoría para No Asignados en el monitor activo
    motorizadosMap['___SIN_ASIGNAR___'] = {
        name: '⚠️ SIN ASIGNAR',
        orders: [],
        totalMoney: 0,
        isUnassigned: true
    };

    // 2.6 Crear categoría para Cancelados
    motorizadosMap['___CANCELADOS___'] = {
        name: '⛔ CANCELADOS',
        orders: [],
        totalMoney: 0,
        isCanceledBox: true
    };

    // 3. Asignar pedidos activos a sus repartidores (Agrupando por Viaje para permitir múltiples cajas)
    activeOrders.forEach(o => {
        let baseKey = (o.envio && o.envio.trim() !== '') ? o.envio.trim().toUpperCase() : '___SIN_ASIGNAR___';
        const vId = String(o.viaje_id || "").trim();
        const hasTripId = (vId !== "" && vId !== "null" && vId !== "undefined");

        let dKey = baseKey;
        // Solo creamos cajas separadas por viaje si es un motorizado real
        // Los pedidos 'Sin Asignar' siempre van a la caja principal ___SIN_ASIGNAR___ (v3.0)
        if (hasTripId && baseKey !== '___SIN_ASIGNAR___' && baseKey !== '___CANCELADOS___') {
            dKey = baseKey + "_" + vId;
        }

        // Si la caja no existe, la creamos (solo si viene de un motorizado válido o es especial)
        if (!motorizadosMap[dKey]) {
            if (baseKey === '___SIN_ASIGNAR___' || baseKey === '___CANCELADOS___' || motorizadosMap[baseKey] || officialDrivers.some(d => d.trim().toUpperCase() === baseKey)) {
                motorizadosMap[dKey] = {
                    name: (motorizadosMap[baseKey] ? motorizadosMap[baseKey].name : (o.envio || baseKey)),
                    tripId: hasTripId ? vId : null,
                    orders: [],
                    totalMoney: 0,
                    isUnassigned: (baseKey === '___SIN_ASIGNAR___'),
                    isCanceledBox: (baseKey === '___CANCELADOS___')
                };
            } else {
                dKey = '___SIN_ASIGNAR___';
            }
        }

        // REGLA: Si estÃ¡ en Sin Asignar Y estÃ¡ cancelado, lo movemos a la caja Cancelados
        // PERO: Si tiene viaje_id, debe quedarse en su caja de viaje para no romper la ruta visual
        if (dKey === '___SIN_ASIGNAR___' && o.estado && !hasTripId) {
            const st = o.estado.toLowerCase();
            if (st.includes('cancelado') || st.includes('rechazado')) {
                dKey = '___CANCELADOS___';
                if (!motorizadosMap[dKey]) {
                    motorizadosMap[dKey] = { name: '⛔ CANCELADOS', orders: [], totalMoney: 0, isCanceledBox: true };
                }
            }
        }

        if (motorizadosMap[dKey]) {
            motorizadosMap[dKey].orders.push(o);
            motorizadosMap[dKey].totalMoney += (parseFloat(o.monto) || 0);
        }
    });


    // Mantenemos estas cajas siempre visibles por requerimiento del usuario (v2.0)
    // if (motorizadosMap['___SIN_ASIGNAR___'].orders.length === 0) {
    //     delete motorizadosMap['___SIN_ASIGNAR___'];
    // }
    // if (motorizadosMap['___CANCELADOS___'].orders.length === 0) {
    //     delete motorizadosMap['___CANCELADOS___'];
    // }

    // 4. Renderizar Monitor Activo
    const counts = calculateGlobalCounts(motorizadosMap, tripOrders);
    renderActiveMonitor(motorizadosMap, activeContainer, counts);

    // 5. Renderizar Sección de Viajes
    renderViajesSection(tripOrders, viajesContainer);

    // 6. Reinicializar Drag & Drop
    initDragAndDrop();
    initTripDropZone();
    initBoxDragAndDrop();
}

function calculateGlobalCounts(motorizadosMap, tripOrders) {
    let enRuta = 0;
    let entregaron = 0;

    // 1. Solo contamos lo que está en el MONITOR ACTIVO (Lo que el usuario ve arriba)
    Object.keys(motorizadosMap).forEach(mKey => {
        const m = motorizadosMap[mKey];
        if (m.isCanceledBox || m.isUnassigned) return;

        // Ver si esta caja ya es un viaje activo (Temporal) en el Monitor
        const stats = getDriverStatusDetailed(m.orders);
        if (stats.enRuta) enRuta++;
        else if (stats.llegaron) entregaron++;
    });

    return { enRuta, entregaron };
}

function renderActiveMonitor(motorizadosMap, container, counts) {
    if (!container) return;

    // Forzamos al contenedor principal a ser flex vertical y ocupar el 100%
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '30px';
    container.style.width = '100%';
    container.style.gridTemplateColumns = 'none'; // Anulamos el grid de index.html

    const allKeys = Object.keys(motorizadosMap);
    const motorizadosKeys = allKeys.sort((a, b) => {
        // PRIORIDAD 0: ORDEN MANUAL (Drag & Drop de Boxes)
        if (boxSortState && boxSortState.length > 0) {
            const indexA = boxSortState.indexOf(a);
            const indexB = boxSortState.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
        }

        if (a === '___SIN_ASIGNAR___') return -1;
        if (b === '___SIN_ASIGNAR___') return 1;
        if (a === '___CANCELADOS___') return 1;
        if (b === '___CANCELADOS___') return -1;

        const dataA = motorizadosMap[a];
        const dataB = motorizadosMap[b];
        const statsA = getDriverStatusDetailed(dataA.orders);
        const statsB = getDriverStatusDetailed(dataB.orders);

        // REGLA 1: EN RUTA (Rojo) a la IZQUIERDA vs LLEGÓ (Verde) a la DERECHA
        if (statsA.enRuta && !statsB.enRuta) return -1;
        if (!statsA.enRuta && statsB.enRuta) return 1;

        // REGLA 2: Si ambos están EN RUTA -> Ordenar por el pedido más ANTIGUO (fecha)
        if (statsA.enRuta && statsB.enRuta) {
            const minA = Math.min(...dataA.orders.map(o => {
                const d = new Date(o.fecha);
                return isNaN(d.getTime()) ? 9999999999999 : d.getTime();
            }));
            const minB = Math.min(...dataB.orders.map(o => {
                const d = new Date(o.fecha);
                return isNaN(d.getTime()) ? 9999999999999 : d.getTime();
            }));
            return minA - minB;
        }

        // REGLA 3: Si ambos ya LLEGARON -> Ordenar por HORA DE ENTREGA (el primero que llegó va primero)
        if (statsA.llegaron && statsB.llegaron) {
            const getArrivedMinutes = (orders) => {
                const minsList = orders.map(o => {
                    const rawVal = [o.fechaHoraReal]
                        .filter(v => v && String(v).trim() !== "" && String(v).trim() !== "---")
                        .join(" ");
                    const match = rawVal.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]\.?m\.?)?/i);
                    if (match) {
                        let h = parseInt(match[1]);
                        const m = parseInt(match[2]);
                        const ampm = match[3] ? match[3].toLowerCase() : null;
                        if (ampm) {
                            if (ampm.includes('p') && h < 12) h += 12;
                            if (ampm.includes('a') && h === 12) h = 0;
                        }
                        return h * 60 + m;
                    }
                    return null;
                }).filter(v => v !== null);
                return minsList.length > 0 ? Math.max(...minsList) : 999999;
            };

            const minA = getArrivedMinutes(dataA.orders);
            const minB = getArrivedMinutes(dataB.orders);
            if (minA !== minB) return minA - minB;
        }

        return a.localeCompare(b);
    });
    let activeDriversKeys = motorizadosKeys.filter(k => k !== '___SIN_ASIGNAR___' && k !== '___CANCELADOS___');

    if (counts) {
        const elRoute = document.getElementById('mapa-route-count');
        const elArrived = document.getElementById('mapa-arrived-count');

        if (elRoute) elRoute.querySelector('.val').textContent = counts.enRuta;
        if (elArrived) elArrived.querySelector('.val').textContent = counts.entregaron;
    }

    if (motorizadosKeys.length === 0) {
        container.innerHTML = `<div class="p-10 text-center opacity-40">Sin pedidos activos</div>`;
        return;
    }

    const enRutaKeys = motorizadosKeys.filter(k => {
        const data = motorizadosMap[k];
        if (k === '___SIN_ASIGNAR___') return data.orders.length > 0;
        if (k === '___CANCELADOS___') return data.orders.length > 0;

        const stats = getDriverStatusDetailed(data.orders);
        // Si tiene pedidos pero no ha terminado (independientemente de si tiene ID o no)
        return stats.enRuta;
    });

    const llegaronKeys = motorizadosKeys.filter(k => {
        if (k === '___SIN_ASIGNAR___' || k === '___CANCELADOS___') return false;
        const data = motorizadosMap[k];
        const stats = getDriverStatusDetailed(data.orders);
        // Solo agrupamos en "llegaron" si tiene pedidos y todos estan terminados
        return data.orders.length > 0 && stats.llegaron;
    });

    const renderGroup = (keys, title, icon, color) => {
        if (keys.length === 0) return '';
        let groupHtml = `
            <div style="margin-bottom: 35px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px; padding-left: 5px; border-left: 4px solid ${color};">
                    <i class="fa-solid ${icon}" style="color: ${color}; font-size: 1.1em;"></i>
                    <h2 style="margin: 0; font-size: 0.85em; font-weight: 800; color: ${color}; text-transform: uppercase; letter-spacing: 1px;">
                        ${title} <span style="opacity: 0.5; font-weight: 400; margin-left: 5px;">(${keys.length})</span>
                    </h2>
                </div>
                <div class="monitor-group-container" style="display: flex; flex-wrap: wrap; gap: 20px; width: 100%;">
        `;

        keys.forEach(mKey => {
            const data = motorizadosMap[mKey];
            // Ordenar pedidos: prioritizar driverSortState (sesiÃ³n actual), luego orden_ruta (base de datos)
            if (driverSortState[mKey]) {
                data.orders.sort((a, b) => {
                    let indexA = driverSortState[mKey].indexOf(String(a.nro));
                    let indexB = driverSortState[mKey].indexOf(String(b.nro));
                    if (indexA === -1) indexA = 9999;
                    if (indexB === -1) indexB = 9999;
                    if (indexA !== indexB) return indexA - indexB;
                    return b.nro - a.nro;
                });
            } else {
                data.orders.sort((a, b) => {
                    const orderA = (a.orden_ruta !== "" && a.orden_ruta !== null) ? Number(a.orden_ruta) : 999999;
                    const orderB = (b.orden_ruta !== "" && b.orden_ruta !== null) ? Number(b.orden_ruta) : 999999;
                    if (orderA !== orderB) return orderA - orderB;
                    return b.nro - a.nro;
                });
            }

            const isCanceledBox = data.isCanceledBox === true;
            let boxTitleColor = '#E2E8F0';
            let customBorderStr = '1px solid rgba(255,255,255,0.1)';
            let customBgStr = 'rgba(255,255,255,0.03)';

            if (isCanceledBox) {
                boxTitleColor = '#F87171';
                customBorderStr = '1px solid rgba(248, 113, 113, 0.3)';
                customBgStr = 'rgba(248, 113, 113, 0.05)';
            } else if (data.isUnassigned) {
                boxTitleColor = '#FCA5A5';
                customBorderStr = '2px dashed rgba(248, 113, 113, 0.4)';
                customBgStr = 'rgba(248, 113, 113, 0.05)';
            } else if (data.orders.length > 0) {
                const stats = getDriverStatusDetailed(data.orders);
                // --- REGLA DE COLORES (v5.0) ---
                if (stats.llegaron) {
                    // Si todos tienen hora de entrega -> VERDE
                    boxTitleColor = '#4ADE80';
                    customBorderStr = '2px solid rgba(74, 222, 128, 0.6)';
                    customBgStr = 'rgba(74, 222, 128, 0.07)';
                } else {
                    // Si falta alguna hora de entrega -> ROJO (En Ruta)
                    boxTitleColor = '#F87171';
                    customBorderStr = '2px solid rgba(248, 113, 113, 0.6)';
                    customBgStr = 'rgba(248, 113, 113, 0.07)';
                }
            }

            let headerExtra = '';
            if (isCanceledBox) {
                const idsToDelete = data.orders.map(o => o.nro).join(',');
                headerExtra = `<button onclick="limpiarCancelados([${idsToDelete}])" title="Archivar cancelados" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 8px; font-size: 0.85em; font-weight: 800; cursor: pointer; margin-left: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: all 0.2s;">Limpiar</button>`;
            }

            const ordersHtml = data.orders.map((o, index) => {
                let tipoPagoDisplay = (o.pago || 'POS/DESC...').toUpperCase();
                let pColor = tipoPagoDisplay.includes('EFECTIVO') ? '#4ADE80' : (tipoPagoDisplay.includes('QR') ? '#22D3EE' : (tipoPagoDisplay.includes('TARJETA') ? '#A78BFA' : '#60A5FA'));
                const isVal = (o.estado === 'Validado');
                const timeTadaInfo = calculateElapsedTimeForMap(null, o.hora_tada, isVal ? o.fecha_validacion : null, o.minutosReales);
                const timeInfo = calculateElapsedTimeForMap(o.fecha, null, isVal ? o.fecha_validacion : null, o.minutosReales);
                const isManualSort = driverSortState[mKey] ? true : false;
                const seqNum = index + 1;

                let assignmentHtml = data.isUnassigned ? `
                    <div style="margin-top: 8px; display:flex; flex-direction:column; gap:6px;">
                        <select id="sel-assign-${o.nro}" onchange="asignarMotorizadoDesdeMapa(${o.nro})" style="width:100%; background:rgba(0,0,0,0.5); color:white; border:1px solid rgba(255,255,255,0.2); border-radius:4px; padding:4px; font-size:0.85em;">
                            <option value="">-- Seleccionar --</option>
                            ${activeDriversKeys.map(k => `<option value="${motorizadosMap[k].name}">${motorizadosMap[k].name}</option>`).join('')}
                        </select>
                        <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                            ${activeDriversKeys.slice(0, 4).map(k => `
                                <button onclick="asignarMotorizadoDesdeMapa(${o.nro}, '${motorizadosMap[k].name.replace(/'/g, "\\'")}')" 
                                    style="background: rgba(96, 165, 250, 0.1); color: #60a5fa; border: 1px solid rgba(96, 165, 250, 0.3); border-radius: 4px; padding: 2px 6px; font-size: 0.7em; font-weight: 700; cursor: pointer; transition: all 0.2s;"
                                    onmouseover="this.style.background='rgba(96, 165, 250, 0.2)'"
                                    onmouseout="this.style.background='rgba(96, 165, 250, 0.1)'">
                                    <i class="fa-solid fa-user-plus" style="font-size:0.8em;"></i> ${motorizadosMap[k].name.split(' ')[0]}
                                </button>
                            `).join('')}
                        </div>
                    </div>` : '';

                let borderColor = o.isPendingAssignment ? 'rgba(96, 165, 250, 0.8)' : (o.estado === 'Validado' ? 'rgba(74, 222, 128, 0.4)' :
                    (o.estado === 'Cancelado' || o.estado === 'Rechazado' ? 'rgba(248, 113, 113, 0.4)' :
                        (o.estado === 'Por Validar' ? 'rgba(96, 165, 250, 0.4)' :
                            (o.estado === 'En Camino' ? 'rgba(255, 255, 255, 0.5)' :
                                (o.estado === 'Pendiente' ? 'rgba(251, 191, 36, 0.5)' : 'rgba(255,255,255,0.1)')))));
                let bgColor = o.estado === 'Validado' ? 'rgba(74, 222, 128, 0.1)' : (o.estado === 'Cancelado' || o.estado === 'Rechazado' ? 'rgba(248, 113, 113, 0.1)' : (o.estado === 'Por Validar' ? 'rgba(96, 165, 250, 0.1)' : 'rgba(0,0,0,0.4)'));

                let sColor = '#94a3b8'; let sBg = 'rgba(148, 163, 184, 0.1)'; let sIcon = 'fa-clock'; let sText = o.estado;
                if (o.estado === 'Validado') { 
                    if (o.validado_por === 'Robot (Auto)') {
                        sColor = '#34d399'; sBg = 'rgba(52, 211, 153, 0.2)'; sIcon = 'fa-robot'; sText = 'Val. Auto';
                    } else {
                        sColor = '#4ADE80'; sBg = 'rgba(74, 222, 128, 0.2)'; sIcon = 'fa-check-circle'; 
                    }
                }
                else if (o.estado === 'Cancelado' || o.estado === 'Rechazado') { sColor = '#F87171'; sBg = 'rgba(248, 113, 113, 0.2)'; sIcon = 'fa-ban'; }
                else if (o.estado === 'En Camino') { sColor = '#FFFFFF'; sBg = 'rgba(255, 255, 255, 0.2)'; sIcon = 'fa-motorcycle'; }
                else if (o.estado === 'Por Validar') { sColor = '#3B82F6'; sBg = 'rgba(59, 130, 246, 0.2)'; sIcon = 'fa-eye'; }
                else if (o.estado === 'Pendiente') { sColor = '#FBBF24'; sBg = 'rgba(251, 191, 36, 0.2)'; sIcon = 'fa-clock'; }

                const hasVId = (o.viaje_id && String(o.viaje_id).trim() !== "" && String(o.viaje_id).trim() !== "null" && String(o.viaje_id).trim() !== "undefined");
                let unassignBtn = (!data.isUnassigned && !isCanceledBox && !hasVId) ? `
                    <button onclick="desasignarMotorizadoDesdeMapa(${o.nro})" title="Quitar repartidor" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 2px 6px; border-radius: 4px; font-size: 0.8em; cursor: pointer; margin-left: 5px;"><i class="fa-solid fa-user-slash"></i></button>` : '';

                let statusBadge = `<div style="display:flex; align-items:center; margin-left: auto;">
                    <span style="font-size: 0.7em; background: ${sBg}; color: ${sColor}; padding: 2px 6px; border-radius: 4px; font-weight: 800; border: 1px solid ${sColor}88; text-transform: uppercase;"><i class="fa-solid ${sIcon}"></i> ${sText}</span>
                    ${unassignBtn}
                </div>`;

                let boxShadow = o.isPendingAssignment ? '0 0 15px rgba(96, 165, 250, 0.4)' : (o.estado === 'Validado' ? '0 0 8px rgba(74, 222, 128, 0.2)' :
                    (o.estado === 'Cancelado' || o.estado === 'Rechazado' ? '0 0 8px rgba(248, 113, 113, 0.2)' :
                        (o.estado === 'Por Validar' ? '0 0 8px rgba(96, 165, 250, 0.2)' :
                            (o.estado === 'En Camino' ? '0 0 8px rgba(255, 255, 255, 0.3)' :
                                (o.estado === 'Pendiente' ? '0 0 8px rgba(251, 191, 36, 0.3)' : 'none')))));

                return `
                    <div class="motorizado-order-card" data-driver="${mKey}" data-nro="${o.nro}" data-estado="${o.estado}" draggable="true" style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 8px; padding: 10px; margin-bottom: 8px; font-size: 0.82em; display: flex; gap: 8px; align-items: flex-start; cursor: grab; position: relative; box-shadow: ${boxShadow}; width: 100%; box-sizing: border-box; overflow: hidden; transition: all 0.3s;">
                        <div style="display:flex; flex-direction:column; align-items:center; gap:2px; padding-top: 4px;">
                            <span style="font-weight: 800; color: ${isManualSort ? '#A78BFA' : 'rgba(255,255,255,0.2)'}; font-size: 0.9em;">[${seqNum}]</span>
                            <div style="color: rgba(255,255,255,0.3);"><i class="fa-solid fa-grip-vertical"></i></div>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:6px; align-items:center; flex-wrap: wrap; gap: 4px;">
                                <div style="display:flex; align-items:center; gap:8px;"><strong style="color: #fff; font-size: 1.05em; white-space: normal; word-break: break-word; flex: 1;" title="${o.llave}">${o.llave || '#' + o.nro}</strong></div>
                                ${statusBadge}
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap: wrap; gap: 4px;">
                                <span style="color: ${pColor}; font-weight: 600; font-size: 0.9em;"><i class="fa-solid fa-wallet"></i> ${tipoPagoDisplay}</span>
                                <div style="display: flex; gap: 4px; align-items: center; flex-direction: column; align-items: flex-end;">
                                    <strong style="color: #4ADE80; font-size: 1.05em;">S/ ${parseFloat(o.monto || 0).toFixed(2)}</strong>
                                    <div style="display: flex; gap: 4px;">
                                        ${(() => {
                        try {
                            const d = new Date(o.fecha);
                            if (isNaN(d.getTime())) return '';
                            const h = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase().replace(' ', '');
                            return `<span title="Hora de Pedido (Columna B)" style="color: #fcd34d; background: rgba(252, 211, 77, 0.1); padding: 2px 5px; border-radius: 4px; font-weight: bold; font-size: 0.75em; white-space: nowrap; border: 1px solid rgba(252, 211, 77, 0.3);"><i class="fa-solid fa-calendar-check"></i> ${h}</span>`;
                        } catch (e) { return ''; }
                    })()}
                                        ${o.hora_tada && o.hora_tada !== '---' ? `<span title="Hora oficial TADA" style="color: #60a5fa; background: rgba(96, 165, 250, 0.1); padding: 2px 5px; border-radius: 4px; font-weight: bold; font-size: 0.75em; white-space: nowrap; border: 1px solid rgba(96, 165, 250, 0.3);"><i class="fa-solid fa-ghost"></i> ${o.hora_tada} (${timeTadaInfo.text})</span>` : ''}
                                        <span title="SLA desde sincronización" style="color: ${timeInfo.color}; background: ${timeInfo.bg}; padding: 2px 5px; border-radius: 4px; font-weight: bold; font-size: 0.85em; white-space: nowrap;"><i class="fa-solid fa-clock"></i> ${timeInfo.text}</span>
                                    </div>
                                </div>
                            </div>
                            ${(tipoPagoDisplay.includes('CONTADO') && o.vuelto && parseFloat(o.vuelto) > 0) ? `
                            <div style="margin-top: 6px; padding: 4px 8px; background: rgba(16, 185, 129, 0.15); border: 1px dashed rgba(16, 185, 129, 0.4); border-radius: 6px; display: inline-flex; align-items: center; gap: 6px;">
                                <i class="fa-solid fa-hand-holding-dollar" style="color: #4ade80;"></i>
                                <span style="font-size: 0.8em; font-weight: bold; color: #4ade80;">Vuelto entregado: S/ ${parseFloat(o.vuelto).toFixed(2)}</span>
                            </div>` : ''}
                            <div style="flex: 1; min-width: 0;">
                                ${o.fechaHoraReal ? `<div style="font-size: 1.1em; color: #4ADE80; margin-top: 10px; font-weight: 900; display: flex; align-items: center; justify-content: center; gap: 8px; background: rgba(74, 222, 128, 0.15); padding: 4px 10px; border-radius: 8px; border: 2px solid rgba(74, 222, 128, 0.4); box-shadow: 0 0 10px rgba(74, 222, 128, 0.2); width: 100%; box-sizing: border-box;"><i class="fa-solid fa-flag-checkered"></i> Entregado: ${(() => {
                        try {
                            const d = new Date(o.fechaHoraReal);
                            if (isNaN(d.getTime())) return String(o.fechaHoraReal).split(' ').pop();
                            return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
                        } catch (e) { return 'OK'; }
                    })()}
                     <span style="font-size: 0.85em; margin-left:8px; opacity:0.9; font-weight: 700;">
                        <i class="fa-solid fa-clock"></i> ${timeInfo.text}
                     </span>
                 </div>` : ''}
                                ${((o.estado === 'Validado' || o.estado === 'Cancelado' || o.estado === 'Rechazado') && (!o.viaje_id || String(o.viaje_id).trim() === "" || String(o.viaje_id).trim() === "null" || String(o.viaje_id).trim() === "undefined")) ? `
                                <div style="margin-top: 8px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 8px;">
                                    <button onclick="liquidarViajeDefinitivo('${mKey}', '${o.nro}')" style="width:100%; background: #10b981; color: white; border: none; padding: 6px; border-radius: 6px; font-size: 0.8em; font-weight: 800; cursor: pointer;">
                                        <i class="fa-solid fa-dollar-sign"></i> Liquidar Individual
                                    </button>
                                </div>` : ''}
                            </div>
                            ${assignmentHtml}
                        </div>
                    </div>`;
            }).join('');

            const extraClasses = data.isUnassigned ? 'box-unassigned' : '';

            groupHtml += `
                <div class="motorizado-columna ${extraClasses}" draggable="true" style="flex: 0 0 auto; min-width: 360px; max-width: 420px; background: ${customBgStr}; border: ${customBorderStr}; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; cursor: grab;" data-driver-container="${mKey}" data-driver-key="${mKey}">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); width: 100%;">
                        <div style="display:flex; align-items:center;">
                            <div style="position: relative; width: 36px; height: 36px; border-radius: 50%; background: ${data.isUnassigned || isCanceledBox ? 'rgba(248, 113, 113, 0.2)' : 'rgba(255,255,255,0.1)'}; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
                                 ${data.isUnassigned ? '<i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i>' : (isCanceledBox ? '<i class="fa-solid fa-ban" style="color:#ef4444;"></i>' : '<i class="fa-solid fa-helmet-safety" style="color:#d1d5db;"></i>')}
                                 ${(() => {
                    if (data.isUnassigned || isCanceledBox) return '';
                    const stats = getDriverStatusDetailed(data.orders);
                    let dotColor = '#94a3b8'; if (stats.enRuta) dotColor = '#ef4444'; else if (stats.llegaron) dotColor = '#10b981';
                    return `<span style="position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; background: ${dotColor}; border: 2px solid #1e1b4b;"></span>`;
                })()}
                            </div>
                            <div>
                                <h3 style="color: ${boxTitleColor}; margin: 0; font-size: 1.1em; font-weight: bold; line-height: 1.2;">${data.name} ${data.tripId ? `<span style="font-size:0.75em; opacity:0.5; font-weight:400;">(#${data.tripId.slice(-4)})</span>` : ''}</h3>
                                 <div style="font-size: 0.75em; color: rgba(255,255,255,0.5); margin-top: 4px;"><strong>${data.orders.length}</strong> pedidos</div>
                            </div>
                        </div>
                        ${headerExtra}
                        ${(() => {
                    if (isCanceledBox || data.isUnassigned || data.orders.length === 0) return '';
                    const stats = getDriverStatusDetailed(data.orders);

                    // --- AUTOMATIZACION DE ID (Basada solo en Horas) ---
                    if (stats.llegaron && !data.tripId) {
                        console.log(`[AutoID] Generando ID para ${data.name}...`);
                        setTimeout(() => window.agruparTodoPendiente(mKey, true), 100);
                        return `<div style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 5px 10px; border-radius: 6px; font-size: 0.75em; font-weight: 900;"><i class="fa-solid fa-spinner fa-spin"></i> GENERANDO ID...</div>`;
                    }

                    // --- DOBLE CANDADO: BOTON LIQUIDAR ---
                    if (stats.llegaron) {
                        if (stats.isLiquidable) {
                            return `<button onclick="liquidarViajeDefinitivo('${data.name.replace(/'/g, "\\'")}', null, '${data.tripId || ''}')" style="background: #10b981; color: white; border: none; padding: 6px 14px; border-radius: 8px; font-size: 0.85em; font-weight: 800; cursor: pointer;"><i class="fa-solid fa-dollar-sign"></i> Liquidar</button>`;
                        } else {
                            return `<div style="background: rgba(252, 211, 77, 0.2); color: #fcd34d; padding: 5px 10px; border-radius: 6px; font-size: 0.75em; font-weight: 900;"><i class="fa-solid fa-lock"></i> Por Validar</div>`;
                        }
                    } else {
                        return `<div style="background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 5px 10px; border-radius: 6px; font-size: 0.75em; font-weight: 900;"><i class="fa-solid fa-motorcycle"></i> RUTA</div>`;
                    }
                })()}
                    </div>
                    <div class="motorizado-dropzone driver-order-list custom-scrollbar" style="flex: 1; overflow-y: auto; padding: 8px; min-height: 200px;" id="dropzone-${mKey}" data-driver-name="${mKey}" data-driver-display-name="${data.name.replace(/'/g, "\\'")}" data-trip-id="${data.tripId || ''}">
                        ${ordersHtml}
                    </div>
                </div>`;
        });

        groupHtml += `</div></div>`;
        return groupHtml;
    };

    let htmlBody = renderGroup(enRutaKeys, 'En Ruta', 'fa-motorcycle', '#ef4444');
    htmlBody += renderGroup(llegaronKeys, 'Entregaron (Listos para Liquidar)', 'fa-circle-check', '#10b981');
    container.innerHTML = htmlBody;
}

function renderViajesSection(tripOrders, container) {
    if (!container) return;
    console.log("[Viajes] Rendering section with orders:", tripOrders.length);

    try {
        // 1. Agrupar por viaje_id primero
        const tripsMap = {};
        tripOrders.forEach(o => {
            if (!o.viaje_id) return;
            const vId = String(o.viaje_id).trim();
            if (!tripsMap[vId]) {
                tripsMap[vId] = {
                    id: vId,
                    driver: vId === 'CANCELADOS_ARCHIVADOS' ? '___CANCELADOS_ARCHIVADOS___' : (o.envio || 'Desconocido').trim().toUpperCase(),
                    originalDriverName: vId === 'CANCELADOS_ARCHIVADOS' ? '___CANCELADOS_ARCHIVADOS___' : (o.envio || 'Desconocido'),
                    orders: [],
                    tripPayout: 0
                };
            }
            tripsMap[vId].orders.push(o);
        });

        // 2. Agrupar viajes por Repartidor y calcular totales
        const driversMap = {};
        Object.values(tripsMap).forEach(trip => {
            const dName = trip.driver;
            if (!driversMap[dName]) {
                driversMap[dName] = {
                    name: trip.originalDriverName || 'Desconocido',
                    trips: [],
                    driverTotal: 0,
                    latestTripId: 0
                };
            }

            // Calcular pago del viaje
            trip.orders.sort((a, b) => (Number(a.nro) || 0) - (Number(b.nro) || 0));
            let tripTotal = 0;
            trip.orders.forEach((o, idx) => {
                tripTotal += calculateOrderPayment(o, idx + 1);
            });
            trip.tripPayout = tripTotal;

            driversMap[dName].trips.push(trip);
            driversMap[dName].driverTotal += tripTotal;

            let tId = 0;
            if (trip.id && !isNaN(trip.id)) {
                tId = parseInt(trip.id);
            }
            if (tId > driversMap[dName].latestTripId) {
                driversMap[dName].latestTripId = tId;
            }
        });

        // 3. Ordenar repartidores por su viaje más reciente
        const sortedDrivers = Object.values(driversMap).sort((a, b) => (b.latestTripId || 0) - (a.latestTripId || 0));

        if (sortedDrivers.length === 0) {
            container.innerHTML = `<div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: rgba(255,255,255,0.2); border: 2px dashed rgba(255,255,255,0.05); border-radius: 20px;">
                <i class="fa-solid fa-route" style="font-size: 3em; margin-bottom: 15px; display: block;"></i>
                No hay viajes registrados para la fecha seleccionada.
            </div>`;
            return;
        }

        // --- CALCULOS GLOBALES ---
        let globalTrips = Object.values(tripsMap).filter(t => t.id !== 'CANCELADOS_ARCHIVADOS').length;
        let globalOrders = 0;
        let globalValidado = 0;
        let globalCancelado = 0; // Suma de todos los cancelados/rechazados
        let globalMoney = 0;
        let globalSubtotal = 0;

        sortedDrivers.forEach(d => {
            // El usuario quiere que TODOS (incluyendo archivados) sumen al resumen
            d.trips.forEach(t => {
                t.orders.forEach(o => {
                    const st = (o.estado || "").toUpperCase();
                    globalSubtotal += (parseFloat(o.monto) || 0);

                    if (st === 'VALIDADO') {
                        globalValidado++;
                        globalOrders++;
                    } else if (st.includes('CANCELADO') || st.includes('RECHAZADO')) {
                        globalCancelado++;
                        globalOrders++;
                    } else if (st !== "") {
                        globalOrders++;
                    }
                    globalMoney += calculateOrderPayment(o, 1);
                });
            });
        });

        let html = `
        <div style="grid-column: 1 / -1; margin-bottom: 25px; padding: 20px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 15px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px;">
            <div style="display: flex; align-items: center; gap: 15px;">
                <div style="width: 50px; height: 50px; border-radius: 12px; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.5em; color: white;">
                    <i class="fa-solid fa-chart-line"></i>
                </div>
                <div>
                    <h2 style="margin: 0; font-size: 1.4em; font-weight: 800;">RESUMEN DE VIAJES</h2>
                    <p style="margin: 0; font-size: 0.85em; color: rgba(255,255,255,0.5);">${globalTrips} Viajes activos hoy</p>
                </div>
            </div>
            <div style="display: flex; gap: 25px; align-items: center; flex-wrap: wrap;">
                <div style="text-align: center; padding: 0 15px; border-right: 1px solid rgba(255,255,255,0.1);">
                    <span style="font-size: 0.7em; color: rgba(255,255,255,0.4); display: block; text-transform: uppercase;">Pedidos</span>
                    <strong style="font-size: 1.25em; color: #ffffff;">${globalOrders}</strong>
                </div>
                <div style="text-align: center; padding: 0 15px; border-right: 1px solid rgba(255,255,255,0.1);">
                    <span style="font-size: 0.7em; color: rgba(255,255,255,0.4); display: block; text-transform: uppercase;">Validados</span>
                    <strong style="font-size: 1.25em; color: #4ade80;">${globalValidado}</strong>
                </div>
                <div style="text-align: center; padding: 0 15px; border-right: 1px solid rgba(255,255,255,0.1);">
                    <span style="font-size: 0.7em; color: rgba(255,255,255,0.4); display: block; text-transform: uppercase;">Cancelados</span>
                    <strong style="font-size: 1.25em; color: #f87171;">${globalCancelado}</strong>
                </div>
                <div style="text-align: center; padding: 0 15px; border-right: 1px solid rgba(255,255,255,0.1);">
                    <span style="font-size: 0.7em; color: rgba(255,255,255,0.4); display: block; text-transform: uppercase;">Subtotal (Ventas)</span>
                    <strong style="font-size: 1.25em; color: #fcd34d;">S/ ${globalSubtotal.toFixed(2)}</strong>
                </div>
                <div style="text-align: right; margin-left:10px;">
                    <span style="font-size: 0.75em; color: rgba(255,255,255,0.4); display: block; text-transform: uppercase;">Total Liquidación</span>
                    <strong style="font-size: 1.6em; color: #4ade80; font-family: monospace;">S/ ${globalMoney.toFixed(2)}</strong>
                </div>
            </div>
        </div>`;

        sortedDrivers.forEach(driver => {
            let countValidado = 0;
            let countActivo = 0;
            let countCancelado = 0;

            driver.trips.forEach(t => {
                t.orders.forEach(o => {
                    const st = (o.estado || "").toUpperCase();
                    if (st === 'VALIDADO') {
                        countValidado++;
                    } else if (st === 'CANCELADO' || st === 'RECHAZADO') {
                        countCancelado++;
                    } else if (st !== "") {
                        countActivo++;
                    }
                });
            });

            // Estilo especial si es el grupo archivado
            const isArchived = driver.name === '___CANCELADOS_ARCHIVADOS___';
            const displayName = isArchived ? 'Historial de Cancelados Archivados' : driver.name;
            const headerBg = isArchived ? '#ef444422' : '#1e293b';
            const borderLeft = isArchived ? '4px solid #ef4444' : '4px solid #60a5fa';
            const iconColor = isArchived ? '#ef4444' : '#60a5fa';
            const iconClass = isArchived ? 'fa-box-archive' : 'fa-user-tag';

            html += `
            <div class="driver-trip-group" style="margin-bottom: 30px; grid-column: 1 / -1;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px; padding: 12px 20px; background: ${headerBg}; border-left: ${borderLeft}; border-radius: 8px;">
                    <div style="display:flex; flex-direction:column; gap:4px;">
                        <h3 style="margin:0; font-size:1.25em; font-weight:700; color:#fff; display:flex; align-items:center; gap:10px;">
                            <i class="fa-solid ${iconClass}" style="color:${iconColor};"></i> ${displayName}
                        </h3>
                        <div style="display:flex; gap:12px; font-size:0.75em; color:rgba(255,255,255,0.5);">
                            ${countValidado > 0 ? `<span><i class="fa-solid fa-circle-check" style="color:#4ade80;"></i> ${countValidado} Validados</span>` : ''}
                            ${countActivo > 0 ? `<span><i class="fa-solid fa-circle-info" style="color:#3B82F6;"></i> ${countActivo} Activos</span>` : ''}
                            ${countCancelado > 0 ? `<span><i class="fa-solid fa-circle-xmark" style="color:#f87171;"></i> ${countCancelado} Cancelados</span>` : ''}
                        </div>
                    </div>
                    ${isArchived ? '' : `
                    <div style="text-align:right; display:flex; gap:12px; align-items:center;">
                         <div style="background: rgba(0,0,0,0.3); padding: 4px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                            <span style="font-size:0.7em; color:rgba(255,255,255,0.5); display:block; text-align:left; margin-bottom: -2px;">TOTAL COMISIÓN ACUMULADA</span>
                            <strong style="font-size:1.4em; color:#4ade80;">S/ ${driver.driverTotal.toFixed(2)}</strong>
                         </div>
                    </div>`}
                </div>
                ${isArchived ? `
                <div style="display: flex; flex-wrap: wrap; gap: 10px; padding: 15px; background: rgba(0,0,0,0.15); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.05);">
                    ${driver.trips.flatMap(t => t.orders).map(o => {
                const motivo = (o.motivo_cancelacion || 'S/E').toUpperCase();
                return `
                        <div class="archived-order-item" style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.15); padding: 8px 14px; border-radius: 8px; display: flex; align-items: center; gap: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                            <strong style="color: #ef4444; font-size: 0.95em; font-family: monospace;">${o.llave || o.nro}</strong>
                            <div style="width:1px; height:12px; background:rgba(255,255,255,0.1);"></div>
                            <span style="color: rgba(255,255,255,0.4); font-size: 0.65em; font-weight: 800; letter-spacing: 0.5px;">CANCELADO POR ${motivo}</span>
                        </div>`;
            }).join('')}
                </div>` : `
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 16px;">
                    ${driver.trips.map(trip => {
                let ordersHtml = trip.orders.map((o, index) => {
                    const payment = calculateOrderPayment(o, index + 1);
                    let st = (o.estado || "").toUpperCase();
                    let sColor = '#94a3b8'; let sIcon = 'fa-clock';
                    if (st === 'VALIDADO') { sColor = '#4ADE80'; sIcon = 'fa-check-circle'; }
                    else if (st.includes('CANCELADO')) { sColor = '#F87171'; sIcon = 'fa-ban'; }
                    else if (st === 'EN CAMINO') { sColor = '#FFFFFF'; sIcon = 'fa-motorcycle'; }
                    let mColor = '#4ADE80';
                    let vueltoHtml = '';
                    const isContado = (o.pago || '').toUpperCase().includes('CONTADO') || (o.tipo_pago || '').toUpperCase().includes('CONTADO');
                    if (isContado && o.vuelto && parseFloat(o.vuelto) > 0) {
                        vueltoHtml = `<div style="font-size: 0.8em; color: #fcd34d; font-weight: 600; text-align: right;"><i class="fa-solid fa-hand-holding-dollar"></i> Vuelto S/ ${parseFloat(o.vuelto).toFixed(2)}</div>`;
                    }

                    return `<div class="trip-order-item" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px; margin-bottom: 8px;">
                                <div style="display:flex; justify-content:space-between; align-items: flex-start;">
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <span style="font-size:0.7em; color:${sColor}; border:1px solid ${sColor}44; padding:2px 6px; border-radius:4px; font-weight:800;">
                                            <i class="fa-solid ${sIcon}"></i> ${o.estado}
                                        </span>
                                        <strong style="color:#fff;">${o.llave || o.nro}</strong>
                                    </div>
                                    <div style="display: flex; flex-direction: column; align-items: flex-end;">
                                        <div style="color:rgba(255,255,255,0.5); font-size:0.9em; font-weight: 600;">
                                            Pago: S/ ${payment.toFixed(2)}
                                        </div>
                                        ${vueltoHtml}
                                    </div>
                                </div>
                            </div>`;
                }).join('');

                const isInvalidId = isNaN(parseInt(trip.id));
                const tripTitle = isInvalidId ? "Viaje Manual" : `Viaje #${String(trip.id).slice(-4)}`;

                const isTripFinished = trip.orders.every(o =>
                    (o.fechaHoraReal && String(o.fechaHoraReal).trim() !== "" && String(o.fechaHoraReal).trim() !== "---")
                );

                const statusColor = isTripFinished ? '#10b981' : '#ef4444'; // Verde vs Rojo
                const statusLabel = isTripFinished ? 'LIQUIDADO' : 'EN RUTA';

                return `<div class="trip-card" style="border-top: 4px solid ${statusColor}; border-radius: 12px; background: rgba(30, 41, 59, 0.7); box-shadow: 0 4px 20px rgba(0,0,0,0.2); transition: all 0.3s; position: relative; overflow: hidden;">
                            <div class="trip-header" style="padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                                <div style="display: flex; flex-direction: column; gap: 2px;">
                                    <h3 style="margin:0; color:#fff; font-size:1em; font-weight: 800;">${tripTitle}</h3>
                                    <span style="font-size: 0.7em; color: ${statusColor}; font-weight: 900; letter-spacing: 0.5px;">
                                        <i class="fa-solid ${isTripFinished ? 'fa-circle-check' : 'fa-truck-fast'}"></i> ${statusLabel}
                                    </span>
                                </div>
                                <div style="text-align: right;">
                                    <strong style="color:#4ade80; display: block; font-size: 1.1em;">S/ ${trip.tripPayout.toFixed(2)}</strong>
                                </div>
                            </div>
                            <div style="padding: 15px; display:flex; flex-direction:column; gap:8px;">
                                ${ordersHtml}
                            </div>
                            </div>`;
            }).join('')}
                </div>`}
            </div>`;
        });

        container.innerHTML = html;
    } catch (err) {
        console.error("[Viajes] Error fatal en renderViajesSection:", err);
        container.innerHTML = `<div style="color:#f87171; padding:20px; background:rgba(248,113,113,0.1); border-radius:10px;">Error al cargar viajes: ${err.message}</div>`;
    }
}

function calculateOrderPayment(order, position) {
    if (order.estado === 'Cancelado' || order.estado === 'Rechazado') {
        const motivo = (order.motivo_cancelacion || "").toLowerCase();
        // Solo pagamos si es cancelación por REPARTIDOR (5.00). 
        // Consumidor y Punto de Venta = 0.00
        if (motivo.includes('consumidor') || motivo.includes('venta')) {
            return 0.00;
        }
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

window.cerrarTodosLosViajesGlobal = async function () {
    const containers = Array.from(document.querySelectorAll('.driver-order-list'));
    const driversToClose = [];

    containers.forEach(container => {
        const driverKey = container.getAttribute('data-driver-name');
        if (driverKey && !driverKey.includes('SIN_ASIGNAR') && !driverKey.includes('CANCELADOS')) {
            const cards = Array.from(container.querySelectorAll('.motorizado-order-card'));
            if (cards.length > 0) {
                // Solo cerramos si TODOS los pedidos de este repartidor están validados
                const allValidated = cards.every(c => c.getAttribute('data-estado') === 'Validado');
                if (allValidated) {
                    const nros = cards.map(c => Number(c.getAttribute('data-nro')));
                    driversToClose.push({ driverKey, nros });
                }
            }
        }
    });

    if (driversToClose.length === 0) {
        Swal.fire('Atención', 'No hay pedidos activos en ningún repartidor para cerrar.', 'info');
        return;
    }

    const { isConfirmed } = await Swal.fire({
        title: '¿Cerrar Todos los Viajes?',
        text: `Se crearán viajes definitivos para ${driversToClose.length} repartidores listos(${driversToClose.reduce((acc, d) => acc + d.nros.length, 0)} pedidos validados en total).`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, Cerrar Todo',
        cancelButtonText: 'Cancelar'
    });

    if (isConfirmed) {
        Swal.fire({
            title: 'Procesando Cierre Global...',
            html: 'Enviando órdenes al servidor, por favor espera.',
            didOpen: () => Swal.showLoading(),
            allowOutsideClick: false
        });

        let successCount = 0;
        let failCount = 0;

        // Ejecutamos en serie para no saturar el servidor y asegurar orden
        for (const driver of driversToClose) {
            try {
                const tripId = Date.now().toString() + "_" + Math.floor(Math.random() * 1000);
                const response = await fetchAPI('asignarViajePedido', {
                    nros: driver.nros,
                    viajeId: tripId
                });

                if (response.success) {
                    successCount++;
                    // Actualizar localmente
                    if (typeof orders !== 'undefined') {
                        driver.nros.forEach(n => {
                            const idx = orders.findIndex(x => x.nro == n);
                            if (idx !== -1) orders[idx].viaje_id = tripId;
                        });
                    }
                } else {
                    failCount++;
                }
            } catch (e) {
                console.error(`Error cerrando global para ${driver.driverKey}: `, e);
                failCount++;
            }
        }

        if (failCount === 0) {
            Swal.fire('¡Cierre Exitoso!', `${successCount} viajes fueron creados y movidos a la sección de Viajes.`, 'success');
        } else {
            Swal.fire('Cierre Parcial', `${successCount} viajes exitosos, ${failCount} fallidos.Revisa el monitor.`, 'warning');
        }

        renderMapaMotorizados();
        if (typeof loadOrdersSilent === 'function') loadOrdersSilent();
    }
};

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

    // --- VALIDACIÓN DE VIAJE ACTIVO (OPCIONAL) ---
    const stats = getDriverStatusDetailed(driverKey);
    if (stats.enRuta || stats.llegaron) {
        console.log("[Monitor] Viaje activo detectado para", driverKey, "- El usuario decidirá cuándo cerrar.");
    }

    // Preparar el HTML para las casillas de verificación
    let htmlContent = `< div style = "text-align: left; max-height: 350px; overflow-y: auto; padding-right: 10px; font-family: 'Inter', sans-serif;" >
        <p style="margin-bottom: 20px; font-size: 0.95em; color: #475569; line-height: 1.5;">Selecciona los pedidos a incluir en el viaje. Desmarca los pedidos 'Pendientes' si deseas dejarlos para después.</p>`;

    cards.forEach(c => {
        const nro = c.getAttribute('data-nro');
        // Buscar info del pedido
        const o = orders.find(x => x.nro == nro);
        if (!o) return;

        let labelColor = '#1e293b';
        let badgeHtml = '';
        if (o.estado === 'Pendiente') {
            badgeHtml = `< span style = "font-size:0.75em; background:#f59e0b; color:#fff; padding:3px 10px; border-radius:20px; font-weight:800; margin-left:8px; box-shadow: 0 2px 4px rgba(245,158,11,0.2);" > Pendiente</span > `;
        } else if (o.estado === 'Validado') {
            badgeHtml = `< span style = "font-size:0.75em; background:#10b981; color:#fff; padding:3px 10px; border-radius:20px; font-weight:800; margin-left:8px; box-shadow: 0 2px 4px rgba(16,185,129,0.2);" > Validado</span > `;
        } else if (o.estado === 'Por Validar') {
            badgeHtml = `< span style = "font-size:0.75em; background:#3b82f6; color:#fff; padding:3px 10px; border-radius:20px; font-weight:800; margin-left:8px; box-shadow: 0 2px 4px rgba(59,130,246,0.2);" > Por Validar</span > `;
        }

        htmlContent += `
        < label style = "display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border: 1.5px solid #e2e8f0; border-radius: 12px; margin-bottom: 10px; cursor: pointer; background: #f8fafc; transition: all 0.2s ease;" >
            <div style="display: flex; align-items: center; gap: 12px;">
                <input type="checkbox" checked value="${nro}" class="trip-order-checkbox" style="width: 20px; height: 20px; cursor: pointer; accent-color: #6366f1;">
                    <span style="color: ${labelColor}; font-weight: 700; font-size: 1.05em;">${o.llave || '#' + o.nro}</span>
            </div>
            ${badgeHtml}
        </label > `;
    });
    htmlContent += `</div > `;

    const result = await Swal.fire({
        title: `Armando Viaje: ${driverKey} `,
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
        await crearViajeConPedidos(result.value);
        const mKey = driverKey.toUpperCase();
        if (driverSortState[mKey]) delete driverSortState[mKey];
    }
}

window.agruparTodoPendiente = async function (driverKey, isSilent = false) {
    const dUpper = (driverKey || "").trim().toUpperCase();
    if (!dUpper || typeof orders === 'undefined') return;

    // Solo agrupar pedidos que NO tengan viaje_id asignado (los de la caja superior)
    const pendingOrders = orders.filter(o =>
        (o.envio || "").trim().toUpperCase() === dUpper &&
        (!o.viaje_id || String(o.viaje_id).trim() === "" || String(o.viaje_id).trim() === "null" || String(o.viaje_id).trim() === "undefined")
    );

    if (pendingOrders.length === 0) {
        if (!isSilent) Swal.fire('Atención', 'No hay pedidos nuevos para agrupar en esta sección.', 'info');
        return;
    }

    if (!isSilent) {
        Swal.fire({
            title: 'Agrupando pedidos...',
            text: 'Generando grupo de entrega temporal',
            didOpen: () => Swal.showLoading(),
            allowOutsideClick: false
        });
    }

    try {
        const response = await fetchAPI('crearViajeAutomatico', { nro: pendingOrders[0].nro });
        if (response.success) {
            Swal.fire({ icon: 'success', title: 'Agrupado con éxito', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
            if (typeof loadOrders === 'function') await loadOrders();
            renderMapaMotorizados();
        } else {
            Swal.fire('Error', response.message, 'error');
        }
    } catch (e) {
        console.error(e);
    }
}

// Función de autogrupado eliminada por requerimiento de v5.1

window.liquidarViajeDefinitivo = async function (driverKey, specificOrderNro = null, targetTripId = null) {
    const dUpper = (driverKey || "").trim().toUpperCase();
    if (!dUpper || typeof orders === 'undefined') return;

    // ... Detectar Fecha del Monitor (Igual que en renderMapa) ...
    const filterEl = document.getElementById('mapa-date-filter');
    let targetDate = filterEl ? filterEl.value : "";
    if (!targetDate) {
        const now = new Date();
        targetDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    }

    const getOrderDateLima = (dateStr) => {
        try {
            return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(dateStr));
        } catch (e) { return ""; }
    };

    // --- Lógica de Selección Inteligente ---
    // Liquidar SOLO lo que ya está terminado (Verde/Validado/Cancelado) en la caja de este repartidor para hoy
    let targetOrders = orders.filter(o => {
        const isSameDate = getOrderDateLima(o.fecha) === targetDate;
        const matchDriver = (o.envio || "").trim().toUpperCase() === dUpper;
        const vId = String(o.viaje_id || "").trim();

        // Si se especificó un viaje, los pedidos deben pertenecer a ese viaje
        const matchTrip = targetTripId ? (vId === String(targetTripId).trim()) : true;

        // Si se especificó un pedido ÚNICO, ignorar el resto
        const matchSpecificOrder = specificOrderNro ? (String(o.nro) === String(specificOrderNro)) : true;

        const isDefinitive = vId !== "" && vId !== "null" && vId !== "undefined" && !vId.includes("AUTO_") && !targetTripId && !specificOrderNro;

        // "Está Terminado" (Verde/Rojo Final): Robot detectó entrega o Administrador ya validó/canceló
        const isFinished = (o.tiempo_entrega && o.tiempo_entrega !== "" && o.tiempo_entrega !== "---") ||
            ['Validado', 'Cancelado', 'Rechazado'].includes(o.estado);

        return isSameDate && matchDriver && matchTrip && matchSpecificOrder && !isDefinitive && isFinished;
    });

    if (targetOrders.length === 0) {
        Swal.fire('Atención', 'No hay pedidos pendientes para liquidar para este repartidor.', 'info');
        return;
    }

    const result = await Swal.fire({
        title: '¿Confirmar Liquidación?',
        text: `Se liquidarán ${targetOrders.length} pedido(s) de ${driverKey}.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, Liquidar y Archivar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        Swal.fire({
            title: 'Procesando Liquidación...',
            text: 'Generando ID definitivo y archivando en el historial',
            didOpen: () => Swal.showLoading(),
            allowOutsideClick: false
        });

        try {
            const nros = targetOrders.map(o => Number(o.nro));
            console.log("[Liquidación] Nros a procesar:", nros);

            // Generar ID DEFINITIVO (177 + timestamp)
            const definitiveId = "177" + Date.now().toString().substring(3);
            console.log("[Liquidación] Generando ID Definitivo:", definitiveId);

            // Usamos asignarViajePedido para forzar nuestro propio ID
            const response = await fetchAPI('asignarViajePedido', {
                nros: nros,
                viajeId: definitiveId
            });

            if (response.success) {
                console.log("[Liquidación] Éxito en Backend. ID:", definitiveId);

                // 1. Forzar actualización local INMEDIATA
                targetOrders.forEach(to => {
                    to.viaje_id = definitiveId;
                });

                // 2. Renderizar AL INSTANTE
                renderMapaMotorizados();

                Swal.fire({
                    icon: 'success',
                    title: 'Liquidación Definitiva',
                    text: `Se han movido ${targetOrders.length} pedido(s) al historial con ID ${definitiveId.slice(-6)}.`,
                    timer: 2000
                });

                // 3. Recarga real DIFERIDA (para dejar que Sheets termine de escribir)
                setTimeout(async () => {
                    console.log("[Liquidación] Ejecutando recarga de seguridad de datos...");
                    if (typeof loadOrders === 'function') await loadOrders();
                    renderMapaMotorizados();
                }, 4000);

            } else {
                Swal.fire('Error', response.message || 'No se pudo liquidar', 'error');
            }
        } catch (e) {
            console.error("[Liquidación] Error fatal:", e);
            Swal.fire('Error', 'Error de red al liquidar: ' + e.message, 'error');
        }
    }
}

async function autoCerrarViajeSilent(driverKey) {
    const listContainer = Array.from(document.querySelectorAll('.driver-order-list'))
        .find(el => el.getAttribute('data-driver-name') === driverKey);
    if (!listContainer) return;

    const cards = Array.from(listContainer.querySelectorAll('.motorizado-order-card'));
    const nros = cards.map(c => Number(c.getAttribute('data-nro')));
    if (nros.length === 0) return;

    try {
        await fetchAPI('crearViajeAutomatico', { nro: nros[0] });
    } catch (e) {
        console.error("Error silent close:", e);
    }
}

function getDriverStatusDetailed(driverOrders) {
    if (!driverOrders || !Array.isArray(driverOrders) || driverOrders.length === 0) return { enRuta: false, llegaron: false, isLiquidable: false };

    // 1. Un repartidor está "ENTREGARON" (VERDE) SOLO si TODOS sus pedidos tienen Hora de Entrega (Columna Y)
    const allHaveTime = driverOrders.every(o =>
        (o.fechaHoraReal && String(o.fechaHoraReal).trim() !== "" && String(o.fechaHoraReal).trim() !== "---")
    );

    // 2. Se puede "LIQUIDAR" (BOTON) SOLO si está terminado Y TODO está Validado o Cancelado
    const allValidatedOrCanceled = driverOrders.every(o =>
        (o.estado === 'Validado' || o.estado === 'Cancelado' || o.estado === 'Rechazado')
    );

    return {
        enRuta: !allHaveTime,
        llegaron: allHaveTime,
        isLiquidable: allHaveTime && allValidatedOrCanceled
    };
}

// Handler for manual reordering of the Boxes themselves
function initBoxDragAndDrop() {
    const containers = document.querySelectorAll('.monitor-group-container');

    containers.forEach(container => {
        const columns = container.querySelectorAll('.motorizado-columna');

        columns.forEach(col => {
            col.addEventListener('dragstart', (e) => {
                // Si el drag proviene de una tarjeta de pedido o un elemento interno que no sea el header de la columna, ignoramos
                // o si estamos arrastrando un motorizado-order-card, priorizamos eso.
                if (document.querySelector('.dragging')) return;

                e.stopPropagation();
                e.target.classList.add('dragging-box');
                e.dataTransfer.setData('text/plain', e.target.getAttribute('data-driver-key'));
            });

            col.addEventListener('dragend', (e) => {
                e.target.classList.remove('dragging-box');
            });
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingBox = document.querySelector('.dragging-box');
            if (!draggingBox) return;

            const afterElement = getDragAfterElementHorizontal(container, e.clientX, e.clientY);
            if (afterElement == null) {
                container.appendChild(draggingBox);
            } else {
                container.insertBefore(draggingBox, afterElement);
            }
        });

        container.addEventListener('drop', (e) => {
            e.preventDefault();
            const draggingBox = document.querySelector('.dragging-box');
            if (!draggingBox) return;

            // Al soltar, guardamos el nuevo orden de las llaves
            const allBoxes = Array.from(container.querySelectorAll('.motorizado-columna'));
            const newOrder = allBoxes.map(b => b.getAttribute('data-driver-key')).filter(k => k);

            if (newOrder.length > 0) {
                // Actualizamos el estado global de orden de cajas
                // Nota: Mantenemos las llaves que no están en este grupo pero están en boxSortState
                const otherKeys = boxSortState.filter(k => !newOrder.includes(k));
                boxSortState = [...newOrder, ...otherKeys];

                localStorage.setItem(BOX_SORT_STATE_KEY, JSON.stringify(boxSortState));
                console.log("Nuevo orden de cajas guardado:", boxSortState);
                // No llamamos a renderMapaMotorizados() inmediatamente para evitar parpadeo si no es necesario,
                // pero como el orden visual ya cambió por el insertBefore, solo guardamos.
                // Sin embargo, para asegurar consistencia en el estado global (como el sorting de motorizadosMap), lo llamamos.
                renderMapaMotorizados();
            }
        });
    });
}

// Helper to find position during drag (Horizontal & Vertical support for Wrap)
function getDragAfterElementHorizontal(container, x, y) {
    const draggableElements = [...container.querySelectorAll('.motorizado-columna:not(.dragging-box)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();

        // En un layout wrap, comparamos primero si estamos en la misma fila (aproximadamente)
        // O simplemente usamos la distancia al centro de la caja.
        const centerX = box.left + box.width / 2;
        const centerY = box.top + box.height / 2;

        // Distancia euclidiana simple al centro de la caja para manejar el wrap de forma intuitiva
        const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));

        if (distance < closest.distance) {
            return { distance: distance, element: child };
        } else {
            return closest;
        }
    }, { distance: Number.POSITIVE_INFINITY }).element;
}

// Handler for manual up/down arrows
window.moveMotorizadoOrder = function (driverKey, orderNro, direction) {
    if (!driverSortState[driverKey]) {
        // Initialize state based on current DOM order if not set
        const listContainer = document.querySelector(`.driver - order - list[data - driver="${driverKey}"]`);
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
            window.isDraggingOrder = true; // Bloquear actualizaciones del monitor
        });

        draggable.addEventListener('dragend', async () => {
            draggable.classList.remove('dragging');
            window.isDraggingOrder = false; // Liberar bloqueo
            if (draggable._preventDragEnd) {
                delete draggable._preventDragEnd;
                return;
            }

            const nro = draggable.getAttribute('data-nro');
            const targetList = draggable.closest('.driver-order-list');
            if (!targetList) return;

            const newDriverKey = targetList.getAttribute('data-driver-name'); // uppercase key
            const newDriverName = targetList.getAttribute('data-driver-display-name') || targetList.getAttribute('data-driver-name'); // original casing
            const targetTripId = targetList.getAttribute('data-trip-id');

            const isUnassignedTarget = newDriverKey === '___SIN_ASIGNAR___';
            const finalEnvioName = isUnassignedTarget ? "" : newDriverName;

            // --- REACCIÃ“N OPTIMISTA + PERSISTENCIA (v5.0) ---
            const oldDriverKey = draggable.getAttribute('data-driver');
            const orderObj = orders.find(x => x.nro == nro);
            const oldDriverName = orderObj ? orderObj.envio : "";
            const oldViajeId = orderObj ? orderObj.viaje_id : "";

            // 1. Registrar en Memoria de Persistencia (Para evitar el "regreso")
            window.pendingAssignments[nro] = {
                envio: finalEnvioName,
                viaje_id: (targetTripId && targetTripId !== "") ? targetTripId : (orderObj ? orderObj.viaje_id : ""),
                timestamp: Date.now()
            };

            // 2. Actualizar estado local INSTANTÃ NEO (para este renderizado)
            if (orderObj) orderObj.envio = finalEnvioName;

            // 3. Obtener nuevo orden de la lista destino para el sort
            const items = Array.from(targetList.querySelectorAll('.motorizado-order-card'));
            const newArr = items.map(el => el.getAttribute('data-nro'));
            driverSortState[newDriverKey] = newArr;

            // 4. Renderizado inmediato
            renderMapaMotorizados();

            // 5. Sincronización en segundo plano (v5.0 Fix Persistencia)
            if (targetTripId && targetTripId !== "") {
                try {
                    // Si el repartidor cambió, sincronizar nombre primero
                    if (finalEnvioName !== oldDriverName) {
                        await fetchAPI('asignarMotorizado', { nro: Number(nro), envio: finalEnvioName });
                    }
                    await crearViajeConPedidos([nro], targetTripId);

                    // Una vez confirmado, se puede limpiar después de unos segundos
                    setTimeout(() => {
                        delete window.pendingAssignments[nro];
                        renderMapaMotorizados();
                    }, 25000);
                } catch (e) {
                    console.error("Error fusionando viaje:", e);
                    delete window.pendingAssignments[nro];
                    if (orderObj) orderObj.envio = oldDriverName;
                    renderMapaMotorizados();
                }
            }
            else if (oldDriverKey !== newDriverKey) {
                try {
                    const response = await fetchAPI('asignarMotorizado', { nro: nro, envio: finalEnvioName });
                    if (!response.success) throw new Error(response.message);
                    syncRutaBackend(newDriverKey, newArr);
                    setTimeout(() => {
                        delete window.pendingAssignments[nro];
                        renderMapaMotorizados();
                    }, 25000);
                } catch (e) {
                    console.error("Error reasignando:", e);
                    delete window.pendingAssignments[nro];
                    if (orderObj) orderObj.envio = oldDriverName;
                    renderMapaMotorizados();
                    Swal.fire('Error', 'No se pudo sincronizar el cambio', 'error');
                }
            } else {
                syncRutaBackend(newDriverKey, newArr);
                setTimeout(() => {
                    delete window.pendingAssignments[nro];
                    renderMapaMotorizados();
                }, 25000);
            }
        });
    });

    containers.forEach(container => {
        container.addEventListener('dragover', e => {
            e.preventDefault();
            const draggingEl = document.querySelector('.motorizado-order-card.dragging');
            if (!draggingEl) return;

            const afterElement = getDragAfterElement(container, e.clientY);
            if (afterElement == null) {
                container.appendChild(draggingEl);
            } else {
                container.insertBefore(draggingEl, afterElement);
            }
        });

        container.addEventListener('dragenter', e => {
            e.preventDefault();
            container.classList.add('dragover');
        });

        container.addEventListener('dragleave', () => {
            container.classList.remove('dragover');
        });

        container.addEventListener('drop', () => {
            container.classList.remove('dragover');
        });
    });

    // UNASSIGN VIA DROP: SOLTAR FUERA DE LAS LISTAS (EN EL FONDO DEL MONITOR)
    const grid = document.getElementById('mapa-grid');
    if (grid) {
        grid.addEventListener('dragover', e => e.preventDefault());

        grid.addEventListener('dragenter', (e) => {
            if (!e.target.closest('.motorizado-dropzone')) {
                grid.classList.add('dragover-unassign');
            }
        });

        grid.addEventListener('dragleave', (e) => {
            if (!e.relatedTarget || !e.relatedTarget.closest('#mapa-grid')) {
                grid.classList.remove('dragover-unassign');
            }
        });

        grid.addEventListener('drop', async (e) => {
            grid.classList.remove('dragover-unassign');
            if (e.target.closest('.motorizado-dropzone')) return;

            const draggingEl = document.querySelector('.motorizado-order-card.dragging');
            if (!draggingEl) return;

            // PREVENIR QUE EL dragend DE initDragAndDrop ACTÃšE (No queremos que intente reasignar o fusionar viaje)
            draggingEl._preventDragEnd = true;

            const nro = draggingEl.getAttribute('data-nro');
            if (nro) {
                console.log("[Monitor] Pedido soltado fuera. Desasignando #", nro);
                await desasignarMotorizadoDesdeMapa(nro);
            }
        });
    }
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
            console.log(`Ruta guardada para: ${driverKey} `, response);
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
function calculateElapsedTimeForMap(fechaStr, horaTadaStr = null, endTimeStr = null, minsReales = null) {
    let result = { text: '-- min', color: 'rgba(255,255,255,0.5)', bg: 'transparent', minsValue: 0 };

    // SI HAY MINUTOS REALES (Columna Z), USARLOS DIRECTAMENTE (Prioridad Máxima según usuario)
    if (minsReales !== null && minsReales !== undefined && minsReales !== "" && minsReales !== "---") {
        const mins = Math.floor(parseFloat(minsReales));
        if (!isNaN(mins)) {
            result.minsValue = mins;
            // Formato solicitado: Xh Ym o X min
            result.text = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60} m` : `${mins} min`;

            // Mantener lógica de colores transaccional (v6.0)
            if (mins >= 30) {
                result.color = '#ef4444';
                result.bg = 'rgba(239, 68, 68, 0.15)';
            } else if (mins >= 20) {
                result.color = '#f97316';
                result.bg = 'rgba(249, 115, 22, 0.15)';
            } else {
                result.color = '#4ade80';
                result.bg = 'rgba(74, 222, 128, 0.1)';
            }
            return result;
        }
    }

    if (!fechaStr && !horaTadaStr) return result;

    try {
        let orderDate = null;

        // Si tenemos Hora TADA (ej: "10:20 p. m."), asumimos que es de HOY
        if (horaTadaStr && horaTadaStr !== "---") {
            try {
                const now = new Date();
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
                    year: 'numeric', month: 'numeric', day: 'numeric'
                });
                const parts = formatter.formatToParts(now);
                const getP = (type) => parseInt(parts.find(p => p.type === type).value, 10);

                orderDate = new Date(Date.UTC(getP('year'), getP('month') - 1, getP('day'), hours, minutes, 0));
            } catch (e) { console.error("Error parseando Hora TADA:", e); }
        }

        // Si no se pudo por Hora TADA o no habia, usar fechaStr original
        if (!orderDate && fechaStr) {
            const dOrig = new Date(fechaStr);
            if (!isNaN(dOrig.getTime())) {
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
        }

        if (orderDate && !isNaN(orderDate.getTime())) {
            const end = endTimeStr ? new Date(endTimeStr) : new Date();
            const now = isNaN(end.getTime()) ? new Date() : end;

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
            result.minsValue = mins;
            result.text = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60} m` : `${mins} min`;

            // LÃ³gica PWA: Verde < 20, Naranja 20-29, Rojo >= 30
            if (mins >= 30) {
                result.color = '#ef4444'; // Rojo (PWA)
                result.bg = 'rgba(239, 68, 68, 0.15)';
            } else if (mins >= 20) {
                result.color = '#f97316'; // Naranja (PWA)
                result.bg = 'rgba(249, 115, 22, 0.15)';
            } else {
                result.color = '#4ade80'; // Verde (PWA)
                result.bg = 'rgba(74, 222, 128, 0.1)';
            }
        }
    } catch (e) { }

    return result;
}

/**
 * LÃ³gica de AUTO-ARCHIVADO: 
 * Si un repartidor tiene pedidos en el Monitor (sin viaje_id) 
 * y el mÃ¡s antiguo ya cumpliÃ³ 20 min, se crea el viaje automÃ¡ticamente.
 */
async function checkAutoArchiveOrders() {
    if (typeof orders === 'undefined' || !orders || orders.length === 0) return;

    // 1. Agrupar pedidos activos por repartidor
    const driverActiveOrders = {};
    orders.forEach(o => {
        const vId = String(o.viaje_id || "").trim();
        const hasTrip = vId !== "" && vId !== "null" && vId !== "undefined";
        if (!hasTrip && o.envio && o.envio.trim() !== '') {
            const dKey = o.envio.trim().toUpperCase();
            if (!driverActiveOrders[dKey]) driverActiveOrders[dKey] = [];
            driverActiveOrders[dKey].push(o);
        }
    });

    // 2. Revisar cada repartidor
    for (const dKey in driverActiveOrders) {
        const driverOrders = driverActiveOrders[dKey];
        let oldestMins = 0;
        let referenceNro = null;

        driverOrders.forEach(o => {
            const timeInfo = calculateElapsedTimeForMap(o.fecha, o.hora_tada);
            if (timeInfo.minsValue > oldestMins) {
                oldestMins = timeInfo.minsValue;
                referenceNro = o.nro;
            }
        });

        // 3. Si el mÃ¡s antiguo >= 15 mins, auto-agrupar silenciadamente
        if (oldestMins >= 15 && referenceNro) {
            console.warn(`[Auto - Agrupar] Repartidor ${dKey} superÃ³ lÃmite de 15min(${oldestMins}m).Agrupando...`);
            try {
                const response = await fetchAPI('crearViajeAutomatico', { nro: referenceNro });
                if (response.success) {
                    console.log(`[Auto - Agrupar] ${dKey} agrupado con Ã©xito.`);
                    if (typeof loadOrdersSilent === 'function') await loadOrdersSilent();
                }
            } catch (e) {
                console.error(`[Auto - Agrupar] Error: `, e);
            }
        }
    }

    /*
        // 4. LÃ³gica de AUTO-LIQUIDACIÃ“N (AutomÃ¡tica si todo estÃ¡ validado/cancelado)
        await checkAutoLiquidation();
    */
}

/**
 * Revisa viajes existentes. Si todos sus pedidos estÃ¡n Validados o Cancelados, 
 * se liquida automÃ¡ticamente (archivado definitivo).
 */
async function checkAutoLiquidation() {
    if (typeof orders === 'undefined' || !orders) return;

    const trips = {};
    orders.forEach(o => {
        const vId = String(o.viaje_id || "").trim();
        if (vId !== "" && vId !== "null" && vId !== "undefined") {
            if (!trips[vId]) trips[vId] = { driver: o.envio, orders: [] };
            trips[vId].orders.push(o);
        }
    });

    for (const vId in trips) {
        const t = trips[vId];
        const allFinished = t.orders.every(o => ['Validado', 'Cancelado', 'Rechazado'].includes(o.estado));
        if (allFinished && t.orders.length > 0) {
            console.log(`[Auto - Liquidar] Viaje ${vId} de ${t.driver} completo.`);
            try {
                await fetchAPI('crearViajeAutomatico', { nro: t.orders[0].nro });
            } catch (e) { }
        }
    }
}

// Make sure to add the timer auto-refresher once the view is opened
setInterval(() => {
    const mapaGrid = document.getElementById('mapa-grid');
    // SAFEGUARD: Don't re-render if we are in the middle of a modal or if user is interaction with a select
    const isSwalOpen = document.body.classList.contains('swal2-shown');
    const hasFocus = document.activeElement && (document.activeElement.tagName === 'SELECT' || document.activeElement.tagName === 'INPUT');
    const isDragging = !!document.querySelector('.dragging') || !!document.querySelector('.dragging-box') || window.isDraggingOrder;

    if (mapaGrid && mapaGrid.offsetParent !== null && !isSwalOpen && !hasFocus && !isDragging) {
        console.log("[Monitor] Refreshing grid...");
        renderMapaMotorizados();
    }
}, 60000); // 1 minute

// Handler for the Assign button explicitly called from HTML
window.asignarMotorizadoDesdeMapa = async function (nro, forcedDriver = null) {
    let newDriver = forcedDriver;
    if (!newDriver) {
        const selectEl = document.getElementById(`sel-assign-${nro}`);
        if (!selectEl) return;
        newDriver = selectEl.value;
    }

    if (!newDriver || newDriver.trim() === '') return;

    // --- REACCIÃ“N OPTIMISTA + PERSISTENCIA (v6.0) ---
    const orderObj = (typeof orders !== 'undefined' ? orders : []).find(o => o.nro == nro);
    if (!orderObj) return;
    const oldDriver = orderObj.envio;

    // 1. Registrar en Memoria de Persistencia (Con tiempo extendido a 25s)
    window.pendingAssignments[nro] = {
        envio: newDriver,
        viaje_id: orderObj.viaje_id,
        timestamp: Date.now()
    };

    // 2. Actualizamos localmente E INSTANTÃ NEO
    orderObj.envio = newDriver;
    renderMapaMotorizados();

    try {
        const response = await fetchAPI('asignarMotorizado', {
            nro: nro,
            envio: newDriver,
            usuario: (typeof currentUser !== 'undefined' && currentUser.usuario) ? currentUser.usuario : 'Admin'
        });

        if (!response.success) {
            delete window.pendingAssignments[nro];
            orderObj.envio = oldDriver;
            renderMapaMotorizados();
            Swal.fire('Error', response.message || 'Error al asignar motorizado', 'error');
        } else {
            // El bloqueo de 25 segundos da tiempo a que el servidor Google Sheets sincronice 
            // y la siguiente carga silenciosa traiga la verdad del servidor corregida.
            setTimeout(() => {
                if (window.pendingAssignments[nro] && window.pendingAssignments[nro].timestamp < Date.now() - 24000) {
                    delete window.pendingAssignments[nro];
                    renderMapaMotorizados();
                }
            }, 25000);
            if (typeof loadOrdersSilent === 'function') loadOrdersSilent();
        }
    } catch (error) {
        console.error(error);
        delete window.pendingAssignments[nro];
        orderObj.envio = oldDriver;
        renderMapaMotorizados();
        Swal.fire('Error', 'Error de red al asignar', 'error');
    }
};

window.quitarPedidoDeViaje = async function (input) {
    const isArray = Array.isArray(input);
    const nros = isArray ? input : [Number(input)];
    const count = nros.length;

    const result = await Swal.fire({
        title: count > 1 ? `¿Desvincular ${count} pedidos ? ` : '¿Remover pedido del viaje?',
        text: count > 1 ? "Todos los pedidos volverán al monitor activo." : "El pedido volverá al monitor activo.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: count > 1 ? 'Sí, desvincular' : 'Sí, remover',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        // --- REACCIÃ“N OPTIMISTA + PERSISTENCIA (v5.0) ---
        const history = []; // Para revertir si falla
        nros.forEach(n => {
            const o = orders.find(x => x.nro == n);
            if (o) {
                history.push({ nro: n, oldViaje: o.viaje_id });
                window.pendingAssignments[n] = {
                    envio: o.envio,
                    viaje_id: "",
                    timestamp: Date.now()
                };
                o.viaje_id = "";
            }
        });
        renderMapaMotorizados();

        try {
            const response = await fetchAPI('asignarViajePedido', {
                nros: nros.map(n => Number(n)),
                viajeId: ""
            });

            if (response.success) {
                Swal.fire({ icon: 'success', title: 'Completado', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
                setTimeout(() => {
                    nros.forEach(n => delete window.pendingAssignments[n]);
                    renderMapaMotorizados();
                }, 25000);
                if (typeof loadOrdersSilent === 'function') loadOrdersSilent();
            } else {
                // Revertir
                history.forEach(h => {
                    delete window.pendingAssignments[h.nro];
                    const o = orders.find(x => x.nro == h.nro);
                    if (o) o.viaje_id = h.oldViaje;
                });
                renderMapaMotorizados();
                Swal.fire('Error', response.message, 'error');
            }
        } catch (e) {
            console.error(e);
            // Revertir
            history.forEach(h => {
                delete window.pendingAssignments[h.nro];
                const o = orders.find(x => x.nro == h.nro);
                if (o) o.viaje_id = h.oldViaje;
            });
            renderMapaMotorizados();
            Swal.fire('Error', 'Error de red', 'error');
        }
    }
};

window.desasignarMotorizadoDesdeMapa = async function (nro) {
    const { isConfirmed } = await Swal.fire({
        title: '¿Quitar asignación?',
        text: 'El pedido volverá a la lista de "Sin Asignar".',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, desasignar',
        cancelButtonText: 'Cancelar'
    });

    if (isConfirmed) {
        // --- REACCIÃ“N OPTIMISTA + PERSISTENCIA (v5.0) ---
        const o = orders.find(x => x.nro == nro);
        if (!o) return;
        const oldEnvio = o.envio;

        // 1. Registrar en Memoria de Persistencia
        window.pendingAssignments[nro] = {
            envio: "",
            viaje_id: o.viaje_id,
            timestamp: Date.now()
        };

        // 2. Actualizar localmente INSTANTÃ NEO
        o.envio = "";
        renderMapaMotorizados();

        try {
            const response = await fetchAPI('asignarMotorizado', {
                nro: Number(nro),
                envio: ""
            });

            if (response.success) {
                // Si el pedido pertenecía a un viaje, también desvincularlo en el servidor (v5.0 Fix)
                if (o.viaje_id && String(o.viaje_id).trim() !== "" && String(o.viaje_id).trim() !== "null") {
                    await fetchAPI('asignarViajePedido', {
                        nros: [Number(nro)],
                        viajeId: ""
                    });
                }

                Swal.fire({ icon: 'success', title: 'Desasignado', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
                setTimeout(() => {
                    delete window.pendingAssignments[nro];
                    renderMapaMotorizados();
                }, 25000);
                if (typeof loadOrdersSilent === 'function') loadOrdersSilent();
            } else {
                // Revertir
                delete window.pendingAssignments[nro];
                o.envio = oldEnvio;
                renderMapaMotorizados();
                Swal.fire('Error', response.message, 'error');
            }
        } catch (e) {
            console.error(e);
            delete window.pendingAssignments[nro];
            o.envio = oldEnvio;
            renderMapaMotorizados();
            Swal.fire('Error', 'Error de red', 'error');
        }
    }
};
