@echo off
setlocal enabledelayedexpansion

chcp 65001 >nul
title NeutrDice Snow - Windows 一键部署

REM ============================================================================
REM NeutrDice Snow - Windows 一键部署脚本
REM ============================================================================
REM 特性：
REM - 交互式输入 WebUI / NapCat / SealDice 端口
REM - 自动生成 .env 文件
REM - 自动检测 docker-compose 可用性
REM - 支持按端口号命名实例（docker-<webui-port>）
REM - 自动创建数据目录
REM - 端口冲突检测
REM - 支持清理实例
REM ============================================================================

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
cd /d "%SCRIPT_DIR%"

set "COMPOSE_FILE=docker\docker-compose.yml"

set "DEFAULT_WEBUI_PORT=3001"
set "DEFAULT_FRONTEND_PORT=3000"
set "DEFAULT_NAPCAT_WEBUI_PORT=6099"
set "DEFAULT_SEALDICE_WEBUI_PORT=32110"
set "DEFAULT_SEALDICE_PORT2=32111"
set "DEFAULT_NAPCAT_PORT1=3002"
set "DEFAULT_NAPCAT_PORT2=3003"
set "DEFAULT_NAPCAT_PORT3=6099"

set "GREEN=[92m"
set "YELLOW=[93m"
set "RED=[91m"
set "NC=[0m"

:MENU
cls
echo.
echo  =========================================
echo   NeutrDice Snow - Windows 一键部署
echo  =========================================
echo.
echo  [1] 部署新实例
echo  [2] 查看实例状态
echo  [3] 清理实例
echo  [4] 退出
echo.
set /p CHOICE="请选择操作 [1-4]: "

if "%CHOICE%"=="1" goto DEPLOY
if "%CHOICE%"=="2" goto STATUS
if "%CHOICE%"=="3" goto CLEAN
if "%CHOICE%"=="4" goto END
goto MENU

:DEPLOY
cls
echo.
echo  =========================================
echo   部署新实例
echo  =========================================
echo.

REM 环境检测
echo [检测] 检查 Docker...
docker --version >nul 2>&1
if errorlevel 1 (
    echo %RED%[错误] 未找到 Docker，请先安装 Docker Desktop%NC%
    echo 下载地址: https://www.docker.com/products/docker-desktop/
    pause
    goto END
)
docker --version
echo.

echo [检测] 检查 docker-compose...
docker compose version >nul 2>&1
if not errorlevel 1 (
    echo %GREEN%[成功] 使用 docker compose%NC%
    set "DOCKER_COMPOSE=docker compose"
) else (
    docker-compose --version >nul 2>&1
    if not errorlevel 1 (
        echo %GREEN%[成功] 使用 docker-compose%NC%
        set "DOCKER_COMPOSE=docker-compose"
    ) else (
        echo %RED%[错误] 未找到 docker-compose 或 docker compose%NC%
        pause
        goto END
    )
)
echo.

REM 端口输入
echo =========================================
echo   端口配置
echo =========================================
echo.

set /p WEBUI_PORT="请输入 WebUI 端口 (面板) [默认: %DEFAULT_WEBUI_PORT%]: "
if "%WEBUI_PORT%"=="" set "WEBUI_PORT=%DEFAULT_WEBUI_PORT%"
call :VALIDATE_PORT "WebUI" %WEBUI_PORT%

echo.
echo NapCat 端口配置：
echo   建议分配 3 个连续端口
echo   例如输入 6099，则自动分配 6099, 6100, 6101
set /p NAPCAT_BASE="请输入 NapCat 基础端口 [默认: %DEFAULT_NAPCAT_WEBUI_PORT%]: "
if "%NAPCAT_BASE%"=="" set "NAPCAT_BASE=%DEFAULT_NAPCAT_WEBUI_PORT%"
call :VALIDATE_PORT "NapCat" %NAPCAT_BASE%
set "NAPCAT_WEBUI_PORT=%NAPCAT_BASE%"
set "NAPCAT_PORT1=%NAPCAT_BASE%"
set /a NAPCAT_PORT2=%NAPCAT_BASE%+1
set /a NAPCAT_PORT3=%NAPCAT_BASE%+2

echo.
echo SealDice 端口配置：
echo   建议分配 2 个连续端口
echo   例如输入 32110，则自动分配 32110, 32111
set /p SEALDICE_BASE="请输入 SealDice 基础端口 [默认: %DEFAULT_SEALDICE_WEBUI_PORT%]: "
if "%SEALDICE_BASE%"=="" set "SEALDICE_BASE=%DEFAULT_SEALDICE_WEBUI_PORT%"
call :VALIDATE_PORT "SealDice" %SEALDICE_BASE%
set "SEALDICE_WEBUI_PORT=%SEALDICE_BASE%"
set /a SEALDICE_PORT2=%SEALDICE_BASE%+1

