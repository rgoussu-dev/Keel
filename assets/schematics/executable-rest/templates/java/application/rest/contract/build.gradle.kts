plugins {
  id("keel.java-conventions")
  id("keel.quality-conventions")
}

dependencies {
  implementation(project(":domain:contract"))
}
