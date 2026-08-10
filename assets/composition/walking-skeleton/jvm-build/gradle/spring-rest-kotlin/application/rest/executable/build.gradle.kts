plugins {
    kotlin("plugin.spring")
    id("org.springframework.boot") version "4.1.0"
}

dependencies {
    implementation(platform("org.springframework.boot:spring-boot-dependencies:4.1.0"))
    implementation("org.springframework.boot:spring-boot-starter-webmvc")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("tools.jackson.module:jackson-module-kotlin")

    implementation(project(":domain:kernel"))
    implementation(project(":domain:contract"))
    implementation(project(":domain:core"))
    implementation(project(":application:rest:contract"))

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}
