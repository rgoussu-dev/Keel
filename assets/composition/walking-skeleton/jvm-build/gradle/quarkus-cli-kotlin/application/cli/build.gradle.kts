plugins {
    kotlin("plugin.allopen")
    id("io.quarkus") version "3.34.6"
}

// Quarkus proxies normal-scoped CDI beans and subclasses test
// classes, so the annotated Kotlin classes must compile open.
allOpen {
    annotation("jakarta.enterprise.context.ApplicationScoped")
    annotation("io.quarkus.test.junit.main.QuarkusMainTest")
}

dependencies {
    implementation(enforcedPlatform("io.quarkus.platform:quarkus-bom:3.34.6"))
    implementation("io.quarkus:quarkus-kotlin")
    implementation("io.quarkus:quarkus-picocli")

    implementation(project(":domain:kernel"))
    implementation(project(":domain:contract"))
    implementation(project(":domain:core"))

    testImplementation("io.quarkus:quarkus-junit5")
}
