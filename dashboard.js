// ============================================================
// dashboard.js — Dashboard Dinámico e Interactivo
// ============================================================

// ---- Estado del dashboard ----
let dashCharts = {};
let dashOrders = [];

// Tipos de pago activos (filtro múltiple)
let activePagos = new Set(['TARJETA', 'QR', 'ONLINE', 'EFECTIVO']);

// ---- Colores del tema ----
const COLORS = {
    azul: 'rgba(96, 165, 250, 0.85)',
    verde: 'rgba(74, 222, 128, 0.85)',
    rojo: 'rgba(248, 113, 113, 0.85)',
    naranja: 'rgba(251, 146, 60, 0.85)',
    violeta: 'rgba(167, 139, 250, 0.85)',
    cyan: 'rgba(34, 211, 238, 0.85)',
    amarillo: 'rgba(250, 204, 21, 0.85)',
    gris: 'rgba(148, 163, 184, 0.85)',
    azulBG: 'rgba(96, 165, 250, 0.15)',
    verdeBG: 'rgba(74, 222, 128, 0.15)',
    rojoBG: 'rgba(248, 113, 113, 0.15)',
    naranjaBG: 'rgba(251, 146, 60, 0.15)',
};

// Colores específicos por tipo de pago
const PAGO_COLORS = {
    TARJETA: { bg: 'rgba(96, 165, 250, 0.2)',  border: 'rgba(96, 165, 250, 0.9)',  text: '#60A5FA', icon: 'fa-credit-card' },
    QR:      { bg: 'rgba(167, 139, 250, 0.2)', border: 'rgba(167, 139, 250, 0.9)', text: '#A78BFA', icon: 'fa-qrcode' },
    ONLINE:  { bg: 'rgba(34, 211, 238, 0.2)',  border: 'rgba(34, 211, 238, 0.9)',  text: '#22D3EE', icon: 'fa-globe' },
    EFECTIVO:{ bg: 'rgba(74, 222, 128, 0.2)',  border: 'rgba(74, 222, 128, 0.9)',  text: '#4ADE80', icon: 'fa-money-bill-wave' },
};

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: 'rgba(255,255,255,0.8)', font: { family: 'Inter' } } } },
};

// ============================================================
// Utilidad: clasificar tipo de pago
// ============================================================
function clasificarPago(o) {
    const t = (o.tipo_pago_val || o.tipo_pago || '').toString().toUpperCase();
    if (t.includes('TARJETA') || t.includes('POS')) return 'TARJETA';
    if (t.includes('QR'))      return 'QR';
    if (t.includes('ONLINE'))  return 'ONLINE';
    if (t.includes('EFECTIVO')) return 'EFECTIVO';
    return 'OTROS';
}

// ============================================================
// Lógica de Procesamiento de Fechas
// ============================================================
function dashParseDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;

    let s = dateStr.toString().trim();

    if (s.includes('T')) {
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }

    const parts = s.split(/[\s/:-]/);
    if (parts.length >= 3) {
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        let year = parseInt(parts[2]);
        if (year < 100) year += 2000;
        const hour = parts[3] ? parseInt(parts[3]) : 0;
        const min  = parts[4] ? parseInt(parts[4]) : 0;
        const sec  = parts[5] ? parseInt(parts[5]) : 0;
        const d = new Date(year, month, day, hour, min, sec);
        return isNaN(d.getTime()) ? null : d;
    }

    const fallback = new Date(s);
    return isNaN(fallback.getTime()) ? null : fallback;
}

