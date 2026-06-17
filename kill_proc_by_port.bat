@echo off
setlocal

if "%~1"=="" (
    echo Usage: kill_proc_by_port.bat ^<port_number^>
    exit /b 1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%~1 "') do (
    if not "%%a"=="0" (
        taskkill /PID %%a /F
    )
)

endlocal