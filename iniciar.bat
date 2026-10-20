@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Deteccao de Vazamento SQL - Dashboard + Pentest

echo ============================================================
echo   SISTEMA DE DETECCAO DE VAZAMENTO DE DADOS (SQL)
echo ------------------------------------------------------------
echo   Subindo API + Dashboard. O navegador abre sozinho.
echo   O dashboard fica em: http://localhost:5173
echo.
echo   IMPORTANTE: o MySQL precisa estar ligado (usuario root).
echo   Para PARAR tudo: feche esta janela ou pressione Ctrl+C.
echo ============================================================
echo.

where python >nul 2>nul
if %errorlevel%==0 (
    python start.py
) else (
    where py >nul 2>nul
    if %errorlevel%==0 (
        py start.py
    ) else (
        echo [ERRO] Python nao encontrado no PATH. Instale o Python e tente de novo.
    )
)

echo.
echo O sistema foi encerrado.
pause
