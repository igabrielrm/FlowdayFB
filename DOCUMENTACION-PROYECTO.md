# Event Organizer UCE — Documentación completa del proyecto

> **Versión:** servidorproyecto (con IA)  
> **Stack:** Spring Boot 3.3.4 · Java 21 · PostgreSQL · Thymeleaf · Groq/Gemini/Claude  
> **Repositorio:** https://github.com/igabrielrm/Event-Organizer  
> **Despliegue:** Render (Docker multi-etapa)

---

## 1. Resumen del proyecto

**Event Organizer UCE** es una aplicación web académica para estudiantes universitarios. Permite organizar actividades, horarios, calendario, comunidad entre compañeros, bienestar/estrés, panel de administración y asistencia con **inteligencia artificial** (chat del compañero virtual y recursos recomendados en tareas).

### Funcionalidades principales

| Módulo | Descripción |
|--------|-------------|
| **Autenticación** | Login, registro en 3 pasos, roles ADMIN / ESTUDIANTE, sesión HTTP |
| **Dashboard** | Resumen del día, semáforo académico, racha, ranking, alertas |
| **Actividades** | CRUD, prioridades, filtros, detalle con modal, reagendar con IA |
| **Calendario** | Vista mensual de actividades |
| **Horario** | Clases semanales, línea roja de hora actual, materias con color |
| **Comunidad** | Conexiones entre estudiantes, sugerencias, actividades compartidas |
| **Bienestar** | Banner día saturado, pausas activas embebidas, detector de estrés |
| **Compañero virtual** | Mascota, consejos, lo-fi, respiración, motivación, **Chat IA** |
| **IA** | Groq (principal), Gemini y Claude como respaldo; chat y recursos |
| **Admin** | Usuarios, anuncios globales (modal), cambio de contraseña |
| **Perfil** | Datos personales, foto, cambio de contraseña |
| **PWA** | manifest, service worker, icono instalable |
| **Temas** | Modo oscuro (default) y modo claro |

---

## 2. Cómo ejecutar el proyecto

### Gabriel — Terminal Cursor + Docker PostgreSQL

```powershell
cd C:\Users\Gabriel\Desktop\AVANCE12\servidorproyecto
docker compose up postgres -d
mvn spring-boot:run -DskipTests
```

Alternativas: `run-docker.bat` o tarea VS Code **Docker PostgreSQL + Spring Boot**.

URL: http://localhost:8080/login

### Compañeros — NetBeans + PostgreSQL + pgAdmin (sin Docker)

1. Instalar Java 21, NetBeans 22+, PostgreSQL 15+.
2. Crear BD `eventorganizer_uce` en pgAdmin.
3. Copiar `application.properties.example` → `application.properties` y configurar contraseña + `groq.api.key`.
4. Abrir proyecto en NetBeans → Run (usa `spring-boot:run` vía `nbactions.xml`).

### Render (producción)

- `Dockerfile` multi-etapa (Maven build + Eclipse Temurin 21 JRE).
- Variables de entorno para BD y API keys en `application-prod.properties`.

---

## 3. Credenciales y configuración

| Concepto | Valor |
|----------|-------|
| Admin | `admin@uce.edu.ec` / `admin123` |
| Demo | `demo@uce.edu.ec` / `demo123` |
| BD local (Docker) | `jdbc:postgresql://localhost:5432/eventorganizer_uce`, user `postgres` |
| pgAdmin (Docker) | http://localhost:5050 |
| Puerto app | 8080 |

**Archivo local (no se sube a Git):** `src/main/resources/application.properties`  
**Plantilla:** `src/main/resources/application.properties.example`

Claves IA configurables:
- `groq.api.key` — proveedor principal (`ia.provider=groq`)
- `gemini.api.key`, `claude.api.key` — respaldo

---

## 4. Historial de cambios (cronológico resumido)

### Fase inicial — Estructura y UI base
- Migración a layout con sidebar, topbar, cards glass, tema oscuro/claro.
- Login flotante con imagen de fondo UCE.
- Formularios de actividades, lista con filtros, calendario.

### Fase comunidad y notificaciones
- `Conexion`, `ConexionService`, solicitudes entre usuarios.
- Campana de notificaciones en topbar.
- Actividades compartidas (`UsuarioActividad`, `ActividadCompartidaService`).

