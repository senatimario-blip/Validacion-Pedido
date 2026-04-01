# Guía de Configuración - Sistema de Validación

Sigue estos pasos para poner en marcha tu sistema.

## 1. Configurar Google Sheets

1. Crea una nueva **Hoja de Cálculo de Google**.
2. Renombra la pestaña predeterminada a `Pedidos`.
3. Crea una segunda pestaña y llámala `Usuarios`.

### Estructura de Columnas (Importante seguir el orden)

**Pestaña `Pedidos` (Fila 1):**
- A: Nro Pedido
- B: Fecha Registro
- C: Llave
- D: Monto
- E: Foto (URL)
- F: Monto Foto
- G: Estado
- H: Validado Por
- I: Fecha Validación

**Pestaña `Usuarios` (Fila 1):**
- A: Usuario
- B: Contraseña
- C: Nombre Completo

### Crear tu primer usuario (para entrar al sistema)
En la pestaña `Usuarios` (Fila 2), escribe:
- A2: `admin`
- B2: `123456`
- C2: `Administrador`

## 2. Configurar el Backend (Google Apps Script)

1. En tu Hoja de Cálculo, ve al menú **Extensiones > Apps Script**.
2. Se abrirá una pestaña nueva. Borra todo el código que aparece en `Código.gs`.
3. Abre el archivo local `Codigo_Google_Script.txt` que te he generado, copia todo su contenido y pégalo en el editor de Google.
4. Dale nombre al proyecto (ej: "API Validación").
5. Guarda con el icono de disquete 💾.

## 3. Desplegar como Aplicación Web

1. Haz clic en el botón azul **Implementar** (arriba derecha) > **Nueva implementación**.
2. En "Seleccionar tipo", elige **Aplicación web**.
3. Configura lo siguiente:
   - **Descripción**: Versión 1
   - **Ejecutar como**: `Yo` (tu cuenta de Google)
   - **Quién tiene acceso**: `Cualquier usuario` (Esto es vital para que funcione el login)
4. Clic en **Implementar**.
5. Te pedirá permisos:
   - Clic en "Revisar permisos".
   - Elige tu cuenta.
   - Si sale "Google no ha verificado esta aplicación", haz clic en **Advanced/Avanzado** y luego en **Ir a... (inseguro)**.
   - Clic en **Allow/Permitir**.
6. **Copia la URL de la aplicación web** que te entrega al final (termina en `/exec`).

## 4. Conectar la Web

1. Abre el archivo `index.html` en tu navegador (doble clic).
2. Verás la pantalla de Login.
3. En el campo "URL del Script de Google", **pega la URL** que copiaste en el paso anterior.
4. Ingresa el usuario (`admin`) y contraseña (`123456`) que creaste en la Hoja de Cálculo.
5. ¡Listo! Ya puedes empezar a registrar y validar pedidos.

## Notas Adicionales

- **Fotos**: La primera vez que subas una foto, el script creará automáticamente una carpeta en tu Google Drive llamada `Fotos_Pedidos_Validacion`.
- **OCR**: La lectura de montos es automática. Si falla, puedes ingresar el monto manualmente.
