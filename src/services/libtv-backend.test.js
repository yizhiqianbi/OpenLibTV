import { describe, expect, it, vi } from 'vitest';
import { createLibTvBackend, isRemoteRevisionConflict, remoteCanvasSave } from './libtv-backend.js';

describe('LibTV backend repository boundary', () => {
  it('exposes one operator repository without requiring local storage', async () => {
    const canvas = { save: vi.fn().mockResolvedValue({ revision: 5 }) };
    const client = {
      content: vi.fn(),
      projects: {},
      folders: {},
      assets: {},
      skills: {},
      canvas,
      generation: {},
      agent: { sessions: {}, stream: vi.fn() },
      upload: vi.fn(),
      social: {},
    };
    const backend = createLibTvBackend({ client });
    await remoteCanvasSave(backend, 'project-1', { title: 'draft' }, { revision: 4 });
    expect(canvas.save).toHaveBeenCalledWith(
      'project-1',
      { title: 'draft' },
      { ifMatch: 4, signal: undefined },
    );
  });

  it('recognizes HTTP and structured CAS conflicts', () => {
    expect(isRemoteRevisionConflict({ status: 412 })).toBe(true);
    expect(isRemoteRevisionConflict({ code: 'REVISION_CONFLICT' })).toBe(true);
    expect(isRemoteRevisionConflict({ status: 500 })).toBe(false);
  });
});
