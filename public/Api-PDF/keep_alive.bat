@echo off
echo Iniciando keep_alive para bandara-os-api...
pip install requests -q
python "%~dp0keep_alive.py"
pause
