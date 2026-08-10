plugins {
    java
    id("io.quarkus") version "3.34.6"
}

dependencies {
    implementation(enforcedPlatform("io.quarkus.platform:quarkus-bom:3.34.6"))
    implementation("io.quarkus:quarkus-rest-jackson")

    implementation(project(":domain:kernel"))
    implementation(project(":domain:contract"))
    implementation(project(":domain:core"))
    implementation(project(":application:rest:contract"))

    testImplementation("io.quarkus:quarkus-junit5")
    testImplementation("io.rest-assured:rest-assured")
}
