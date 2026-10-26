@echo off
rem Opens Headcount Planner in an app-style window (Edge or Chrome). No install, server or internet needed.
rem Keep this file next to headcount-planner.html.
setlocal
set "HTML=%~dp0headcount-planner.html"
set "URL=%HTML:\=/%"
if not exist "%HTML%" (
  echo Could not find headcount-planner.html next to this launcher.
  echo Build it with: npm run build:single
  pause
  exit /b 1
)
start msedge --app="file:///%URL%" 2>nul && goto :eof
start chrome --app="file:///%URL%" 2>nul && goto :eof
start "" "%HTML%"
