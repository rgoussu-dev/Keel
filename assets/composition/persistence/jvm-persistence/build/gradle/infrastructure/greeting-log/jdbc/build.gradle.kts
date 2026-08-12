plugins {
    `java-library`
}

dependencies {
    api(project(":domain:contract"))

    testImplementation("org.junit.jupiter:junit-jupiter:5.11.0")
    testImplementation("org.testcontainers:junit-jupiter:1.21.0")
    testImplementation("org.testcontainers:postgresql:1.21.0")
    testImplementation("org.flywaydb:flyway-core:11.7.2")
    testImplementation("org.postgresql:postgresql:42.7.5")
    testRuntimeOnly("org.flywaydb:flyway-database-postgresql:11.7.2")
}
