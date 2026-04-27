plugins {
    java
    id("io.quarkus") version "3.34.6"
}

dependencies {
    implementation(enforcedPlatform("io.quarkus.platform:quarkus-bom:3.34.6"))
    implementation("io.quarkus:quarkus-picocli")

    implementation(project(":domain:contract"))
    implementation(project(":domain:core"))

    testImplementation("io.quarkus:quarkus-junit5")
}
