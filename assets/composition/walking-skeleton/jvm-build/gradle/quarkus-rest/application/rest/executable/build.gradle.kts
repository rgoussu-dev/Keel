plugins {
    java
    id("io.quarkus") version "3.38.2"
}

dependencies {
    implementation(enforcedPlatform("io.quarkus.platform:quarkus-bom:3.38.2"))
    implementation("io.quarkus:quarkus-rest-jackson")

    implementation(project(":domain:kernel"))
    implementation(project(":domain:contract"))
    implementation(project(":domain:core"))
    implementation(project(":application:rest:contract"))

    testImplementation("io.quarkus:quarkus-junit5")
    testImplementation("io.rest-assured:rest-assured")
}
