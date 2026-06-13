@echo off
setlocal
cd /d "%~dp0"

set "ACTION=%~1"
if "%ACTION%"=="" set "ACTION=start"

if /I "%ACTION%"=="start" goto start
if /I "%ACTION%"=="stop" goto stop
if /I "%ACTION%"=="status" goto status
goto usage

:start
call :ensure_docker || exit /b 1

rem Skip startup if Supabase containers are already healthy
call npx supabase status >nul 2>&1
if %ERRORLEVEL%==0 (
    echo Supabase is already running.
    call npx supabase status
    exit /b 0
)

call npx supabase start
exit /b %ERRORLEVEL%

:stop
call npx supabase stop
exit /b %ERRORLEVEL%

:status
call :ensure_docker || exit /b 1
call npx supabase status
exit /b %ERRORLEVEL%

:ensure_docker
docker info >nul 2>&1
if %ERRORLEVEL%==0 exit /b 0
echo Docker Desktop is not running. Starting it...
start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
for /l %%i in (1,1,30) do (
    timeout /t 2 /nobreak >nul
    docker info >nul 2>&1 && exit /b 0
)
echo Docker Desktop did not become ready in time.
exit /b 1

:usage
echo Usage: supabase.bat [start^|stop^|status]
echo.
echo   start   (default) Start Docker Desktop if needed, then Supabase
echo   stop    Stop Supabase containers
echo   status  Show Supabase status
exit /b 1
