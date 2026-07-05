# 📅 Event Organizer UCE

> Asistente inteligente para gestionar el estrés académico y conectar con la comunidad universitaria.

---

## 🚀 Características

| Característica | Descripción |
|----------------|-------------|
| ✅ **Gestión de actividades** | Crear, editar, completar y eliminar tareas académicas |
| ✅ **Reagendamiento inteligente** | IA que optimiza tu horario automáticamente |
| ✅ **Pomodoro integrado** | Técnica de estudio con pausas activas |
| ✅ **Mascota interactiva** | Consejos personalizados según tu estado |
| ✅ **Semáforo académico** | Visualización del estado de tus materias |
| ✅ **Comunidad** | Conexión con compañeros de estudio |
| ✅ **Panel de administración** | Gestión de usuarios y anuncios globales |
| ✅ **Seguridad** | BCrypt, sesiones seguras, roles ADMIN/ESTUDIANTE |
| ✅ **Responsive** | Funciona en celulares, tablets y escritorio |

---

## 📋 Requisitos del sistema

- **Java:** 21 o superior
- **Maven:** 3.9+
- **PostgreSQL:** 15+ (instalado localmente o vía Docker)
- **Docker:** 20.10+ (opcional, incluye pgAdmin en docker-compose)
- **Apache NetBeans:** 22+ (opcional, recomendado para el equipo)

---

## 🛠️ Instalación y ejecución

### 🔹 Local (con Maven / terminal de Cursor)

**Gabriel (Docker + terminal integrada):**

```powershell
cd C:\Users\Gabriel\Desktop\AVANCE12\servidorproyecto
docker compose up postgres -d
mvn spring-boot:run -DskipTests
```

También puedes usar `run-docker.bat` (doble clic) o en Cursor: **Terminal → Run Task → Docker PostgreSQL + Spring Boot**.

**Importante:** usa la terminal integrada de Cursor (`mvn spring-boot:run`). No uses el botón Run de NetBeans en este entorno; si el puerto 8080 ya está ocupado, detén la instancia anterior antes de volver a iniciar.

### 🔹 Local con NetBeans + PostgreSQL + pgAdmin (equipo, sin Docker)

1. Instalar **Java 21**, **Apache NetBeans 22+** y **PostgreSQL 15+** en Windows.
2. Iniciar el servicio PostgreSQL (Windows Services o pgAdmin conectado a localhost).
3. En pgAdmin: crear la base de datos `eventorganizer_uce` (codificación UTF8).
4. Copiar `src/main/resources/application.properties.example` → `application.properties` y configurar:
   - `spring.datasource.password=` tu contraseña de PostgreSQL local
   - `groq.api.key=` tu key de https://console.groq.com (para la IA)
5. En NetBeans: **File → Open Project** → seleccionar esta carpeta.
6. Verificar que NetBeans use **JDK 21** (Project Properties → Sources).
7. Clic derecho en el proyecto → **Run** (usa `spring-boot:run` vía Maven, configurado en `nbactions.xml`).
8. Abrir http://localhost:8080/login

Opcional: ejecutar `init-db.sql` en pgAdmin para datos demo.

**Si NetBeans abre una ventana de PowerShell y se cierra:** cierra el proyecto, vuelve a abrirlo y usa Run de nuevo; el proyecto ya está configurado con `spring-boot:run` (no `exec:java`).

### 🔹 Con Docker

```bash
# 1. Compilar el JAR
./mvnw clean package -DskipTests

# 2. Ejecutar con docker-compose
docker-compose up -d
```

### 🔹 JAR directo

```bash
# 1. Compilar
./mvnw clean package -DskipTests

# 2. Ejecutar
java -jar target/servidorproyecto-0.0.1-SNAPSHOT.jar --spring.profiles.active=prod
```

---

## 🔑 Credenciales de acceso

| Rol | Correo | Contraseña |
|-----|--------|------------|
| **Administrador** | admin@uce.edu.ec | admin123 |
| **Estudiante demo** | demo@uce.edu.ec | demo123 |

