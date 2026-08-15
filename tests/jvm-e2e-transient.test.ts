/**
 * The retry predicate of the JVM e2e harness.
 *
 * `tests/support/jvm-e2e.ts` retries a build whose output matches a
 * known Gradle-CDN flake, because those failures are unrelated to the
 * project under test and make the suites unreliable on cold caches.
 * That predicate is a list of regexes over log text, which is exactly
 * the kind of thing that rots silently: upstream reworded a message
 * and the flake comes back as a red build, or a pattern is widened and
 * starts swallowing real failures. Neither shows up until CI is
 * already lying.
 *
 * So the patterns are pinned here, against output captured from real
 * runs, and it runs in `verify` rather than behind the e2e opt-in.
 */

import { describe, expect, it } from 'vitest';
import { isTransient } from './support/jvm-e2e.js';

/**
 * Captured from `e2e (jvm-basic-quarkus)` on a commit whose only
 * change was a Markdown file — the generated project's wrapper had its
 * connection dropped mid-TLS-handshake while fetching the Gradle
 * distribution. It never reaches an HTTP status code, which is why the
 * 5xx patterns do not see it.
 */
const CONNECTION_RESET = `./gradlew build  failed (exit 1)
stdout:
Downloading https://services.gradle.org/distributions/gradle-9.4.1-bin.zip

stderr:
Exception in thread "main" java.net.SocketException: Connection reset
\tat java.base/sun.nio.ch.NioSocketImpl.implRead(NioSocketImpl.java:316)
\tat java.base/sun.security.ssl.SSLSocketImpl.startHandshake(SSLSocketImpl.java:455)
\tat java.base/java.net.HttpURLConnection.getResponseCode(HttpURLConnection.java:493)
\tat org.gradle.wrapper.Install.forceFetch(SourceFile:2)
\tat org.gradle.wrapper.GradleWrapperMain.main(SourceFile:2)`;

describe('the JVM e2e retry predicate', () => {
  it('retries the CDN flakes it was written for', () => {
    expect(isTransient('Test of distribution url https://example/g.zip failed')).toBe(true);
    expect(isTransient('Server returned HTTP response code: 503')).toBe(true);
    expect(isTransient('HEAD request to https://example/g.zip failed: response code (502)')).toBe(
      true,
    );
  });

  it('retries a connection reset in the wrapper download, which never reaches a status code', () => {
    expect(isTransient(CONNECTION_RESET)).toBe(true);
  });

  it('does not retry a socket failure raised by the project under test', () => {
    // The anchor that keeps the pattern honest: the same exception,
    // with no `org.gradle.wrapper.Install` frame, is the emitted
    // project's own build or test failing — which is the whole thing
    // these suites exist to report, and must go red on the first try.
    const projectFailure = `./gradlew build  failed (exit 1)
stderr:
GreetControllerTest > greetsByNameThroughMediator FAILED
    java.net.SocketException: Connection reset
\tat com.example.rest.GreetControllerTest.greetsByNameThroughMediator(GreetControllerTest.java:31)`;

    expect(isTransient(projectFailure)).toBe(false);
  });

  it('does not retry an ordinary compile or assertion failure', () => {
    expect(isTransient('error: cannot find symbol\n  symbol: class GreetHandler')).toBe(false);
    expect(isTransient('expected: <400> but was: <404>')).toBe(false);
    expect(isTransient('Server returned HTTP response code: 404')).toBe(false);
  });
});
