// ============================================================
// dashboard.js — Dashboard Dinámico e Interactivo
// ============================================================

let dashCharts = {};
let dashOrders = [];

// Filtros activos de tipo de pago/estado
// Incluye tipos de pago normales + 'CANCELADO' como opción especial
let activePagos = new Set(['TARJETA', 'QR', 'ONLINE', 'EFECTIVO', 'CANCELADO']);

const COLORS = {
    azul:     'rgba(96, 165, 250, 0.85)',
    verde:    'rgba(74, 222, 128, 0.85)',
    rojo:     'rgba(248, 113, 113, 0.85)',
    naranja:  'rgba(251, 146, 60, 0.85)',
    violeta:  'rgba(167, 139, 250, 0.85)',
    cyan:     'rgba(34, 211, 238, 0.85)',
    amarillo: 'rgba(250, 204, 21, 0.85)',
    gris:     'rgba(148, 163, 184, 0.85)',
    azulBG:   'rgba(96, 165, 250, 0.15)',
    verdeBG:  'rgba(74, 222, 128, 0.15)',
    rojoBG:   'rgba(248, 113, 113, 0.15)',
    naranjaBG:'rgba(251, 146, 60, 0.15)',
};

const PAGO_COLORS = {
    TARJETA:  { bg: 'rgba(96, 165, 250, 0.2)',  border: 'rgba(96, 165, 250, 0.9)',  text: '#60A5FA', icon: 'fa-credit-card'    },
    QR:       { bg: 'rgba(167, 139, 250, 0.2)', border: 'rgba(167, 139, 250, 0.9)', text: '#A78BFA', icon: 'fa-qrcode'         },
    ONLINE:   { bg: 'rgba(34, 211, 238, 0.2)',  border: 'rgba(34, 211, 238, 0.9)',  text: '#22D3EE', icon: 'fa-globe'          },
    EFECTIVO: { bg: 'rgba(74, 222, 128, 0.2)',  border: 'rgba(74, 222, 128, 0.9)',  text: '#4ADE80', icon: 'fa-money-bill-wave' },
    CANCELADO:{ bg: 'rgba(248, 113, 113, 0.2)', border: 'rgba(248, 113, 113, 0.9)', text: '#F87171', icon: 'fa-ban'            },
};

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: 'rgba(255,255,255,0.8)', font: { family: 'Inter' } } } },
};

// ============================================================
// Utilidades
// ============================================================
function clasificarPago(o) {
    const t = (o.tipo_pago_val || o.tipo_pago || '').toString().toUpperCase();
    if (t.includes('TARJETA') || t.includes('POS')) return 'TARJETA';
    if (t.includes('QR'))       return 'QR';
    if (t.includes('ONLINE'))   return 'ONLINE';
    if (t.includes('EFECTIVO')) return 'EFECTIVO';
    return 'OTROS';
}

function esCancelado(o) {
    return o.estado === 'Cancelado' || o.estado === 'Rechazado';
}

function dashParseDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;
    let s = dateStr.toString().trim();
    if (s.includes('T')) { const d = new Date(s); return isNaN(d.getTime()) ? null : d; }
    const parts = s.split(/[\s/:-]/);
    if (parts.length >= 3) {
        const day = parseInt(parts[0]), month = parseInt(parts[1]) - 1;
        let year = parseInt(parts[2]); if (year < 100) year += 2000;
        const h   = parts[3] ? parseInt(parts[3]) : 0;
        const m   = parts[4] ? parseInt(parts[4]) : 0;
        const sec = parts[5] ? parseInt(parts[5]) : 0;
        const d   = new Date(year, month, day, h, m, sec);
        return isNaN(d.getTime()) ? null : d;
    }
    const f = new Date(s); return isNaN(f.getTime()) ? null : f;
}

// Devuelve la hora (0-23) de o.hora_entrega, o null
function getHoraEntrega(o) {
    if (!o.hora_entrega) return null;
    const s = String(o.hora_entrega).trim();
    try {
        if (s.includes('T')) { const d = new Date(s); return isNaN(d.getTime()) ? null : d.getHours(); }
        const parts = s.split(':');
        if (parts.length >= 2) { const h = parseInt(parts[0], 10); return isNaN(h) ? null : h; }
    } catch(e) {}
    return null;
}

