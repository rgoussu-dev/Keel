/**
 * The optional agent workflow kit: shared project instructions and
 * one family kit selected by the project's language/runtime tags.
 * Presets install it after the runnable skeleton; later adoption
 * realizes existing contributors' declared harness elements too.
 */

import { AGENT_HARNESS_TAG, type Vertical } from '../../contract/composition.js';
import { claudeCoreAdapter } from '../adapters/claude-core.js';
import { CLAUDE_KIT_TAG, RUN_SKILL_NAME } from '../adapters/claude-kit.js';
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
  skills: [RUN_SKILL_NAME],
  adapters: [
    claudeCoreAdapter,
    jvmClaudeKitAdapter,
    goClaudeKitAdapter,
    rustClaudeKitAdapter,
    tsClaudeKitAdapter,
    wcClaudeKitAdapter,
  ],
};