### Fase horario y alertas
- CRUD horario de clases con colores por materia.
- Línea roja de hora actual en vista semanal.
- Banner de próxima clase / clase en curso.
- Alertas de prioridad (tareas con entrega cercana).

### Fase bienestar y compañero virtual
- Banner “día saturado” (>6 h o 3 tareas ALTA).
- Modal de pausas activas (respiración, estiramientos, meditación, juego, música, video).
- Compañero virtual: mascota SVG, lo-fi SomaFM, respiración guiada, burbuja flotante arrastrable.
- API `/api/bienestar/estres` — barra de estrés en dashboard.

### Fase IA
- `GroqService`, `GeminiService`, `ClaudeService`, `IAProviderService`.
- `IAService` — chat académico, recursos para DEBER/EXAMEN, reagendamiento.
- `IAController` — endpoints REST `/api/ia/chat`, `/api/ia/recursos/{id}`.
- Chat IA en compañero virtual (modal ampliado).
- Recursos recomendados en modal detalle de actividad.

### Fase admin y seguridad
- Panel admin: usuarios, anuncios con modal, archivado.
- Cambio de contraseña en perfil y admin.
- BCrypt, `SessionFilter`, roles.

### Fase despliegue
- Dockerfile multi-etapa para Render.
- `application-prod.properties` con `server.port=${PORT}`.
- `.gitignore` excluye `application.properties` y keys.

### Fase entrega y correcciones
- README con instrucciones NetBeans + Maven.
- `nbactions.xml` corregido (`spring-boot:run` en lugar de `exec:java`).
- Scripts `run-local.bat`, `run-docker.bat`.
- **Tema claro:** texto más oscuro y legible.
- **Pausas:** videos embebidos en modal (sin abrir pestañas externas).
- **Chat IA:** modal más grande (640×520 px aprox.).

---

## 5. Lista de clases Java

### Aplicación
| Clase | Rol |
|-------|-----|
| `ServidorproyectoApplication.java` | Punto de entrada Spring Boot |

### Config (`config/`)
| Clase | Rol |
|-------|-----|
| `SecurityConfig.java` | Spring Security (permitAll + filtros custom) |
| `PasswordEncoderConfig.java` | BCrypt |
| `WebConfig.java` | CORS, `/uploads/**` |
| `GlobalModelAdvice.java` | Atributos globales Thymeleaf |
| `TestSecurityConfig.java` | Config tests |

### Controladores (`controller/`)
| Clase | Rutas principales |
|-------|-------------------|
| `AuthController` | `/login`, `/registro`, logout |
| `DashboardController` | `/`, `/dashboard`, `/css/app.css` |
| `ActividadController` | `/actividades/**` |
| `CalendarioController` | `/calendario` |
| `HorarioController` | `/horario` |
| `ComunidadController` | `/comunidad` |
| `PerfilController` | `/perfil` |
| `AdminController` | `/admin/**` |
| `BienestarController` | `/api/bienestar/**` |
| `IAController` | `/api/ia/**` |
| `NotificacionController` | `/api/notificaciones/**` |
| `AnuncioController` | API anuncios |

### Modelos (`model/`)
| Clase | Tabla / entidad |
|-------|-----------------|
| `Usuario` | usuarios |
| `Actividad` | actividades |
| `HorarioClase` | horario_clase |
| `Anuncio` | anuncios |
| `Conexion` | conexiones |
| `Notificacion` | notificaciones |
| `RegistroBienestar` | registro_bienestar |
| `UsuarioActividad` | usuario_actividad (compartidas) |

### Repositorios (`repository/`)
Un repositorio JPA por cada entidad (`*Repository.java`).

### Servicios (`service/`)
| Clase | Responsabilidad |
|-------|-----------------|
| `UsuarioService` | Usuarios, registro, contraseñas |
| `ActividadService` | CRUD actividades, saturación, alertas |
| `HorarioService` | Horario semanal |
| `HorarioClaseSchedulerService` | Alertas de clase |
| `ComunidadService` | Conexiones, sugerencias, ranking |
| `ConexionService` | Solicitudes de conexión |
| `ActividadCompartidaService` | Compartir tareas |
| `NotificacionService` | Notificaciones |
| `BienestarService` | Pausas, registros |
| `EstresService` | Cálculo nivel estrés |
| `AdminService` | Panel administración |
| `IAService` | Orquestación IA |
| `IAProviderService` | Selector Groq/Gemini/Claude |
| `GroqService` | API Groq |
| `GeminiService` | API Google Gemini |
| `ClaudeService` | API Anthropic |
| `PrioridadSchedulerService` | Scheduler prioridades |