// NUEVO: Devuelve hora formateada HH:MM de o.hora_entrega
function getHoraEntregaStr(o) {
    if (!o.hora_entrega) return '--';
    const s = String(o.hora_entrega).trim();
    try {
        if (s.includes('T')) {
            const d = new Date(s);
            if (!isNaN(d.getTime())) {
                return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            }
        }
        const parts = s.split(':');
        if (parts.length >= 2) {
            return `${String(parseInt(parts[0],10)).padStart(2,'0')}:${String(parseInt(parts[1],10)).padStart(2,'0')}`;
        }
    } catch(e) {}
    return '--';
}

// NUEVO: Obtiene hora para filtro (entrega para válidos, pedido para cancelados)
function getHoraParaFiltro(o) {
    if (esCancelado(o)) {
        // Cancelados: usan hora del pedido (fecha)
        const d = dashParseDate(o.fecha);
        return d ? d.getHours() : null;
    }
    // Válidos: usan hora de entrega
    return getHoraEntrega(o);
}

// NUEVO: Obtiene string de hora para mostrar en tabla
function getHoraParaMostrar(o) {
    if (esCancelado(o)) {
        // Cancelados: muestran hora del pedido con indicador
        const d = dashParseDate(o.fecha);
        if (!d) return '--';
        return {
            hora: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
            esPedido: true,
            tooltip: 'Hora en que se realizó el pedido (no tiene hora de entrega)'
        };
    }
    // Válidos: hora de entrega normal
    return {
        hora: getHoraEntregaStr(o),
        esPedido: false,
        tooltip: 'Hora de entrega'
    };
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function destroyChart(key) { if (dashCharts[key]) { dashCharts[key].destroy(); delete dashCharts[key]; } }
function baseOptions(extra = {}) { return Object.assign({}, CHART_DEFAULTS, extra); }

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
        document.getElementById('app-content').style.display     = 'none';
        document.getElementById('reports-content').style.display = 'none';
        document.getElementById('dashboard-view').style.display  = 'block';
        const fromEl = document.getElementById('dash-from');
        const toEl   = document.getElementById('dash-to');
        if (!fromEl.value && !toEl.value) {
            const t = new Date();
            const ymd = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
            fromEl.value = toEl.value = ymd;
        }
        renderDashboard();
    });

    document.getElementById('dash-filter-btn').addEventListener('click', renderDashboard);

    document.getElementById('dash-reset-btn').addEventListener('click', () => {
        document.getElementById('dash-from').value   = '';
        document.getElementById('dash-to').value     = '';
        document.getElementById('dash-driver').value = '';
        const hSel = document.getElementById('dash-corte-hora-sel');
        if (hSel) hSel.value = String(Math.min(Math.max(new Date().getHours(), 8), 23));
        activePagos = new Set(['TARJETA', 'QR', 'ONLINE', 'EFECTIVO', 'CANCELADO']);
        syncPagoButtons();
        renderDashboard();
    });

    // Botones tipo de pago (incluye CANCELADO)
    document.querySelectorAll('.dash-pago-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tipo = btn.dataset.tipo;
            if (activePagos.has(tipo)) { if (activePagos.size > 1) activePagos.delete(tipo); }
            else activePagos.add(tipo);
            syncPagoButtons();
            renderDashboard();
        });
    });

    // Selector hora → solo recalcula listado
    document.addEventListener('change', (e) => {
        if (e.target && e.target.id === 'dash-corte-hora-sel') renderListado();
    });
}

function syncPagoButtons() {
    document.querySelectorAll('.dash-pago-btn').forEach(btn => {
        const tipo = btn.dataset.tipo;
        if (activePagos.has(tipo)) {
            btn.style.background  = PAGO_COLORS[tipo].bg;
            btn.style.borderColor = PAGO_COLORS[tipo].border;
            btn.style.color       = PAGO_COLORS[tipo].text;
            btn.style.opacity     = '1';
        } else {
            btn.style.background  = 'rgba(255,255,255,0.04)';
            btn.style.borderColor = 'rgba(255,255,255,0.1)';
            btn.style.color       = 'rgba(255,255,255,0.3)';
            btn.style.opacity     = '0.45';
        }
    });
}

