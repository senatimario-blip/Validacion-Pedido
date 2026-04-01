# GUÍA DE INTEGRACIÓN SEGURA: SISTEMA DE TRAZABILIDAD

Sigue estos 3 pasos exactos para activar la trazabilidad en tu sistema real sin romper nada.

## PASO 1: Preparar la Hoja de Google
1. Abre tu Google Sheet principal.
2. Crea una nueva pestaña (hoja) en la parte inferior llamada exactamente: **Trazabilidad**.
3. (Opcional) Pon estos encabezados en la primera fila (A1 hasta H1): 
   `ID Pedido | Fecha | Hora | Hito / Evento | Minutos | Driver | Ubicación | Usuario`

---

## PASO 2: Añadir el Nuevo Código (Final del Script)
1. Ve a tu Editor de Scripts de Google (Extensiones > Apps Script).
2. Ve al puro final de tu código actual (haz scroll hasta abajo del todo).
3. Pega el código que está en el archivo **`Codigo_Trazabilidad_GAS.txt`** (el que te cree anteriormente).

---

## PASO 3: Insertar los "Ganchos" (IMPORTANTE)
Busca estas funciones en tu script actual y añade la línea de trazabilidad donde se indica:

### A) En la función `crearPedido`:
Busca la línea donde se guarda el pedido en la hoja y añade debajo:
```javascript
// Añadir esta línea dentro de crearPedido:
registrarEvento(data.nro, "CREACIÓN", "", "Robot", "Ingreso al Sistema");
```

### B) En la función `marcarPorValidar`:
Busca la sección donde se actualizan los metadatos y añade:
```javascript
// Añadir esta línea dentro de marcarPorValidar:
registrarEvento(nro, "EVIDENCIA ENVIADA", rows[i][9], "App Repartidor", "Foto capturada");
```

### C) En la función `asignarMotorizado`:
Añade esta línea después de asignar el nombre:
```javascript
// Añadir esta línea dentro de asignarMotorizado:
registrarEvento(nroPedido, "ASIGNACIÓN", nuevoDriver, "Admin", "Asignado para despacho");
```

### D) En la función `validarPedido`:
Añade esta línea al final del proceso de validación:
```javascript
// Añadir esta línea dentro de validarPedido:
registrarEvento(data.nro, "VALIDADO", data.envio, data.usuario, "Validación administrativa");
```

---

## PASO 4: Guardar y Probar
1. Haz clic en el icono de **Guardar** (Disco azul) en el Editor de Script.
2. Haz clic en **Implementar > Administrar implementaciones** y actualiza a una nueva versión si es necesario.
3. ¡Listo! El siguiente pedido que entre ya se registrará en la pestaña "Trazabilidad".