### Filtros
| Clase | Rol |
|-------|-----|
| `SessionFilter.java` | Protege rutas; redirige a login si no hay sesión |

---

## 6. Templates HTML (frontend)

| Archivo | Uso |
|---------|-----|
| `dashboard.html` | Página principal, banners, modales pausa |
| `login.html` | Inicio de sesión |
| `registro-paso1/2/3.html` | Registro estudiante |
| `lista-actividades.html` | Listado y filtros |
| `formulario-actividad.html` | Crear/editar actividad |
| `calendario.html` | Vista calendario |
| `horario.html` | Horario semanal |
| `community.html` | Comunidad |
| `perfil.html` | Perfil usuario |
| `admin-dashboard.html` | Panel admin |
| `error/access-denied.html` | Acceso denegado |

### Fragmentos (`fragments/`)
| Archivo | Contenido |
|---------|-----------|
| `auth-common.html` | Fondo login, topbar auth, escudo UCE |
| `companero-virtual.html` | Mascota, menú, chat IA, modal, burbuja flotante |
| `modal-detalle-actividad.html` | Detalle tarea + recursos IA |
| `modal-reagendar.html` | Reagendar con sugerencias IA |
| `modal-confirmar.html` | Confirmaciones genéricas |
| `modal-anuncio.html` | Ver anuncio global |
| `notificaciones-bell.html` | Campana notificaciones |
| `pwa-head.html` | Meta PWA, manifest |
| `layout-scripts.html` | Scripts comunes layout |

### CSS
| Archivo | Notas |
|---------|-------|
| `templates/app.css` | **Todos los estilos** — servido en `/css/app.css` vía `DashboardController` |
| Variables `:root` y `[data-theme="light"]` | Colores globales |
| `.glass-banner` | Banners con efecto cristal |
| `.modal-pausa-*` | Modal pausas con iframe embebido |
| `.modal-companero-chat` | Chat IA ampliado |

---

## 7. Dónde cambiar imágenes, enlaces y recursos

### Imágenes estáticas
| Recurso | Ruta en disco | URL en app |
|---------|---------------|------------|
| Escudo UCE (login) | `src/main/resources/static/images/uce-escudo.png` | `/images/uce-escudo.png` |
| Fondo login oscuro | `static/images/auth-bg-dark.png` *(añadir si falta)* | `/images/auth-bg-dark.png` |
| Fondo login claro | `static/images/auth-bg-light.png` | `/images/auth-bg-light.png` |
| Patrón fondo oscuro | `static/images/bg-pattern-dark.png` | Referenciado en CSS |
| Patrón fondo claro | `static/images/bg-pattern-light.png` | Referenciado en CSS |
| Icono PWA | `static/icons/icon.svg` | `/icons/icon.svg` |
| Fotos de perfil subidas | carpeta `uploads/` (raíz proyecto) | `/uploads/{archivo}` |

**Cambiar fondo login:** editar `fragments/auth-common.html` (líneas con `auth-bg-dark.png` / `auth-bg-light.png`).

**Cambiar patrón de fondo app:** editar variables en `app.css`:
```css
--app-bg-pattern: url('/images/bg-pattern-light.png');
```

### Enlaces de pausas activas (videos embebidos)
Editar en `dashboard.html` → objeto `PAUSA_CONTENIDO`:

| Tipo | ID YouTube / URL actual |
|------|-------------------------|
| Estiramientos | `DwRR59ektIs` |
| Meditación | `inpok4MKVLM` |
| Video lo-fi | `jfKfPfyJRdk` |
| Juego Snake | `google.com/logos/fnbx/snake_arcade/` |

Formato embed YouTube: `https://www.youtube.com/embed/VIDEO_ID?rel=0&modestbranding=1`

### Streams Lo-fi (compañero virtual)
Editar en `fragments/companero-virtual.html` → `LOFI_STREAMS`:
- Ambiente: SomaFM Groove Salad
- Jazz: SomaFM Lush
- Chill: SomaFM Deep Space One

### Consejos y motivaciones (sin IA)
Mismos archivo → arrays `consejos` y `motivaciones`.

### API IA
| Qué | Dónde |
|-----|-------|
| Prompts del chat | `IAService.java` |
| Proveedor activo | `application.properties` → `ia.provider` |
| Keys API | `application.properties` (local) o env vars (Render) |
| Endpoints REST | `IAController.java` |

