plugins {
    kotlin("plugin.allopen")
    id("io.quarkus") version "3.34.6"
}

// Quarkus proxies normal-scoped CDI beans and subclasses test
// classes, so the annotated Kotlin classes must compile open.
allOpen {
    annotation("jakarta.ws.rs.Path")
    annotation("jakarta.ws.rs.ext.Provider")
    annotation("jakarta.enterprise.context.ApplicationScoped")
    annotation("io.quarkus.test.junit.QuarkusTest")
}

dependencies {
    implementation(enforcedPlatform("io.quarkus.platform:quarkus-bom:3.34.6"))
    implementation("io.quarkus:quarkus-kotlin")
    implementation("io.quarkus:quarkus-rest-jackson")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")

    implementation(project(":domain:kernel"))
    implementation(project(":domain:contract"))
    implementation(project(":domain:core"))
    implementation(project(":application:rest:contract"))

    testImplementation("io.quarkus:quarkus-junit5")
    testImplementation("io.rest-assured:rest-assured")
}
