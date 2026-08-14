plugins {
    `java-library`
}

dependencies {
    api(project(":modules:greeting:domain:contract"))
    api("io.micronaut.data:micronaut-data-tx:4.14.4")

    testImplementation("org.junit.jupiter:junit-jupiter:5.11.0")
}
