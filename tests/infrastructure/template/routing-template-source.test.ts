/**
 * The template router: keel's own ids reach the packaged assets, a
 * plugin's reach that plugin's directory, and an id naming a plugin
 * that registered no assets fails saying so.
 *
 * The last one is the case worth a test of its own. Falling through
 * to keel's assets would render a file the plugin author did not
 * write — or report a path they never named — which is precisely the
 * "fail naming the plugin, not the engine" property the seam exists
 * to hold.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pluginTemplateId } from '../../../src/domain/contract/plugin.js';
import { EjsTemplateSource } from '../../../src/infrastructure/template/ejs-template-source.js';
import {
  RoutingTemplateSource,
  templateSourceFor,
} from '../../../src/infrastructure/template/routing-template-source.js';

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-router-'));
  await fs.outputFile(path.join(root, 'plugin', 'greeting', 'HI.md.ejs'), 'hi <%= who %>');
  await fs.outputFile(path.join(root, 'packaged', 'shipped', 'SHIPPED.md.ejs'), 'shipped');
});

afterEach(async () => {
  await fs.remove(root);
});

function router(): RoutingTemplateSource {
  return new RoutingTemplateSource(
    new EjsTemplateSource(path.join(root, 'packaged')),
    new Map([['acme', path.join(root, 'plugin')]]),
  );
}

describe('RoutingTemplateSource', () => {
  it('renders a plugin id from that plugin s own assets directory', async () => {
    const files = await router().render(pluginTemplateId('acme', 'greeting'), 'out', {
      who: 'world',
    });
    expect(files).toEqual([{ path: 'out/HI.md', content: 'hi world' }]);
  });

  it('renders an unprefixed id from the packaged assets', async () => {
    const files = await router().render('shipped', '', {});
    expect(files).toEqual([{ path: 'SHIPPED.md', content: 'shipped' }]);
  });

  it('names the plugin when the id addresses one that registered no assets', async () => {
    await expect(router().render(pluginTemplateId('other', 'greeting'), '', {})).rejects.toThrow(
      /plugin 'other'/,
    );
  });
});

describe('templateSourceFor', () => {
  it('hands back the packaged source untouched when no plugin brought assets', () => {
    const packaged = new EjsTemplateSource(path.join(root, 'packaged'));
    expect(templateSourceFor(packaged, new Map())).toBe(packaged);
  });
});
