@echo off
setlocal

echo Building Modern WPI Planner...

rem Check if Node.js is available
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    exit /b 1
)

rem Check if npm is available
npm --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm is not available
    echo Please ensure Node.js and npm are properly installed
    exit /b 1
)

echo Node.js and npm are available

rem Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install dependencies
        exit /b 1
    )
    echo Dependencies installed successfully
)

echo Compiling TypeScript...
npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: TypeScript compilation failed
    exit /b 1
)

echo TypeScript compiled successfully!

rem Download fresh course data (optional - for local development)
echo.
echo Downloading fresh course data from WPI servers for local development...
curl -L -o dist/new.schedb https://planner.wpi.edu/new.schedb
if %ERRORLEVEL% EQU 0 (
    echo ✓ Successfully downloaded fresh course data!
    echo Note: When deployed to GitHub Pages, course data is updated automatically every 15 minutes
) else (
    echo ℹ Warning: Could not download course data for local development
    echo This is OK - when deployed, the GitHub Actions workflow will handle data updates
)

echo.
echo ✓ Build completed successfully!
echo.
echo To start the development server, run:
echo   npm start
echo.
echo To serve the built application, run:
echo   npm run serve
echo.
echo The application will automatically fetch course data from WPI servers
echo when first loaded, and will cache it locally for better performance.