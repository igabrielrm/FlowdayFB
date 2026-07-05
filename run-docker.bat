@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Levantando PostgreSQL en Docker...
docker compose up postgres -d
if errorlevel 1 (
    echo ERROR: Docker no disponible. Usa PostgreSQL instalado localmente.
    pause
    exit /b 1
)
timeout /t 5 /nobreak >nul
echo Iniciando aplicacion...
mvn spring-boot:run -DskipTests
pause