---

## 📁 Estructura del proyecto

```
servidorproyecto/
├── src/
│   ├── main/
│   │   ├── java/com/uce/servidorproyecto/
│   │   │   ├── config/          # Configuración (seguridad, web)
│   │   │   ├── controller/      # Controladores REST/MVC
│   │   │   ├── filter/          # Filtros de seguridad
│   │   │   ├── model/           # Entidades JPA
│   │   │   ├── repository/      # Repositorios JPA
│   │   │   └── service/         # Lógica de negocio
│   │   └── resources/
│   │       ├── static/          # CSS, JS, imágenes
│   │       └── templates/       # Vistas Thymeleaf
│   └── test/                    # Pruebas unitarias y de integración
├── docker-compose.yml           # Docker Compose
├── Dockerfile                   # Dockerfile
├── README.md                    # Esta documentación
└── LICENSE                      # Licencia del proyecto
```

---

## 🧪 Pruebas

```bash
# Ejecutar todas las pruebas
./mvnw test

# Ejecutar pruebas de seguridad
./mvnw test -Dtest=SecurityTest

# Generar reporte de cobertura
./mvnw test jacoco:report
# Abrir target/site/jacoco/index.html
```

---

## 📊 Endpoints de la API

### 🔹 Autenticación

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/login` | Iniciar sesión |
| GET | `/logout` | Cerrar sesión |
| POST | `/registro/paso1` | Registro paso 1 |
| POST | `/registro/paso2` | Registro paso 2 |
| POST | `/registro/paso3` | Registro paso 3 |

### 🔹 Actividades

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/actividades` | Listar actividades |
| GET | `/actividades/nueva` | Formulario nueva |
| POST | `/actividades` | Guardar actividad |
| GET | `/actividades/editar/{id}` | Formulario editar |
| POST | `/actividades/editar/{id}` | Actualizar actividad |
| POST | `/actividades/eliminar/{id}` | Eliminar actividad |
| POST | `/actividades/estado/{id}` | Cambiar estado |

### 🔹 IA

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/ia/reagendar` | Reagendar con IA |
| POST | `/api/ia/auxilio` | Recursos de estudio |
| POST | `/api/ia/detectar-bloqueo` | Detectar bloqueo creativo |
| GET | `/api/ia/recursos` | Recursos por tema |
| GET | `/api/ia/pausa` | Sugerir pausa activa |
| POST | `/api/ia/reagendar-crisis` | Plan de crisis |

---

## 👥 Equipo de desarrollo

| Nombre | Rol | Responsabilidades |
|--------|-----|-------------------|
| **Karla Domínguez** | Frontend | HTML, CSS, JavaScript, Vistas Thymeleaf |
| **María Torres** | Backend | Java, Spring Boot, JPA, Base de datos |
| **Juan Pérez** | IA y Documentación | Servicios de IA, Pruebas, Documentación |

---

## 📝 Licencia

Este proyecto es de uso académico para la **Universidad Central del Ecuador**.

---

## 📞 Contacto y soporte

- **Soporte técnico:** soporte@eventorganizer.uce.edu.ec
- **GitHub:** https://github.com/uce/eventorganizer
- **Reportar problemas:** https://github.com/uce/eventorganizer/issues

---

## 🎯 Demo para Casa Abierta

**3 minutos para convencer:**

1. **Login** (10 segundos) - `demo@uce.edu.ec` / `demo123`
2. **Dashboard** (30 segundos) - Mostrar semáforo en ROJO
3. **Mascota** (15 segundos) - Hacer clic para consejo
4. **Reagendar IA** (30 segundos) - Botón ⚡ Reagendar
5. **Comunidad** (30 segundos) - Buscar compañeros
6. **Admin** (30 segundos) - Panel de administración
7. **Cierre** (35 segundos) - Frase final impactante

---

## 🏆 Agradecimientos

A la **Universidad Central del Ecuador** por el apoyo y la oportunidad de desarrollar este proyecto.

---

**¡Gracias por usar Event Organizer UCE!** 🎉