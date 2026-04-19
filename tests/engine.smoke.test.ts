import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HomegrownEngine, cliPrompt } from '../src/engine/homegrown.js';
import { renderTemplate } from '../src/engine/template.js';
import { logger } from '../src/util/log.js';
import type { Schematic } from '../src/engine/types.js';

describe('HomegrownEngine', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'keel-test-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('runs a schematic that writes a single file', async () => {
    const engine = new HomegrownEngine();
    const schematic: Schematic = {
      name: 'hello',
      description: 'writes a greeting',
      parameters: [],
      async run(tree, opts) {
        tree.write('greeting.txt', `hello ${String(opts['who'] ?? 'world')}\n`);
      },
    };
    engine.register(schematic);

    await engine.run(
      'hello',
      { who: 'keel' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
    );

    const out = readFileSync(path.join(workDir, 'greeting.txt'), 'utf8');
    expect(out).toBe('hello keel\n');
  });

  it('supports composition via context.invoke', async () => {
    const engine = new HomegrownEngine();
    engine.register({
      name: 'leaf',
      description: 'leaf schematic',
      parameters: [],
      async run(tree) {
        tree.write('leaf.txt', 'leaf\n');
      },
    });
    engine.register({
      name: 'root',
      description: 'composes leaf',
      parameters: [],
      async run(tree, _opts, ctx) {
        tree.write('root.txt', 'root\n');
        await ctx.invoke('leaf', {});
      },
    });

    await engine.run(
      'root',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
    );

    expect(existsSync(path.join(workDir, 'root.txt'))).toBe(true);
    expect(existsSync(path.join(workDir, 'leaf.txt'))).toBe(true);
  });

  it('propagates invoke through nested composition (grand-child writes via ctx.invoke)', async () => {
    const engine = new HomegrownEngine();
    engine.register({
      name: 'grand',
      description: 'leaf',
      parameters: [],
      async run(tree) {
        tree.write('grand.txt', 'grand\n');
      },
    });
    engine.register({
      name: 'child',
      description: 'middle',
      parameters: [],
      async run(tree, _opts, ctx) {
        tree.write('child.txt', 'child\n');
        await ctx.invoke('grand', {});
      },
    });
    engine.register({
      name: 'parent',
      description: 'top',
      parameters: [],
      async run(tree, _opts, ctx) {
        tree.write('parent.txt', 'parent\n');
        await ctx.invoke('child', {});
      },
    });

    await engine.run(
      'parent',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
    );

    for (const f of ['parent.txt', 'child.txt', 'grand.txt']) {
      expect(existsSync(path.join(workDir, f))).toBe(true);
    }
  });

  it('does not write to disk on dry run', async () => {
    const engine = new HomegrownEngine();
    engine.register({
      name: 'x',
      description: '',
      parameters: [],
      async run(tree) {
        tree.write('dry.txt', 'should not be written\n');
      },
    });
    await engine.run(
      'x',
      {},
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
      { dryRun: true },
    );
    expect(existsSync(path.join(workDir, 'dry.txt'))).toBe(false);
  });

  it('renders a template directory with ejs and path substitution', async () => {
    const templateDir = path.join(workDir, '__tpl__');
    mkdirSync(templateDir, { recursive: true });
    writeFileSync(path.join(templateDir, '__name__.java.ejs'), 'public class <%= name %> {}');

    const engine = new HomegrownEngine();
    engine.register({
      name: 'render',
      description: '',
      parameters: [],
      async run(tree, opts) {
        await renderTemplate(tree, templateDir, 'out', { name: String(opts['name']) });
      },
    });
    await engine.run(
      'render',
      { name: 'UserRepository' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
    );

    const produced = readFileSync(path.join(workDir, 'out', 'UserRepository.java'), 'utf8');
    expect(produced).toBe('public class UserRepository {}');
  });
});
