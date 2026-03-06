/**
 * Módulo de Gestión de Caja Chica
 * Sincronizado con validaciones de pedidos y movimientos manuales.
 */

const contentCaja = document.getElementById('caja-content');
const navCaja = document.getElementById('nav-caja');
const cajaTableBody = document.getElementById('caja-table-body');
const cajaSaldoInicial = document.getElementById('caja-saldo-inicial');
const cajaIngresos = document.getElementById('caja-ingresos');
const cajaEgresos = document.getElementById('caja-egresos');
const cajaSaldoFinal = document.getElementById('caja-saldo-final');
const cajaRecaudadoPedidos = document.getElementById('caja-recaudado-pedidos');
const cajaDatePicker = document.getElementById('caja-date-picker');

document.addEventListener('DOMContentLoaded', () => {
    if (cajaDatePicker) {
        cajaDatePicker.addEventListener('change', loadCajaData);
    }

    const btnAbrirCaja = document.getElementById('btn-abrir-caja');
    if (btnAbrirCaja) {
        btnAbrirCaja.addEventListener('click', mostrarModalApertura);
    }

    const btnAddCaja = document.getElementById('btn-add-caja-entry');
    if (btnAddCaja) {
        btnAddCaja.addEventListener('click', mostrarModalNuevoMovimiento);
    }

    const btnCerrarCaja = document.getElementById('btn-cerrar-caja');
    if (btnCerrarCaja) {
        btnCerrarCaja.addEventListener('click', mostrarModalCierre);
    }

    const btnExportCaja = document.getElementById('btn-export-caja');
    if (btnExportCaja) {
        btnExportCaja.addEventListener('click', () => {
            Swal.fire('Proximamente', 'La exportación a Excel estará disponible pronto.', 'info');
        });
    }
});

/**
 * Carga los datos de caja desde el backend
 */
async function loadCajaData() {
    if (!contentCaja || contentCaja.classList.contains('hidden')) return;

    const refreshIcon = document.getElementById('caja-refresh-icon');
    if (refreshIcon) refreshIcon.classList.add('fa-spin');

    console.log("Cargando datos de caja...");

    try {
        const selectedDate = cajaDatePicker.value; // yyyy-mm-dd
        let dateQuery = null;
        if (selectedDate) {
            const [y, m, d] = selectedDate.split('-');
            dateQuery = `${d}/${m}/${y}`;
        }

        const res = await fetchAPI('getCajaData', { fecha: dateQuery });
        console.log("Respuesta de Caja:", res);
        if (res.success) {
            renderCajaHistory(res);
            renderPedidosContadoPendientes(res.pedidosContado);

            // Calcular recaudado total de pedidos (monto de todos los pedidos contado de hoy)
            const totalRecaudado = (res.pedidosContado || []).reduce((acc, p) => acc + (parseFloat(p.monto) || 0), 0);
            if (cajaRecaudadoPedidos) {
                cajaRecaudadoPedidos.textContent = `S/ ${totalRecaudado.toFixed(2)}`;
            }
        }
    } catch (err) {
        console.error("Error al cargar datos de caja:", err);
    } finally {
        if (refreshIcon) refreshIcon.classList.remove('fa-spin');
    }
}

// La función renderCajaSummary se integra ahora en renderCajaHistory para evitar errores de scope

