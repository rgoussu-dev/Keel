plugins {
  java
  id("com.diffplug.spotless")
}

java {
  toolchain {
    languageVersion.set(JavaLanguageVersion.of(25))
  }
}

tasks.withType<JavaCompile>().configureEach {
  options.compilerArgs.addAll(listOf(
    "-Xlint:all",
    "-Werror",
  ))
}

spotless {
  java {
    target("src/**/*.java")
    googleJavaFormat()
    removeUnusedImports()
    trimTrailingWhitespace()
    endWithNewline()
  }
}
