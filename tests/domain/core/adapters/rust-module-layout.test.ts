/**
 * Tests for the Rust module-layout resolver.
 *
 * Two derivations in here are transplanted bugs rather than new code,
 * and they are what most of this file pins:
 *
 *   - **the crate name and its three spellings** — a directory is a
 *     package name in the member list and a `[dependencies]` key, and
 *     an identifier in a `use` statement, and getting one of the
 *     three wrong produces an error message that points at the
 *     template rather than at the derivation;
 *   - **the `path =` depth** between two crates, which is the JVM's
 *     `upToRoot` bug with a new spelling. `jvm-module-layout` and
 *     `go-module-layout` both carry unit tests pinning theirs; this
 *     is the third.
 *
 * Everything here is pure — no templates, no tree, no toolchain — so
 * it runs in milliseconds and fails on the derivation rather than on
 * a Cargo error three layers downstream.
 */

import { describe, expect, it } from 'vitest';
import type { Tag } from '../../../../src/domain/contract/composition.js';
import {
  BASIC_LAYOUT_TAG,
  MODULITH_LAYOUT_TAG,
  PEER_CONTEXT_TAG,
} from '../../../../src/domain/core/adapters/module-layout.js';
import {
  addWorkspaceMembers,
  hasPeerContext,
  rustLayout,
  rustPeerCrates,
  rustTemplateVars,
  toCrateIdent,
  toCrateName,
} from '../../../../src/domain/core/adapters/rust-module-layout.js';

const PROJECT = 'skel';

const basic = (): ReturnType<typeof rustLayout> => rustLayout([BASIC_LAYOUT_TAG], PROJECT);
const modulith = (extra: readonly Tag[] = []): ReturnType<typeof rustLayout> =>
  rustLayout([MODULITH_LAYOUT_TAG, ...extra], PROJECT);

describe('toCrateName', () => {
  it('drops the modules/ prefix and joins the rest with dashes', () => {
    expect(toCrateName('modules/ordering/user-side/service')).toBe('ordering-user-side-service');
  });

  it('keeps every segment of a path that is not under modules/', () => {
    expect(toCrateName('platform/kernel')).toBe('platform-kernel');
    expect(toCrateName('application/http')).toBe('application-http');
  });

  it('drops only a leading modules/, not one further down', () => {
    expect(toCrateName('modules/billing/modules/legacy')).toBe('billing-modules-legacy');
  });
});

describe('toCrateIdent', () => {
  it('is the package name with dashes turned into underscores', () => {
    expect(toCrateIdent('ordering-user-side-service')).toBe('ordering_user_side_service');
  });

  it('leaves a single-segment name alone', () => {
    expect(toCrateIdent('skel')).toBe('skel');
  });
});

describe('rustLayout — the three spellings', () => {
  it('spells the seam crate as directory, package and identifier', () => {
    const { crate } = modulith().service;

    expect(crate.dir).toBe('modules/greeting/user-side/service');
    expect(crate.name).toBe('greeting-user-side-service');
    expect(crate.ident).toBe('greeting_user_side_service');
  });

  it('names the contract and core crates after their context', () => {
    const layout = modulith();

    expect(layout.contract.crate.name).toBe('greeting-domain-contract');
    expect(layout.core.crate.name).toBe('greeting-domain-core');
    expect(layout.kernel.crate.name).toBe('platform-kernel');
  });

  it('puts every crate manifest at its own directory', () => {
    const layout = modulith();

    expect(layout.contract.crate.manifest).toBe('modules/greeting/domain/contract/Cargo.toml');
    expect(layout.kernel.crate.manifest).toBe('platform/kernel/Cargo.toml');
  });
});

