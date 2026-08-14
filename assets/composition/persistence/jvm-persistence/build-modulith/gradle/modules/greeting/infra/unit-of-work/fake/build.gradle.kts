plugins {
    `java-library`
}

dependencies {
    api(project(":modules:greeting:domain:contract"))

    testImplementation("org.junit.jupiter:junit-jupiter:5.11.0")
}
