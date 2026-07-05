@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  Event Organizer UCE - Inicio local
echo ============================================
echo.
echo PostgreSQL debe estar corriendo en localhost:5432
echo (Docker: docker compose up postgres -d)
echo.
mvn spring-boot:run -DskipTests
echo.
if errorlevel 1 (
    echo ERROR: no se pudo iniciar la aplicacion.
    echo - Verifica que PostgreSQL este activo
    echo - Revisa src\main\resources\application.properties
)
pause