// ============================================================
// Init
// ============================================================
function initDashboard() {
    if (!document.getElementById('dashboard-view')) {
        document.querySelector('.main-content').insertAdjacentHTML('beforeend', getDashboardHTML());
    }

    document.getElementById('nav-dashboard').addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
        document.getElementById('nav-dashboard').classList.add('active');
        document.getElementById('app-content').style.display = 'none';
        document.getElementById('reports-content').style.display = 'none';
        document.getElementById('dashboard-view').style.display = 'block';

        const fromEl = document.getElementById('dash-from');
        const toEl   = document.getElementById('dash-to');
        if (!fromEl.value && !toEl.value) {
            const t = new Date();
            const yy = t.getFullYear();
            const mm = String(t.getMonth() + 1).padStart(2, '0');
            const dd = String(t.getDate()).padStart(2, '0');
            fromEl.value = `${yy}-${mm}-${dd}`;
            toEl.value   = `${yy}-${mm}-${dd}`;
        }
        renderDashboard();
    });

    document.getElementById('dash-filter-btn').addEventListener('click', renderDashboard);
    document.getElementById('dash-reset-btn').addEventListener('click', () => {
        document.getElementById('dash-from').value    = '';
        document.getElementById('dash-to').value      = '';
        document.getElementById('dash-driver').value  = '';
        activePagos = new Set(['TARJETA', 'QR', 'ONLINE', 'EFECTIVO']);
        syncPagoButtons();
        renderDashboard();
    });

    // Botones de filtro por tipo de pago
    document.querySelectorAll('.dash-pago-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tipo = btn.dataset.tipo;
            if (activePagos.has(tipo)) {
                // No dejar menos de 1 activo
                if (activePagos.size > 1) activePagos.delete(tipo);
            } else {
                activePagos.add(tipo);
            }
            syncPagoButtons();
            renderDashboard();
        });
    });
}

function syncPagoButtons() {
    document.querySelectorAll('.dash-pago-btn').forEach(btn => {
        const tipo = btn.dataset.tipo;
        if (activePagos.has(tipo)) {
            btn.classList.add('pago-active');
            btn.style.background = PAGO_COLORS[tipo].bg;
            btn.style.borderColor = PAGO_COLORS[tipo].border;
            btn.style.color = PAGO_COLORS[tipo].text;
        } else {
            btn.classList.remove('pago-active');
            btn.style.background = 'rgba(255,255,255,0.04)';
            btn.style.borderColor = 'rgba(255,255,255,0.1)';
            btn.style.color = 'rgba(255,255,255,0.35)';
        }
    });
}

// ============================================================
// Render principal
// ============================================================
function renderDashboard() {
    const fromVal = document.getElementById('dash-from').value;
    const toVal   = document.getElementById('dash-to').value;
    const driver  = (document.getElementById('dash-driver').value || '').toLowerCase().trim();

    // Base: todos los pedidos filtrados por fecha y repartidor
    const baseOrders = (typeof orders !== 'undefined' ? orders : []).filter(o => {
        let ok = true;
        if (fromVal || toVal) {
            const d = dashParseDate(o.fecha);
            if (!d) return false;
            const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            if (fromVal) { const f = new Date(fromVal + 'T00:00:00'); ok = ok && dateOnly >= f; }
            if (toVal)   { const t = new Date(toVal   + 'T00:00:00'); ok = ok && dateOnly <= t; }
        }
        if (driver) ok = ok && (o.envio || '').toLowerCase().includes(driver);
        return ok;
    });

    // Aplicar filtro de tipos de pago
    dashOrders = baseOrders.filter(o => {
        const tipo = clasificarPago(o);
        // Pedidos sin tipo o pendientes los incluimos siempre en KPIs generales,
        // pero para el filtro de pago solo filtramos validados con tipo asignado
        if (o.estado === 'Validado') {
            return activePagos.has(tipo) || tipo === 'OTROS';
        }
        return true; // pendientes/cancelados siempre visibles
    });

    // Poblar select de repartidores
    const allDrivers = [...new Set((typeof orders !== 'undefined' ? orders : []).map(o => o.envio).filter(Boolean))].sort();
    const dashDriver = document.getElementById('dash-driver');
    if (dashDriver && dashDriver.options.length <= 1) {
        allDrivers.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d; opt.textContent = d;
            dashDriver.appendChild(opt);
        });
    }

    // Actualizar chips de totales por tipo
    renderPagoChips(baseOrders);

    renderKPIs();
    renderChartPorDia();
    renderChartPagos();
    renderChartRepartidores();
    renderChartCancelaciones();
    renderChartHoras();
    renderChartValidadores();
    renderTablaDia();
    renderTablaCorteHoras(baseOrders);
}

// ============================================================
// Chips de conteo rápido por tipo de pago
// ============================================================
function renderPagoChips(baseOrders) {
    const tipos = ['TARJETA', 'QR', 'ONLINE', 'EFECTIVO'];
    tipos.forEach(tipo => {
        const validados = baseOrders.filter(o => o.estado === 'Validado' && clasificarPago(o) === tipo);
        const countEl = document.getElementById(`pago-count-${tipo}`);
        const montoEl = document.getElementById(`pago-monto-${tipo}`);
        if (countEl) countEl.textContent = validados.length;
        if (montoEl) montoEl.textContent = 'S/ ' + validados.reduce((s, o) => s + (parseFloat(o.monto) || 0), 0).toFixed(2);
    });
}

