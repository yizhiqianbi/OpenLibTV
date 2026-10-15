// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildAgentModeMetadata,
  normalizeAgentModeConfig,
  resolveAgentModeConfig,
} from './agent-mode-config.js';

describe('source dry-run session config', () => {
  it('defaults to manual and retains an explicitly automatic preference', () => {
    expect(resolveAgentModeConfig()).toEqual({ dryRun: true });
    expect(resolveAgentModeConfig({ preference: false })).toEqual({ dryRun: false });
    expect(resolveAgentModeConfig({ preference: { dryrun: false } })).toEqual({ dryRun: false });
    expect(normalizeAgentModeConfig({ dryrun: true, dryRun: false })).toEqual({ dryRun: false });
  });
  it('resolves preference, stored session intent, and local session override in that order', () => {
    expect(
      resolveAgentModeConfig({
        preference: true,
        sessionId: 's',
        sessionExtra: { dryRunIntent: false },
        override: { dryRun: true },
        draft: { dryRun: false },
      }),
    ).toEqual({ dryRun: true });
    expect(
      resolveAgentModeConfig({
        preference: true,
        sessionId: 's',
        sessionExtra: { dryRunIntent: false },
      }),
    ).toEqual({ dryRun: false });
    expect(
      resolveAgentModeConfig({
        preference: false,
        sessionId: 's',
        sessionExtra: { dryRunIntent: 'true' },
        override: { dryRun: 'yes' },
      }),
    ).toEqual({ dryRun: false });
  });
  it('uses a draft only before a session is selected and emits metadata separate from parts', () => {
    const config = resolveAgentModeConfig({
      draft: { dryRun: false, scriptModel: 'seed_evolving' },
      sessionExtra: { dryRunIntent: true },
    });
    expect(buildAgentModeMetadata(config)).toEqual({
      dryRunIntent: false,
      scriptModel: 'seed_evolving',
    });
    expect(
      buildAgentModeMetadata({
        dryRun: false,
        modelKey: 'video',
        parts: [{ type: 'model', id: 'x' }],
      }),
    ).toEqual({ dryRunIntent: false });
  });
});
