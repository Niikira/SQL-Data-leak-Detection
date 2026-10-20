@echo off
chcp 65001 >nul
title Parar - Deteccao de Vazamento SQL

echo ============================================================
echo   ENCERRANDO O SISTEMA DE DETECCAO
echo   API porta 5000 + Dashboard porta 5173 + monitoramento
echo ============================================================
echo.

set "ACHOU="
for %%P in (5000 5173) do (
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P" ^| findstr LISTENING') do (
        echo Encerrando porta %%P - PID %%A ...
        taskkill /PID %%A /T /F >nul 2>nul
        set "ACHOU=1"
    )
)

echo.
if defined ACHOU (
    echo Tudo encerrado.
) else (
    echo Nada estava rodando nas portas 5000 / 5173.
)

timeout /t 3 /nobreak >nul 2>nul
