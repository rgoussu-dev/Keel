plugins {
  id("keel.java-conventions")
  id("keel.quality-conventions")
  id("keel.test-conventions")
  alias(libs.plugins.quarkus)
}

dependencies {
  implementation(enforcedPlatform(libs.quarkus.bom))

  implementation("io.quarkus:quarkus-rest")
  implementation("io.quarkus:quarkus-rest-jackson")
  implementation("io.quarkus:quarkus-smallrye-openapi")

  implementation(project(":application:rest:contract"))
  implementation(project(":domain:kernel"))
  implementation(project(":domain:contract"))
  implementation(project(":domain:core"))

  testImplementation("io.quarkus:quarkus-junit5")
  testImplementation("io.rest-assured:rest-assured")
}
