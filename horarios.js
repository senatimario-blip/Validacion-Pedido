// horarios.js
// Lógica para el Organizador de Horarios de Motorizados

(function () {
    // 1. Hook Navigation
    const navHorarios = document.getElementById('nav-horarios');
    const horariosContent = document.getElementById('horarios-content');

    const allNavs = document.querySelectorAll('.nav-links li');
    const allContents = [
        document.getElementById('app-content'),
        document.getElementById('mapa-content'),
        document.getElementById('reports-content'),
        document.getElementById('dashboard-content'),
        document.getElementById('horarios-content')
    ];

    if (navHorarios) {
        navHorarios.addEventListener('click', (e) => {
            e.preventDefault();
            allContents.forEach(c => c && c.classList.add('hidden'));
            allNavs.forEach(n => n.classList.remove('active'));

            if (horariosContent) horariosContent.classList.remove('hidden');
            navHorarios.classList.add('active');

            // Week initialization handled by app.js; trigger load if value exists
            if (document.getElementById('horario-semana-picker').value) {
                window.loadHorarioSemana();
            }
        });
    }

    // 2. Elementos UI
    const tbody = document.getElementById('horarios-table-body');
    const btnAdd = document.getElementById('btn-add-horario-row');
    const btnPaste = document.getElementById('btn-paste-horario');
    const btnSave = document.getElementById('btn-save-horario');
    const btnClone = document.getElementById('btn-clone-horario');
    const btnRefresh = document.getElementById('btn-refresh-horario');
    const btnCompliance = document.getElementById('btn-compliance-report');
    const weekPicker = document.getElementById('horario-semana-picker');

    if (weekPicker) {
        weekPicker.addEventListener('change', () => window.loadHorarioSemana({ force: true }));
    }

    if (btnAdd) {
        btnAdd.addEventListener('click', () => {
            const nextNro = tbody.querySelectorAll('tr').length + 1;
            tbody.appendChild(createRow(nextNro));
            calculateSummary();
        });
    }

    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const semanaId = weekPicker.value;
            if (!semanaId) {
                Swal.fire('Atención', 'Selecciona una semana primero', 'warning');
                return;
            }

            const horarios = [];
            tbody.querySelectorAll('tr').forEach(tr => {
                const getChipData = (dayClass) => {
                    const chip = tr.querySelector(`.${dayClass} .shift-chip`);
                    if (!chip) return '';
                    return `${chip.dataset.time}|${chip.dataset.status}`;
                };

                horarios.push({
                    nro: tr.querySelector('.in-nro').value,
                    status: tr.querySelector('.in-status').value,
                    driver: tr.querySelector('.in-driver').value,
                    lunes: getChipData('in-l'),
                    martes: getChipData('in-m'),
                    miercoles: getChipData('in-x'),
                    jueves: getChipData('in-j'),
                    viernes: getChipData('in-v'),
                    sabado: getChipData('in-s'),
                    domingo: getChipData('in-d'),
                });
            });

            Swal.fire({
                title: 'Guardando...',
                allowEscapeKey: false,
                didOpen: () => Swal.showLoading()
            });

            try {
                const res = await fetchAPI('guardarHorarioSemananal', { semanaId, horarios });
                if (res.success) {
                    Swal.fire('Éxito', res.message, 'success');
                } else {
                    Swal.fire('Error', res.message, 'error');
                }
            } catch (error) {
                Swal.fire('Error', 'Fallo al guardar horario', 'error');
            }
        });
    }

    if (btnPaste) {
        btnPaste.addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (!text) { Swal.fire('Atención', 'El portapapeles está vacío', 'info'); return; }
                const rows = text.split('\n');
                tbody.innerHTML = '';
                let validRowsCount = 0;

                rows.forEach((rowStr) => {
                    const cleanRow = rowStr.replace('\r', '').trim();
                    if (!cleanRow) return;
                    const cols = cleanRow.split('\t');
                    if (cols.length >= 10) {
                        try {
                            const nro = cols[0] ? cols[0].trim() : (validRowsCount + 1);
                            const h = {
                                nro: nro,
                                status: cols[1] ? cols[1].trim() : '',
                                driver: cols[2] ? cols[2].trim() : '',
                                lunes: cols[3] ? cols[3].trim() : '',
                                martes: cols[4] ? cols[4].trim() : '',
                                miercoles: cols[5] ? cols[5].trim() : '',
                                jueves: cols[6] ? cols[6].trim() : '',
                                viernes: cols[7] ? cols[7].trim() : '',
                                sabado: cols[8] ? cols[8].trim() : '',
                                domingo: cols[9] ? cols[9].trim() : ''
                            };
                            if (h.nro.toUpperCase() === 'NRO' || h.driver.toUpperCase() === 'DRIVERS ATE') return;
                            tbody.appendChild(createRow(nro, h));
                            validRowsCount++;
                        } catch (e) {
                            console.error("Error parseando fila copiada", e);
                        }
                    }
                });

                if (validRowsCount > 0) {
                    Swal.fire('Éxito', `Se pegaron ${validRowsCount} repartidores desde Excel`, 'success');
                    calculateSummary();
                } else {
                    Swal.fire('Atención', 'No se detectó un formato tabular comprensible.', 'warning');
                }
            } catch (err) {
                console.error('Error leyendo portapapeles:', err);
                Swal.fire('Error', 'No se pudo leer el portapapeles.', 'error');
            }
        });
    }

    // LISTENER AL CAMBIAR SEMANA EN EL PICKER
    if (weekPicker) {
        weekPicker.addEventListener('change', () => {
            if (typeof loadHorarioSemana === 'function') {
                loadHorarioSemana();
            }
        });
    }

    // CLONAR SEMANA ANTERIOR
    if (btnClone) {
        btnClone.addEventListener('click', async () => {
            if (!weekPicker.value) {
                Swal.fire('Atención', 'Selecciona la semana de destino en el recuadro.', 'warning');
                return;
            }
            const currentParts = weekPicker.value.split('-W');
            let year = parseInt(currentParts[0]);
            let week = parseInt(currentParts[1]);

            week--;
            if (week <= 0) {
                year--;
                week = 52;
            }

            const prevSemanaId = `${year}-W${week.toString().padStart(2, '0')}`;

            Swal.fire({
                title: `Clonando semana ${prevSemanaId}...`,
                allowEscapeKey: false,
                didOpen: () => Swal.showLoading()
            });

            try {
                const res = await fetchAPI('obtenerHorariosSemanales', { semanaId: prevSemanaId });
                if (res.success && res.data && res.data.length > 0) {
                    tbody.innerHTML = '';
                    res.data.forEach(h => {
                        // Reset statuses to PENDING when cloning
                        const resetStatus = (val) => {
                            if (!val) return '';
                            let t = val.includes('|') ? val.split('|')[0] : val;
                            return `${t}|PENDING`;
                        };

                        const newData = {
                            nro: h.nro,
                            status: h.status,
                            driver: h.driver,
                            lunes: resetStatus(h.lunes),
                            martes: resetStatus(h.martes),
                            miercoles: resetStatus(h.miercoles),
                            jueves: resetStatus(h.jueves),
                            viernes: resetStatus(h.viernes),
                            sabado: resetStatus(h.sabado),
                            domingo: resetStatus(h.domingo)
                        };
                        tbody.appendChild(createRow(newData.nro, newData));
                    });
                    calculateSummary();
                    Swal.fire('Éxito', `Semana anterior clonada. ¡Las fichas se resetearon a "Pendiente"! Recuerda hacer clic en "Guardar Horario".`, 'success');
                } else {
                    Swal.fire('Información', `No se encontró programación en la semana anterior (${prevSemanaId}).`, 'info');
                }
            } catch (error) {
                Swal.fire('Error', 'Fallo al clonar horarios.', 'error');
            }
        });
    }

    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            if (typeof loadHorarioSemana === 'function') {
                loadHorarioSemana({ force: true });
            }
        });
    }

    if (btnCompliance) {
        btnCompliance.addEventListener('click', () => {
            showComplianceReport();
        });
    }

    // --- Helper Drag and Drop + Modal Logic ---
    let draggedChip = null;
    let targetCellForModal = null; // Cell that was clicked

    // Event Delegation on horariosContent for chips and cells
    if (horariosContent) {
        horariosContent.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('shift-chip')) {
                draggedChip = e.target;
                setTimeout(() => e.target.classList.add('dragging'), 0);
            }
        });

        horariosContent.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('shift-chip')) {
                e.target.classList.remove('dragging');
                draggedChip = null;
                document.querySelectorAll('.shift-cell').forEach(c => c.classList.remove('drag-over'));
                calculateSummary();
            }
        });

        horariosContent.addEventListener('dragover', (e) => {
            e.preventDefault();
            const cell = e.target.closest('.shift-cell');
            if (cell) cell.classList.add('drag-over');
        });

        horariosContent.addEventListener('dragleave', (e) => {
            const cell = e.target.closest('.shift-cell');
            if (cell) cell.classList.remove('drag-over');
        });

        horariosContent.addEventListener('drop', (e) => {
            e.preventDefault();
            const cell = e.target.closest('.shift-cell');
            if (cell) {
                cell.classList.remove('drag-over');
                if (draggedChip) {
                    if (draggedChip.dataset.isTemplate) {
                        const time = draggedChip.dataset.time;
                        const statusTemplate = draggedChip.dataset.status;

                        if (statusTemplate === 'DELETE') {
                            cell.innerHTML = '';
                        } else if (time === 'Otros') {
                            // If they drop "Otros", open the modal automatically
                            targetCellForModal = cell;
                            const timeInput = document.getElementById('edit-shift-time');
                            const radios = document.getElementsByName('shiftStatus');
                            timeInput.value = '';
                            for (let r of radios) { r.checked = (r.value === 'PENDING'); }
                            document.getElementById('modal-shift-edit').classList.add('active');
                            setTimeout(() => { timeInput.focus(); }, 100);
                        } else {
                            cell.innerHTML = createChipHTML(`${time}|PENDING`);
                        }
                    } else {
                        // Swap logic or replace logic
                        const existingChip = cell.querySelector('.shift-chip');
                        if (existingChip && existingChip !== draggedChip) {
                            draggedChip.parentNode.appendChild(existingChip);
                        }
                        cell.appendChild(draggedChip);
                    }
                }
            }
        });
    }

    if (tbody) {
        tbody.addEventListener('click', (e) => {
            const btnDel = e.target.closest('.btn-delete-row');
            if (btnDel) {
                btnDel.closest('tr').remove();
                calculateSummary();
                return;
            }

            const cell = e.target.closest('.shift-cell');
            if (cell) {
                targetCellForModal = cell;
                const chip = cell.querySelector('.shift-chip');

                const timeInput = document.getElementById('edit-shift-time');
                const radios = document.getElementsByName('shiftStatus');

                if (chip) {
                    timeInput.value = chip.dataset.time || '';
                    const status = chip.dataset.status || 'PENDING';
                    for (let r of radios) { r.checked = (r.value === status); }
                } else {
                    timeInput.value = '';
                    for (let r of radios) { r.checked = (r.value === 'PENDING'); }
                }

                document.getElementById('modal-shift-edit').classList.add('active');
            }
        });
    }

    // Modal Shift Edit Logic
    const shiftForm = document.getElementById('edit-shift-form');
    const btnClearShift = document.getElementById('btn-clear-shift');

    if (shiftForm) {
        shiftForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!targetCellForModal) return;

            const timeValue = document.getElementById('edit-shift-time').value.trim();
            const statusNode = document.querySelector('input[name="shiftStatus"]:checked');
            const statusValue = statusNode ? statusNode.value : 'PENDING';

            // remove old
            targetCellForModal.innerHTML = '';

            const newData = `${timeValue}|${statusValue}`;
            targetCellForModal.innerHTML = createChipHTML(newData);

            document.getElementById('modal-shift-edit').classList.remove('active');
            calculateSummary();
        });
    }

    if (btnClearShift) {
        btnClearShift.addEventListener('click', () => {
            if (targetCellForModal) {
                targetCellForModal.innerHTML = '';
                document.getElementById('modal-shift-edit').classList.remove('active');
                calculateSummary();
            }
        });
    }


    // --- Core Functions ---

    window.lastLoadedWeek = null;

    window.loadHorarioSemana = async function loadHorarioSemana(opts = { force: false }) {
        if (!weekPicker || !tbody) return;
        const semanaId = weekPicker.value;
        if (!semanaId) return;

        // Caché: Evitar recargas si ya pintamos esta misma semana y no es un force-reload
        if (!opts.force && window.lastLoadedWeek === semanaId) {
            calculateSummary(); // Asegurarnos de recacular totales por si la vista cambió rápido
            return;
        }

        Swal.fire({
            title: 'Cargando Horarios...',
            allowEscapeKey: false,
            didOpen: () => Swal.showLoading()
        });

        try {
            const res = await fetchAPI('obtenerHorariosSemanales', { semanaId });
            tbody.innerHTML = '';

            if (res.success && res.data && res.data.length > 0) {
                res.data.forEach(h => {
                    tbody.appendChild(createRow(h.nro, h));
                });
            } else {
                for (let i = 1; i <= 5; i++) tbody.appendChild(createRow(i));
            }

            calculateSummary();
            window.lastLoadedWeek = semanaId; // Guardar semana exitosa en memoria
            Swal.close();
        } catch (error) {
            Swal.fire('Error', 'No se pudieron cargar los horarios', 'error');
        }
    };

    // Generador HTML para una ficha
    function createChipHTML(val) {
        if (!val || val.trim() === '') return '';

        let time = val;
        let status = 'PENDING';

        if (val.includes('|')) {
            const parts = val.split('|');
            time = parts[0].trim();
            status = parts[1].trim();
        }

        let icon = 'fa-clock';
        if (time.toLowerCase().includes('descanso')) {
            icon = 'fa-mug-hot';
            status = 'DESCANSO';
        } else if (status === 'OK') {
            icon = 'fa-check';
        } else if (status === 'FAIL') {
            icon = 'fa-xmark';
        } else {
            icon = 'fa-hourglass-half';
        }

        const isDescanso = time.toLowerCase().includes('descanso') ? 'shift-descanso' : '';

        return `<div class="shift-chip ${isDescanso}" draggable="true" data-time="${time}" data-status="${status}">
                    <i class="fa-solid ${icon}"></i> ${time}
                </div>`;
    }

    function createRow(nro, data = {}) {
        const tr = document.createElement('tr');
        tr.className = 'horario-row';
        tr.innerHTML = `
            <td><input type="text" class="search-input in-nro" value="${data.nro || nro}" style="width:100%; text-align:center;"></td>
            <td><input type="text" list="status-opts" class="search-input in-status" placeholder="FIJO/APOYO" value="${data.status || ''}" style="width:100%;"></td>
            <td><input type="text" list="drivers-list" class="search-input in-driver" placeholder="Nombre Repartidor" value="${data.driver || ''}" style="width:100%;"></td>
            <td><div class="shift-cell in-l" data-day="l">${createChipHTML(data.lunes)}</div></td>
            <td><div class="shift-cell in-m" data-day="m">${createChipHTML(data.martes)}</div></td>
            <td><div class="shift-cell in-x" data-day="x">${createChipHTML(data.miercoles)}</div></td>
            <td><div class="shift-cell in-j" data-day="j">${createChipHTML(data.jueves)}</div></td>
            <td><div class="shift-cell in-v" data-day="v">${createChipHTML(data.viernes)}</div></td>
            <td><div class="shift-cell in-s" data-day="s">${createChipHTML(data.sabado)}</div></td>
            <td><div class="shift-cell in-d" data-day="d">${createChipHTML(data.domingo)}</div></td>
            <td style="text-align:center;"><span class="row-total-hrs" style="display:inline-block; padding: 6px 16px; border-radius: 12px; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.4); color: #60a5fa; font-weight: bold; font-family: monospace; min-width: 60px; font-size: 1.1em;">0</span></td>
            <td style="text-align:center;"><button type="button" class="btn-icon btn-delete-row" style="color:#ef4444;"><i class="fa-solid fa-trash"></i></button></td>
        `;
        return tr;
    }

    function calculateSummary() {
        const days = ['l', 'm', 'x', 'j', 'v', 's', 'd'];
        const totals = {
            rooster: { l: 0, m: 0, x: 0, j: 0, v: 0, s: 0, d: 0 },
            am: { l: 0, m: 0, x: 0, j: 0, v: 0, s: 0, d: 0 },
            pm: { l: 0, m: 0, x: 0, j: 0, v: 0, s: 0, d: 0 }
        };

        const rows = document.querySelectorAll('tr.horario-row');

        rows.forEach(tr => {
            let rowTotalLUtoJU = 0;
            days.forEach(day => {
                const cell = tr.querySelector(`.in-${day}`);
                if (!cell) return;

                const chip = cell.querySelector('.shift-chip');
                if (!chip) return;

                const val = chip.dataset.time.toLowerCase();
                const status = chip.dataset.status;

                let hoursInShift = 0;
                const nums = val.match(/\d+/g);
                if (nums && nums.length >= 2) {
                    const hStart = parseInt(nums[0], 10);
                    const hEnd = parseInt(nums[nums.length - 1], 10);
                    if (hEnd > hStart) {
                        hoursInShift = hEnd - hStart;
                    } else if (hEnd < hStart) {
                        // Caso cruce de medianoche
                        hoursInShift = (24 - hStart) + hEnd;
                    }

                    // Sumar a la columna de LU a JU (solo si NO es fallido)
                    if (['l', 'm', 'x', 'j'].includes(day) && status !== 'FAIL') {
                        rowTotalLUtoJU += hoursInShift;
                    }

                    if (!val || val.includes('descanso')) return;

                    // Si la ficha está marcada explícitamente como FAIL (Faltó), entonces NO sumamos a la dotación
                    if (status === 'FAIL') return;

                    const firstNum = hStart;
                    const lastNum = hEnd;

                    // ROOSTER: Empieza a las 8 AM
                    if (firstNum === 8) {
                        totals.rooster[day]++;
                    }

                    // AM: Empieza a las 10, 11 o 12
                    else if (firstNum === 10 || firstNum === 11 || firstNum === 12) {
                        totals.am[day]++;
                    }

                    // PM: Cierra a las 23h
                    if (lastNum === 23) {
                        totals.pm[day]++;
                    }
                }
            });

            // Actualizar celda de total de la fila (LU a JU)
            const totalCell = tr.querySelector('.row-total-hrs');
            if (totalCell) totalCell.textContent = rowTotalLUtoJU;
        });

        days.forEach(day => {
            const sumRO = document.getElementById(`sum-${day}-ro`);
            const sumAM = document.getElementById(`sum-${day}-am`);
            const sumPM = document.getElementById(`sum-${day}-pm`);
            if (sumRO) sumRO.textContent = totals.rooster[day];
            if (sumAM) sumAM.textContent = totals.am[day];
            if (sumPM) sumPM.textContent = totals.pm[day];
        });
    }

    if (!document.getElementById('status-opts')) {
        const dl = document.createElement('datalist');
        dl.id = 'status-opts';
        dl.innerHTML = `
            <option value="FIJO"></option>
            <option value="APOYO"></option>
            <option value="ROOSTER"></option>
        `;
        document.body.appendChild(dl);
    }

    function showComplianceReport() {
        const rows = document.querySelectorAll('tr.horario-row');
        const stats = {};

        rows.forEach(tr => {
            const driver = tr.querySelector('.in-driver').value.trim();
            if (!driver) return;

            if (!stats[driver]) {
                stats[driver] = { total: 0, ok: 0, fail: 0 };
            }

            const dayCells = tr.querySelectorAll('.shift-cell');
            dayCells.forEach(cell => {
                const chip = cell.querySelector('.shift-chip');
                if (!chip) return;

                const time = chip.dataset.time.toLowerCase();
                const status = chip.dataset.status;

                if (time.includes('descanso')) return;

                stats[driver].total++;
                if (status === 'OK') stats[driver].ok++;
                else if (status === 'FAIL') stats[driver].fail++;
            });
        });

        const modal = document.getElementById('modal-compliance-report');
        const tbody = document.getElementById('compliance-table-body');
        const weekTitle = document.getElementById('compliance-week-title');
        const weekPicker = document.getElementById('horario-semana-picker');

        if (!modal || !tbody) return;

        weekTitle.textContent = `Resumen semanal: ${weekPicker ? weekPicker.value : 'Actual'}`;
        tbody.innerHTML = '';

        const driverNames = Object.keys(stats);
        if (driverNames.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No hay turnos asignados con repartidor</td></tr>';
        } else {
            driverNames.sort((a, b) => a.localeCompare(b)).forEach(name => {
                const s = stats[name];
                const compliance = s.total > 0 ? Math.round((s.ok / s.total) * 100) : 0;

                let color = '#4ade80';
                if (compliance < 100) color = '#fb923c';
                if (compliance < 70) color = '#f87171';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight:bold;">${name}</td>
                    <td style="text-align:center;">${s.total}</td>
                    <td style="text-align:center; color:#4ade80; font-weight:bold;">${s.ok}</td>
                    <td style="text-align:center; color:#f87171; font-weight:bold;">${s.fail}</td>
                    <td style="text-align:center;">
                        <span style="background: rgba(0,0,0,0.2); padding: 4px 10px; border-radius: 12px; border: 1px solid ${color}; color: ${color}; font-weight:bold;">
                            ${compliance}%
                        </span>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        modal.classList.add('active');
    }
})();