describe('rustLayout — the path = depth', () => {
  it('climbs out of the context to reach a sibling crate of the same context', () => {
    const layout = modulith();

    expect(layout.contract.crate.pathFrom(layout.service.crate)).toBe('../../domain/contract');
  });

  it('climbs to the workspace root and back down to reach the kernel', () => {
    const layout = modulith();

    expect(layout.kernel.crate.pathFrom(layout.contract.crate)).toBe('../../../../platform/kernel');
  });

  it('reaches a context crate from an assembly at a different depth', () => {
    const layout = modulith();

    expect(layout.service.crate.pathFrom(layout.assembly('http').crate)).toBe(
      '../../modules/greeting/user-side/service',
    );
  });

  it('derives the reverse direction independently, not by mirroring', () => {
    const layout = modulith();

    expect(layout.assembly('http').crate.pathFrom(layout.service.crate)).toBe(
      '../../../../application/http',
    );
  });

  it('always emits posix separators, whatever the host', () => {
    const layout = modulith();

    expect(layout.kernel.crate.pathFrom(layout.core.crate)).not.toContain('\\');
  });
});

describe('rustLayout — basic', () => {
  it('is a single crate at the project root, not a workspace', () => {
    const layout = basic();

    expect(layout.workspace).toBe(false);
    expect(layout.members).toEqual([]);
    expect(layout.contract.crate.dir).toBe('');
    expect(layout.contract.crate.manifest).toBe('Cargo.toml');
  });

  it('keeps today’s file placement for the contract face and its core', () => {
    const layout = basic();

    expect(layout.contract.rootFile).toBe('src/domain.rs');
    expect(layout.core.rootFile).toBe('src/domain/greet.rs');
    expect(layout.contract.moduleFile('clock')).toBe('src/domain/clock.rs');
    expect(layout.infra('clock_fake').rootFile).toBe('src/infra/clock_fake.rs');
    expect(layout.assembly('cli').rootFile).toBe('src/bin/cli/main.rs');
    expect(layout.assembly('http').moduleFile('handler')).toBe('src/bin/http/handler.rs');
  });

  it('collapses the seam onto the contract face, because one hexagon has no seam', () => {
    const layout = basic();

    expect(layout.service).toBe(layout.contract);
  });

  it('names the contract face through the single crate', () => {
    expect(basic().contract.usePath).toBe('skel::domain');
  });
});

describe('rustLayout — modulith', () => {
  it('is a workspace whose members lead with the kernel', () => {
    const layout = modulith();

    expect(layout.workspace).toBe(true);
    expect(layout.members.map((c) => c.name)).toEqual([
      'platform-kernel',
      'greeting-domain-contract',
      'greeting-domain-core',
      'greeting-user-side-service',
    ]);
  });

  it('gives every unit its own crate root rather than a shared src/', () => {
    const layout = modulith();

    expect(layout.contract.rootFile).toBe('modules/greeting/domain/contract/src/lib.rs');
    expect(layout.core.rootFile).toBe('modules/greeting/domain/core/src/lib.rs');
    expect(layout.infra('clock_fake').rootFile).toBe(
      'modules/greeting/infra/clock_fake/src/lib.rs',
    );
  });

  it('separates the seam from the contract face', () => {
    const layout = modulith();

    expect(layout.service.crate.name).not.toBe(layout.contract.crate.name);
  });

  it('puts an assembly under application/ with a main.rs, not a lib.rs', () => {
    const layout = modulith();

    expect(layout.assembly('http').crate.dir).toBe('application/http');
    expect(layout.assembly('http').rootFile).toBe('application/http/src/main.rs');
  });

  it('names units by their crate identifier, with no module qualifier', () => {
    expect(modulith().contract.usePath).toBe('greeting_domain_contract');
  });
});

describe('rustLayout — binary names', () => {
  it('keeps the same binary names under both layouts', () => {
    for (const layout of [basic(), modulith()]) {
      expect(layout.binName('cli')).toBe('skel');
      expect(layout.binName('http')).toBe('skel-http');
    }
  });
});

