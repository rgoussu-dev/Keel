/**
 * Handler for `keel.link-peer` — record two keel projects as peers
 * of one another.
 *
 * Reads both manifests, records each side's declared `projects` tags
 * into the other side's `peers` (upserting by ref, so re-linking
 * refreshes a stale projection), and writes both back. Everything
 * downstream is the ordinary machinery: the next `keel add` in
 * either project resolves adapters against tags ∪ peer tags.
 *
 * Refs are stored relative to each project's root so the pair stays
 * linked when the enclosing directory moves as a whole.
 */

import path from 'node:path';
import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type { LinkPeerCommand, LinkReport } from '../../contract/commands.js';
import { projectScopeRoot, type ManifestV2, type PeerLink } from '../../contract/manifest.js';
import type { InstallDeps } from './deps.js';

/** Executes {@link LinkPeerCommand}s. */
export class LinkPeerHandler implements Handler<LinkPeerCommand> {
  constructor(private readonly deps: InstallDeps) {}

  supports(action: Action): action is LinkPeerCommand {
    return action.kind === 'keel.link-peer';
  }

  async handle(command: LinkPeerCommand): Promise<Result<LinkReport>> {
    const here = path.resolve(command.cwd);
    const there = path.resolve(command.cwd, command.ref);
    if (here === there) {
      return err(new DomainError('cannot link a project to itself', 'keel.invalid-peer'));
    }

    const own = await this.deps.manifests.read(projectScopeRoot(here));
    if (!own) {
      return err(
        new DomainError(
          `no project initialised at ${projectScopeRoot(here)} — run 'keel new --stack=<id>' first`,
          'keel.not-initialised',
        ),
      );
    }
    const peer = await this.deps.manifests.read(projectScopeRoot(there));
    if (!peer) {
      return err(
        new DomainError(
          `no keel project at ${there} — the peer must be an initialised keel project`,
          'keel.peer-not-initialised',
        ),
      );
    }

    const now = this.deps.clock.nowIso();
    const refHere = toPosix(path.relative(here, there));
    const refThere = toPosix(path.relative(there, here));

    await this.deps.manifests.write(
      projectScopeRoot(here),
      withPeer(own, { ref: refHere, tags: [...peer.projects].sort() }, now),
    );
    await this.deps.manifests.write(
      projectScopeRoot(there),
      withPeer(peer, { ref: refThere, tags: [...own.projects].sort() }, now),
    );

    this.deps.logger.success(
      `linked peers: . ↔ ${refHere} (here gains [${peer.projects.join(', ')}], there gains [${own.projects.join(', ')}])`,
    );
    return ok({
      ref: refHere,
      projectedHere: [...peer.projects].sort(),
      projectedThere: [...own.projects].sort(),
    });
  }
}

function withPeer(manifest: ManifestV2, link: PeerLink, now: string): ManifestV2 {
  const others = manifest.peers.filter((p) => p.ref !== link.ref);
  return { ...manifest, peers: [...others, link], updatedAt: now };
}

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}
