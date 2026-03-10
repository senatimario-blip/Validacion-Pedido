@echo off
echo =======================================================
echo Iniciando Servidor Local para Validacion-Pedido
echo =======================================================
echo.
echo Presiona Ctrl+C para detener el servidor.
echo.
start http://localhost:8000
py -m http.server 8000
pause