### Anuncios globales
- Crear/editar: panel Admin → formulario en `admin-dashboard.html`
- Modal lectura: `fragments/modal-anuncio.html`

### Colores de materias (horario)
- Frontend: selector en `horario.html`
- Backend: campo `color` en entidad `HorarioClase`

### Tema claro / oscuro
- Variables: `app.css` líneas `:root` y `[data-theme="light"]`
- Toggle: botón en topbar → `localStorage.theme` → recarga página

---

## 8. Endpoints API relevantes

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/ia/chat` | Chat compañero IA |
| GET | `/api/ia/recursos/{actividadId}` | Recursos para DEBER/EXAMEN |
| GET | `/api/bienestar/estres` | Nivel estrés del día |
| POST | `/api/bienestar/pausa` | Registrar pausa activa |
| GET | `/api/notificaciones` | Listar notificaciones |
| PATCH | `/api/notificaciones/{id}/leer` | Marcar leída |

---

## 9. Base de datos

- **Nombre:** `eventorganizer_uce`
- **DDL:** `spring.jpa.hibernate.ddl-auto=update` (crea tablas automáticamente)
- **Datos demo:** `init-db.sql` (admin, usuario demo, actividades ejemplo)
- **Docker:** `docker-compose.yml` — servicios `postgres`, `pgadmin`, opcional `app`

---

## 10. Archivos de configuración del IDE

| Archivo | Propósito |
|---------|-----------|
| `pom.xml` | Maven, Spring Boot 3.3.4, Java 21 |
| `nbactions.xml` | NetBeans Run → `spring-boot:run` |
| `nb-configuration.xml` | JDK 21, mainClass |
| `.vscode/tasks.json` | Tareas Cursor (Spring Boot, Docker) |
| `.vscode/launch.json` | Debug Java en terminal integrada |
| `Dockerfile` | Build producción Render |
| `application-prod.properties` | Perfil producción |

---

## 11. Archivos eliminados / consolidados (limpieza)

| Archivo | Motivo |
|---------|--------|
| `Dockerfile.txt`, `.dockerignore.txt` | Renombrados a `Dockerfile`, `.dockerignore` |
| `sidebar.html` | Sidebar integrado en `dashboard.html` |
| `pwa-scripts.html` | Scripts movidos a `layout-scripts.html` |
| `modal-pomodoro.html` | Pomodoro integrado en dashboard/modal propio |

---

## 12. Tests

Ubicación: `src/test/java/com/uce/servidorproyecto/`

| Test | Cubre |
|------|-------|
| `AuthControllerTest` | Login (firma con `modoAdmin`) |
| `ActividadServiceTest` | Servicio actividades |
| `IAServiceTest` | Servicio IA |

Ejecutar: `mvn test` o `mvn spring-boot:run -DskipTests` para omitir.

---

## 13. Estructura de carpetas

```
servidorproyecto/
├── src/main/java/com/uce/servidorproyecto/
│   ├── config/
│   ├── controller/
│   ├── filter/
│   ├── model/
│   ├── repository/
│   ├── service/
│   └── ServidorproyectoApplication.java
├── src/main/resources/
│   ├── templates/          # HTML + app.css
│   ├── static/             # imágenes, icons, sw.js, manifest
│   ├── application.properties.example
│   └── application-prod.properties
├── src/test/
├── uploads/                # fotos perfil (runtime)
├── docker-compose.yml
├── init-db.sql
├── Dockerfile
├── nbactions.xml
├── run-local.bat
├── run-docker.bat
├── README.md
└── DOCUMENTACION-PROYECTO.md  ← este archivo
```

---

## 14. Copia sin IA (entrega alternativa)

Carpeta separada: `Event-Organizer-Sin-IA`  
- Compañero virtual **sin chat IA** (solo consejo, lo-fi, respirar, motivación).  
- Recursos estáticos en lugar de IA generativa.  
- Misma base Spring Boot sin keys obligatorias.

---

## 15. Contacto y mantenimiento

- **GitHub:** https://github.com/igabrielrm/Event-Organizer  
- **Render:** configurar `DATABASE_URL`, `GROQ_API_KEY`, etc. en dashboard Render  
- **Local:** nunca commitear `application.properties` con keys reales  

---

*Documento generado: julio 2026 — Event Organizer UCE*
