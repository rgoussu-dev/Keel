FROM gradle:jdk25 AS build
WORKDIR /workspace
COPY . .
RUN gradle build -x test

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /workspace/application/rest/executable/build/quarkus-app/ /app/
EXPOSE 8080
CMD ["java", "-jar", "quarkus-run.jar"]
