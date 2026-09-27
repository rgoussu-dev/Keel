/**
 * The sentence a command needing a keel project is refused with where
 * none is: pointing at the project the directory sits inside — or, for
 * a command a product root refuses too, at that root's services — at
 * the services below it, or, with nothing near, at the command that
 * creates one; and, where every project it would point at refuses the
 * command as well, for one reason, saying why instead. Every shape the
 * walk can hand it, one row each.
 */

import { describe, expect, it } from 'vitest';
import {
  NO_PROJECT_NEARBY,
  notInitialisedSentence,
  type NearbyProjects,
} from '../../../src/domain/contract/nearby.js';

const none = 'no project initialised at /p/.claude';

/** Why a project refuses `keel x`, by the path it is named by. */
const REFUSING: Readonly<Record<string, string>> = {
  '..': 'it is flat',
  '../backend': 'it is flat',
  '../frontend': 'it is flat',
  '../api': 'it has no adapter',
  backend: 'it is flat',
  frontend: 'it is flat',
};

const TABLE: readonly {
  readonly name: string;
  readonly nearby: NearbyProjects;
  readonly serviceScoped?: boolean;
  /** The paths {@link REFUSING} is read for; none when omitted. */
  readonly refusing?: readonly string[];
  readonly sentence: string;
}[] = [
  {
    name: 'nothing near',
    nearby: NO_PROJECT_NEARBY,
    sentence: `${none} — run 'keel new --stack=<id>' first to create one`,
  },
  {
    name: 'a project above',
    nearby: { above: '../..', below: [] },
    sentence: `${none} — this directory is inside the keel project at ../../; run 'keel x' there`,
  },
  {
    name: 'one service below',
    nearby: { above: null, below: ['backend'] },
    sentence: `${none} — backend/ below holds a keel project; run 'keel x' in it`,
  },
  {
    name: 'two services below',
    nearby: { above: null, below: ['backend', 'frontend'] },
    sentence: `${none} — backend/ and frontend/ below hold keel projects; run 'keel x' in one of them`,
  },
  {
    name: 'three services below',
    nearby: { above: null, below: ['a', 'b', 'c'] },
    sentence: `${none} — a/, b/ and c/ below hold keel projects; run 'keel x' in one of them`,
  },
  {
    name: 'a product root above, for a command it runs',
    nearby: { above: '..', services: ['../backend', '../frontend'], below: [] },
    sentence: `${none} — this directory is inside the keel project at ../; run 'keel x' there`,
  },
  {
    name: 'a product root above, for a command only its services run',
    nearby: { above: '..', services: ['../backend', '../frontend'], below: [] },
    serviceScoped: true,
    sentence: `${none} — this directory is inside the keel product at ../, whose services are ../backend/ and ../frontend/; run 'keel x' in one of them`,
  },
  {
    name: 'a one-service product root above, for a command only its services run',
    nearby: { above: '..', services: ['../api'], below: [] },
    serviceScoped: true,
    sentence: `${none} — this directory is inside the keel product at ../, whose service is ../api/; run 'keel x' in it`,
  },
  {
    name: 'a single project above, for a command only a product root refuses',
    nearby: { above: '..', below: [] },
    serviceScoped: true,
    sentence: `${none} — this directory is inside the keel project at ../; run 'keel x' there`,
  },
  {
    name: 'a project above that refuses it too',
    nearby: { above: '..', below: [] },
    refusing: ['..'],
    sentence: `${none} — this directory is inside the keel project at ../, which refuses 'keel x' too, since it is flat`,
  },
  {
    name: 'a product root above whose services each refuse it, for one reason',
    nearby: { above: '..', services: ['../backend', '../frontend'], below: [] },
    serviceScoped: true,
    refusing: ['../backend', '../frontend'],
    sentence: `${none} — this directory is inside the keel product at ../, whose services are ../backend/ and ../frontend/, each refusing 'keel x' too, since it is flat`,
  },
  {
    name: 'a product root above one of whose services takes it',
    nearby: { above: '..', services: ['../backend', '../frontend'], below: [] },
    serviceScoped: true,
    refusing: ['../frontend'],
    sentence: `${none} — this directory is inside the keel product at ../, whose services are ../backend/ and ../frontend/; run 'keel x' in one of them`,
  },
  {
    name: 'a product root above whose services refuse it for different reasons',
    nearby: { above: '..', services: ['../backend', '../api'], below: [] },
    serviceScoped: true,
    refusing: ['../backend', '../api'],
    sentence: `${none} — this directory is inside the keel product at ../, whose services are ../backend/ and ../api/; run 'keel x' in one of them`,
  },
  {
    name: 'one service below that refuses it',
    nearby: { above: null, below: ['backend'] },
    refusing: ['backend'],
    sentence: `${none} — backend/ below holds a keel project, which refuses 'keel x' too, since it is flat`,
  },
  {
    name: 'services below that each refuse it',
    nearby: { above: null, below: ['backend', 'frontend'] },
    refusing: ['backend', 'frontend'],
    sentence: `${none} — backend/ and frontend/ below hold keel projects, each refusing 'keel x' too, since it is flat`,
  },
];

describe('notInitialisedSentence', () => {
  it.each(TABLE)('$name', ({ nearby, serviceScoped, refusing = [], sentence }) => {
    expect(
      notInitialisedSentence(
        '/p/.claude',
        nearby,
        'keel x',
        'keel new --stack=<id>',
        serviceScoped,
        (named) => (refusing.includes(named) ? (REFUSING[named] ?? null) : null),
      ),
    ).toBe(sentence);
  });
});
