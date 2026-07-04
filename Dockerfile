# ============================================
# DOCKERFILE - Event Organizer UCE (Render / Docker)
# ============================================

# --- Etapa 1: compilar con Maven ---
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /app

COPY pom.xml .
RUN mvn dependency:go-offline -B

COPY src ./src
RUN mvn clean package -DskipTests -B

# --- Etapa 2: ejecutar ---
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

COPY --from=build /app/target/servidorproyecto-0.0.1-SNAPSHOT.jar app.jar

EXPOSE 8080
ENV SPRING_PROFILES_ACTIVE=prod

ENTRYPOINT ["java", "-jar", "app.jar"]
