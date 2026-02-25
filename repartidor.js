const API_URL = 'https://script.google.com/macros/s/AKfycbwqwWxeisCo342uZduigmSRI9qP-0RSCEGRq2XZY_jVbLvh0XRrxWr1s1LTbwQxjqR8/exec';

// State
let currentUser = null;
let currentOrders = [];
let activeTimers = {};
let selectedOrderForCapture = null;

// DOM Elements
const pantallaLogin = document.getElementById('pantalla-login');
const pantallaRuta = document.getElementById('pantalla-ruta');
const inputDriver = document.getElementById('driver-name-input');
const btnIngresar = document.getElementById('btn-ingresar');
const lblDriverName = document.getElementById('lbl-driver-name');
const lblPedidosCount = document.getElementById('lbl-pedidos-count');
const btnActualizar = document.getElementById('btn-actualizar');
const btnCerrarRuta = document.getElementById('btn-cerrar-ruta');
const containerPedidos = document.getElementById('lista-pedidos-container');
const loadingPedidos = document.getElementById('loading-pedidos');

// Modal Elements
const modalCaptura = document.getElementById('modal-captura');
const btnCerrarModal = document.getElementById('btn-cerrar-modal');
const lblModalLlave = document.getElementById('lbl-modal-llave');
const lblTipoPagoModal = document.getElementById('lbl-tipo-pago-modal');
const btnEnviarWsp = document.getElementById('btn-enviar-wsp');

// Photo Inputs
const inputEvidencia = document.getElementById('input-foto-evidencia');
const inputPos = document.getElementById('input-foto-pos');
const btnUiEvidencia = document.getElementById('btn-ui-evidencia');
const btnUiPos = document.getElementById('btn-ui-pos');
const iconEvidencia = document.getElementById('icon-evidencia');
const iconPos = document.getElementById('icon-pos');
const previewEvidencia = document.getElementById('preview-evidencia');
const previewPos = document.getElementById('preview-pos');
const canvasFusion = document.getElementById('canvas-fusion');

// Data
let photoEvidenciaFile = null;
let photoPosFile = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Check if previously logged in
    const savedDriver = localStorage.getItem('activeDriver');
    if (savedDriver) {
        loginDriver(savedDriver);
    }

    inputDriver.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') btnIngresar.click();
    });

    btnIngresar.addEventListener('click', () => {
        const name = inputDriver.value.trim();
        if (name) loginDriver(name);
    });

    btnCerrarRuta.addEventListener('click', () => {
        Swal.fire({
            title: '¿Terminar Ruta?',
            text: "Saldrás de tu sesión actual.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Sí, salir'
        }).then((result) => {
            if (result.isConfirmed) {
                localStorage.removeItem('activeDriver');
                currentUser = null;
                stopAllTimers();
                pantallaRuta.classList.add('hidden');
                pantallaRuta.classList.remove('flex');
                pantallaLogin.classList.remove('hidden');
                pantallaLogin.classList.add('flex');
                inputDriver.value = '';
            }
        });
    });

    btnActualizar.addEventListener('click', () => {
        if (currentUser) fetchDriverOrders();
    });

    // Modal Close
    btnCerrarModal.addEventListener('click', () => {
        modalCaptura.classList.add('hidden');
        modalCaptura.classList.remove('flex');
        resetModalState();
    });

    // File Inputs Handlers
    inputEvidencia.addEventListener('change', (e) => handlePhotoCapture(e, 'evidencia'));
    inputPos.addEventListener('change', (e) => handlePhotoCapture(e, 'pos'));

    // Share to WhatsApp
    btnEnviarWsp.addEventListener('click', handleSendToWhatsApp);
});

function loginDriver(name) {
    currentUser = name;
    localStorage.setItem('activeDriver', name);
    lblDriverName.textContent = name;

    pantallaLogin.classList.add('hidden');
    pantallaLogin.classList.remove('flex');
    pantallaRuta.classList.remove('hidden');
    pantallaRuta.classList.add('flex');

    fetchDriverOrders();
}

