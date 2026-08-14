plugins {
    `java-library`
}

dependencies {
    // The port this adapter implements is guestbook's own.
    api(project(":modules:guestbook:domain:contract"))

    // The peer's in-process API — the only inter-context edge in the
    // build graph. `implementation` because it is this adapter's
    // business, not its callers'. Note what is absent and cannot be
    // added: greeting's domain. The service module declares its own
    // contract non-transitively, so `greeting.domain.contract` is not
    // on this compile classpath and an import of it fails to compile.
    implementation(project(":modules:greeting:user-side:service"))

    testImplementation("org.junit.jupiter:junit-jupiter:5.11.0")
}
