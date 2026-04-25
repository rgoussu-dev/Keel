plugins {
  id("keel.java-conventions")
  id("keel.test-conventions")
  id("keel.quality-conventions")
}

dependencies {
  implementation(project(":domain:kernel"))
  implementation(project(":domain:contract"))
}
