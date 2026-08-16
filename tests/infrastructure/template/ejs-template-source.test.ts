import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EjsTemplateSource } from '../../../src/infrastructure/template/ejs-template-source.js';

let tmplRoot: string;

beforeEach(async () => {
  tmplRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-render-tmpl-'));
});

afterEach(async () => {
  await fs.remove(tmplRoot);
});

describe('EjsTemplateSource.render', () => {
  it('renders .ejs files through EJS and strips the suffix', async () => {
    await fs.outputFile(path.join(tmplRoot, 'README.md.ejs'), 'project: <%= name %>');
    const files = await new EjsTemplateSource(tmplRoot).render('', '', { name: 'demo' });
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('README.md');
    expect(files[0]!.content.toString()).toBe('project: demo');
  });

  it('byte-copies non-ejs files', async () => {
    const bin = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
    await fs.outputFile(path.join(tmplRoot, 'logo.png'), bin);
    const files = await new EjsTemplateSource(tmplRoot).render('', '', {});
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('logo.png');
    expect(Buffer.isBuffer(files[0]!.content)).toBe(true);
    expect((files[0]!.content as Buffer).equals(bin)).toBe(true);
  });

  it('substitutes __token__ in filenames from vars', async () => {
    await fs.outputFile(
      path.join(tmplRoot, 'src', '__pkgPath__', '__Name__.java.ejs'),
      'class <%= Name %> {}',
    );
    const files = await new EjsTemplateSource(tmplRoot).render('', '', {
      pkgPath: 'com/example',
      Name: 'Hello',
    });
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('src/com/example/Hello.java');
    expect(files[0]!.content.toString()).toBe('class Hello {}');
  });

  it('preserves the executable bit on the source file', async () => {
    const exe = path.join(tmplRoot, 'gradlew');
    await fs.outputFile(exe, '#!/bin/sh\n');
    await fs.chmod(exe, 0o755);
    const files = await new EjsTemplateSource(tmplRoot).render('', '', {});
    expect(files[0]!.mode).toBe(0o755);
  });

  it('joins targetRoot onto every output path', async () => {
    await fs.outputFile(path.join(tmplRoot, 'a.txt'), 'hi');
    const files = await new EjsTemplateSource(tmplRoot).render('', 'sub/dir', {});
    expect(files[0]!.path).toBe('sub/dir/a.txt');
  });

  it('leaves unknown __token__ placeholders untouched', async () => {
    await fs.outputFile(path.join(tmplRoot, '__missing__.txt'), 'x');
    const files = await new EjsTemplateSource(tmplRoot).render('', '', {});
    expect(files[0]!.path).toBe('__missing__.txt');
  });

  /**
   * A token immediately followed by `_` is the case that made the old
   * grammar ambiguous: with `_` legal inside a token name, the greedy
   * read took `module_` and found its closing `__`, so nothing
   * resolved and the literal landed on disk. A Go test file emitted
   * per bounded context is exactly this shape.
   */
  it('resolves a token immediately followed by an underscore', async () => {
    await fs.outputFile(path.join(tmplRoot, '__module___test.go'), 'package main');
    const files = await new EjsTemplateSource(tmplRoot).render('', '', { module: 'ordering' });
    expect(files[0]!.path).toBe('ordering_test.go');
  });

  it('resolves a token immediately followed by more letters', async () => {
    await fs.outputFile(path.join(tmplRoot, '__consumes__gateway/x.txt'), 'x');
    const files = await new EjsTemplateSource(tmplRoot).render('', '', { consumes: 'greeting' });
    expect(files[0]!.path).toBe('greetinggateway/x.txt');
  });

  it('substitutes two different tokens in one path', async () => {
    await fs.outputFile(path.join(tmplRoot, '__pkgPath__/__assemblyPkgPath__/x.txt'), 'x');
    const files = await new EjsTemplateSource(tmplRoot).render('', '', {
      pkgPath: 'com/example',
      assemblyPkgPath: 'cli',
    });
    expect(files[0]!.path).toBe('com/example/cli/x.txt');
  });
});
