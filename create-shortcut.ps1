$ErrorActionPreference = "Stop"

# Paths
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$electronExe = Join-Path $projectDir "node_modules\electron\dist\electron.exe"
$distIndex = Join-Path $projectDir "dist\index.html"
$desktopDir = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopDir "ImageTrans Pro.lnk"

# Check prerequisites
if (-not (Test-Path $electronExe)) {
    Write-Host "ERROR: electron.exe not found. Run 'npm install' first." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path $distIndex)) {
    Write-Host "Building frontend first..." -ForegroundColor Yellow
    Push-Location $projectDir
    npx vite build
    Pop-Location
    if (-not (Test-Path $distIndex)) {
        Write-Host "ERROR: Build failed." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Create shortcut
$WScriptShell = New-Object -ComObject WScript.Shell
$shortcut = $WScriptShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $electronExe
$shortcut.Arguments = $projectDir
$shortcut.WorkingDirectory = $projectDir
$shortcut.Description = "ImageTrans Pro - Image text overlay tool"
$shortcut.IconLocation = "$electronExe,0"
$shortcut.Save()

Write-Host "Shortcut created on desktop: ImageTrans Pro.lnk" -ForegroundColor Green
Write-Host "You can now double-click it to launch the app!" -ForegroundColor Cyan
