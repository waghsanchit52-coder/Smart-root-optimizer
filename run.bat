@echo off
title Pune Smart Route Optimizer - Server
color 0A
echo ============================================================
echo        PUNE SMART ROUTE OPTIMIZER (C++ & Flask)
echo ============================================================
echo.
echo [1/2] Checking C++ RouteOptimizer_Web binary...
if not exist "RouteOptimizer_Web.exe" (
    echo [ERROR] RouteOptimizer_Web.exe not found! Please compile main.cpp.
    pause
    exit /b
)
echo [OK] C++ Binary verified.
echo.
echo [2/2] Starting Flask Backend at http://localhost:5000 ...
echo Press Ctrl+C in this terminal to stop the server anytime.
echo.
start http://localhost:5000
python server.py
pause
