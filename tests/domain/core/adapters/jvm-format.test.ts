/**
 * The JVM formatter's build-file patches, on a build file keel did not
 * write. Each anchors on a block every keel-emitted script carries, so
 * a file without one is the user's, and the patch refuses it naming
 * the file rather than throwing an error only an adapter's author
 * could read.
 */

import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../../src/domain/kernel/result.js';
import { PathConflictError } from '../../../../src/domain/core/apply.js';
import {
  JVM_FORMAT_ID,
  addSpotlessToGradle,
  addSpotlessToPom,
} from '../../../../src/domain/core/adapters/jvm-format.js';

const JAVA = ['lang.java', 'runtime.jvm'];

const refusal = (patch: () => string): PathConflictError => {
  try {
    patch();
  } catch (thrown) {
    expect(thrown).toBeInstanceOf(PathConflictError);
    expect(thrown).toBeInstanceOf(DomainError);
    return thrown as PathConflictError;
  }
  throw new Error('expected the patch to refuse the file');
};

describe('jvm-format build-file patches', () => {
  it('adds the plugin inside a Gradle script’s plugins block', () => {
    const patched = addSpotlessToGradle('plugins {\n    java\n}\n', JAVA);
    expect(patched).toMatch(/^plugins \{\n {4}id\("com\.diffplug\.spotless"\) version "/);
  });

  it('refuses a Gradle script with no plugins block, naming the file', () => {
    const error = refusal(() => addSpotlessToGradle('// hand-written\n', JAVA));
    expect(error.code).toBe('keel.path-conflict');
    expect(error.path).toBe('build.gradle.kts');
    expect(error.adapterId).toBe(JVM_FORMAT_ID);
    expect(error.message).toBe(
      "'build.gradle.kts' has no 'plugins {' block for the Spotless plugin — keel adds its line inside that block and does not rewrite the file; add one, then re-run (code-style/jvm-format)",
    );
  });

  it('refuses a POM with no build element, naming the file', () => {
    const error = refusal(() => addSpotlessToPom('<project></project>\n', JAVA));
    expect(error.code).toBe('keel.path-conflict');
    expect(error.path).toBe('pom.xml');
    expect(error.adapterId).toBe(JVM_FORMAT_ID);
    expect(error.message).toMatch(/^'pom\.xml' has no <build> element for the Spotless plugin/);
  });

  it('leaves a file that already names the plugin alone, anchor or not', () => {
    const own = '// com.diffplug.spotless, applied elsewhere\n';
    expect(addSpotlessToGradle(own, JAVA)).toBe(own);
  });
});
