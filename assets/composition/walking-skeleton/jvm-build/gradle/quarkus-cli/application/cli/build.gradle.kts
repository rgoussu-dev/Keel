plugins {
    java
    id("io.quarkus") version "3.38.2"
}

dependencies {
    implementation(enforcedPlatform("io.quarkus.platform:quarkus-bom:3.38.2"))
    implementation("io.quarkus:quarkus-picocli")

    implementation(project(":domain:kernel"))
    implementation(project(":domain:contract"))
    implementation(project(":domain:core"))

    testImplementation("io.quarkus:quarkus-junit5")
}
