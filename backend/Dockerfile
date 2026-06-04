# ---- build stage ----
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
RUN mvn -q -B clean package -DskipTests

# ---- runtime stage ----
FROM eclipse-temurin:17-jre
WORKDIR /app
# non-root runtime user
RUN useradd -r -u 1001 spring && mkdir -p /app && chown spring:spring /app
USER spring
COPY --from=build /app/target/promote-backend-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
