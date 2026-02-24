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
