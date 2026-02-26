// ============================================================
// mapa.js — Monitor de Motorizados y sus rutas
// ============================================================

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

    // Filter only active orders (Pendiente, En Camino, Reservado, empty)
    // Same as what the motorizado sees, essentially NOT Cancelado, NOT Validado
    const activeOrders = (typeof orders !== 'undefined' ? orders : []).filter(o =>
        o.estado !== 'Validado' &&
        o.estado !== 'Cancelado' &&
        o.estado !== 'Rechazado' &&
        o.envio && o.envio.trim() !== ''
    );

    // Group by 'envio' (motorizado name)
    const motorizadosMap = {};
    activeOrders.forEach(o => {
        const dName = o.envio.trim().toUpperCase();
        if (!motorizadosMap[dName]) {
            motorizadosMap[dName] = {
                name: o.envio.trim(),
                orders: [],
                totalMoney: 0
            };
        }
        motorizadosMap[dName].orders.push(o);
        motorizadosMap[dName].totalMoney += (parseFloat(o.monto) || 0);
    });

    const motorizadosKeys = Object.keys(motorizadosMap).sort();

    // Update the counter
    if (countEl) {
        countEl.innerHTML = `<i class="fa-solid fa-motorcycle"></i> ${motorizadosKeys.length} Activos`;
    }

    if (motorizadosKeys.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 40px; color: rgba(255,255,255,0.4);">
                <i class="fa-solid fa-mug-hot text-4xl mb-4" style="font-size:3em; margin-bottom:15px;"></i>
                <h3 style="font-size:1.2em; font-weight:600;">Sin Rutas Activas</h3>
                <p>No hay motorizados con pedidos pendientes en este momento.</p>
            </div>
        `;
        return;
    }

    let htmlBody = '';

    motorizadosKeys.forEach(mKey => {
        const data = motorizadosMap[mKey];
        data.orders.sort((a, b) => b.nro - a.nro); // Show newest on top

        let ordersHtml = data.orders.map(o => {
            const timeInfo = calculateElapsedTimeForMap(o.fecha);

            // Payment type logic based on recent change (order.pago default)
            let tipoPagoDisplay = (o.pago || 'POS/DESC...').toUpperCase();
            let pColor = 'rgba(255,255,255,0.7)';

            if (tipoPagoDisplay.includes('EFECTIVO')) pColor = '#4ADE80';
            else if (tipoPagoDisplay.includes('QR') || tipoPagoDisplay.includes('YAPE') || tipoPagoDisplay.includes('PLIN')) pColor = '#22D3EE';
            else if (tipoPagoDisplay.includes('TARJETA') || tipoPagoDisplay.includes('POS')) pColor = '#A78BFA';
            else if (tipoPagoDisplay.includes('ONLINE')) pColor = '#60A5FA';

            return `
                <div style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 8px 12px; margin-bottom: 8px; font-size: 0.85em;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <strong style="color: #fff;">${o.llave || '#' + o.nro}</strong>
                        <strong style="color: #4ADE80;">S/ ${parseFloat(o.monto || 0).toFixed(2)}</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color: ${pColor}; font-weight: 600; font-size:0.9em;"><i class="fa-solid fa-wallet"></i> ${tipoPagoDisplay}</span>
                        <span style="color: ${timeInfo.color}; background: ${timeInfo.bg}; padding: 2px 6px; border-radius: 4px; font-weight: bold;">
                            <i class="fa-solid fa-clock"></i> ${timeInfo.text}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        htmlBody += `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px; display:flex; flex-direction:column;">
                
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px dashed rgba(255,255,255,0.1);">
                    <div style="display:flex; align-items:center; gap: 10px;">
                        <div style="width: 40px; height: 40px; border-radius: 50%; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.5); display:flex; align-items:center; justify-content:center; color: #60A5FA;">
                            <i class="fa-solid fa-helmet-safety text-xl" style="font-size:1.2em;"></i>
                        </div>
                        <div>
                            <h3 style="margin: 0; font-size: 1.1em; font-weight: 700; color: #fff;">${data.name}</h3>
                            <span style="font-size: 0.8em; color: rgba(255,255,255,0.5);">${data.orders.length} pedidos en ruta</span>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size: 0.75em; color: rgba(255,255,255,0.5); text-transform: uppercase;">A Cobrar</div>
                        <div style="font-size: 1.1em; font-weight: 700; color: #4ADE80;">S/ ${data.totalMoney.toFixed(2)}</div>
                    </div>
                </div>

                <div style="flex: 1; overflow-y: auto; max-height: 400px; padding-right: 4px;" class="no-scrollbar">
                    ${ordersHtml}
                </div>
            </div>
        `;
    });

    container.innerHTML = htmlBody;
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

            result.text = mins >= 60 ?\`\${Math.floor(mins / 60)}h \${mins % 60}m\` : \`\${mins} min\`;
            
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
    } catch(e) {}
    
    return result;
}

// Make sure to add the timer auto-refresher once the view is opened
setInterval(() => {
    const mapaContent = document.getElementById('mapa-content');
    if (mapaContent && !mapaContent.classList.contains('hidden')) {
        renderMapaMotorizados(); // Tick the timers on screen dynamically
    }
}, 60000); // 1 minute
