@echo off
echo Starting Podman machine...
"C:\Program Files\RedHat\Podman\podman.exe" machine start >nul 2>&1
if %errorlevel% neq 0 (
    echo Podman machine is already running or failed to start.
) else (
    echo Podman machine started successfully.
)
echo.

if /I "%1"=="supabase" (
    echo Supabase parameter detected. Starting local Supabase...
    cd /d "%~dp0"
    npx supabase start
    echo.
) else (
    podman ps
    echo.
    echo Usage: run.bat [supabase]
    echo   supabase  - Also starts local Supabase after Podman is running
    pause
)
