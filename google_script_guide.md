# Guía de Actualización de Google Apps Script (Versión Inteligente)

Para solucionar el problema de que no se concatena la información en tu hoja de cálculo, por favor reemplaza tu función `validarPedido` por esta versión mejorada. 

Esta versión **busca automáticamente las columnas por su nombre** (así no importa si moviste las columnas) y **preserva la foto existente** si no subes una nueva.

```javascript
/**
 * Función mejorada para validar pedidos.
 * Concatena Tipo de Pago y Vuelto en la celda de la FOTO.
 */
function validarPedido(data) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Pedidos");
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0]; // La primera fila son los encabezados
  
  // 1. Encontrar índices de columnas dinámicamente
  var colNro = headers.indexOf("Pedido"); // O "Nro" según tu hoja
  if (colNro === -1) colNro = headers.indexOf("Nro");
  
  var colEstado = headers.indexOf("Estado");
  var colFoto = headers.indexOf("Foto");
  var colValidador = headers.indexOf("Validado por");
  
  // 2. Buscar la fila del pedido
  var rowIndex = -1;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][colNro] == data.nro) {
      rowIndex = i + 1;
      break;
    }
  }
  
  if (rowIndex === -1) return { success: false, message: "Pedido #" + data.nro + " no encontrado." };

  // 3. Determinar la URL de la foto (Nueva o Existente)
  var currentFotoValue = rows[rowIndex-1][colFoto] || "";
  var photoUrl = "";
  
  // Extraer solo la URL si la celda ya tenía texto inyectado antes
  if (currentFotoValue.indexOf("http") !== -1) {
    photoUrl = currentFotoValue.split(" ")[0]; // Tomamos solo el primer bloque (la URL)
  }

  // Si se subió una nueva foto, sobrescribimos la URL
  if (data.archivo && data.archivo.data) {
    var folder = DriveApp.getFolderById("TU_ID_DE_CARPETA"); // <--- REEMPLAZA ESTO
    var blob = Utilities.newBlob(Utilities.base64Decode(data.archivo.data), data.archivo.type, data.archivo.name);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    // Guardamos link directo para previsualización inmediata en la App
    photoUrl = "https://lh3.googleusercontent.com/d/" + file.getId();
  }
  
  // 4. Construir el valor final INYECTADO
  // Formato: [URL] [TIPO] [VUELTO: XX]
  var finalValue = photoUrl;
  
  if (data.tipo) {
    finalValue += " " + data.tipo;
  }
  
  if (data.tipo === "EFECTIVO" && data.vuelto) {
    finalValue += " VUELTO: " + data.vuelto;
  }
  
  // 5. Guardar en la hoja
  sheet.getRange(rowIndex, colEstado + 1).setValue("Validado");
  sheet.getRange(rowIndex, colFoto + 1).setValue(finalValue.trim());
  sheet.getRange(rowIndex, colValidador + 1).setValue(data.usuario);
  
  return { 
    success: true, 
    message: "Pedido " + data.nro + " validado como " + data.tipo,
    debug_saved_value: finalValue.trim() // Para que veas qué se guardó
  };
}
```

### ¿Por qué la versión anterior pudo fallar?
1.  **Columnas estáticas:** Si tu columna "Foto" no era exactamente la número 7, el script no guardaba nada o guardaba en el lugar equivocado. Esta versión busca la palabra "Foto" en la cabecera.
2.  **Falta de "Deploy":** Asegúrense de que después de guardar el código, hagan clic en **"Implementar" -> "Administrar implementaciones" -> Editar -> "Versión: Nueva"** para que los cambios se activen.

### Acciones recomendadas:
1.  Asegúrate de que los encabezados de tu Excel se llamen exactamente: **"Pedido"** (o "Nro"), **"Estado"**, **"Foto"** y **"Validado por"**.
2.  Reemplaza el código, guarda y publica una nueva versión del script de Google.
3.  Prueba validar un pedido de nuevo y mira el log de consola del navegador si algo falla.
