@echo off
chcp 65001 >nul
REM ============================================================
REM  FastAPI Jinja2 PWA 启动脚本 (Windows)
REM ============================================================

cd /d "%~dp0"

:check_python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未找到 Python，请先安装 Python 3.10+
    pause
    exit /b 1
)

:menu
echo ========================================
echo   FastAPI Jinja2 PWA
echo ========================================
echo   1. 本地开发模式 (uvicorn --reload)
echo   2. 生产模式 ASGI (uvicorn)
echo   3. 生产模式 WSGI (waitress)
echo   4. CDN 模式 ASGI (prefix^=/image)
echo   5. CDN 模式 WSGI (prefix^=/image)
echo   6. 安装依赖
echo   7. 退出
echo ========================================
set /p choice="请选择 [1-7]: "

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
echo [安装依赖...]
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
pause
goto menu

:dev
echo.
echo [本地开发模式]
python development.py
pause
goto menu

:prod_asgi
echo.
echo [生产模式 - ASGI]
python serve.py --asgi
pause
goto menu

:prod_wsgi
echo.
echo [生产模式 - WSGI]
python serve.py --wsgi
pause
goto menu

:cdn_asgi
echo.
echo [CDN 模式 - ASGI]  path_prefix=/image
set PATH_PREFIX=/image
python serve.py --asgi
pause
goto menu

:cdn_wsgi
echo.
echo [CDN 模式 - WSGI]  path_prefix=/image
set PATH_PREFIX=/image
python serve.py --wsgi
pause
goto menu
