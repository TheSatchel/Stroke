@echo off
chcp 65001 >nul
REM ============================================================
REM  FastAPI Jinja2 PWA launch script (Windows)
REM ============================================================

cd /d "%~dp0"

:check_python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python 3.10+
    pause
    exit /b 1
)

:menu
echo ========================================
echo   FastAPI Jinja2 PWA
echo ========================================
echo   1. Dev mode (uvicorn --reload)
echo   2. Production ASGI (uvicorn)
echo   3. Production WSGI (waitress)
echo   4. CDN mode ASGI (prefix=/image)
echo   5. CDN mode WSGI (prefix=/image)
echo   6. Install dependencies
echo   7. Exit
echo ========================================
set /p choice=Select [1-7]: 

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto prod_asgi
if "%choice%"=="3" goto prod_wsgi
if "%choice%"=="4" goto cdn_asgi
if "%choice%"=="5" goto cdn_wsgi
if "%choice%"=="6" goto install
if "%choice%"=="7" exit /b 0
goto menu

:install
echo.
echo Installing dependencies...
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
pause
goto menu

:dev
echo.
echo Dev mode
python development.py
pause
goto menu

:prod_asgi
echo.
echo Production ASGI
python serve.py --asgi
pause
goto menu

:prod_wsgi
echo.
echo Production WSGI
python serve.py --wsgi
pause
goto menu

:cdn_asgi
echo.
echo CDN mode ASGI  path_prefix=/image
set PATH_PREFIX=/image
python serve.py --asgi
pause
goto menu

:cdn_wsgi
echo.
echo CDN mode WSGI  path_prefix=/image
set PATH_PREFIX=/image
python serve.py --wsgi
pause
goto menu