function renderPedidosContadoPendientes(pedidos) {
    const container = document.getElementById('caja-vueltos-container');
    const list = document.getElementById('caja-vueltos-list');
    if (!container || !list) return;

    if (!pedidos || pedidos.length === 0) {
        container.style.display = 'block';
        list.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 25px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: 12px; color: rgba(255,255,255,0.3);">
                <i class="fa-solid fa-check-double" style="font-size: 1.8em; margin-bottom: 12px; display: block; color: rgba(16, 185, 129, 0.4);"></i>
                No hay pedidos al contado en la fecha seleccionada.
            </div>
        `;
        return;
    }

    container.style.display = 'block';
    // Ordenar: los más nuevos (número mayor) primero, los validados al final
    const estadoOrder = { 'PENDIENTE_VUELTO': 0, 'PENDIENTE_COBRO': 1, 'COBRADO': 2, 'VALIDADO': 3 };
    const sorted = [...pedidos].sort((a, b) => {
        const ea = estadoOrder[a.estado || 'PENDIENTE_VUELTO'] ?? 0;
        const eb = estadoOrder[b.estado || 'PENDIENTE_VUELTO'] ?? 0;
        if (ea !== eb) return ea - eb;         // primero por estado
        return parseInt(b.nro) - parseInt(a.nro); // luego por nro desc (más nuevo a la izq)
    });
    list.innerHTML = sorted.map(p => {
        const monto = parseFloat(p.monto) || 0;
        const vuelto = parseFloat(p.vueltoEgresado) || 0;
        const cobro = parseFloat(p.cobroIngresado) || 0;
        const esperado = monto + vuelto;
        const estado = p.estado || 'PENDIENTE_VUELTO';

        // Colores y badges por estado
        let borderColor, badgeHtml, infoExtra, botonesHtml;

        if (estado === 'PENDIENTE_VUELTO') {
            // 🟠 Naranja — mismo color que badge "Pendiente" en pantalla principal
            borderColor = 'rgba(249,115,22,0.5)';
            badgeHtml = `<span style="background:rgba(249,115,22,0.15); color:#fb923c; padding:3px 10px; border-radius:20px; font-size:0.7em; font-weight:bold;">⏳ PENDIENTE</span>`;
            infoExtra = '';
            botonesHtml = `
                <button onclick="registrarVueltoRapido('${p.nro}', '${p.llave}', '${p.repartidor || ''}', 'FISICO')"
                    style="flex:1; padding:8px; font-size:0.8em; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); border-radius:8px; color:white; cursor:pointer;">
                    <i class="fa-solid fa-hand-holding-dollar"></i> Vuelto Físico
                </button>
                <button onclick="registrarVueltoRapido('${p.nro}', '${p.llave}', '${p.repartidor || ''}', 'DIGITAL')"
                    style="flex:1; padding:8px; font-size:0.8em; background:rgba(59,130,246,0.1); border:1px solid rgba(59,130,246,0.3); border-radius:8px; color:#60a5fa; cursor:pointer;">
                    <i class="fa-solid fa-mobile-screen"></i> Vuelto Yape
                </button>`;

        } else if (estado === 'PENDIENTE_COBRO') {
            // 🔵 Celeste — mismo color que badge "Por Validar" / "En Camino" en pantalla principal
            borderColor = 'rgba(6,182,212,0.5)';
            const metodoIcon = p.metodoVuelto === 'DIGITAL' ? '📱 Yape' : '💵 Físico';
            badgeHtml = `<span style="background:rgba(6,182,212,0.15); color:#22d3ee; padding:3px 10px; border-radius:20px; font-size:0.7em; font-weight:bold;">🚴 EN RUTA</span>`;
            infoExtra = `
                <div style="background:rgba(59,130,246,0.08); border:1px solid rgba(59,130,246,0.2); border-radius:8px; padding:8px; font-size:0.82em; margin-top:4px;">
                    <div>Vuelto entregado: <strong style="color:#60a5fa;">S/ ${vuelto.toFixed(2)}</strong> (${metodoIcon})</div>
                    <div style="color:rgba(255,255,255,0.5); margin-top:2px;">El repartidor debe traer: <strong style="color:#fcd34d;">S/ ${esperado.toFixed(2)}</strong></div>
                </div>`;
            botonesHtml = `
                <button onclick="registrarCobroContado('${p.nro}', '${p.llave}', '${p.repartidor || ''}', ${monto}, ${vuelto})"
                    style="width:100%; padding:10px; font-size:0.9em; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.4); border-radius:8px; color:#10b981; cursor:pointer; font-weight:bold;">
                    <i class="fa-solid fa-hand-holding-dollar"></i> Registrar Cobro del Repartidor (S/ ${esperado.toFixed(2)})
                </button>`;

        } else if (estado === 'VALIDADO') {
            // 🟢 Verde — mismo color que badge "Validado" en pantalla principal
            borderColor = 'rgba(34,197,94,0.3)';
            badgeHtml = `<span style="background:rgba(34,197,94,0.15); color:#4ade80; padding:3px 10px; border-radius:20px; font-size:0.7em; font-weight:bold;">✅ VALIDADO</span>`;
            infoExtra = `
                <div style="font-size:0.8em; color:rgba(255,255,255,0.35); padding:4px 0;">
                    Vuelto: <strong>S/ ${vuelto.toFixed(2)}</strong> &nbsp;|&nbsp; Cobro reg.: <strong>S/ ${cobro.toFixed(2)}</strong>
                </div>`;
            botonesHtml = `<div style="font-size:0.78em; color:rgba(255,255,255,0.25); text-align:center; padding:2px;">Historial del día</div>`;

        } else { // COBRADO — aguardando validación
            borderColor = 'rgba(16,185,129,0.3)';
            const diferencia = cobro - esperado;
            const diffColor = Math.abs(diferencia) < 0.01 ? '#10b981' : '#ef4444';
            const diffIcon = Math.abs(diferencia) < 0.01 ? '✅' : '⚠️';
            badgeHtml = `<span style="background:rgba(16,185,129,0.15); color:#10b981; padding:3px 10px; border-radius:20px; font-size:0.7em; font-weight:bold;">💰 COBRADO</span>`;
            infoExtra = `
                <div style="background:rgba(16,185,129,0.05); border:1px solid rgba(16,185,129,0.2); border-radius:8px; padding:8px; font-size:0.82em; margin-top:4px;">
                    <div>Esperado: <strong>S/ ${esperado.toFixed(2)}</strong> &nbsp;|&nbsp; Recibido: <strong>S/ ${cobro.toFixed(2)}</strong></div>
                    <div style="color:${diffColor}; margin-top:2px;">${diffIcon} Diferencia: S/ ${diferencia.toFixed(2)}</div>
                </div>`;
            botonesHtml = `<div style="font-size:0.78em; color:rgba(255,255,255,0.3); text-align:center; padding:4px;">Pendiente de validación en pestaña Pedidos</div>`;
        }

        return `
        <div style="background:rgba(255,255,255,0.03); border:1px solid ${borderColor}; padding:15px; border-radius:14px; display:flex; flex-direction:column; gap:10px; transition:border-color 0.3s;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <div style="font-size:0.75em; color:rgba(255,255,255,0.4);">${p.fecha} &nbsp;|&nbsp; Llave: <strong style="color:white;">${p.llave}</strong></div>
                    <div style="font-size:1.1em; font-weight:bold; color:white; margin-top:3px;">Pedido #${p.nro}</div>
                    <div style="font-size:0.85em; color:rgba(255,255,255,0.6); margin-top:2px;">
                        <i class="fa-solid fa-motorcycle"></i> ${p.repartidor || 'Sin repartidor'}
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                    ${badgeHtml}
                    <span style="font-size:0.9em; font-weight:bold; color:#fcd34d;">S/ ${monto.toFixed(2)}</span>
                </div>
            </div>
            ${infoExtra}
            <div style="display:flex; gap:8px; margin-top:2px;">${botonesHtml}</div>
        </div>`;
    }).join('');
}

async function registrarVueltoRapido(nro, llave, repartidor, metodo) {
    const { value: montoVuelto } = await Swal.fire({
        title: 'Registrar Entrega de Vuelto',
        text: `Pedido #${nro} [${llave}] - Repartidor: ${repartidor}`,
        input: 'number',
        inputLabel: `Monto del Vuelto (${metodo === 'FISICO' ? 'Efectivo' : 'Yape'})`,
        inputPlaceholder: '0.00',
        showCancelButton: true,
        confirmButtonText: 'Registrar Egreso',
        inputValidator: (value) => {
            if (!value || isNaN(value) || value <= 0) return 'Ingresa un monto válido';
        }
    });

    if (montoVuelto) {
        Swal.showLoading();
        try {
            const res = await fetchAPI('registrarMovimientoCaja', {
                tipo: 'EGRESO',
                metodo: metodo,
                concepto: `Vuelto [LLAVE: ${llave}] - ${repartidor}`,
                monto: parseFloat(montoVuelto),
                pedidoNro: nro,
                repartidor: repartidor,
                usuario: currentUser.usuario
            });

            if (res.success) {
                Swal.fire('¡Registrado!', 'El egreso por vuelto ha sido cargado a la caja.', 'success');
                loadCajaData();
            } else {
                Swal.fire('Error', res.message, 'error');
            }
        } catch (err) {
            Swal.fire('Error', 'Falló la conexión', 'error');
        }
    }
}

