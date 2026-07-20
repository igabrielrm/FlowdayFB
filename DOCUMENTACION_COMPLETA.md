# FLOWDAY - Documentación Completa del Proyecto

## Índice
1. [Conceptos Básicos](#1-conceptos-básicos)
2. [Tecnologías Utilizadas](#2-tecnologías-utilizadas)
3. [Arquitectura del Proyecto](#3-arquitectura-del-proyecto)
4. [Estructura de Directorios](#4-estructura-de-directorios)
5. [Base de Datos y Relaciones entre Tablas](#5-base-de-datos-y-relaciones-entre-tablas)
6. [Backend (Spring Boot)](#6-backend-spring-boot)
7. [Frontend (React + TypeScript)](#7-frontend-react--typescript)
8. [Modo Offline y Sincronización](#8-modo-offline-y-sincronización)
9. [Android (Capacitor)](#9-android-capacitor)
10. [Docker](#10-docker)
11. [GitHub Actions (CI/CD)](#11-github-actions-cicd)
12. [Despliegue en Render](#12-despliegue-en-render)
13. [Guía para Desarrolladores](#13-guía-para-desarrolladores)

---

## 1. Conceptos Básicos

### ¿Qué es Flowday?
Flowday es una aplicación web/móvil **para estudiantes universitarios** que les ayuda a organizar su vida académica. Permite:
- Gestionar **actividades/tareas** con prioridades
- Ver un **calendario** mensual con las actividades
- Crear **notas rápidas** con colores
- Usar un **temporizador Pomodoro** para estudiar
- Medir el **nivel de estrés** basado en las tareas
- **Chat** con otros estudiantes
- **Horario de clases** semanal
- Funciona **offline** y sincroniza cuando hay internet

### Terminología clave
| Término | Significado |
|---------|-------------|
| SPA | Single Page Application - app que carga una sola página HTML |
| API REST | Interfaz para comunicación entre frontend y backend |
| JPA | Java Persistence API - para guardar datos en base de datos |
| JWT | JSON Web Token - para autenticación |
| Optimistic UI | Actualizar la interfaz ANTES de que el servidor confirme |
| Offline-first | La app funciona sin internet, usando datos en caché |

---

## 2. Tecnologías Utilizadas

### Backend (Servidor)
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| Java | 21 | Lenguaje de programación principal |
| Spring Boot | 3.3.4 | Framework web (como Express en Node.js) |
| Spring Security | - | Autenticación y seguridad |
| Spring Data JPA | - | Acceso a base de datos (como Prisma/TypeORM) |
| Hibernate | - | ORM - mapea tablas a objetos Java |
| Maven | 3.9.9 | Gestor de dependencias (como npm) |
| PostgreSQL | - | Base de datos principal |
| WebSocket | - | Para chat en tiempo real |
| Swagger/OpenAPI | - | Documentación automática de la API |
| Lombok | - | Reduce código repetitivo en Java |

### Frontend (Cliente web)
| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| React | 18 | Biblioteca para construir interfaces de usuario |
| TypeScript | 5 | JavaScript con tipos (más seguro) |
| Vite | 5 | Empaquetador (compila el código) |
| Material UI (MUI) | 6 | Componentes visuales (botones, modales, etc.) |
| React Router | 6 | Navegación entre páginas |
| Tailwind CSS | 3 | Estilos utilitarios |

### Móvil
| Tecnología | Propósito |
|------------|-----------|
| Capacitor | Convierte la web app en app Android nativa |
| Android SDK | Para compilar el APK |

### Infraestructura
| Tecnología | Propósito |
|------------|-----------|
| Docker | Contenedor para el backend |
| Render | Servicio cloud donde se despliega la app |
| Neon | Base de datos PostgreSQL en la nube |
| GitHub Actions | CI/CD automático |

---

## 3. Arquitectura del Proyecto

```
┌─────────────────────────────────────────────────────────┐
│                   USUARIO                                │
│   (Navegador Web / App Android)                         │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              FRONTEND (React SPA)                        │
│  - Páginas: Inicio, Actividades, Notas, Calendario...   │
│  - Componentes reutilizables                            │
│  - Estado offline en caché (IndexedDB)                  │
│  - Llamadas a la API del backend                        │
└────────────────────┬────────────────────────────────────┘
                     │  HTTP / HTTPS
                     ▼
┌─────────────────────────────────────────────────────────┐
│              BACKEND (Spring Boot)                      │
│  - API REST en /api/v1/*                                │
│  - Autenticación con sesiones HTTP                      │
│  - WebSockets para chat en tiempo real                  │
│  - Sincronización offline                               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              BASE DE DATOS (PostgreSQL / Neon)           │
│  - Tablas: usuarios, actividades, notas, horario...     │
└─────────────────────────────────────────────────────────┘
```

### Flujo de una petición típica
1. El usuario hace clic en "Guardar nota"
2. React (frontend) llama a `api.notes.update()`
3. El frontend guarda en **caché local** primero (para que se vea instantáneo)
4. Luego envía la petición HTTP al backend: `PUT /api/v1/notas`
5. Spring Boot recibe la petición, verifica la sesión del usuario
6. `NotaApiController` procesa y llama a `NotaRepository`
7. `NotaRepository` guarda en PostgreSQL (Neon)
8. La respuesta vuelve al frontend, que actualiza la interfaz

---

## 4. Estructura de Directorios

```
servidorproyecto/
│
├── frontend/                          # APLICACIÓN WEB (React + TypeScript)
│   ├── src/                           # Código fuente
│   │   ├── api/                       # Cliente API (llamadas al backend)
│   │   │   └── client.ts              # → Aquí están todas las llamadas a la API
│   │   ├── auth/                      # Autenticación (login, registro)
│   │   ├── components/                # Componentes reutilizables
│   │   │   ├── AppLayout.tsx          # Layout principal con menú lateral
│   │   │   ├── MobileBottomNav.tsx    # Barra inferior para móvil
│   │   │   ├── VirtualCompanion.tsx   # Botón flotante del compañero IA
│   │   │   ├── ActivityDetailModal.tsx # Modal de detalle de actividad
│   │   │   └── ...
│   │   ├── hooks/                     # Hooks personalizados (Pomodoro, etc.)
│   │   ├── notifications/             # Notificaciones push
│   │   ├── offline/                   # SISTEMA OFFLINE
│   │   │   ├── cache.ts              # Caché en IndexedDB
│   │   │   ├── queue.ts              # Cola de operaciones offline
│   │   │   ├── optimistic.ts         # Actualizaciones optimistas
│   │   │   └── sync.ts               # Sincronización cuando hay internet
│   │   ├── pages/                     # Páginas de la aplicación
│   │   │   ├── DashboardPage.tsx      # Inicio
│   │   │   ├── NotesPage.tsx          # Notas
│   │   │   ├── CalendarPage.tsx       # Calendario
│   │   │   ├── WellbeingPage.tsx      # Bienestar (Pomodoro, estrés)
│   │   │   ├── ChatPage.tsx           # Chat
│   │   │   └── ...
│   │   ├── theme/                     # Tema visual (colores, estilos)
│   │   ├── types/                     # Tipos de datos TypeScript
│   │   └── utils/                     # Utilidades
│   ├── android/                       # Proyecto Android (generado por Capacitor)
│   ├── public/                        # Archivos estáticos
│   ├── package.json                   # Dependencias de Node.js
│   └── vite.config.ts                 # Configuración de Vite
│
├── src/                               # BACKEND (Java + Spring Boot)
│   ├── main/
│   │   ├── java/com/flowday/flowday/
│   │   │   ├── FlowdayApplication.java   # Punto de entrada
│   │   │   ├── api/
│   │   │   │   ├── dto/                  # Objetos de transferencia de datos
│   │   │   │   └── v1/                   # Controladores API REST
│   │   │   │       ├── NotaApiController.java   # API de notas (/api/v1/notas)
│   │   │   │       ├── ActivityApiController.java
│   │   │   │       ├── ChatApiController.java
│   │   │   │       └── ...
│   │   │   ├── config/                   # Configuración (Spring, seguridad, etc.)
│   │   │   ├── controller/               # Controladores MVC (vista web)
│   │   │   │   ├── BienestarController.java  # API de bienestar (/api/bienestar)
│   │   │   │   └── ...
│   │   │   ├── model/                    # MODELOS / ENTIDADES (tablas)
│   │   │   │   ├── Nota.java             # → tabla "notas"
│   │   │   │   ├── Actividad.java        # → tabla "actividades"
│   │   │   │   ├── Usuario.java          # → tabla "usuarios"
│   │   │   │   └── ...
│   │   │   ├── repository/               # Repositorios (consultas a BD)
│   │   │   ├── security/                 # Seguridad (filtros, JWT, etc.)
│   │   │   └── service/                  # Lógica de negocio
│   │   │       ├── EstresService.java    # Cálculo del nivel de estrés
│   │   │       ├── BienestarService.java
│   │   │       └── ...
│   │   └── resources/
│   │       ├── application.properties    # Configuración de Spring Boot
│   │       ├── static/app/               # Frontend COMPILADO (generado por Vite)
│   │       └── templates/                # Plantillas HTML (Thymeleaf)
│   └── test/                             # Tests
│
├── Dockerfile                            # Para construir el contenedor Docker
├── docker-compose.yml                    # Para ejecutar con Docker local
├── pom.xml                               # Dependencias de Maven (Java)
└── init-db.sql                           # Script de inicialización de BD
```

---

## 5. Base de Datos y Relaciones entre Tablas

### Diagrama de Entidades

```
┌───────────────┐       ┌──────────────────┐
│   usuarios    │       │   actividades    │
├───────────────┤       ├──────────────────┤
│ id (PK)       │──┐    │ id (PK)          │
│ nombre        │  │    │ usuario_id (FK)──┼──┐
│ correo        │  │    │ titulo           │  │
│ contrasena    │  │    │ descripcion      │  │
│ rol           │  │    │ fecha_inicio     │  │
│ carrera       │  │    │ hora_inicio      │  │
│ estado        │  │    │ prioridad        │  │
└───────────────┘  │    │ estado           │  │
                   │    └──────────────────┘  │
                   │                          │
┌──────────────────┴┐   ┌─────────────────────┘
│     notas         │   │
├───────────────────┤   │
│ id (PK)           │   │
│ usuario_id (FK)───┼───┘
│ titulo            │
│ contenido         │
│ color             │
│ pinned (anclada)  │
│ created_at        │
│ updated_at        │
└───────────────────┘

┌──────────────────┐   ┌──────────────────────┐
│  bloques_horario │   │  mensajes_privados   │
├──────────────────┤   ├──────────────────────┤
│ id (PK)          │   │ id (PK)              │
│ usuario_id (FK)  │   │ remitente_id (FK)    │
│ materia          │   │ destinatario_id (FK) │
│ dia_semana       │   │ contenido            │
│ hora_inicio      │   │ leido                │
│ hora_fin         │   │ created_at           │
│ aula             │   └──────────────────────┘
│ profesor         │
│ color            │
└──────────────────┘

┌──────────────────────┐
│ registro_bienestar   │
├──────────────────────┤
│ id (PK)              │
│ usuario_id (FK)      │
│ tipo (POMODORO/PAUSA)│
│ valor (minutos)      │
│ created_at           │
└──────────────────────┘
```

### Explicación de relaciones
- **Un usuario** tiene **muchas** actividades, notas, mensajes, bloques de horario, registros de bienestar
- Las claves foráneas (FK) como `usuario_id` conectan las tablas

### Tabla `notas` (la que arreglamos)
```sql
CREATE TABLE notas (
    id VARCHAR(36) PRIMARY KEY,      -- UUID como texto
    usuario_id BIGINT NOT NULL,       -- FK → usuarios(id)
    titulo VARCHAR(200),
    contenido VARCHAR(8000),
    pinned BOOLEAN DEFAULT false,
    color VARCHAR(20),
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    version BIGINT DEFAULT 0,        -- Para control de concurrencia
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);
```

---

## 6. Backend (Spring Boot)

### ¿Qué es Spring Boot?
Es un framework para Java que facilita crear aplicaciones web. Piensa en él como "Express.js para Node.js" pero en Java.

### Estructura por capas (MVC)
```
Controlador (Controller) → Servicio (Service) → Repositorio (Repository) → Base de Datos
     ↕                          ↕
   DTOs                      Modelos/Entidades
```

### Ejemplo: Flujo de "Crear Nota"

1. **Controlador** (`NotaApiController.java`):
   ```java
   @PostMapping
   public ApiResponse<NotaDto> saveOrUpdate(@RequestBody NotaDto dto, WebRequest request) {
       Usuario usuario = ApiAuthHelper.requireUser(request);  // Verifica sesión
       // ... lógica para guardar
       notaRepository.save(nota);
       return ApiResponse.success(NotaDto.from(nota));
   }
   ```

2. **Repositorio** (`NotaRepository.java`):
   ```java
   public interface NotaRepository extends JpaRepository<Nota, String> {
       List<Nota> findByUsuarioOrderByPinnedDescUpdatedAtDesc(Usuario usuario);
   }
   ```
   Spring Data JPA genera automáticamente la consulta SQL basada en el nombre del método.

3. **Entidad** (`Nota.java`):
   ```java
   @Entity
   @Table(name = "notas")
   public class Nota {
       @Id private String id;
       @ManyToOne private Usuario usuario;  // Relación muchos-a-uno
       private String titulo;
       private String contenido;
       // ...
   }
   ```

### Autenticación
- Usa **sesiones HTTP** (no JWT en web)
- El filtro `SessionFilter.java` verifica la sesión en cada petición
- En móvil usa JWT (MobileJwtService.java)

### Bienestar y Estrés
- `BienestarController.java` expone `/api/bienestar/estres`
- `EstresService.java` calcula el nivel de estrés basado en:
  - Cantidad de tareas de alta prioridad
  - Tareas pendientes del día
  - Horas de estudio programadas
  - Entregas próximas (fecha_entrega)

---

## 7. Frontend (React + TypeScript)

### ¿Qué es React?
Biblioteca para construir interfaces de usuario. La app es una **SPA** (Single Page Application): carga una sola página HTML y React actualiza solo las partes que cambian.

### Enrutamiento
`App.tsx` define las rutas:
```tsx
<Routes>
  <Route path="/" element={<DashboardPage />} />
  <Route path="/notes" element={<NotesPage />} />
  <Route path="/calendar" element={<CalendarPage />} />
  <Route path="/wellbeing" element={<WellbeingPage />} />
  <Route path="/chat" element={<ChatPage />} />
  <!-- etc -->
</Routes>
```

### Estado y datos
- Cada página carga sus propios datos usando `useEffect` + `useState`
- El cliente API (`api/client.ts`) centraliza todas las llamadas al backend
- Las respuestas se guardan automáticamente en caché

### Componentes clave
| Componente | Propósito |
|------------|-----------|
| `AppLayout.tsx` | Layout con menú lateral (escritorio) y barra inferior (móvil) |
| `MobileBottomNav.tsx` | Barra de navegación inferior: Inicio, Tareas, Horario, Notas |
| `VirtualCompanion.tsx` | Botón flotante del asistente IA |
| `ActivityDetailModal.tsx` | Modal que muestra detalles de una actividad |

### Cliente API (`api/client.ts`)
Todas las llamadas al backend están organizadas en un objeto `api`:
```typescript
export const api = {
  notes: {
    list: () => request<Note[]>('/api/v1/notas'),
    create: (titulo, contenido, color, pinned) => { /* ... */ },
    update: (id, patch) => { /* ... */ },
    remove: (id) => { /* ... */ },
  },
  activities: { /* ... */ },
  bienestar: { /* ... */ },
  // etc
};
```

---

## 8. Modo Offline y Sincronización

### ¿Cómo funciona?
La app está diseñada para funcionar **sin internet**. Todo se guarda primero localmente y luego se sincroniza.

### Arquitectura offline

```
┌───────────────────────────────────────────┐
│           USUARIO (sin internet)          │
│                                           │
│  1. Crea una nota → se muestra al instante│
│  2. La nota se guarda en CACHÉ local      │
│  3. Se añade a la COLA DE SINCRONIZACIÓN  │
│                                           │
│          ┌─────────────────────┐          │
│          │   IndexedDB (navegador)│        │
│          │  ┌───────────────┐  │          │
│          │  │  Caché (GET)  │  │          │
│          │  └───────────────┘  │          │
│          │  ┌───────────────┐  │          │
│          │  │  Cola (POST)  │  │          │
│          │  └───────────────┘  │          │
│          └─────────────────────┘          │
└───────────────────────────────────────────┘
                    │ Cuando vuelve internet
                    ▼
┌───────────────────────────────────────────┐
│        SINCRONIZACIÓN AUTOMÁTICA          │
│                                           │
│  1. Toma las operaciones de la cola       │
│  2. Las envía al backend una por una      │
│  3. Si hay conflictos, se resuelven       │
│  4. Actualiza la caché con datos reales   │
└───────────────────────────────────────────┘
```

### Archivos del sistema offline
| Archivo | Propósito |
|---------|-----------|
| `offline/cache.ts` | Guarda respuestas GET en IndexedDB |
| `offline/queue.ts` | Cola de operaciones pendientes (FIFO) |
| `offline/optimistic.ts` | Actualiza la UI antes de recibir respuesta |
| `offline/sync.ts` | Procesa la cola cuando hay conexión |
| `offline/domainOptimistic.ts` | Operaciones específicas (chat, perfil, etc.) |

### Actualizaciones optimistas
Cuando creas/editas/eliminas algo:
1. La UI se actualiza **INMEDIATAMENTE** (sin esperar al servidor)
2. La operación se añade a la cola
3. Cuando hay internet, se sincroniza automáticamente
4. Si hay error, se muestra una notificación

---

## 9. Android (Capacitor)

### ¿Qué es Capacitor?
Capacitor convierte una aplicación web en una app nativa para Android/iOS. Es como un "envoltorio" que permite que el código React se ejecute como app.

### Archivos clave
```
frontend/android/          # Proyecto Android generado
  ├── app/
  │   ├── src/main/
  │   │   ├── AndroidManifest.xml   # Permisos, configuración de la app
  │   │   ├── java/.../MainActivity.java  # Actividad principal
  │   │   └── res/                  # Recursos (iconos, splash)
  ├── build.gradle          # Dependencias de Android
  └── gradle.properties     # Configuración de Gradle
```

### Cómo se construye el APK
1. Se compila el frontend: `npm run build` (genera archivos en `dist/`)
2. Capacitor copia esos archivos a la carpeta Android
3. Android Studio compila el APK
4. El APK contiene la web app + un WebView para ejecutarla

### Autenticación en móvil
- En web usa **sesiones HTTP** (cookies)
- En Android usa **JWT** (tokens) almacenados de forma segura

---

## 10. Docker

### ¿Qué es Docker?
Un contenedor es como una "máquina virtual ligera" que contiene todo lo necesario para ejecutar la app. Docker asegura que funcione igual en cualquier servidor.

### Archivo Dockerfile
```dockerfile
# Etapa 1: Compilar el JAR de Spring Boot
FROM maven:3.9.9 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline       # Descarga dependencias
COPY src ./src
RUN mvn clean package -DskipTests   # Compila a JAR

# Etapa 2: Ejecutar el JAR
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### docker-compose.yml
Para ejecutar localmente con PostgreSQL:
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: flowday
      POSTGRES_PASSWORD: postgres
  app:
    build: .
    ports:
      - "8080:8080"
    depends_on:
      - db
```

### Comandos útiles
```bash
# Construir imagen
docker build -t flowday .

# Ejecutar con docker-compose
docker-compose up

# Ejecutar solo el backend (conectado a Neon en la nube)
docker run -p 8080:8080 flowday
```

---

## 11. GitHub Actions (CI/CD)

### ¿Qué es GitHub Actions?
Es un sistema de **automatización** que se ejecuta cuando haces push a GitHub. Puede compilar, testear y desplegar el código automáticamente.

### Archivos de configuración
```
.github/workflows/
  ├── build.yml          # Compila frontend + backend
  ├── android-release.yml  # Genera APK automáticamente
  └── deploy.yml         # Despliega en Render
```

### Flujo típico (build.yml)
```yaml
name: Build
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4     # Descarga el código
      - name: Build frontend
        run: |
          cd frontend
          npm install
          npm run build               # Compila React
      - name: Build backend
        run: |
          mvn clean package           # Compila Spring Boot
      - name: Upload APK
        run: |
          cd frontend
          npx cap sync android
          cd android
          ./gradlew assembleRelease   # Genera APK
```

### Despliegue automático en Render
El workflow `deploy.yml` llama a la API de Render para hacer redeploy automático después de cada push a `main`.

---

## 12. Despliegue en Render

### ¿Qué es Render?
Render es un servicio cloud (como Heroku) que aloja aplicaciones web. Flowday está desplegado en:
- **URL**: https://flowday-z8hp.onrender.com
- **Base de datos**: Neon PostgreSQL (separada)

### Cómo se despliega
1. Haces push a GitHub (`git push origin main`)
2. Render detecta el nuevo commit automáticamente
3. Render ejecuta el Dockerfile para construir la imagen
4. Render inicia el contenedor con la app
5. La app se conecta a Neon (configurado en variables de entorno)

### Variables de entorno en Render
| Variable | Propósito |
|----------|-----------|
| `DATABASE_URL` | Conexión a Neon PostgreSQL |
| `SPRING_PROFILES_ACTIVE=prod` | Activa perfil de producción |
| `GROQ_API_KEY` | API key para el asistente IA |
| `SESSION_SECRET` | Secreto para cifrar sesiones |

---

## 13. Guía para Desarrolladores

### Requisitos para desarrollar localmente
```bash
# Backend
- Java 21+ (JDK)
- Maven 3.9+
- PostgreSQL (o Neon)

# Frontend
- Node.js 18+
- npm

# Móvil (opcional)
- Android Studio
- Capacitor CLI
```

### Comandos básicos

```bash
# 1. INICIAR BACKEND
cd servidorproyecto
mvn spring-boot:run          
# → http://localhost:8080

# 2. INICIAR FRONTEND (en otra terminal)
cd servidorproyecto/frontend
npm install          # Solo la primera vez
npm run dev          
# → http://localhost:5173

# 3. CONSTRUIR TODO (frontend + backend)
cd servidorproyecto/frontend
npm run build        # Compila React a static/
cd ..
mvn clean package    # Compila Spring Boot a JAR

# 4. GENERAR APK Android
cd servidorproyecto/frontend
npm run build
npx cap sync android
npx cap open android  # Abre Android Studio
# En Android Studio: Build → Build Bundle(s) / APK(s)
```

### URLs importantes
| URL | Propósito |
|-----|-----------|
| http://localhost:5173 | Frontend en desarrollo |
| http://localhost:8080 | Backend + frontend compilado |
| http://localhost:8080/swagger-ui.html | Documentación de la API |
| https://flowday-z8hp.onrender.com | App en producción |
| https://console.neon.tech | Base de datos PostgreSQL cloud |

### Estructura de un commit típico
```bash
git add .
git commit -m "Descripción del cambio"
git push origin main
# → Render redeploya automáticamente (~2-3 min)
```

---

## Resumen de lo que arreglamos

| Problema | Causa | Solución |
|----------|-------|----------|
| Notas no aparecían en Render | Frontend llamaba a `/api/v1/notes` pero backend espera `/api/v1/notas` | Cambiar todas las rutas a `/api/v1/notas` |
| Error de compilación en notas | Faltaba import de `Grid` en MUI | Agregar `Grid` a los imports |
| Estrés no se mostraba | Backend devuelve Map plano, frontend esperaba ApiResponse | Usar `legacyJson` en lugar de `request` |
| FAB tapaba botón de nueva nota | Ambos en la misma posición | Mover FAB a top cuando está en notas |
| Calendario sin colores | Se eliminó `dayPriorityStyle` por accidente | Restaurar `dayPriorityStyle` |
| "Nota reciente" mal alineada | Padding incorrecto en Card | Ajustar padding y estilos del Paper |
| Modal actividad: "sin conexión" | Error real cuando nunca se cargó la actividad | El sistema ya usa caché, solo necesita cargarse una vez |