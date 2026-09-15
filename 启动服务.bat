@echo off
chcp 65001 >nul
title 发卡网系统启动器
echo ============================================
echo   发卡网系统 - 一键启动
echo ============================================
cd /d %~dp0

if not exist node_modules (
  echo [1/2] 首次运行，正在安装依赖（仅需一次）...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo 依赖安装失败，请确认已安装 Node.js：https://nodejs.org/
    pause
    exit /b 1
  )
)

echo [2/2] 正在启动服务...
echo   用户端   : http://localhost:3000/index.html
echo   管理后台 : http://localhost:3000/admin.html
echo   管理账号 : admin / admin123
echo ============================================
call npm start
pause
