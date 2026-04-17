@echo off
setlocal EnableExtensions

cd /d "%~dp0checkin_web"

if not exist "app.py" (
    echo [ERROR] checkin_web\app.py was not found.
    echo Put this script in the project root and run again.
    pause
    exit /b 1
)

where py >nul 2>nul
if %errorlevel%==0 (
    set "PY_EXE=py"
    set "PY_ARGS=-3"
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] Python was not found.
        echo Install Python 3.10+ and enable "Add python to PATH".
        pause
        exit /b 1
    )
    set "PY_EXE=python"
    set "PY_ARGS="
)

if not exist ".venv\Scripts\python.exe" (
    echo [1/4] Creating virtual environment...
    "%PY_EXE%" %PY_ARGS% -m venv .venv
    if errorlevel 1 goto :ERROR
)

echo [2/4] Installing/updating dependencies...
set "PIP_DISABLE_PIP_VERSION_CHECK=1"
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :ERROR

set "PORT=8000"
set "LAN_IP="
for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr /R /C:"IPv4 Address" /C:"IPv4 ??"') do (
    set "LAN_IP=%%I"
    goto :IP_FOUND
)

:IP_FOUND
set "LAN_IP=%LAN_IP: =%"
if "%LAN_IP%"=="" set "LAN_IP=127.0.0.1"

echo [3/4] Ready to start.
echo.
echo =========================================
echo PC URL:     http://127.0.0.1:%PORT%
echo Phone URL:  http://%LAN_IP%:%PORT%   (same Wi-Fi)
echo Stop server: Press Ctrl + C in this window
echo =========================================
echo.

if /I "%~1"=="--dry-run" (
    echo Dry run passed.
    exit /b 0
)

start "" "http://127.0.0.1:%PORT%"

set "FLASK_DEBUG=0"
set "PORT=%PORT%"

echo [4/4] Server is running...
".venv\Scripts\python.exe" app.py

echo.
echo Server stopped.
pause
exit /b 0

:ERROR
echo.
echo Startup failed. Send me the last 20 lines of this window and I will fix it.
pause
exit /b 1