// ============================================================
// Render principal
// ============================================================
function renderDashboard() {
    const fromVal  = document.getElementById('dash-from').value;
    const toVal    = document.getElementById('dash-to').value;
    const driver   = (document.getElementById('dash-driver').value || '').toLowerCase().trim();

    // Base: filtrado por fecha + repartidor
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

    // dashOrders: aplicar filtro de pago para gráficos y KPIs
    dashOrders = baseOrders.filter(o => {
        if (esCancelado(o)) return activePagos.has('CANCELADO');
        if (o.estado === 'Validado') return activePagos.has(clasificarPago(o)) || clasificarPago(o) === 'OTROS';
        return true; // pendientes siempre
    });

    // Poblar select repartidores (solo la primera vez)
    const dashDriverEl = document.getElementById('dash-driver');
    if (dashDriverEl && dashDriverEl.options.length <= 1) {
        const allDrivers = [...new Set((typeof orders !== 'undefined' ? orders : []).map(o => o.envio).filter(Boolean))].sort();
        allDrivers.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d; opt.textContent = d;
            dashDriverEl.appendChild(opt);
        });
    }

    renderPagoChips(baseOrders);
    renderKPIs();
    renderChartPorDia();
    renderChartPagos();
    renderChartRepartidores();
    renderChartCancelaciones();
    renderChartHoras();
    renderChartValidadores();
    renderListado();
}

// ============================================================
// Chips de pago
// ============================================================
function renderPagoChips(baseOrders) {
    ['TARJETA','QR','ONLINE','EFECTIVO'].forEach(tipo => {
        const vals = baseOrders.filter(o => o.estado === 'Validado' && clasificarPago(o) === tipo);
        setText(`pago-count-${tipo}`, vals.length);
        setText(`pago-monto-${tipo}`, 'S/ ' + vals.reduce((s,o) => s+(parseFloat(o.monto)||0), 0).toFixed(2));
    });
    // Chip cancelados: count solamente
    const cans = baseOrders.filter(o => esCancelado(o));
    setText('pago-count-CANCELADO', cans.length);
    setText('pago-monto-CANCELADO', cans.length + ' pedidos');
}

// ============================================================
// KPIs
// ============================================================
function renderKPIs() {
    const total      = dashOrders.length;
    const validados  = dashOrders.filter(o => o.estado === 'Validado').length;
    const cancelados = dashOrders.filter(o => esCancelado(o)).length;
    const pendientes = dashOrders.filter(o => o.estado === 'Pendiente').length;
    const montoVal   = dashOrders.filter(o => o.estado === 'Validado').reduce((s,o) => s+(parseFloat(o.monto)||0), 0);
    const fillRate   = total > 0 ? (validados / total * 100).toFixed(1) : '0.0';
    const slaFuera   = dashOrders.filter(o => o.sla_fuera && String(o.sla_fuera).trim() !== '').length;
    const slaBase    = total - cancelados;
    const slaRate    = slaBase > 0 ? ((1 - slaFuera / slaBase) * 100).toFixed(1) : '100.0';

    let tpeTotalMins = 0, tpeCount = 0;
    dashOrders.forEach(o => {
        if (o.estado === 'Validado' && o.hora_entrega && o.fecha) {
            try {
                const orderDate = dashParseDate(o.fecha); if (!orderDate) return;
                let deliveryDate = (o.fecha_entrega && String(o.fecha_entrega).trim() !== '')
                    ? dashParseDate(o.fecha_entrega) : new Date(orderDate);
                if (!deliveryDate) return;
                let h = 0, m = 0, horaValida = false;
                const hs = String(o.hora_entrega).trim();
                if (hs.includes('T')) {
                    const dT = new Date(hs); if (!isNaN(dT.getTime())) { h = dT.getHours(); m = dT.getMinutes(); horaValida = true; }
                } else {
                    const pp = hs.split(':');
                    if (pp.length >= 2) { h = parseInt(pp[0],10); m = parseInt(pp[1],10); horaValida = !isNaN(h) && !isNaN(m); }
                }
                if (horaValida) {
                    deliveryDate.setHours(h, m, 0, 0);
                    let diffMs = deliveryDate - orderDate;
                    if (diffMs < 0 && Math.abs(diffMs) > 43200000) { deliveryDate.setDate(deliveryDate.getDate()+1); diffMs = deliveryDate - orderDate; }
                    if (diffMs > 0 && diffMs <= 43200000) { tpeTotalMins += Math.floor(diffMs/60000); tpeCount++; }
                }
            } catch(e) {}
        }
    });
    const tpeMins   = tpeCount > 0 ? Math.round(tpeTotalMins / tpeCount) : 0;
    const tpeString = tpeCount > 0 ? (tpeMins >= 60 ? `${Math.floor(tpeMins/60)}h ${tpeMins%60}m` : `${tpeMins} min`) : '0 min';

    setText('kpi-total',      total);
    setText('kpi-validados',  validados);
    setText('kpi-cancelados', cancelados);
    setText('kpi-pendientes', pendientes);
    setText('kpi-monto',      'S/ ' + montoVal.toFixed(2));
    setText('kpi-fill',       fillRate + '%');
    setText('kpi-tpe',        tpeString);
    setText('kpi-sla',        slaRate + '%');
    setText('kpi-sla-base',   `${slaFuera} fuera de ${slaBase} pedidos`);
}

