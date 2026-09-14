/**
 * The optional agent workflow kit: shared project instructions and
 * one family kit selected by the project's language/runtime tags.
 * Presets install it after the runnable skeleton; later adoption
 * realizes existing contributors' declared harness elements too.
 */

import { AGENT_HARNESS_TAG, type Vertical } from '../../contract/composition.js';
import { claudeCoreAdapter } from '../adapters/claude-core.js';
import {
  ADD_MODULE_SKILL_NAME,
  CLAUDE_KIT_TAG,
  PRE_COMMIT_HOOK_NAME,
  PROMOTE_SKILL_NAME,
  RUN_SKILL_NAME,
} from '../adapters/claude-kit.js';
import { goClaudeKitAdapter } from '../adapters/go-claude-kit.js';
import { jvmClaudeKitAdapter } from '../adapters/jvm-claude-kit.js';
import { rustClaudeKitAdapter } from '../adapters/rust-claude-kit.js';
import { tsClaudeKitAdapter } from '../adapters/ts-claude-kit.js';
import { wcClaudeKitAdapter } from '../adapters/wc-claude-kit.js';

/** Agent documents, skills and hooks for one scaffolded service. */
export const agentHarnessVertical: Vertical = {
  id: 'agent-harness',
  title: 'Agent harness',
  description: 'Project instructions, skills and workflow hooks for coding agents.',
  dimensions: ['agentic-baseline', 'agentic-kit'],
  promotes: [AGENT_HARNESS_TAG, CLAUDE_KIT_TAG],
  // Every name the vertical may stage, not the ones one layout does:
  // the family kit ships exactly one of the two layout lifecycle
  // skills, and which one is a tag the declaration cannot read.
  skills: [RUN_SKILL_NAME, ADD_MODULE_SKILL_NAME, PROMOTE_SKILL_NAME],
  hooks: [PRE_COMMIT_HOOK_NAME],
  adapters: [
    claudeCoreAdapter,
    jvmClaudeKitAdapter,
    goClaudeKitAdapter,
    rustClaudeKitAdapter,
    tsClaudeKitAdapter,
    wcClaudeKitAdapter,
  ],
};