set /p FRONTEND_PORT="请输入前端端口 [默认: %DEFAULT_FRONTEND_PORT%]: "
if "%FRONTEND_PORT%"=="" set "FRONTEND_PORT=%DEFAULT_FRONTEND_PORT%"
call :VALIDATE_PORT "前端" %FRONTEND_PORT%

echo.
echo =========================================
echo   数据目录
echo =========================================
echo.
set /p DATA_DIR="数据目录 [默认: .\data]: "
if "%DATA_DIR%"=="" set "DATA_DIR=.\data"

REM 实例名
set "PROJECT_NAME=docker-%WEBUI_PORT%"
set "ENV_FILE=%SCRIPT_DIR%\.env.%PROJECT_NAME%"

echo.
echo =========================================
echo   配置预览
echo =========================================
echo.
echo   实例名:       %PROJECT_NAME%
echo   面板端口:     %WEBUI_PORT% ^> 3001
echo   前端端口:     %FRONTEND_PORT% ^> 80
echo   NapCat 端口:  %NAPCAT_PORT1%, %NAPCAT_PORT2%, %NAPCAT_PORT3%
echo                 NapCat WebUI: %NAPCAT_WEBUI_PORT%
echo   SealDice 端口: %SEALDICE_WEBUI_PORT%, %SEALDICE_PORT2%
echo   数据目录:     %DATA_DIR%
echo   环境文件:     %ENV_FILE%
echo   容器名前缀:   %PROJECT_NAME%-
echo.

REM 端口冲突检测
echo =========================================
echo   端口冲突检测
echo =========================================
echo.

call :CHECK_PORT_IN_USE %WEBUI_PORT%
if !ERRORLEVEL! equ 0 (
    echo %YELLOW%[警告] 端口 %WEBUI_PORT% 可能已被占用%NC%
)
call :CHECK_PORT_IN_USE %FRONTEND_PORT%
if !ERRORLEVEL! equ 0 (
    echo %YELLOW%[警告] 端口 %FRONTEND_PORT% 可能已被占用%NC%
)
call :CHECK_PORT_IN_USE %NAPCAT_PORT1%
if !ERRORLEVEL! equ 0 (
    echo %YELLOW%[警告] 端口 %NAPCAT_PORT1% 可能已被占用%NC%
)
call :CHECK_PORT_IN_USE %NAPCAT_PORT2%
if !ERRORLEVEL! equ 0 (
    echo %YELLOW%[警告] 端口 %NAPCAT_PORT2% 可能已被占用%NC%
)
call :CHECK_PORT_IN_USE %NAPCAT_PORT3%
if !ERRORLEVEL! equ 0 (
    echo %YELLOW%[警告] 端口 %NAPCAT_PORT3% 可能已被占用%NC%
)
call :CHECK_PORT_IN_USE %NAPCAT_WEBUI_PORT%
if !ERRORLEVEL! equ 0 (
    echo %YELLOW%[警告] 端口 %NAPCAT_WEBUI_PORT% 可能已被占用%NC%
)
call :CHECK_PORT_IN_USE %SEALDICE_WEBUI_PORT%
if !ERRORLEVEL! equ 0 (
    echo %YELLOW%[警告] 端口 %SEALDICE_WEBUI_PORT% 可能已被占用%NC%
)
call :CHECK_PORT_IN_USE %SEALDICE_PORT2%
if !ERRORLEVEL! equ 0 (
    echo %YELLOW%[警告] 端口 %SEALDICE_PORT2% 可能已被占用%NC%
)

echo.
set /p CONFIRM="确认开始部署? [y/N]: "
if /i not "!CONFIRM!"=="y" (
    echo 已取消部署。
    pause
    goto END
)

REM 创建数据目录
echo.
echo =========================================
echo   创建数据目录
echo =========================================
echo.

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if not exist "%DATA_DIR%\sealdice\data" mkdir "%DATA_DIR%\sealdice\data"
if not exist "%DATA_DIR%\sealdice\backups" mkdir "%DATA_DIR%\sealdice\backups"
if not exist "%DATA_DIR%\napcat\data" mkdir "%DATA_DIR%\napcat\data"
if not exist "%DATA_DIR%\napcat\qq_data" mkdir "%DATA_DIR%\napcat\qq_data"
if not exist "%DATA_DIR%\%PROJECT_NAME%-logs" mkdir "%DATA_DIR%\%PROJECT_NAME%-logs"

