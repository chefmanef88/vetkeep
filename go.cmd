@echo off
rem Starts Metro for Expo Go on a physical phone. Run `.\go` from the repo root.
rem
rem A .cmd rather than an npm script because this machine's PowerShell
rem execution policy refuses to load npm.ps1, so plain `npm` fails at the
rem prompt while `npm.cmd` works. Batch files are not affected, so this is one
rem word to type and nothing to remember.
rem
rem   .\go           Metro, Expo Go, port 8081, phone on the same WiFi
rem   .\go tunnel    same but routed through ngrok, for a different network
rem   .\go clear     same as .\go but wipes Metro's cache first
rem
rem Metro prints exp://<this-machine-ip>:8081 and a QR code. Scan it with the
rem camera on iOS, or in the Expo Go app on Android.

setlocal
cd /d "%~dp0"

if /i "%~1"=="tunnel" (
  echo Starting Metro for Expo Go via tunnel...
  npm.cmd run tunnel --workspace @vetkeep/mobile
  goto :eof
)

if /i "%~1"=="clear" (
  echo Starting Metro for Expo Go with a cleared cache...
  npm.cmd run go --workspace @vetkeep/mobile -- --clear
  goto :eof
)

if not "%~1"=="" (
  echo Unknown option "%~1". Use: go [tunnel^|clear]
  exit /b 1
)

echo Starting Metro for Expo Go on port 8081...
npm.cmd run go --workspace @vetkeep/mobile
