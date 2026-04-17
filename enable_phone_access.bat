@echo off
setlocal EnableExtensions

echo This script adds a Windows Firewall inbound rule for TCP 8000.
echo Run this as Administrator.
echo.

net session >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Administrator permission is required.
    echo Right-click this file and choose "Run as administrator".
    pause
    exit /b 1
)

netsh advfirewall firewall add rule name="CheckinWeb-8000" dir=in action=allow protocol=TCP localport=8000 >nul
if errorlevel 1 (
    echo [ERROR] Failed to add firewall rule.
    pause
    exit /b 1
)

echo Firewall rule added: CheckinWeb-8000
echo You can now use http://YOUR_PC_IP:8000 from your phone on same Wi-Fi.
pause
exit /b 0
