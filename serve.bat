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
echo   7. Download AI segmentation model
echo   8. Exit
echo ========================================
set /p choice=Select [1-8]: 

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto prod_asgi
if "%choice%"=="3" goto prod_wsgi
if "%choice%"=="4" goto cdn_asgi
if "%choice%"=="5" goto cdn_wsgi
if "%choice%"=="6" goto install
if "%choice%"=="7" goto dl_model
if "%choice%"=="8" exit /b 0
goto menu

:install
echo.
echo Installing dependencies...
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
if %errorlevel% neq 0 (
    pip install -r requirements.txt
)
pause
goto menu

:check_model
set MODEL_FILE=static\models\Xenova\segformer-b2-finetuned-ade-512-512\model.onnx
if exist "%MODEL_FILE%" goto :eof
echo.
echo ========================================
echo   [WARNING] AI segmentation model NOT found
echo   Path: %MODEL_FILE%
echo ========================================
echo.
echo The app can still run, but AI selection tool will be disabled.
echo.
choice /c yn /m "Download the model now (~85MB)? [Y/N]"
if %errorlevel%==2 goto :eof

:dl_model
echo.
echo ========================================
echo   Downloading AI segmentation model...
echo ========================================
echo.
python scripts\download_seg_model.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Model download failed. Check your network connection.
    pause
)
if "%choice%"=="7" goto menu
goto :eof

:dev
call :check_model
echo.
echo Dev mode
python development.py
pause
goto menu

:prod_asgi
call :check_model
echo.
echo Production ASGI
python serve.py --asgi
pause
goto menu

:prod_wsgi
call :check_model
echo.
echo Production WSGI
python serve.py --wsgi
pause
goto menu

:cdn_asgi
call :check_model
echo.
echo CDN mode ASGI  path_prefix=/image
set PATH_PREFIX=/image
python serve.py --asgi
pause
goto menu

:cdn_wsgi
call :check_model
echo.
echo CDN mode WSGI  path_prefix=/image
set PATH_PREFIX=/image
python serve.py --wsgi
pause
goto menu