/**
 * Registra el cobro cuando el repartidor regresa con el dinero del cliente.
 * Siempre trae: Monto del pedido + Vuelto (monto redondo que pagó el cliente).
 */
async function registrarCobroContado(nro, llave, repartidor, monto, vuelto) {
    const esperado = monto + vuelto;
    const { value: montoRecibido } = await Swal.fire({
        title: `Cobro Repartidor - Pedido #${nro}`,
        html: `
            <div style="text-align:left; font-size:0.9em; margin-bottom:10px;">
                <div>Llave: <strong>${llave}</strong> &nbsp;|&nbsp; Rep: <strong>${repartidor || '--'}</strong></div>
                <div style="margin-top:6px; padding:8px; background:rgba(252,211,77,0.1); border:1px solid rgba(252,211,77,0.3); border-radius:8px;">
                    Monto pedido: <strong>S/ ${monto.toFixed(2)}</strong> + Vuelto: <strong>S/ ${vuelto.toFixed(2)}</strong>
                    <br><strong style="color:#fcd34d;">El repartidor debe traer: S/ ${esperado.toFixed(2)}</strong>
                </div>
            </div>
            <label style="display:block; text-align:left; font-weight:bold; margin-bottom:4px;">¿Cuánto trajo el repartidor? (S/)</label>
        `,
        input: 'number',
        inputValue: esperado.toFixed(2),
        inputPlaceholder: esperado.toFixed(2),
        showCancelButton: true,
        confirmButtonText: 'Confirmar Ingreso',
        confirmButtonColor: '#10b981',
        inputValidator: (value) => {
            if (!value || isNaN(value) || parseFloat(value) <= 0) return 'Ingresa un monto válido';
        }
    });

    if (!montoRecibido) return;

    const recibido = parseFloat(montoRecibido);
    const diferencia = recibido - esperado;

    // Alerta si hay diferencia
    if (Math.abs(diferencia) > 0.01) {
        const { isConfirmed } = await Swal.fire({
            title: '⚠️ Diferencia detectada',
            html: `
                <div style="text-align:left;">
                    <div>Esperado: <strong>S/ ${esperado.toFixed(2)}</strong></div>
                    <div>Recibido: <strong>S/ ${recibido.toFixed(2)}</strong></div>
                    <div style="color:${diferencia > 0 ? '#10b981' : '#ef4444'}; margin-top:8px; font-weight:bold;">
                        Diferencia: S/ ${diferencia.toFixed(2)} ${diferencia > 0 ? '(cobró de más)' : '(cobró de menos)'}
                    </div>
                </div>
            `,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Registrar de todas formas',
            cancelButtonText: 'Corregir monto',
            confirmButtonColor: '#f59e0b'
        });
        if (!isConfirmed) return;
    }

    Swal.fire({ title: 'Registrando cobro...', didOpen: () => Swal.showLoading() });
    try {
        const res = await fetchAPI('registrarMovimientoCaja', {
            tipo: 'INGRESO',
            metodo: 'FISICO',
            concepto: `Cobro [LLAVE: ${llave}] - ${repartidor}`,
            monto: recibido,
            pedidoNro: nro,
            repartidor: repartidor,
            usuario: currentUser.usuario
        });

        if (res.success) {
            Swal.fire('¡Cobro registrado!', `S/ ${recibido.toFixed(2)} ingresados a caja.`, 'success');
            loadCajaData();
        } else {
            Swal.fire('Error', res.message, 'error');
        }
    } catch (err) {
        Swal.fire('Error', 'Falló la conexión', 'error');
    }
}

