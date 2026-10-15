import { describe, expect, it } from 'vitest';
import {
  agentNodeLivePreview,
  agentNodeVideoPoster,
  resolveAgentNodePresentation,
} from './agent-node-presentation.ts';

const reference = Object.freeze({
  type: 'node',
  id: 'n',
  nodeKey: 'n',
  name: '保存名称',
  projectId: 'a',
  nodeType: 'image',
  url: '/saved.png',
  mediaType: 'image',
  referenceKey: 'occurrence-1',
});
const node = {
  id: 'n',
  type: 'image',
  data: { type: 'image', name: '实时名称', url: ['', '/live.png'] },
};
const live = { projectId: 'a', nodes: [node], ready: true, canLocate: true };

describe('agent node presentation source rules', () => {
  it('uses live labels and first media URL while preserving stored occurrence metadata', () => {
    expect(resolveAgentNodePresentation(reference, live)).toMatchObject({
      state: 'live',
      label: '实时名称',
      canLocate: true,
      previewSource: 'live',
      preview: { url: '/live.png', mediaType: 'image' },
    });
    const renamed = { ...node, data: { ...node.data, name: ' 新名称 ' } };
    expect(resolveAgentNodePresentation(reference, { ...live, nodes: [renamed] }).label).toBe(
      '新名称',
    );
    const blank = { ...node, data: { name: '', title: '不能替代显式空名称', type: 'image' } };
    expect(resolveAgentNodePresentation(reference, { ...live, nodes: [blank] }).label).toBe('n');
    expect(reference.name).toBe('保存名称');
    expect(reference.referenceKey).toBe('occurrence-1');
  });
  it('distinguishes missing live nodes from loading and context-free snapshots', () => {
    expect(resolveAgentNodePresentation(reference, { ...live, nodes: [] })).toMatchObject({
      state: 'missing',
      deleted: true,
      dimmed: true,
      canLocate: false,
      title: '节点已删除',
    });
    expect(resolveAgentNodePresentation(reference, { ...live, nodes: [] }).preview).toBeUndefined();
    expect(
      resolveAgentNodePresentation(reference, { ...live, ready: false, nodes: [] }),
    ).toMatchObject({
      state: 'loading',
      deleted: false,
      canLocate: false,
      previewSource: 'snapshot',
    });
    expect(resolveAgentNodePresentation(reference)).toMatchObject({
      state: 'snapshot',
      deleted: false,
      canLocate: false,
      previewSource: 'snapshot',
    });
  });
  it('does not bind another project to a same-ID local node; share replay uses its loaded nodes', () => {
    expect(resolveAgentNodePresentation(reference, { ...live, projectId: 'b' })).toMatchObject({
      state: 'other-project',
      label: '非本画布节点',
      canLocate: false,
      canOpenProject: false,
    });
    expect(
      resolveAgentNodePresentation(reference, { ...live, projectId: 'b' }).preview,
    ).toBeUndefined();
    expect(
      resolveAgentNodePresentation(reference, { ...live, projectId: 'b', isShareReplay: true }),
    ).toMatchObject({
      state: 'live',
      label: '实时名称',
      canLocate: true,
    });
    expect(
      resolveAgentNodePresentation(reference, { ...live, projectId: 'b', canOpenProject: true }),
    ).toMatchObject({ canOpenProject: true });
    expect(
      resolveAgentNodePresentation(reference, {
        ...live,
        projectId: 'b',
        ready: false,
        canOpenProject: true,
      }).canOpenProject,
    ).toBe(false);
  });
  it('retains legacy extra snapshot media and suppresses unresolved/error references', () => {
    const legacy = {
      type: 'node',
      name: '旧快照',
      extra: JSON.stringify({
        canvasNodeId: 'old',
        nodeType: 'video',
        previewUrl: '/saved.mp4',
        previewMedia: 'video',
      }),
    };
    expect(resolveAgentNodePresentation(legacy)).toMatchObject({
      nodeId: 'old',
      nodeType: 'video',
      previewSource: 'snapshot',
      preview: { url: '/saved.mp4', mediaType: 'video' },
    });
    expect(resolveAgentNodePresentation({ ...reference, status: 'uploading' }, live)).toMatchObject(
      { state: 'pending', canLocate: false, dimmed: true },
    );
    expect(
      resolveAgentNodePresentation(
        { ...reference, canvasPickPending: true },
        { ...live, nodes: [] },
      ).deleted,
    ).toBe(false);
    expect(
      resolveAgentNodePresentation({ ...reference, canvasPickPending: true }, live),
    ).toMatchObject({
      dimmed: true,
      canLocate: true,
      previewSource: 'live',
    });
    expect(resolveAgentNodePresentation({ ...reference, status: 'error' }, live)).toMatchObject({
      state: 'error',
      label: '上传失败',
      canLocate: false,
    });
  });
  it('matches exact live media fields and rejects executable URLs and attachment source confusion', () => {
    expect(
      agentNodeLivePreview({ id: 'n', type: 'image', data: { url: '/wrong.png' } }),
    ).toBeUndefined();
    expect(
      agentNodeLivePreview({ id: 'n', data: { type: 'image', originalUrl: '/fallback.png' } }),
    ).toEqual({ url: '/fallback.png', mediaType: 'image' });
    expect(
      agentNodeLivePreview({
        id: 'n',
        data: { type: 'video', originalUrl: '/not-video-fallback.mp4' },
      }),
    ).toBeUndefined();
    expect(
      resolveAgentNodePresentation({ ...reference, url: 'javascript:alert(1)' }).preview,
    ).toBeUndefined();
    expect(
      resolveAgentNodePresentation({
        type: 'node',
        id: 'n',
        name: '节点',
        nodeType: 'image',
        source: { type: 'url', value: '/attachment.png' },
      }).preview,
    ).toBeUndefined();
  });
  it('uses the source width tiers and skips unsupported/already processed video posters', () => {
    expect(agentNodeVideoPoster('https://example.test/clip.mp4?token=x', 100)).toBe(
      'https://example.test/clip.mp4?token=x&x-oss-process=video/snapshot,t_0,f_jpg,w_200,m_fast,ar_auto',
    );
    expect(agentNodeVideoPoster('https://example.test/clip.mp4', 800)).toContain('w_800');
    expect(agentNodeVideoPoster('https://example.test/clip.webm?x=1', 100)).toBeUndefined();
    expect(agentNodeVideoPoster('/local.mp4', 100)).toBeUndefined();
    expect(
      agentNodeVideoPoster('https://example.test/clip.mp4?x-oss-process=video/snapshot', 100),
    ).toBeUndefined();
  });
});
