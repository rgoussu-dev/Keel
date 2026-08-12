plugins {
    `java-library`
}

dependencies {
    api(project(":domain:kernel"))

    // Annotation-only Jakarta APIs, meta-annotating @DomainHandler so
    // each channel's container can discover handlers. `compileOnlyApi`
    // so domain/core sees them where it applies the marker, while
    // neither API reaches a runtime classpath — the domain declares
    // intent, never a framework.
    compileOnlyApi("jakarta.inject:jakarta.inject-api:2.0.1")
    compileOnlyApi("jakarta.enterprise:jakarta.enterprise.cdi-api:4.1.0")
}
