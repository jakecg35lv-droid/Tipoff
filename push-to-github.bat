@echo off
setlocal

set REPO=C:\Users\jakec\OneDrive\Desktop\TipoffFantasy

echo.
echo  Tipoff Fantasy -- Push to GitHub
echo  ==================================
echo.

if not exist "%REPO%\.git" (
  echo  ERROR: No git repo at %REPO%
  pause
  exit /b 1
)

cd /d "%REPO%"

:: Remove stale lock if present
if exist ".git\index.lock" (
  echo  Removing stale lock...
  del /f ".git\index.lock"
)

echo  Staging files...
git add -A

git diff --cached --quiet
if %errorlevel%==0 (
  echo  Nothing to commit. Already up to date.
  echo.
  pause
  exit /b 0
)

echo  Committing...
git commit -m "Update app"
if %errorlevel% neq 0 (
  echo.
  echo  ERROR: Commit failed. See above.
  pause
  exit /b 1
)

echo  Pushing to GitHub...
git push -u origin HEAD --force
if %errorlevel% neq 0 (
  echo.
  echo  ERROR: Push failed. Check your GitHub credentials.
  pause
  exit /b 1
)

echo.
echo  Done! Live at: https://jakecg35lv-droid.github.io/Tipoff/
echo.
pause
