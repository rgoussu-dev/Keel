plugins {
    `java-library`
}

dependencies {
    api(project(":domain:contract"))

    testImplementation("org.junit.jupiter:junit-jupiter:6.1.3")
}