// ============================================================
// KPI Cards
// ============================================================
function renderKPIs() {
    const total     = dashOrders.length;
    const validados = dashOrders.filter(o => o.estado === 'Validado').length;
    const cancelados = dashOrders.filter(o => o.estado === 'Cancelado' || o.estado === 'Rechazado').length;
    const pendientes = dashOrders.filter(o => o.estado === 'Pendiente').length;
    const montoVal   = dashOrders.filter(o => o.estado === 'Validado').reduce((s, o) => s + (parseFloat(o.monto) || 0), 0);
    const fillRate   = total > 0 ? (validados / total * 100).toFixed(1) : '0.0';

    const slaFuera = dashOrders.filter(o => o.sla_fuera && String(o.sla_fuera).trim() !== '').length;
    const slaBase  = total - cancelados;
    const slaRate  = slaBase > 0 ? ((1 - slaFuera / slaBase) * 100).toFixed(1) : '100.0';

    // TPE
    let tpeTotalMins = 0, tpeCount = 0;
    dashOrders.forEach(o => {
        if (o.estado === 'Validado' && o.hora_entrega && o.fecha) {
            try {
                const orderDate = dashParseDate(o.fecha);
                if (!orderDate) return;
                let deliveryDate = (o.fecha_entrega && String(o.fecha_entrega).trim() !== '')
                    ? dashParseDate(o.fecha_entrega)
                    : new Date(orderDate);
                if (!deliveryDate) return;

                let h = 0, m = 0, horaValida = false;
                const horaStr = String(o.hora_entrega).trim();
                if (horaStr.includes('T')) {
                    const dTime = new Date(horaStr);
                    if (!isNaN(dTime.getTime())) { h = dTime.getHours(); m = dTime.getMinutes(); horaValida = true; }
                } else {
                    const parts = horaStr.split(':');
                    if (parts.length >= 2) { h = parseInt(parts[0], 10); m = parseInt(parts[1], 10); horaValida = (!isNaN(h) && !isNaN(m)); }
                }

                if (horaValida) {
                    deliveryDate.setHours(h, m, 0, 0);
                    let diffMs = deliveryDate - orderDate;
                    if (diffMs < 0 && Math.abs(diffMs) > 43200000) { deliveryDate.setDate(deliveryDate.getDate() + 1); diffMs = deliveryDate - orderDate; }
                    if (diffMs > 0 && diffMs <= 43200000) { tpeTotalMins += Math.floor(diffMs / 60000); tpeCount++; }
                }
            } catch (e) {}
        }
    });

    const tpeMins   = tpeCount > 0 ? Math.round(tpeTotalMins / tpeCount) : 0;
    const tpeString = tpeCount > 0
        ? (tpeMins >= 60 ? `${Math.floor(tpeMins / 60)}h ${tpeMins % 60}m` : `${tpeMins} min`)
        : '0 min';

    setText('kpi-total',    total);
    setText('kpi-validados', validados);
    setText('kpi-cancelados', cancelados);
    setText('kpi-pendientes', pendientes);
    setText('kpi-monto',    'S/ ' + montoVal.toFixed(2));
    setText('kpi-fill',     fillRate + '%');
    setText('kpi-tpe',      tpeString);
    setText('kpi-sla',      slaRate + '%');
    setText('kpi-sla-base', `${slaFuera} fuera de ${slaBase} pedidos`);
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ============================================================
// Gráficos
// ============================================================
function destroyChart(key) { if (dashCharts[key]) { dashCharts[key].destroy(); delete dashCharts[key]; } }
function baseOptions(extra = {}) { return Object.assign({}, CHART_DEFAULTS, extra); }

function renderChartPorDia() {
    destroyChart('porDia');
    const byDay = {};
    dashOrders.forEach(o => {
        const d = dashParseDate(o.fecha);
        if (!d) return;
        const key = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
        if (!byDay[key]) byDay[key] = { count: 0, monto: 0 };
        byDay[key].count++;
        if (o.estado === 'Validado') byDay[key].monto += parseFloat(o.monto) || 0;
    });
    const labels = Object.keys(byDay).sort();
    const ctx = document.getElementById('chart-por-dia').getContext('2d');
    dashCharts.porDia = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Pedidos', data: labels.map(l => byDay[l].count), borderColor: COLORS.azul, backgroundColor: COLORS.azulBG, tension: 0.3, fill: true }] },
        options: baseOptions({ plugins: { legend: { display: false } } })
    });
}