/**
 * Renderiza el historial de movimientos filtrado por fecha
 */
function renderCajaHistory(data) {
    if (!cajaTableBody) return;

    const movimientos = data.movimientos || [];

    const selectedDate = cajaDatePicker.value; // yyyy-mm-dd
    if (!selectedDate) return;
    const [y, m, d] = selectedDate.split('-');
    const dateQuery = `${d}/${m}/${y}`;

    // Filtrar movimientos por la fecha seleccionada
    const movs = movimientos.filter(mov => (mov.fecha || '').trim().includes(dateQuery));

    let html = '';
    let totalIngresos = 0;
    let totalEgresos = 0;

    if (movs.length === 0) {
        html = `<tr><td colspan="6" style="text-align:center; padding: 30px; color:rgba(255,255,255,0.3);">No hay movimientos para esta fecha</td></tr>`;
    } else {
        movs.forEach((m, index) => {
            const isIngreso = m.tipo === 'INGRESO';
            if (isIngreso) totalIngresos += m.monto;
            else totalEgresos += m.monto;

            const badgeColor = isIngreso ? '#10b981' : '#ef4444';
            const icon = isIngreso ?
                `<i class="fa-solid fa-arrow-down" style="color:${badgeColor};"></i>` :
                `<i class="fa-solid fa-arrow-up" style="color:${badgeColor};"></i>`;

            const metodoBadge = m.metodo === 'DIGITAL' ?
                '<span style="font-size:0.7em; background:rgba(59,130,246,0.2); color:#60a5fa; padding:2px 6px; border-radius:4px; margin-left:8px;">DIGITAL</span>' :
                '<span style="font-size:0.7em; background:rgba(245,158,11,0.2); color:#fbbf24; padding:2px 6px; border-radius:4px; margin-left:8px;">FISICO</span>';

            html += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="color:rgba(255,255,255,0.4);">${movs.length - index}</td>
                    <td>${m.hora}</td>
                    <td style="font-weight:bold; color:${badgeColor};">
                        ${icon} ${m.tipo} ${metodoBadge}
                    </td>
                    <td>
                        <div style="font-weight:600; color: #fff;">${m.concepto}</div>
                        <div style="font-size:0.85em; color:rgba(255,255,255,0.5); margin-top:2px;">
                            ${m.repartidor ? `<i class="fa-solid fa-motorcycle" style="font-size:0.9em;"></i> ${m.repartidor}` : ''} 
                            ${m.pedidoNro ? ` | <i class="fa-solid fa-hashtag" style="font-size:0.9em;"></i> ${m.pedidoNro}` : ''}
                        </div>
                    </td>
                    <td style="font-weight:bold; font-size:1.1em; color:${badgeColor};">S/ ${m.monto.toFixed(2)}</td>
                    <td>
                        <button onclick="verDetalleMovimiento('${m.id}')" class="btn-icon-small" title="Ver detalle"><i class="fa-solid fa-eye"></i></button>
                    </td>
                </tr>
            `;
        });
    }

    cajaTableBody.innerHTML = html;

    // KPIs del Resumen de Caja
    // Primer movimiento del día que sea apertura (ingreso inicial)
    const apertura = movs.find(mov => mov.concepto && mov.concepto.toLowerCase().includes('apertura'));
    if (cajaSaldoInicial) {
        cajaSaldoInicial.textContent = apertura ? `S/ ${parseFloat(apertura.monto).toFixed(2)}` : 'S/ 0.00';
    }
    if (cajaIngresos) cajaIngresos.textContent = `S/ ${totalIngresos.toFixed(2)}`;
    if (cajaEgresos) cajaEgresos.textContent = `S/ ${totalEgresos.toFixed(2)}`;
    if (cajaSaldoFinal) {
        cajaSaldoFinal.textContent = `S/ ${(data.saldoFisico + data.saldoDigital).toFixed(2)}`;
        cajaSaldoFinal.title = `Saldo Físico: S/ ${data.saldoFisico.toFixed(2)} | Saldo Digital: S/ ${data.saldoDigital.toFixed(2)}`;
    }
}

/**
 * Modal para Apertura de Caja (Inicio de turno)
 */
async function mostrarModalApertura() {
    const { value: monto } = await Swal.fire({
        title: 'Apertura de Caja',
        input: 'number',
        inputLabel: 'Monto Inicial (S/)',
        inputValue: 629.00,
        inputPlaceholder: 'Ingresa el monto de apertura',
        showCancelButton: true,
        confirmButtonText: 'Abrir Caja',
        inputValidator: (value) => {
            if (!value || isNaN(value) || value < 0) {
                return 'Por favor ingresa un monto válido';
            }
        }
    });

    if (monto) {
        Swal.fire({ title: 'Abriendo caja...', didOpen: () => Swal.showLoading() });
        try {
            const res = await fetchAPI('registrarMovimientoCaja', {
                tipo: 'INGRESO',
                metodo: 'FISICO',
                concepto: 'Apertura de Caja',
                monto: parseFloat(monto),
                usuario: currentUser.usuario
            });

            if (res.success) {
                Swal.fire('¡Éxito!', 'Caja abierta con S/ ' + monto, 'success');
                loadCajaData();
            } else {
                Swal.fire('Error', res.message, 'error');
            }
        } catch (err) {
            Swal.fire('Error', 'Falló la conexión', 'error');
        }
    }
}

/**
 * Modal para Cierre de Caja (11 PM)
 */
async function mostrarModalCierre() {
    const res = await fetchAPI('getCajaData');
    if (!res.success) return Swal.fire('Error', 'No se pudieron obtener los datos para el cierre', 'error');

    const { isConfirmed } = await Swal.fire({
        title: 'Cierre de Caja (Corte 11 PM)',
        html: `
            <div style="text-align:left; border:1px solid rgba(255,255,255,0.1); padding:15px; border-radius:8px;">
                <p><strong>Saldo Físico:</strong> S/ ${res.saldoFisico.toFixed(2)}</p>
                <p><strong>Saldo Digital:</strong> S/ ${res.saldoDigital.toFixed(2)}</p>
                <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1);">
                <p style="font-size:1.1em;"><strong>Total en Caja:</strong> S/ ${(res.saldoFisico + res.saldoDigital).toFixed(2)}</p>
            </div>
            <p style="margin-top:15px; font-size:0.9em; color:#fca5a5;">¿Confirmas el cierre del turno actual?</p>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Confirmar Cierre',
        confirmButtonColor: '#ef4444'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'Procesando cierre...', didOpen: () => Swal.showLoading() });
        // Por ahora el cierre es informativo y registra un log. 
        // En el futuro podría resetear los saldos si se desea.
        const cierreRes = await fetchAPI('registrarMovimientoCaja', {
            tipo: 'EGRESO',
            metodo: 'FISICO',
            concepto: 'CIERRE DE TURNO (11 PM)',
            monto: 0,
            usuario: currentUser.usuario
        });

        if (cierreRes.success) {
            Swal.fire('¡Cierre Exitoso!', 'El turno ha sido cerrado correctamente.', 'success');
            loadCajaData();
        }
    }
}

