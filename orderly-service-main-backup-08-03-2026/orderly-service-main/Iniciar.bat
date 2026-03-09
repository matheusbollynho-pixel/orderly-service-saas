@echo off
REM Bandara Motos - Sistema de OS Launcher
REM Este script abre a aplicação no navegador padrão

setlocal enabledelayedexpansion

REM Abrir URL no navegador padrão
start https://os-bandara.vercel.app

REM Mostrar mensagem
echo.
echo ========================================
echo  Bandara Motos - Sistema de OS
echo ========================================
echo.
echo A aplicacao esta sendo aberta...
echo Se o navegador nao abrir, visite:
echo https://os-bandara.vercel.app
echo.
echo Pressione qualquer tecla para continuar...
pause > nul

endlocal
