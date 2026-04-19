plugins {
  `java-library`
  id("info.solidsoft.pitest")
}

val libs = the<org.gradle.accessors.dm.LibrariesForLibs>()

dependencies {
  testImplementation(platform(libs.junit.bom))
  testImplementation(libs.junit.jupiter)
  testImplementation(libs.assertj.core)
  testImplementation(libs.archunit)
}

tasks.withType<Test>().configureEach {
  useJUnitPlatform()
  testLogging {
    events("failed")
    showStandardStreams = false
  }
}

pitest {
  junit5PluginVersion.set("1.2.1")
  targetClasses.set(listOf("${project.group}.*"))
  mutationThreshold.set(75)
  timestampedReports.set(false)
}