// ============================================================
// Gráficos
// ============================================================
function renderChartPorDia() {
    destroyChart('porDia');
    const byDay = {};
    dashOrders.forEach(o => {
        const d = dashParseDate(o.fecha); if (!d) return;
        const key = d.toLocaleDateString('es-PE', { day:'2-digit', month:'2-digit' });
        if (!byDay[key]) byDay[key] = { count:0, monto:0 };
        byDay[key].count++;
        if (o.estado === 'Validado') byDay[key].monto += parseFloat(o.monto)||0;
    });
    const labels = Object.keys(byDay).sort();
    const ctx = document.getElementById('chart-por-dia').getContext('2d');
    dashCharts.porDia = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label:'Pedidos', data: labels.map(l=>byDay[l].count), borderColor: COLORS.azul, backgroundColor: COLORS.azulBG, tension:0.3, fill:true }] },
        options: baseOptions({ plugins: { legend: { display:false } } })
    });
}

function renderChartPagos() {
    destroyChart('pagos');
    const agrupado = { TARJETA:0, QR:0, EFECTIVO:0, ONLINE:0, Otros:0 };
    dashOrders.filter(o => o.estado === 'Validado').forEach(o => {
        const tipo = clasificarPago(o);
        agrupado[tipo] !== undefined ? agrupado[tipo]++ : agrupado.Otros++;
    });
    const colorMap = { TARJETA: COLORS.azul, QR: COLORS.violeta, EFECTIVO: COLORS.verde, ONLINE: COLORS.cyan, Otros: COLORS.gris };
    const labels = Object.keys(agrupado).filter(k => agrupado[k] > 0);
    const ctx = document.getElementById('chart-pagos').getContext('2d');
    dashCharts.pagos = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: labels.map(l=>agrupado[l]), backgroundColor: labels.map(l=>colorMap[l]) }] },
        options: baseOptions({ plugins: { legend: { position:'bottom' } } })
    });
}

function renderChartRepartidores() {
    destroyChart('repartidores');
    const stats = {};
    dashOrders.forEach(o => {
        const name = (o.envio||'').trim(); if (!name) return;
        if (!stats[name]) stats[name] = { val:0, can:0 };
        if (o.estado === 'Validado') stats[name].val++;
        else if (esCancelado(o)) stats[name].can++;
    });
    const sorted = Object.keys(stats).sort((a,b) => stats[b].val - stats[a].val).slice(0,10);
    const ctx = document.getElementById('chart-repartidores').getContext('2d');
    dashCharts.repartidores = new Chart(ctx, {
        type: 'bar',
        data: { labels: sorted, datasets: [{ label:'Validados', data: sorted.map(n=>stats[n].val), backgroundColor: COLORS.azul }] },
        options: baseOptions({ indexAxis:'y', plugins: { legend: { display:false } } })
    });
}

