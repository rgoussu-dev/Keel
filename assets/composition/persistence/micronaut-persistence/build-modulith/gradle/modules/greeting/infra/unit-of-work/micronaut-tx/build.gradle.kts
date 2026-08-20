plugins {
    `java-library`
}

dependencies {
    api(project(":modules:greeting:domain:contract"))
    api("io.micronaut.data:micronaut-data-tx:5.1.1")

    testImplementation("org.junit.jupiter:junit-jupiter:6.1.3")
}