function renderChartPagos() {
    destroyChart('pagos');
    const agrupado = { TARJETA: 0, QR: 0, EFECTIVO: 0, ONLINE: 0, Otros: 0 };
    dashOrders.filter(o => o.estado === 'Validado').forEach(o => {
        const tipo = clasificarPago(o);
        if (agrupado[tipo] !== undefined) agrupado[tipo]++;
        else agrupado.Otros++;
    });
    const colorMap = { TARJETA: COLORS.azul, QR: COLORS.violeta, EFECTIVO: COLORS.verde, ONLINE: COLORS.cyan, Otros: COLORS.gris };
    const labels = Object.keys(agrupado).filter(k => agrupado[k] > 0);
    const ctx = document.getElementById('chart-pagos').getContext('2d');
    dashCharts.pagos = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: labels.map(l => agrupado[l]), backgroundColor: labels.map(l => colorMap[l]) }] },
        options: baseOptions({ plugins: { legend: { position: 'bottom' } } })
    });
}

function renderChartRepartidores() {
    destroyChart('repartidores');
    const stats = {};
    dashOrders.forEach(o => {
        const name = (o.envio || '').trim();
        if (!name) return;
        if (!stats[name]) stats[name] = { val: 0, can: 0 };
        if (o.estado === 'Validado') stats[name].val++;
        else if (o.estado === 'Cancelado' || o.estado === 'Rechazado') stats[name].can++;
    });
    const sorted = Object.keys(stats).sort((a, b) => stats[b].val - stats[a].val).slice(0, 10);
    const ctx = document.getElementById('chart-repartidores').getContext('2d');
    dashCharts.repartidores = new Chart(ctx, {
        type: 'bar',
        data: { labels: sorted, datasets: [{ label: 'Validados', data: sorted.map(n => stats[n].val), backgroundColor: COLORS.azul }] },
        options: baseOptions({ indexAxis: 'y', plugins: { legend: { display: false } } })
    });
}

function renderChartCancelaciones() {
    destroyChart('cancelaciones');
    const motivos = {};
    dashOrders.filter(o => o.estado === 'Cancelado' || o.estado === 'Rechazado').forEach(o => {
        const m = o.motivo_cancelacion || 'No especificado';
        motivos[m] = (motivos[m] || 0) + 1;
    });
    const ctx = document.getElementById('chart-cancelaciones').getContext('2d');
    dashCharts.cancelaciones = new Chart(ctx, {
        type: 'bar',
        data: { labels: Object.keys(motivos), datasets: [{ data: Object.values(motivos), backgroundColor: COLORS.rojo }] },
        options: baseOptions({ plugins: { legend: { display: false } } })
    });
}

function renderChartHoras() {
    destroyChart('horas');
    const horas = Array(24).fill(0);
    dashOrders.forEach(o => {
        const d = dashParseDate(o.fecha);
        if (d) horas[d.getHours()]++;
    });
    const ctx = document.getElementById('chart-horas').getContext('2d');
    dashCharts.horas = new Chart(ctx, {
        type: 'bar',
        data: { labels: Array.from({ length: 24 }, (_, i) => i + 'h'), datasets: [{ data: horas, backgroundColor: COLORS.violeta }] },
        options: baseOptions({ plugins: { legend: { display: false } } })
    });
}

function renderChartValidadores() {
    destroyChart('validadores');
    const users = {};
    dashOrders.forEach(o => { if (o.validado_por) users[o.validado_por] = (users[o.validado_por] || 0) + 1; });
    const ctx = document.getElementById('chart-validadores').getContext('2d');
    dashCharts.validadores = new Chart(ctx, {
        type: 'pie',
        data: { labels: Object.keys(users), datasets: [{ data: Object.values(users), backgroundColor: [COLORS.azul, COLORS.verde, COLORS.naranja, COLORS.violeta, COLORS.cyan] }] },
        options: baseOptions({ plugins: { legend: { position: 'bottom' } } })
    });
}