async function fetchDriverOrders() {
    containerPedidos.innerHTML = '';
    containerPedidos.appendChild(loadingPedidos);
    loadingPedidos.classList.remove('hidden');
    stopAllTimers();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'listarPedidos' })
        });
        const data = await response.json();

        if (data.success) {
            // Filtrar y ordenar
            currentOrders = data.data.filter(o =>
                (o.estado === 'Pendiente' || o.estado === 'En Camino' || o.estado === '') &&
                o.envio &&
                o.envio.toLowerCase() === currentUser.toLowerCase()
            ).sort((a, b) => b.nro - a.nro);

            renderOrders();
        } else {
            throw new Error('Error parseando datos');
        }
    } catch (error) {
        console.error("Fetch error:", error);
        Swal.fire({
            icon: 'error',
            toast: true,
            position: 'top-end',
            title: 'Error de red al actualizar',
            showConfirmButton: false,
            timer: 3000
        });
    } finally {
        loadingPedidos.classList.add('hidden');
    }
}

function renderOrders() {
    containerPedidos.innerHTML = '';
    lblPedidosCount.textContent = currentOrders.length;

    if (currentOrders.length === 0) {
        containerPedidos.innerHTML = `
            <div class="text-center py-12 px-4 border border-dashed border-slate-700 rounded-2xl">
                <i class="fa-solid fa-mug-hot text-4xl text-slate-500 mb-4"></i>
                <h3 class="text-xl font-bold text-slate-300">Sin Pedidos</h3>
                <p class="text-slate-500 mt-2">No tienes pedidos pendientes de entrega asignados a tu nombre.</p>
            </div>
        `;
        return;
    }

    currentOrders.forEach(order => {
        // Parse time for the clock
        let registerDate = null;
        if (order.fecha) {
            // Try to parse the ISO string or similar format from the Google server
            registerDate = new Date(order.fecha);
        }

        const tipoPagoDisplay = (order.tipo_pago || 'Desconocido').toUpperCase();
        let tipoIcon = 'wallet';
        let tipoColor = 'text-slate-400 bg-slate-800';

        if (tipoPagoDisplay.includes('EFECTIVO')) {
            tipoIcon = 'money-bill';
            tipoColor = 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
        } else if (tipoPagoDisplay.includes('TARJETA') || tipoPagoDisplay.includes('POS')) {
            tipoIcon = 'credit-card';
            tipoColor = 'text-purple-400 bg-purple-400/10 border-purple-400/20';
        } else if (tipoPagoDisplay.includes('QR') || tipoPagoDisplay.includes('YAPE') || tipoPagoDisplay.includes('PLIN')) {
            tipoIcon = 'qrcode';
            tipoColor = 'text-teal-400 bg-teal-400/10 border-teal-400/20';
        } else if (tipoPagoDisplay.includes('ONLINE')) {
            tipoIcon = 'globe';
            tipoColor = 'text-blue-400 bg-blue-400/10 border-blue-400/20';
        }

        const monto = parseFloat(order.monto) || 0;

        const card = document.createElement('div');
        card.className = 'bg-cardDark rounded-2xl p-4 shadow-lg border border-slate-700/50 active:scale-[0.98] transition-all cursor-pointer';
        card.onclick = () => openCaptureModal(order);

        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div>
                    <span class="text-xs text-slate-400 font-medium uppercase tracking-wider block mb-1">Llave / Ticket</span>
                    <span class="text-xl font-bold tracking-tight">${order.llave || `PED-${order.nro}`}</span>
                </div>
                <div class="text-right">
                    <span class="text-xs text-slate-400 font-medium uppercase tracking-wider block mb-1">A Cobrar</span>
                    <span class="text-xl font-bold text-emerald-400">S/ ${monto.toFixed(2)}</span>
                </div>
            </div>
            
            <div class="flex items-center justify-between mt-4">
                <span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-semibold ${tipoColor}">
                    <i class="fa-solid fa-${tipoIcon}"></i>
                    ${tipoPagoDisplay}
                </span>
                
                <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800" id="timer-box-${order.nro}">
                    <i class="fa-solid fa-clock text-slate-400" id="timer-icon-${order.nro}"></i>
                    <span class="font-mono font-bold text-slate-300" id="timer-text-${order.nro}">--:--</span>
                </div>
            </div>
        `;

        containerPedidos.appendChild(card);

        if (registerDate && !isNaN(registerDate)) {
            startTimer(order.nro, registerDate);
        }
    });
}

// --- Timers Logic ---
const audioAlerta = new Audio('data:audio/mp3;base64,//OExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'); // Minimal silent audio to initialize object
// A simple oscillator beep function as fallback for mobile without actual sound files
function playBeep() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); // Gentle volume
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();
        setTimeout(() => oscillator.stop(), 300); // 300ms pip
    } catch (e) { console.log("Audio not supported"); }
}

function startTimer(orderId, startTime) {
    const updateTime = () => {
        const now = new Date();
        const diffMs = now - startTime;
        const diffMins = Math.floor(diffMs / 60000);

        const box = document.getElementById(`timer-box-${orderId}`);
        const text = document.getElementById(`timer-text-${orderId}`);
        const icon = document.getElementById(`timer-icon-${orderId}`);

        if (!box || !text) return;

        text.textContent = `${diffMins} min`;

        if (diffMins >= 35) {
            box.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/50 animate-pulse';
            text.className = 'font-mono font-bold text-red-500';
            icon.className = 'fa-solid fa-clock text-red-500';
        } else if (diffMins >= 30) {
            box.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-500/20 border border-orange-500/50';
            text.className = 'font-mono font-bold text-orange-500';
            icon.className = 'fa-solid fa-clock text-orange-500';
            // Play a soft beep every 1 minute once it hits 30 (not ideal for battery but meets requirement)
            if (now.getSeconds() === 0 && (now.getMinutes() % 1 === 0)) {
                playBeep();
                if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            }
        } else {
            box.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20';
            text.className = 'font-mono font-bold text-emerald-400';
            icon.className = 'fa-solid fa-clock text-emerald-400';
        }
    };

    updateTime(); // Initial update
    activeTimers[orderId] = setInterval(updateTime, 10000); // Update every 10 seconds to save battery
}

function stopAllTimers() {
    Object.values(activeTimers).forEach(clearInterval);
    activeTimers = {};
}

// --- Capture Modal Logic ---
function openCaptureModal(order) {
    selectedOrderForCapture = order;
    lblModalLlave.textContent = order.llave || `PED-${order.nro}`;

    const tipo = (order.tipo_pago || '').toUpperCase();
    if (tipo.includes('ONLINE')) {
        lblTipoPagoModal.textContent = 'Evidencia Online';
    } else if (tipo.includes('EFECTIVO')) {
        lblTipoPagoModal.textContent = 'Pago en Efectivo';
    } else {
        lblTipoPagoModal.textContent = 'Voucher POS';
    }

    resetModalState();
    modalCaptura.classList.remove('hidden');
    modalCaptura.classList.add('flex');
}

function resetModalState() {
    photoEvidenciaFile = null;
    photoPosFile = null;

    // Reset UI Evidencia
    const eviUiClasses = ['bg-slate-800', 'border-slate-600', 'border-dashed'];
    const eviIconClasses = ['bg-slate-700', 'text-slate-300'];
    btnUiEvidencia.className = `btn-ui bg-slate-800 border-2 border-dashed border-slate-600 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-colors`;
    iconEvidencia.className = `w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-2xl`;
    iconEvidencia.innerHTML = '<i class="fa-solid fa-box-open"></i>';
    previewEvidencia.classList.add('hidden');
    previewEvidencia.src = '';

    // Reset UI POS
    btnUiPos.className = `btn-ui bg-slate-800 border-2 border-dashed border-slate-600 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 transition-colors`;
    iconPos.className = `w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-2xl`;
    iconPos.innerHTML = '<i class="fa-solid fa-receipt"></i>';
    previewPos.classList.add('hidden');
    previewPos.src = '';

    checkReadyToShare();
}

function handlePhotoCapture(e, type) {
    const file = e.target.files[0];
    if (!file) return;

    // Compress image slightly to save data
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200; // Reasonable for whatsapp
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Get compressed image
            canvas.toBlob((blob) => {
                const compressedFile = new File([blob], `photo_${type}.jpg`, { type: 'image/jpeg' });
                const blobUrl = URL.createObjectURL(compressedFile);

                if (type === 'evidencia') {
                    photoEvidenciaFile = compressedFile;
                    previewEvidencia.src = blobUrl;
                    previewEvidencia.classList.remove('hidden');
                    // Style change
                    btnUiEvidencia.classList.replace('border-slate-600', 'border-emerald-500');
                    btnUiEvidencia.classList.replace('border-dashed', 'border-solid');
                    iconEvidencia.classList.replace('bg-slate-700', 'bg-emerald-500');
                    iconEvidencia.classList.replace('text-slate-300', 'text-white');
                    iconEvidencia.innerHTML = '<i class="fa-solid fa-check"></i>';
                } else {
                    photoPosFile = compressedFile;
                    previewPos.src = blobUrl;
                    previewPos.classList.remove('hidden');
                    // Style change
                    btnUiPos.classList.replace('border-slate-600', 'border-emerald-500');
                    btnUiPos.classList.replace('border-dashed', 'border-solid');
                    iconPos.classList.replace('bg-slate-700', 'bg-emerald-500');
                    iconPos.classList.replace('text-slate-300', 'text-white');
                    iconPos.innerHTML = '<i class="fa-solid fa-check"></i>';
                }

                checkReadyToShare();
            }, 'image/jpeg', 0.8);
        }
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function checkReadyToShare() {
    if (photoEvidenciaFile && photoPosFile) {
        btnEnviarWsp.removeAttribute('disabled');
        btnEnviarWsp.classList.add('animate-pulse');
    } else {
        btnEnviarWsp.setAttribute('disabled', 'true');
        btnEnviarWsp.classList.remove('animate-pulse');
    }
}

// --- WhatsApp Fusion and Share Logic ---
async function uploadPosSilently(file, orderKey) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async () => {
            const base64Str = reader.result.split(',')[1];
            try {
                // Post silent hidden backup to keep OCR intact
                const jsonPayload = JSON.stringify({
                    action: 'guardarFotoOcr',
                    llave: orderKey,
                    fotoBase64: base64Str
                });

                // Wait for the response to see if there's an error
                const response = await fetch(API_URL, {
                    method: 'POST',
                    body: jsonPayload
                });
                const result = await response.json();
                console.log("Resultado de Google Drive subida silenciosa:", result);
                if (!result.success) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error de Google Drive',
                        text: 'TÓMALE CAPTURA A ESTO: ' + (result.msg || 'Desconocido'),
                        confirmButtonText: 'Entendido'
                    });
                    resolve(false); // Indicates failure
                    return;
                }
                resolve(true); // Indicates success
            } catch (e) {
                console.error("Error catched en uploadPosSilently:", e);
                Swal.fire({
                    icon: 'error',
                    title: 'Error de Red Silencioso',
                    text: 'TÓMALE CAPTURA A ESTO: ' + e.toString(),
                    confirmButtonText: 'Entendido'
                });
                resolve(false);
            }
        };
        reader.readAsDataURL(file);
    });
}

function fusePhotos() {
    return new Promise((resolve) => {
        const img1 = new Image();
        const img2 = new Image();
        let loaded = 0;

        const checkLoad = () => {
            loaded++;
            if (loaded === 2) {
                // Resize both to same width for stacking
                const targetWidth = 1000;
                const srcAspect1 = img1.width / img1.height;
                const srcAspect2 = img2.width / img2.height;

                const targetHeight1 = targetWidth / srcAspect1;
                const targetHeight2 = targetWidth / srcAspect2;

                canvasFusion.width = targetWidth;
                canvasFusion.height = targetHeight1 + targetHeight2;
                const ctx = canvasFusion.getContext('2d');

                // Draw white background
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvasFusion.width, canvasFusion.height);

                // Draw Top (Evidencia)
                ctx.drawImage(img1, 0, 0, targetWidth, targetHeight1);

                // Draw Bottom (POS)
                ctx.drawImage(img2, 0, targetHeight1, targetWidth, targetHeight2);

                // Add watermark/Text overlay
                ctx.fillStyle = "rgba(0,0,0,0.7)";
                ctx.fillRect(0, targetHeight1 - 50, targetWidth, 100);
                ctx.fillStyle = "#ffffff";
                ctx.font = "30px Arial";
                ctx.textAlign = "center";
                ctx.fillText(`FUSIÓN AUTOMÁTICA O.K.`, targetWidth / 2, targetHeight1);

                canvasFusion.toBlob((blob) => {
                    resolve(new File([blob], `entrega_${selectedOrderForCapture.llave}.jpg`, { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.85);
            }
        };

        img1.onload = checkLoad;
        img2.onload = checkLoad;

        img1.src = URL.createObjectURL(photoEvidenciaFile);
        img2.src = URL.createObjectURL(photoPosFile);
    });
}

async function handleSendToWhatsApp() {
    btnEnviarWsp.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-xl"></i> Procesando...';
    btnEnviarWsp.setAttribute('disabled', 'true');
    btnEnviarWsp.classList.remove('animate-pulse');

    try {
        // 1. Silent upload POS original para el Admin OCR
        const subidaExitosa = await uploadPosSilently(photoPosFile, selectedOrderForCapture.llave);

        if (!subidaExitosa) {
            // Restore button if the upload failed so they can try again or see the error
            btnEnviarWsp.innerHTML = '<i class="fa-brands fa-whatsapp text-xl"></i><span class="text-lg">Intentar de nuevo</span>';
            btnEnviarWsp.removeAttribute('disabled');
            return; // Stop here, don't fuse or send to whatsapp
        }

        // 2. Fusionar fotos
        const fusedFile = await fusePhotos();

        // 3. Calcular tiempo exacto
        let elapsedMinHtml = '--';
        if (selectedOrderForCapture.fecha && !isNaN(new Date(selectedOrderForCapture.fecha))) {
            const start = new Date(selectedOrderForCapture.fecha);
            const diffMin = Math.floor((new Date() - start) / 60000);
            elapsedMinHtml = diffMin;
        }

        // 4. Preparar mensaje
        const money = parseFloat(selectedOrderForCapture.monto).toFixed(2);
        const llave = selectedOrderForCapture.llave || `PED-${selectedOrderForCapture.nro}`;
        const msgText = `✅ P. ENTREGADO\n📦 Llave: ${llave}\n💵 Monto: S/ ${money}\n⏱️ Tiempo Real: ${elapsedMinHtml} min\n💳 Tipo: ${selectedOrderForCapture.tipo_pago}\n🚴🏽 Repartidor: ${currentUser}`;

        // 5. Intentar usar Web Share API nativo (Permite adjuntar foto local a WhatsApp directo)
        if (navigator.canShare && navigator.canShare({ files: [fusedFile] })) {
            await navigator.share({
                title: 'Evidencia de Entrega',
                text: msgText,
                files: [fusedFile]
            });
            Swal.fire('¡Éxito!', 'Redirigiendo a WhatsApp...', 'success');
        } else {
            // Fallback si el dispositivo no soporta pasar archivos binarios directo (iOS viejo/Desktops)
            Swal.fire({
                icon: 'info',
                title: 'Descarga tu foto',
                text: 'Tu dispositivo no permite enviar la foto directo a WhatsApp. Guarda esta imagen fusionada y pásala junto con los datos copiados.',
            });
            // Copiar texto al portapapeles
            try { await navigator.clipboard.writeText(msgText + "\n\n*Adjunta la foto que descargó el sistema.*"); } catch (e) { }

            // Forzar descarga de la fusión
            const a = document.createElement('a');
            a.href = URL.createObjectURL(fusedFile);
            a.download = `entrega_${llave}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Redirigir a whatsapp universal sin archivo
            window.location.href = `https://wa.me/?text=${encodeURIComponent(msgText)}`;
        }

        // 6. Cerrar modal y limpiar
        modalCaptura.classList.add('hidden');
        modalCaptura.classList.remove('flex');

        // Remove from list visually since it's delivered
        currentOrders = currentOrders.filter(o => o.nro !== selectedOrderForCapture.nro);
        renderOrders();

    } catch (e) {
        console.error(e);
        if (e.name !== 'AbortError') { // AbortError es cuando el usuario cancela el share intencionalmente
            Swal.fire('Error', 'Hubo un problema procesando las imágenes.', 'error');
            btnEnviarWsp.innerHTML = '<i class="fa-brands fa-whatsapp text-xl"></i><span class="text-lg">Intentar de nuevo</span>';
            btnEnviarWsp.removeAttribute('disabled');
        } else {
            btnEnviarWsp.innerHTML = '<i class="fa-brands fa-whatsapp text-xl"></i><span class="text-lg">Enviar a WhatsApp</span>';
            btnEnviarWsp.removeAttribute('disabled');
        }
    }
}
