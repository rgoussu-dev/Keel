plugins {
  `java-library`
}

val libs = the<org.gradle.accessors.dm.LibrariesForLibs>()

dependencies {
  compileOnly(libs.jspecify)
  annotationProcessor(libs.errorprone.core)
  annotationProcessor(libs.nullaway)
}

tasks.withType<JavaCompile>().configureEach {
  options.errorprone {
    error("NullAway")
    option("NullAway:AnnotatedPackages", "${project.group}")
  }
}
