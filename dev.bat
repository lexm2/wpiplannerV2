@echo off
setlocal

echo Starting WPI Planner Development Environment...

rem Check if dependencies are installed
if not exist "node_modules" (
    echo Dependencies not found. Running initial setup...
    call build.bat
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Initial setup failed
        exit /b 1
    )
)

echo Starting TypeScript compiler in watch mode...
start "TypeScript Watch" cmd /k "npm run dev"

timeout /t 3 /nobreak >nul

echo Starting development server...
start "Development Server" cmd /k "npm run serve"

echo.
echo ✓ Development environment started!
echo.
echo - TypeScript compiler is running in watch mode
echo - Development server is running on http://localhost:3000
echo - Both will reload automatically when you make changes
echo.
echo Press Ctrl+C in each window to stop the services.