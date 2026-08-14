plugins {
    `java-library`
}

dependencies {
    api(project(":platform:kernel"))
    api(project(":modules:guestbook:domain:contract"))

    testImplementation("org.junit.jupiter:junit-jupiter:5.11.0")
}
