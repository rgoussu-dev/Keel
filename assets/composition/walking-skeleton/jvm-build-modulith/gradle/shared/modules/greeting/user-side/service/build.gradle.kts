plugins {
    `java-library`
}

dependencies {
    // The peer-facing interface takes a Mediator, so the kernel is part
    // of this module's own API…
    api(project(":platform:kernel"))

    // …but the module's commands are an implementation detail. `implementation`
    // keeps them off a consuming module's compile classpath, so a peer
    // physically cannot reach past this seam into the greeting domain.
    implementation(project(":modules:greeting:domain:contract"))

    testImplementation(project(":modules:greeting:domain:contract"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.11.0")
}