function renderTablaDia() {
    const tbody = document.getElementById('dash-tabla-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const recientes = [...dashOrders].sort((a, b) => b.nro - a.nro).slice(0, 20);
    recientes.forEach(o => {
        const d = dashParseDate(o.fecha);
        const hr = d ? d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '';
        const estCol = o.estado === 'Validado' ? COLORS.verde : (o.estado === 'Cancelado' || o.estado === 'Rechazado') ? COLORS.rojo : COLORS.amarillo;
        tbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td>${o.llave}</td>
                <td style="color:${estCol}; font-weight:bold;">${o.estado}</td>
                <td>S/ ${parseFloat(o.monto || 0).toFixed(2)}</td>
                <td>${o.envio || '-'}</td>
                <td>${(o.tipo_pago_val || o.tipo_pago || '-').toUpperCase()}</td>
                <td>${hr}</td>
            </tr>`);
    });
}

// ============================================================
// TABLA DE CORTES POR HORA (NUEVA)
// ============================================================
function renderTablaCorteHoras(baseOrders) {
    const tbody = document.getElementById('dash-corte-horas-body');
    const totalRow = document.getElementById('dash-corte-horas-total');
    if (!tbody) return;

    const tiposActivos = ['TARJETA', 'QR', 'ONLINE', 'EFECTIVO'];

    // Estructura: horas[hora] = { TARJETA: {count, monto}, QR: {...}, ... }
    const horas = {};
    for (let i = 0; i < 24; i++) {
        horas[i] = {};
        tiposActivos.forEach(t => { horas[i][t] = { count: 0, monto: 0 }; });
        horas[i]['TOTAL'] = { count: 0, monto: 0 };
    }

    const pedidosValidados = baseOrders.filter(o => o.estado === 'Validado');
    pedidosValidados.forEach(o => {
        const d = dashParseDate(o.fecha);
        if (!d) return;
        const hora = d.getHours();
        const tipo = clasificarPago(o);
        const monto = parseFloat(o.monto) || 0;

        if (tiposActivos.includes(tipo)) {
            horas[hora][tipo].count++;
            horas[hora][tipo].monto += monto;
        }
        horas[hora]['TOTAL'].count++;
        horas[hora]['TOTAL'].monto += monto;
    });

    // Solo mostrar horas con actividad
    const horasConActividad = Object.keys(horas).filter(h => horas[h]['TOTAL'].count > 0).map(Number).sort((a, b) => a - b);

    if (horasConActividad.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; opacity:0.5; padding:20px;">Sin datos para el período seleccionado</td></tr>`;
        if (totalRow) totalRow.innerHTML = '';
        return;
    }

    // Calcular totales generales
    const totalesGlobales = {};
    tiposActivos.forEach(t => { totalesGlobales[t] = { count: 0, monto: 0 }; });
    totalesGlobales['TOTAL'] = { count: 0, monto: 0 };

    // Render filas
    let html = '';
    horasConActividad.forEach(h => {
        const datos = horas[h];
        const label = `${String(h).padStart(2, '0')}:00 – ${String(h + 1).padStart(2, '0')}:00`;

        let rowHtml = `<tr>
            <td style="font-weight:600; white-space:nowrap; color:rgba(255,255,255,0.8);">${label}</td>`;

        tiposActivos.forEach(tipo => {
            const d = datos[tipo];
            const col = PAGO_COLORS[tipo];
            totalesGlobales[tipo].count += d.count;
            totalesGlobales[tipo].monto += d.monto;

            if (d.count > 0) {
                rowHtml += `<td>
                    <span style="color:${col.text}; font-weight:700;">${d.count}</span>
                    <br><small style="color:rgba(255,255,255,0.5);">S/ ${d.monto.toFixed(2)}</small>
                </td>`;
            } else {
                rowHtml += `<td style="color:rgba(255,255,255,0.2);">—</td>`;
            }
        });

        totalesGlobales['TOTAL'].count += datos['TOTAL'].count;
        totalesGlobales['TOTAL'].monto += datos['TOTAL'].monto;

        rowHtml += `<td style="font-weight:700; color:${COLORS.amarillo};">
            ${datos['TOTAL'].count}
            <br><small style="color:rgba(255,255,255,0.5);">S/ ${datos['TOTAL'].monto.toFixed(2)}</small>
        </td></tr>`;

        html += rowHtml;
    });

    tbody.innerHTML = html;

    // Fila de totales
    if (totalRow) {
        let totHtml = `<td style="font-weight:700; color:white;">TOTAL</td>`;
        tiposActivos.forEach(tipo => {
            const col = PAGO_COLORS[tipo];
            const d = totalesGlobales[tipo];
            totHtml += `<td style="font-weight:700;">
                <span style="color:${col.text};">${d.count}</span>
                <br><small style="color:rgba(255,255,255,0.6);">S/ ${d.monto.toFixed(2)}</small>
            </td>`;
        });
        totHtml += `<td style="font-weight:700; color:${COLORS.amarillo};">
            ${totalesGlobales['TOTAL'].count}
            <br><small style="color:rgba(255,255,255,0.6);">S/ ${totalesGlobales['TOTAL'].monto.toFixed(2)}</small>
        </td>`;
        totalRow.innerHTML = totHtml;
    }
}

// ============================================================
// HTML del Dashboard
// ============================================================
function getDashboardHTML() {
    return `
<div id="dashboard-view" style="display:none; padding:20px; overflow-y:auto; height:100%;">

    <!-- ── FILTROS SUPERIORES ── -->
    <div class="glass-panel" style="padding:16px; margin-bottom:16px; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <i class="fa-solid fa-filter" style="color:rgba(255,255,255,0.5);"></i>
        <input type="date" id="dash-from">
        <input type="date" id="dash-to">
        <select id="dash-driver"><option value="">Todos los repartidores</option></select>
        <button id="dash-filter-btn" class="btn-primary">Aplicar</button>
        <button id="dash-reset-btn" class="btn-secondary">Reset</button>
    </div>

    <!-- ── FILTRO TIPO DE PAGO (MULTI-SELECT) ── -->
    <div class="glass-panel" style="padding:16px; margin-bottom:20px;">
        <div style="font-size:0.78em; text-transform:uppercase; letter-spacing:0.08em; color:rgba(255,255,255,0.4); margin-bottom:12px;">
            <i class="fa-solid fa-filter"></i> Filtrar por tipo de pago
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
            ${['TARJETA','QR','ONLINE','EFECTIVO'].map(tipo => `
            <button class="dash-pago-btn" data-tipo="${tipo}"
                style="display:flex; flex-direction:column; align-items:center; gap:4px;
                       padding:10px 18px; border-radius:10px; border:1px solid ${PAGO_COLORS[tipo].border};
                       background:${PAGO_COLORS[tipo].bg}; color:${PAGO_COLORS[tipo].text};
                       font-weight:700; font-size:0.85em; cursor:pointer; transition:all 0.2s;
                       min-width:100px;">
                <i class="fa-solid ${PAGO_COLORS[tipo].icon}" style="font-size:1.3em;"></i>
                ${tipo}
                <div style="font-size:0.75em; font-weight:400; opacity:0.8;" id="pago-count-${tipo}">0</div>
                <div style="font-size:0.7em; opacity:0.7;" id="pago-monto-${tipo}">S/ 0.00</div>
            </button>`).join('')}
        </div>
        <div style="font-size:0.72em; color:rgba(255,255,255,0.3);">
            <i class="fa-solid fa-circle-info"></i> Haz clic para activar/desactivar tipos. Los totales se actualizan en tiempo real.
        </div>
    </div>

    <!-- ── KPI CARDS ── -->
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px; margin-bottom:20px;">
        ${kpiCard('kpi-total',     'fa-list-ol',     'Total',     '0',      COLORS.azul)}
        ${kpiCard('kpi-validados', 'fa-check-circle','Validados', '0',      COLORS.verde)}
        ${kpiCard('kpi-cancelados','fa-ban',         'Cancelados','0',      COLORS.rojo)}
        ${kpiCard('kpi-pendientes','fa-clock',       'Pendientes','0',      COLORS.amarillo)}
        ${kpiCard('kpi-monto',     'fa-money-bill',  'Monto Val.','S/ 0.00',COLORS.cyan)}
        ${kpiCard('kpi-fill',      'fa-percentage',  'Fill Rate', '0%',     COLORS.naranja)}
        ${kpiCard('kpi-tpe',       'fa-stopwatch',   'TPE',       '--',     COLORS.verde)}
        <div class="glass-panel" style="padding:14px; border-left:3px solid ${COLORS.violeta}; text-align:center;">
            <div id="kpi-sla" style="font-size:1.5em; font-weight:bold;">0%</div>
            <div style="font-size:0.7em; color:gray;">SLA Cumplimiento</div>
            <div id="kpi-sla-base" style="font-size:0.6em;">0 fuera de 0</div>
        </div>
    </div>

    <!-- ── GRÁFICOS ── -->
    <div style="display:grid; grid-template-columns:2fr 1fr; gap:16px; margin-bottom:16px;">
        <div class="glass-panel" style="padding:16px; height:250px;"><canvas id="chart-por-dia"></canvas></div>
        <div class="glass-panel" style="padding:16px; height:250px;"><canvas id="chart-pagos"></canvas></div>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
        <div class="glass-panel" style="padding:16px; height:300px;"><canvas id="chart-repartidores"></canvas></div>
        <div class="glass-panel" style="padding:16px; height:300px;"><canvas id="chart-cancelaciones"></canvas></div>
    </div>
    <div style="display:grid; grid-template-columns:2fr 1fr; gap:16px; margin-bottom:16px;">
        <div class="glass-panel" style="padding:16px; height:250px;"><canvas id="chart-horas"></canvas></div>
        <div class="glass-panel" style="padding:16px; height:250px;"><canvas id="chart-validadores"></canvas></div>
    </div>

    <!-- ── TABLA CORTE POR HORA (NUEVA) ── -->
    <div class="glass-panel" style="padding:16px; margin-bottom:20px;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
            <i class="fa-solid fa-clock" style="color:${COLORS.cyan};"></i>
            <span style="font-weight:700; font-size:1em;">Corte por Hora — Cuadre por Tipo de Pago</span>
            <span style="font-size:0.75em; color:rgba(255,255,255,0.4); margin-left:auto;">Solo pedidos validados</span>
        </div>
        <div style="overflow-x:auto;">
            <table class="orders-table" style="min-width:600px;">
                <thead>
                    <tr>
                        <th style="width:130px;">Franja Horaria</th>
                        ${['TARJETA','QR','ONLINE','EFECTIVO'].map(tipo => `
                        <th style="color:${PAGO_COLORS[tipo].text};">
                            <i class="fa-solid ${PAGO_COLORS[tipo].icon}"></i> ${tipo}
                        </th>`).join('')}
                        <th style="color:${COLORS.amarillo};">TOTAL</th>
                    </tr>
                </thead>
                <tbody id="dash-corte-horas-body">
                    <tr><td colspan="6" style="text-align:center; opacity:0.5; padding:20px;">Cargando...</td></tr>
                </tbody>
                <tfoot>
                    <tr id="dash-corte-horas-total" style="background:rgba(255,255,255,0.05); font-weight:700; border-top:2px solid rgba(255,255,255,0.15);">
                    </tr>
                </tfoot>
            </table>
        </div>
    </div>

    <!-- ── TABLA ÚLTIMOS PEDIDOS ── -->
    <div class="glass-panel" style="padding:16px;">
        <div style="font-weight:700; margin-bottom:10px;"><i class="fa-solid fa-list"></i> Últimos 20 pedidos</div>
        <table class="orders-table">
            <thead>
                <tr><th>Llave</th><th>Estado</th><th>Monto</th><th>Repartidor</th><th>Pago</th><th>Hora</th></tr>
            </thead>
            <tbody id="dash-tabla-body"></tbody>
        </table>
    </div>
</div>`;
}

function kpiCard(id, icon, label, def, col) {
    return `<div class="glass-panel" style="padding:14px; border-left:3px solid ${col}; text-align:center;">
        <div id="${id}" style="font-size:1.5em; font-weight:bold;">${def}</div>
        <div style="font-size:0.7em; color:gray;">${label}</div>
    </div>`;
}

document.addEventListener('DOMContentLoaded', () => { setTimeout(initDashboard, 100); });

window.refreshDashboardIfVisible = function () {
    const v = document.getElementById('dashboard-view');
    if (v && v.style.display !== 'none') renderDashboard();
};