function renderChartCancelaciones() {
    destroyChart('cancelaciones');
    const motivos = {};
    dashOrders.filter(o => esCancelado(o)).forEach(o => {
        const m = o.motivo_cancelacion || 'No especificado';
        motivos[m] = (motivos[m]||0) + 1;
    });
    const ctx = document.getElementById('chart-cancelaciones').getContext('2d');
    dashCharts.cancelaciones = new Chart(ctx, {
        type: 'bar',
        data: { labels: Object.keys(motivos), datasets: [{ data: Object.values(motivos), backgroundColor: COLORS.rojo }] },
        options: baseOptions({ plugins: { legend: { display:false } } })
    });
}

function renderChartHoras() {
    destroyChart('horas');
    const horas = Array(24).fill(0);
    dashOrders.forEach(o => { const d = dashParseDate(o.fecha); if (d) horas[d.getHours()]++; });
    const ctx = document.getElementById('chart-horas').getContext('2d');
    dashCharts.horas = new Chart(ctx, {
        type: 'bar',
        data: { labels: Array.from({length:24},(_,i)=>i+'h'), datasets: [{ data: horas, backgroundColor: COLORS.violeta }] },
        options: baseOptions({ plugins: { legend: { display:false } } })
    });
}

function renderChartValidadores() {
    destroyChart('validadores');
    const users = {};
    dashOrders.forEach(o => { if (o.validado_por) users[o.validado_por] = (users[o.validado_por]||0)+1; });
    const ctx = document.getElementById('chart-validadores').getContext('2d');
    dashCharts.validadores = new Chart(ctx, {
        type: 'pie',
        data: { labels: Object.keys(users), datasets: [{ data: Object.values(users), backgroundColor: [COLORS.azul, COLORS.verde, COLORS.naranja, COLORS.violeta, COLORS.cyan] }] },
        options: baseOptions({ plugins: { legend: { position:'bottom' } } })
    });
}

