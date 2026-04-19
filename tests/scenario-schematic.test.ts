import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HomegrownEngine, cliPrompt } from '../src/engine/homegrown.js';
import { scenarioSchematic } from '../src/schematics/scenario/factory.js';
import { logger } from '../src/util/log.js';

describe('scenario schematic', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(path.join(tmpdir(), 'keel-sc-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('scaffolds Scenario, Factory, and Test stubs in the domain test tree', async () => {
    const engine = new HomegrownEngine();
    engine.register(scenarioSchematic);

    await engine.run(
      'scenario',
      { name: 'CreateUser', basePackage: 'com.example', aggregate: 'user' },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
    );

    const base = 'domain/core/src/test/java/com/example/user';
    for (const f of ['CreateUserScenario.java', 'CreateUserFactory.java', 'CreateUserTest.java']) {
      expect(existsSync(path.join(workDir, base, f))).toBe(true);
    }

    const test = readFileSync(path.join(workDir, base, 'CreateUserTest.java'), 'utf8');
    expect(test).toContain('class CreateUserTest');
    expect(test).toContain('CreateUserScenario.defaults()');
    expect(test).toContain('CreateUserFactory.from(scenario).build()');
    expect(test).toContain('Mediator underTest');
  });

  it('honours a custom portName', async () => {
    const engine = new HomegrownEngine();
    engine.register(scenarioSchematic);

    await engine.run(
      'scenario',
      {
        name: 'SearchUsers',
        basePackage: 'com.example',
        aggregate: 'user',
        portName: 'UserQueries',
      },
      { logger, cwd: workDir, prompt: cliPrompt, invoke: async () => {} },
    );

    const test = readFileSync(
      path.join(workDir, 'domain/core/src/test/java/com/example/user/SearchUsersTest.java'),
      'utf8',
    );
    expect(test).toContain('UserQueries underTest');
  });
});
