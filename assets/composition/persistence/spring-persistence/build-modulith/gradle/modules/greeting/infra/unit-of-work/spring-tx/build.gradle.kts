plugins {
    `java-library`
}

dependencies {
    api(project(":modules:greeting:domain:contract"))
    api("org.springframework:spring-tx:7.0.8")

    testImplementation("org.junit.jupiter:junit-jupiter:6.1.3")
}