// ============================================================
// LISTADO INFERIOR — refleja TODOS los filtros + corte por hora de ENTREGA
// Válidos: hora de entrega | Cancelados: hora del pedido (fallback)
// ============================================================
// ============================================================
// LISTADO INFERIOR — refleja TODOS los filtros + corte por hora de ENTREGA
// Válidos: filtran y ordenan por hora de entrega
// Cancelados: filtran y ordenan por hora de pedido
// ORDEN DESCENDENTE: últimas entregas/pedidos arriba, primeras abajo
// ============================================================
function renderListado() {
    const tbody  = document.getElementById('dash-listado-body');
    const tfoot  = document.getElementById('dash-listado-tfoot');
    const infoEl = document.getElementById('dash-listado-info');
    if (!tbody) return;

    const hSel      = document.getElementById('dash-corte-hora-sel');
    const horaCorte = hSel ? parseInt(hSel.value) : 23;

    // Filtrar por hora correspondiente (entrega para válidos, pedido para cancelados)
    const pedidos = dashOrders.filter(o => {
        if (o.estado === 'Validado') {
            if (!activePagos.has(clasificarPago(o))) return false;
            const h = getHoraEntrega(o); // Hora de entrega para válidos
            if (h === null) return false;
            return h <= horaCorte;
        }
        if (esCancelado(o)) {
            if (!activePagos.has('CANCELADO')) return false;
            const h = getHoraParaFiltro(o); // Hora del pedido para cancelados
            if (h === null) return false;
            return h <= horaCorte;
        }
        return false;
    }).sort((a, b) => {
        // Obtener hora de referencia para cada pedido (la que se usa para ordenar)
        const getHoraOrden = (o) => {
            if (esCancelado(o)) {
                // Cancelados: hora del pedido
                const d = dashParseDate(o.fecha);
                return d ? d.getHours() : -1;
            }
            // Válidos: hora de entrega
            return getHoraEntrega(o) ?? -1;
        };
        
        // Obtener minutos de referencia para desempate
        const getMinutosOrden = (o) => {
            if (esCancelado(o)) {
                // Cancelados: minutos del pedido
                const d = dashParseDate(o.fecha);
                return d ? d.getMinutes() : 0;
            }
            // Válidos: minutos de la hora de entrega
            if (!o.hora_entrega) return 0;
            const s = String(o.hora_entrega).trim();
            if (s.includes('T')) {
                const d = new Date(s);
                return !isNaN(d.getTime()) ? d.getMinutes() : 0;
            }
            const parts = s.split(':');
            return parts.length >= 2 ? parseInt(parts[1], 10) || 0 : 0;
        };
        
        const hA = getHoraOrden(a);
        const hB = getHoraOrden(b);
        
        // ORDEN DESCENDENTE: mayor hora arriba
        if (hA !== hB) return hB - hA;
        
        // Misma hora: ordenar por minutos descendente
        const mA = getMinutosOrden(a);
        const mB = getMinutosOrden(b);
        if (mA !== mB) return mB - mA;
        
        // Misma hora y minutos: ordenar por fecha completa descendente
        const dA = dashParseDate(a.fecha);
        const dB = dashParseDate(b.fecha);
        return (dB ? dB.getTime() : 0) - (dA ? dA.getTime() : 0);
    });

    // Totales
    const totales = {
        TARJETA:  {count:0, monto:0}, QR:       {count:0, monto:0},
        ONLINE:   {count:0, monto:0}, EFECTIVO: {count:0, monto:0},
        CANCELADO:{count:0, monto:0}, TOTAL:    {count:0, monto:0}
    };
    pedidos.forEach(o => {
        const monto = parseFloat(o.monto) || 0;
        if (esCancelado(o)) {
            totales.CANCELADO.count++;
            totales.CANCELADO.monto += monto;
        } else {
            const tipo = clasificarPago(o);
            if (totales[tipo]) { totales[tipo].count++; totales[tipo].monto += monto; }
        }
        totales.TOTAL.count++;
        totales.TOTAL.monto += monto;
    });

    // Info descriptiva actualizada
    const driverLabel = (document.getElementById('dash-driver').value || '');
    const pagosLabel  = [...activePagos].join(', ');
    if (infoEl) {
        infoEl.innerHTML =
            `${pedidos.length} registros` +
            ` · Corte: válidos hasta ${String(horaCorte).padStart(2,'0')}:59 (entrega)` +
            ` · Cancelados hasta ${String(horaCorte).padStart(2,'0')}:59 (pedido)` +
            (driverLabel ? ` · ${driverLabel}` : ' · Todos los repartidores') +
            ` · Filtros: ${pagosLabel}`;
    }

    if (pedidos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; opacity:0.5; padding:24px;">
            Sin registros con los filtros seleccionados</td></tr>`;
        if (tfoot) tfoot.innerHTML = '';
        return;
    }

    // Filas con indicadores visuales de hora
    tbody.innerHTML = pedidos.map(o => {
        const isCan   = esCancelado(o);
        const horaData = getHoraParaMostrar(o);
        const tipo    = isCan ? 'CANCELADO' : clasificarPago(o);
        const col     = PAGO_COLORS[tipo]?.text || COLORS.gris;
        const estCol  = isCan ? COLORS.rojo : COLORS.verde;
        const estLabel = isCan ? (o.estado || 'Cancelado') : 'Validado';
        
        // Indicador visual para cancelados (hora de pedido)
        const horaDisplay = isCan 
            ? `<span style="opacity:0.7;">${horaData.hora}</span> <span style="font-size:0.75em; opacity:0.5; font-weight:400;">(pedido)</span>`
            : horaData.hora;
            
        const horaStyle = isCan 
            ? `color:${COLORS.rojo}; font-style:italic;` 
            : `color:rgba(255,255,255,0.9); font-weight:700;`;
        
        const rowStyle = isCan ? 'opacity:0.75;' : '';
        const tooltip = isCan ? 'title="Hora en que se realizó el pedido (cancelado, sin entrega)"' : '';

        return `<tr style="${rowStyle}" ${tooltip}>
            <td style="text-align:left; font-family:monospace; font-size:0.92em; letter-spacing:0.03em;">${o.llave}</td>
            <td style="text-align:center; color:${estCol}; font-weight:bold;">${estLabel}</td>
            <td style="text-align:right; font-weight:600;">S/ ${parseFloat(o.monto||0).toFixed(2)}</td>
            <td style="text-align:left;">${o.envio || '-'}</td>
            <td style="text-align:left; color:${col}; font-weight:600;">
                <i class="fa-solid ${PAGO_COLORS[tipo]?.icon || 'fa-circle'}" style="margin-right:5px;"></i>${tipo}
            </td>
            <td style="text-align:center; font-size:0.95em; ${horaStyle}">
                ${horaDisplay}
            </td>
        </tr>`;
    }).join('');

    // Pie con totales
    if (tfoot) {
        const chips = ['TARJETA','QR','ONLINE','EFECTIVO','CANCELADO']
            .filter(t => totales[t].count > 0)
            .map(t => {
                const montoStr = t === 'CANCELADO'
                    ? `${totales[t].count} reg.`
                    : `${totales[t].count} · S/ ${totales[t].monto.toFixed(2)}`;
                return `<span style="color:${PAGO_COLORS[t].text}; margin-right:14px; white-space:nowrap;">
                    <i class="fa-solid ${PAGO_COLORS[t].icon}"></i> <strong>${montoStr}</strong>
                </span>`;
            }).join('');

        tfoot.innerHTML = `
            <tr style="background:rgba(250,204,21,0.1); border-top:2px solid rgba(250,204,21,0.35);">
                <td colspan="2" style="font-weight:800; color:${COLORS.amarillo}; white-space:nowrap;">
                    <i class="fa-solid fa-scissors"></i> CORTE ${String(horaCorte).padStart(2,'0')}:59
                </td>
                <td style="font-weight:800; color:${COLORS.amarillo};">
                    S/ ${totales.TOTAL.monto.toFixed(2)}
                </td>
                <td style="font-weight:700; color:rgba(255,255,255,0.8);">${totales.TOTAL.count} registros</td>
                <td colspan="2" style="font-size:0.85em; padding:10px 8px;">${chips}</td>
            </tr>`;
    }
}

// ============================================================
// HTML
// ============================================================
function getDashboardHTML() {
    const horaActual = Math.min(Math.max(new Date().getHours(), 8), 23);

    return `
<div id="dashboard-view" style="display:none; padding:20px; overflow-y:auto; height:100%;">

    <!-- ── FILTROS SUPERIORES (fecha + repartidor + hora de corte) ── -->
    <div class="glass-panel" style="padding:16px; margin-bottom:16px; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <i class="fa-solid fa-filter" style="color:rgba(255,255,255,0.5);"></i>
        <input type="date" id="dash-from">
        <input type="date" id="dash-to">
        <select id="dash-driver"><option value="">Todos los repartidores</option></select>

        <!-- Hora de corte al costado de los filtros -->
        <div style="display:flex; align-items:center; gap:6px; margin-left:4px;">
            <label style="font-size:0.82em; color:rgba(255,255,255,0.55); white-space:nowrap;">
                <i class="fa-solid fa-scissors"></i> Corte hasta:
            </label>
            <select id="dash-corte-hora-sel"
                style="background:rgba(250,204,21,0.12); border:1px solid rgba(250,204,21,0.4);
                       color:${COLORS.amarillo}; border-radius:8px; padding:6px 12px;
                       font-weight:700; font-size:0.88em; cursor:pointer;">
                ${Array.from({length:16},(_,i)=>i+8).map(h =>
                    `<option value="${h}" ${h===horaActual?'selected':''}>${String(h).padStart(2,'0')}:59</option>`
                ).join('')}
            </select>
        </div>

        <button id="dash-filter-btn" class="btn-primary">Aplicar</button>
        <button id="dash-reset-btn" class="btn-secondary">Reset</button>
    </div>

    <!-- ── FILTRO TIPO DE PAGO + CANCELADOS ── -->
    <div class="glass-panel" style="padding:16px; margin-bottom:20px;">
        <div style="font-size:0.78em; text-transform:uppercase; letter-spacing:0.08em;
                    color:rgba(255,255,255,0.4); margin-bottom:12px;">
            <i class="fa-solid fa-filter"></i> Filtrar por tipo de pago / estado — clic para activar/desactivar
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
            ${['TARJETA','QR','ONLINE','EFECTIVO','CANCELADO'].map(tipo => `
            <button class="dash-pago-btn" data-tipo="${tipo}"
                style="display:flex; flex-direction:column; align-items:center; gap:4px;
                       padding:10px 18px; border-radius:10px;
                       border:1px solid ${PAGO_COLORS[tipo].border};
                       background:${PAGO_COLORS[tipo].bg}; color:${PAGO_COLORS[tipo].text};
                       font-weight:700; font-size:0.85em; cursor:pointer;
                       transition:all 0.2s; min-width:100px;">
                <i class="fa-solid ${PAGO_COLORS[tipo].icon}" style="font-size:1.3em;"></i>
                ${tipo}
                <div style="font-size:0.78em; font-weight:400;" id="pago-count-${tipo}">0</div>
                <div style="font-size:0.72em; opacity:0.8;" id="pago-monto-${tipo}">—</div>
            </button>`).join('')}
        </div>
    </div>

    <!-- ── KPIs ── -->
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px; margin-bottom:20px;">
        ${kpiCard('kpi-total',     'fa-list-ol',      'Total',      '0',       COLORS.azul)}
        ${kpiCard('kpi-validados', 'fa-check-circle', 'Validados',  '0',       COLORS.verde)}
        ${kpiCard('kpi-cancelados','fa-ban',          'Cancelados', '0',       COLORS.rojo)}
        ${kpiCard('kpi-pendientes','fa-clock',        'Pendientes', '0',       COLORS.amarillo)}
        ${kpiCard('kpi-monto',     'fa-money-bill',   'Monto Val.', 'S/ 0.00', COLORS.cyan)}
        ${kpiCard('kpi-fill',      'fa-percentage',   'Fill Rate',  '0%',      COLORS.naranja)}
        ${kpiCard('kpi-tpe',       'fa-stopwatch',    'TPE',        '--',      COLORS.verde)}
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

    <!-- ── LISTADO INFERIOR ── -->
    <div class="glass-panel" style="padding:16px;">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px; flex-wrap:wrap;">
            <i class="fa-solid fa-list-check" style="color:${COLORS.cyan};"></i>
            <span style="font-weight:700; font-size:1em;">Listado de Pedidos</span>
            <span style="font-size:0.7em; color:rgba(255,255,255,0.4); margin-left:auto;">
                <i class="fa-solid fa-info-circle"></i> 
                Válidos: hora de entrega | Cancelados: hora de pedido
            </span>
        </div>
        <div id="dash-listado-info"
             style="font-size:0.75em; color:rgba(255,255,255,0.4); margin-bottom:10px;
                    padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.07);"></div>
        <div style="overflow-x:auto;">
            <table class="orders-table">
                <colgroup>
                    <col style="width:18%">
                    <col style="width:12%">
                    <col style="width:12%">
                    <col style="width:20%">
                    <col style="width:26%">
                    <col style="width:12%">
                </colgroup>
                <thead>
                    <tr>
                        <th style="text-align:left;">Llave</th>
                        <th style="text-align:center;">Estado</th>
                        <th style="text-align:right;">Monto</th>
                        <th style="text-align:left;">Repartidor</th>
                        <th style="text-align:left;">Tipo Pago</th>
                        <th style="text-align:center;">Hora <span style="font-size:0.75em; opacity:0.6;">(Entrega/Pedido)</span></th>
                    </tr>
                </thead>
                <tbody id="dash-listado-body"></tbody>
                <tfoot id="dash-listado-tfoot"></tfoot>
            </table>
        </div>
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