echo %GREEN%[成功] 数据目录已创建%NC%
echo.

REM 生成环境文件
echo =========================================
echo   生成配置文件
echo =========================================
echo.

(
echo # 由 deploy.bat 自动生成
echo # 生成时间: %date% %time%
echo COMPOSE_PROJECT_NAME=%PROJECT_NAME%
echo.
echo # 面板/前端/核心端口
echo PANEL_PORT=%WEBUI_PORT%
echo FRONTEND_PORT=%FRONTEND_PORT%
echo SEALDICE_PORT1=%SEALDICE_WEBUI_PORT%
echo SEALDICE_PORT2=%SEALDICE_PORT2%
echo NAPCAT_PORT1=%NAPCAT_PORT1%
echo NAPCAT_PORT2=%NAPCAT_PORT2%
echo NAPCAT_PORT3=%NAPCAT_PORT3%
echo NAPCAT_WEBUI_PORT=%NAPCAT_WEBUI_PORT%
echo PANEL_PASSWORD=neutrdice2024
) > "%ENV_FILE%"

echo %GREEN%[成功] 环境文件已生成: %ENV_FILE%%NC%
echo.

REM 启动服务
echo =========================================
echo   启动服务
echo =========================================
echo.

echo [信息] 正在构建镜像...
%DOCKER_COMPOSE% -f "%COMPOSE_FILE%" --env-file "%ENV_FILE%" build

echo.
echo [信息] 正在启动容器...
%DOCKER_COMPOSE% -f "%COMPOSE_FILE%" --env-file "%ENV_FILE%" up -d

echo.
echo =========================================
echo   部署完成
echo =========================================
echo.
echo   面板地址: http://^<服务器IP^>:%WEBUI_PORT%
echo   前端地址: http://^<服务器IP^>:%FRONTEND_PORT%
echo   默认密码: neutrdice2024
echo   环境文件: %ENV_FILE%
echo.
echo   如需再次部署/更新：
echo     deploy.bat
echo.
echo   如需清理实例：
echo     deploy.bat --clean %PROJECT_NAME%
echo.
pause
goto END

:STATUS
cls
echo.
echo  =========================================
echo   实例状态
echo  =========================================
echo.
docker ps --filter "label=neutrdice.instance" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>nul || echo 未找到运行中的实例
echo.
echo 环境文件：
dir /b .env.docker-* 2>nul || echo   未找到环境文件
echo.
pause
goto END

:CLEAN
cls
echo.
echo  =========================================
echo   清理实例
echo  =========================================
echo.
set /p CLEAN_TARGET="请输入实例名 (例如 docker-3001): "
if "%CLEAN_TARGET%"=="" (
    echo 实例名不能为空。
    pause
    goto END
)

echo.
echo 即将清理实例: %CLEAN_TARGET%
echo 这将删除所有容器、网络和数据卷！
echo.
set /p CLEAN_CONFIRM="确认删除该实例? [y/N]: "
if /i not "%CLEAN_CONFIRM%"=="y" (
    echo 已取消清理。
    pause
    goto END
)

echo.
echo [信息] 正在停止并删除实例...
docker compose -f "%COMPOSE_FILE%" -p "%CLEAN_TARGET%" down -v 2>nul || docker-compose -f "%COMPOSE_FILE%" -p "%CLEAN_TARGET%" down -v 2>nul

echo.
echo [成功] 实例清理完成。
echo 如需彻底删除，请额外手动删除：
echo   - 环境文件: .env.%CLEAN_TARGET%
echo   - 数据目录: %DATA_DIR%
echo.
pause
goto END

:VALIDATE_PORT
set "PORT_NAME=%~1"
set "PORT_VALUE=%~2"
if not "%PORT_VALUE%"=="" (
    set /a PORT_NUM=%PORT_VALUE% 2>nul
    if errorlevel 1 (
        echo %RED%[错误] %PORT_NAME% 端口必须是数字%NC%
        pause
        goto END
    )
    if %PORT_NUM% lss 1 (
        echo %RED%[错误] %PORT_NAME% 端口必须大于 0%NC%
        pause
        goto END
    )
    if %PORT_NUM% gtr 65535 (
        echo %RED%[错误] %PORT_NAME% 端口必须小于 65536%NC%
        pause
        goto END
    )
)
exit /b 0

:CHECK_PORT_IN_USE
set "CHECK_PORT=%~1"
netstat -ano | findstr ":%~1 " | findstr "LISTENING" >nul 2>&1
exit /b %ERRORLEVEL%

:END
endlocal
