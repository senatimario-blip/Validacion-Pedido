# 📄 Ficha Técnica y Manual de Funcionamiento
## Sistema de Validación y Gestión de Pedidos

---

### NO 1: Descripción General
Este aplicativo web es una solución integral diseñada para la gestión, validación y seguimiento de pedidos y comprobantes de pago en tiempo real. Su objetivo principal es optimizar el flujo de trabajo entre la recepción de un pedido y su validación financiera, proporcionando una interfaz moderna, intuitiva y segura.

El sistema permite a los administradores y usuarios visualizar pedidos, verificar comprobantes de pago (vouchers, capturas), gestionar estados (Validado, Pendiente, Rechazado) y obtener estadísticas financieras al instante.

### 🛠️ 2. Ficha Técnica

| Categoría | Tecnología / Detalle |
| :--- | :--- |
| **Tipo de Aplicación** | Single Page Application (SPA) Web |
| **Frontend** | HTML5, CSS3 (Diseño Glassmorphism), JavaScript (ES6+) |
| **Backend / Base de Datos** | Google Apps Script (API) + Google Sheets (Persistencia) |
| **Librerías Externas** | - **SweetAlert2** (Notificaciones modales)<br>- **Tesseract.js** (OCR - Reconocimiento de texto en imágenes)<br>- **FontAwesome 6** (Iconografía)<br>- **Google Fonts** (Tipografía Inter) |
| **Autenticación** | Login con roles (Admin / Usuario) y persistencia de sesión |
| **Despliegue** | Web Hosting Estático (GitHub Pages / Local) |
| **Compatibilidad** | Navegadores modernos (Chrome, Edge, Firefox, Safari) |
| **Diseño** | Responsivo (Desktop y Móvil) con Modo Oscuro |

---

### 🚀 3. Funcionalidades Principales

#### 📊 Dashboard y Estadísticas
*   **Tarjetas en Tiempo Real:** Visualización inmediata de montos totales acumulados y conteo de pedidos por estado (Total, Pendientes, Validados, Rechazados).
*   **Desglose de Validados:** Al hacer clic en la tarjeta "Validados", se despliega un detalle de los métodos de pago (Voucher, Efectivo, Online).

#### 🔍 Filtros Avanzados y Búsqueda
*   **Filtrado por Fecha:**
    *   *Por defecto:* Carga los pedidos del día actual.
    *   *Selector Individual:* Permite elegir una fecha específica.
    *   *Rango de Fechas (Corte):* Modal dedicado para seleccionar un periodo (Desde - Hasta).
*   **Filtros de Estado:** Botones interactivos para ver rápidamente "Todos", "Validados", "Pendientes" o "Rechazados", con indicadores de color.
*   **Búsqueda Textual:** Barra de búsqueda para localizar pedidos por nombre, código o llave única.

#### 📝 Listado de Pedidos
*   **Correlativo Dinámico:** Una columna visual (#) que numera los pedidos mostrados de manera descendente (del total al 1), facilitando el conteo visual según el filtro activo.
*   **Indicadores Visuales:** Badges de colores para estados y tipos de pago.
*   **Acciones:** Botones rápidos para validar (Admin) o ver detalles (Lectura).

#### ✅ Validación y OCR
*   **Modal de Validación:** Interfaz detallada que muestra la imagen del comprobante junto a los datos del pedido.
*   **OCR Integrado:** Herramienta para escanear la imagen del voucher y extraer automáticamente el monto y texto, facilitando la conciliación.
*   **Validación / Rechazo:** Acciones para aprobar el pedido (cambia estado a Validado) o rechazarlo (cambia a Rechazado).

#### ➕ Nuevo Pedido (Ingreso Manual)
*   **Formulario Inteligente:**
    *   **Fecha Bloqueada:** Se fija automáticamente en "Hoy".
    *   **Correlativo Histórico:** Muestra el ID real de base de datos que se asignará (solo lectura).
    *   **Correlativo Visual:** Indica qué número ocuparía este pedido en tu vista actual filtrada (informativo).
*   **Validación:** Campos obligatorios para evitar registros incompletos.

---

### 🔄 4. Cómo Funciona (Flujo de Trabajo)

1.  **Inicio de Sesión:**
    *   El usuario ingresa sus credenciales.
    *   El sistema carga la configuración y valida el rol (Admin o Usuario).

2.  **Carga Inicial:**
    *   Al entrar, el sistema consulta la base de datos (Google Sheet) y muestra automáticamente los **pedidos de la fecha actual**.

3.  **Gestión Diaria:**
    *   El usuario revisa la lista de "Pendientes".
    *   Usa el botón "Validar" (icono de lápiz u ojo).
    *   Revisa el comprobante en pantalla.
    *   Si es correcto -> Clic en **"Validar Pedido"**. El estado cambia a verde y se suma a los totales financieros.
    *   Si hay problemas -> Clic en **"Rechazar"**.

4.  **Cortes y Reportes:**
    *   Para ver el cierre de caja de la semana, el usuario usa el botón **"Corte"**, selecciona el rango de fechas y el sistema recalcula todos los totales y la lista.

5.  **Ingreso Manual:**
    *   Crea nuevos pedidos directamente desde el botón "Nuevo Pedido", llenando la llave y el monto. El sistema se encarga de la fecha y el correlativo.

---

### 💻 5. Requisitos para el Usuario
*   Conexión a Internet estable (para conectar con Google Sheets).
*   Navegador web actualizado.
*   Acceso a la URL del aplicativo desplegado.
