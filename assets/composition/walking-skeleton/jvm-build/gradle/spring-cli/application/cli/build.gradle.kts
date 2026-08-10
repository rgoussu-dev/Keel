plugins {
    java
    id("org.springframework.boot") version "4.1.0"
}

dependencies {
    implementation(platform("org.springframework.boot:spring-boot-dependencies:4.1.0"))
    implementation("org.springframework.boot:spring-boot-starter")
    implementation("info.picocli:picocli-spring-boot-starter:4.7.7")

    implementation(project(":domain:kernel"))
    implementation(project(":domain:contract"))
    implementation(project(":domain:core"))

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}
