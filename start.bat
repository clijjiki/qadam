@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Запуск Qadam...
python serve.py 8080
pause