/**
 * Modal para registrar movimientos manuales (Gasto, Depósito, Ajuste)
 */
async function mostrarModalNuevoMovimiento() {
    const { value: formValues } = await Swal.fire({
        title: 'Nuevo Movimiento de Caja',
        html: `
            <div style="text-align:left;">
                <label style="display:block; margin-bottom:5px; font-weight:bold;">Tipo de Movimiento:</label>
                <select id="swal-caja-tipo" class="swal2-input" style="margin:0 0 15px 0; width:100%;">
                    <option value="EGRESO">Salida / Gasto / Depósito al Banco</option>
                    <option value="INGRESO">Ingreso / Ajuste</option>
                </select>

                <label style="display:block; margin-bottom:5px; font-weight:bold;">Método:</label>
                <select id="swal-caja-metodo" class="swal2-input" style="margin:0 0 15px 0; width:100%;">
                    <option value="FISICO">Dinero Físico (Efectivo)</option>
                    <option value="DIGITAL">Dinero Digital (Yape/Plin al Repartidor)</option>
                </select>

                <label style="display:block; margin-bottom:5px; font-weight:bold;">Concepto / Motivo:</label>
                <input id="swal-caja-concepto" class="swal2-input" style="margin:0 0 15px 0; width:100%;" placeholder="Ej: Depósito al banco, Yape vuelto a Raul, etc.">

                <label style="display:block; margin-bottom:5px; font-weight:bold;">Monto (S/):</label>
                <input id="swal-caja-monto" type="number" step="0.01" class="swal2-input" style="margin:0; width:100%;" placeholder="0.00">
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Registrar',
        cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const tipo = document.getElementById('swal-caja-tipo').value;
            const metodo = document.getElementById('swal-caja-metodo').value;
            const concepto = document.getElementById('swal-caja-concepto').value.trim();
            const monto = parseFloat(document.getElementById('swal-caja-monto').value);

            if (!concepto || isNaN(monto) || monto <= 0) {
                Swal.showValidationMessage('Por favor completa todos los campos correctamente');
                return false;
            }
            return { tipo, metodo, concepto, monto };
        }
    });

    if (formValues) {
        Swal.fire({ title: 'Registrando...', didOpen: () => Swal.showLoading() });
        try {
            const res = await fetchAPI('registrarMovimientoCaja', {
                ...formValues,
                usuario: currentUser.usuario
            });

            if (res.success) {
                Swal.fire('¡Éxito!', 'Movimiento registrado correctamente', 'success');
                loadCajaData();
            } else {
                Swal.fire('Error', res.message, 'error');
            }
        } catch (err) {
            Swal.fire('Error', 'Falló la conexión con el servidor', 'error');
        }
    }
}

// Globalizar para usar en onclick si es necesario
window.verDetalleMovimiento = (id) => {
    // Implementación futura o simple toast
    console.log("Detalle del movimiento:", id);
};

// Exportar para que app.js pueda llamarlo al cambiar de pestaña
window.loadCajaData = loadCajaData;
