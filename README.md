# Portal de Validación de Pedidos

Aplicación web segura y moderna para la validación y gestión de pedidos, conectada directamente a Google Sheets.

## Características

*   **Gestión de Pedidos**: Visualización en tiempo real de pedidos (Pendientes, Validados, Rechazados).
*   **Validación Inteligente**:
    *   **OCR (Reconocimiento Óptico)**: Extrae automáticamente el monto de las fotos de los vouchers.
    *   **Carga Masiva (CSV)**: Importa múltiples pedidos desde archivos CSV/TXT. Formato: `Fecha, Llave, Monto`.
    *   **Validación Manual**: Opción para pagos en Efectivo y Online.
*   **Roles de Usuario**:
    *   **Admin**: Control total (Crear, Editar, Validar, Rechazar).
    *   **Lector**: Modo "Solo Lectura" para consulta (sin permisos de edición).
*   **Interfaz Moderna**: Diseño "Glassmorphism" con modo oscuro, totalmente responsivo.

## Instalación y Despliegue

### 1. Backend (Google Sheets + Apps Script)

1.  Abre tu Hoja de Cálculo de Google.
2.  Ve a **Extensiones > Apps Script**.
3.  Copia todo el contenido del archivo `Codigo_Google_Script.txt` y pégalo en el editor `Code.gs`.
4.  **Configura las Hojas**:
    *   Crea una pestaña llamada **`Usuarios`** (Columnas: Usuario, Contraseña, Nombre, Rol).
    *   Crea una pestaña llamada **`Pedidos`**.
5.  **Despliegue (Deploy)**:
    *   Clic en **Implementar > Nueva implementación**.
    *   Tipo: **Aplicación web**.
    *   Ejecutar como: **Yo (tu cuenta)**.
    *   Quién tiene acceso: **Cualquier persona** (Necesario para que la App web se conecte).
    *   Copia la **URL de la aplicación web** generada.

### 2. Frontend (GitHub Pages)

1.  Sube los siguientes archivos a tu repositorio de GitHub:
    *   `index.html`
    *   `styles.css`
    *   `app.js`
2.  Ve a **Settings > Pages** en GitHub y activa GitHub Pages (rama main/master).
3.  Abre la URL que te da GitHub.

### 3. Uso

1.  Al abrir la App, pega la **URL de la API** (del paso 1) en el campo correspondiente.
2.  Ingresa con tu usuario y contraseña.
3.  ¡Listo!

## Gestión de Roles

En la hoja `Usuarios`, columna D (**Rol**):
*   Escribe `Admin` para dar permisos totales.
*   Déjalo vacío o escribe cualquier otra cosa para dar permisos de **Solo Lectura**.
