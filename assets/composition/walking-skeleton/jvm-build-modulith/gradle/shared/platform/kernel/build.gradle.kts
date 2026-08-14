plugins {
    `java-library`
}

dependencies {
    // Annotation-only Jakarta APIs, meta-annotating @DomainHandler so
    // each assembly's container can discover handlers. `compileOnlyApi`
    // so every module applying the marker sees them, while neither API
    // reaches a runtime classpath — the kernel declares intent, never a
    // framework.
    compileOnlyApi("jakarta.inject:jakarta.inject-api:2.0.1")
    compileOnlyApi("jakarta.enterprise:jakarta.enterprise.cdi-api:4.1.0")
}