describe('peer context', () => {
  it('is off unless the manifest carries the tag', () => {
    expect(hasPeerContext([MODULITH_LAYOUT_TAG])).toBe(false);
    expect(hasPeerContext([MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG])).toBe(true);
  });

  it('names the peer’s crates the same way the skeleton’s are named', () => {
    const peer = rustPeerCrates(modulith([PEER_CONTEXT_TAG]));

    expect(peer.contract.crate.name).toBe('guestbook-domain-contract');
    expect(peer.core.crate.name).toBe('guestbook-domain-core');
  });

  it('puts the gateway in the consumer’s infra, named for the context it reaches', () => {
    const peer = rustPeerCrates(modulith([PEER_CONTEXT_TAG]));

    expect(peer.gateway.crate.dir).toBe('modules/guestbook/infra/greeting-gateway');
    expect(peer.gateway.crate.name).toBe('guestbook-infra-greeting-gateway');
  });

  it('derives the gateway’s path to the seam it is allowed to depend on', () => {
    const layout = modulith([PEER_CONTEXT_TAG]);
    const peer = rustPeerCrates(layout);

    expect(layout.service.crate.pathFrom(peer.gateway.crate)).toBe(
      '../../../greeting/user-side/service',
    );
  });
});

describe('rustTemplateVars', () => {
  it('hands the modulith tree finished crate spellings', () => {
    const vars = rustTemplateVars(modulith(), PROJECT);

    expect(vars).toMatchObject({
      projectName: 'skel',
      contractCrate: 'greeting-domain-contract',
      contractIdent: 'greeting_domain_contract',
      contractUse: 'greeting_domain_contract',
      kernelCrate: 'platform-kernel',
      serviceCrate: 'greeting-user-side-service',
    });
  });

  it('hands the basic tree the project’s own crate, as it always has', () => {
    const vars = rustTemplateVars(basic(), PROJECT);

    expect(vars).toMatchObject({
      projectName: 'skel',
      contractCrate: 'skel',
      contractIdent: 'skel',
      contractUse: 'skel::domain',
    });
  });
});

describe('layout resolution from tags', () => {
  it('defaults to basic when the manifest carries neither tag', () => {
    expect(rustLayout([], PROJECT).layout).toBe('basic');
  });
});

describe('addWorkspaceMembers', () => {
  const manifest = (members: readonly string[]): string =>
    `[workspace]\nresolver = "3"\nmembers = [\n${members
      .map((m) => `    "${m}",`)
      .join('\n')}\n]\n\n[workspace.package]\nversion = "0.1.0"\n`;

  it('adds a crate and keeps the list sorted', () => {
    const got = addWorkspaceMembers(manifest(['platform/kernel']), ['application/cli']);

    expect(got).toContain('"application/cli",');
    expect(got.indexOf('"application/cli"')).toBeLessThan(got.indexOf('"platform/kernel"'));
  });

  it('is idempotent — re-applying adds nothing', () => {
    const once = addWorkspaceMembers(manifest(['platform/kernel']), ['application/cli']);

    expect(addWorkspaceMembers(once, ['application/cli'])).toBe(once);
  });

  it('preserves entries an earlier adapter already added', () => {
    const got = addWorkspaceMembers(manifest(['platform/kernel', 'application/cli']), [
      'modules/guestbook/domain/core',
    ]);

    for (const m of ['platform/kernel', 'application/cli', 'modules/guestbook/domain/core']) {
      expect(got).toContain(`"${m}",`);
    }
  });

  it('leaves the rest of the manifest untouched', () => {
    const got = addWorkspaceMembers(manifest(['platform/kernel']), ['application/http']);

    expect(got).toContain('[workspace.package]');
    expect(got).toContain('resolver = "3"');
  });

  it('throws when there is no members list, rather than silently dropping the crate', () => {
    expect(() => addWorkspaceMembers('[package]\nname = "skel"\n', ['application/cli'])).toThrow(
      /no workspace members list/,
    );
  });
});
