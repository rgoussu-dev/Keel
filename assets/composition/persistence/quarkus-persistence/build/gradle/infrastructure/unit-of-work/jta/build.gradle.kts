plugins {
    `java-library`
}

dependencies {
    api(project(":domain:contract"))
    api("jakarta.transaction:jakarta.transaction-api:2.0.1")

    testImplementation("org.junit.jupiter:junit-jupiter:5.11.0")
}
