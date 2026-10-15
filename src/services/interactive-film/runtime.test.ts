import { describe, expect, it } from 'vitest';
import { createFilmRuntime } from './runtime.ts';
import type { FilmManifest, FilmNode } from './types.ts';

const node = (id: string, kind: FilmNode['kind'], extra: Partial<FilmNode> = {}): FilmNode => ({
  id,
  kind,
  title: id,
  position: { x: 0, y: 0 },
  ...extra,
});
const manifest = (
  nodes: FilmNode[],
  routes: [string, string, string][],
  extra: Partial<FilmManifest> = {},
): FilmManifest => ({
  schemaVersion: 1,
  runtimeVersion: '1',
  title: '互动故事',
  revision: 1,
  startNodeId: nodes[0].id,
  nodes,
  edges: routes.map(([source, sourcePort, target], index) => ({
    id: String(index),
    source,
    sourcePort,
    target,
  })),
  variables: [],
  media: {},
  ...extra,
});

describe('shared film runtime', () => {
  it('executes start, typed set/add and condition, then preserves variables across a choice', () => {
    const runtime = createFilmRuntime(
      manifest(
        [
          node('start', 'start'),
          node('set', 'set', { variableId: 'score', operation: 'add', value: 2 }),
          node('condition', 'condition', { variableId: 'score', comparator: 'gte', value: 2 }),
          node('choice', 'choice', { choices: [{ id: 'a', text: '继续' }] }),
          node('end', 'ending'),
        ],
        [
          ['start', 'next', 'set'],
          ['set', 'next', 'condition'],
          ['condition', 'yes', 'choice'],
          ['condition', 'no', 'end'],
          ['choice', 'a', 'end'],
        ],
        {
          variables: [{ id: 'score', name: '分数', type: 'number', initial: 0 }],
        },
      ),
    );
    runtime.start();
    expect(runtime.getSnapshot()).toMatchObject({
      nodeId: 'choice',
      phase: 'interaction',
      variables: { score: 2 },
    });
    const snapshot = runtime.getSnapshot();
    snapshot.variables.score = 9;
    expect(runtime.getSnapshot().variables.score).toBe(2);
    runtime.advance(1000);
    expect(runtime.getSnapshot().nodeId).toBe('choice');
    expect(runtime.choose('a')).toBe(true);
    expect(runtime.getSnapshot()).toMatchObject({
      nodeId: 'end',
      phase: 'ended',
      variables: { score: 2 },
    });
    runtime.start();
    expect(runtime.getSnapshot().variables.score).toBe(2);
  });
  it('waits for real timed media completion and uses active elapsed time for still images', () => {
    const runtime = createFilmRuntime(
      manifest(
        [
          node('video', 'play', { mediaId: 'v', trimIn: 5, trimOut: 8 }),
          node('image', 'play', { mediaId: 'i', displaySeconds: 2 }),
          node('end', 'ending'),
        ],
        [
          ['video', 'next', 'image'],
          ['image', 'next', 'end'],
        ],
        {
          media: {
            v: {
              id: 'v',
              name: 'v.mp4',
              type: 'video',
              mimeType: 'video/mp4',
              bytes: 1,
              duration: 10,
              url: 'v.mp4',
            },
            i: {
              id: 'i',
              name: 'i.png',
              type: 'image',
              mimeType: 'image/png',
              bytes: 1,
              url: 'i.png',
            },
          },
        },
      ),
    );
    runtime.start();
    const old = runtime.getSnapshot().epoch;
    runtime.advance(20);
    expect(runtime.getSnapshot().nodeId).toBe('video');
    runtime.completeMedia(old);
    runtime.advance(1);
    runtime.setPaused(true);
    runtime.advance(100);
    expect(runtime.getSnapshot().elapsed).toBe(1);
    runtime.setPaused(false);
    runtime.completeMedia(old);
    expect(runtime.getSnapshot().nodeId).toBe('image');
    runtime.advance(1);
    expect(runtime.getSnapshot().nodeId).toBe('end');
  });
  it('opens local windows once, freezes on pause, and follows success/failure ports', () => {
    const runtime = createFilmRuntime(
      manifest(
        [
          node('hotspot', 'hotspot', {
            windowStart: 1,
            windowEnd: 4,
            region: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
          }),
          node('qte', 'qte', { windowStart: 1, windowEnd: 3 }),
          node('yes', 'ending'),
          node('no', 'ending'),
        ],
        [
          ['hotspot', 'success', 'qte'],
          ['hotspot', 'failure', 'no'],
          ['qte', 'success', 'yes'],
          ['qte', 'failure', 'no'],
        ],
      ),
    );
    runtime.start();
    expect(runtime.hit(0.5, 0.5)).toBe(false);
    runtime.advance(1);
    expect(runtime.hit(0.1, 0.1)).toBe(false);
    const hotspotEpoch = runtime.getSnapshot().epoch;
    expect(runtime.hit(0.5, 0.5)).toBe(true);
    expect(runtime.hit(0.5, 0.5, hotspotEpoch)).toBe(false);
    expect(runtime.qte()).toBe(false);
    runtime.advance(1);
    runtime.setPaused(true);
    runtime.advance(10);
    expect(runtime.qte()).toBe(false);
    runtime.setPaused(false);
    expect(runtime.qte()).toBe(true);
    expect(runtime.getSnapshot().nodeId).toBe('yes');
    runtime.start();
    runtime.advance(4);
    expect(runtime.getSnapshot().nodeId).toBe('no');
  });
  it('times out bounded choice/QTE and rejects every old or duplicate input after transition', () => {
    const runtime = createFilmRuntime(
      manifest(
        [
          node('choice', 'choice', { choices: [{ id: 'a', text: 'A' }], windowEnd: 2 }),
          node('qte', 'qte', { windowEnd: 1 }),
          node('end', 'ending'),
        ],
        [
          ['choice', 'a', 'end'],
          ['choice', 'timeout', 'qte'],
          ['qte', 'success', 'end'],
          ['qte', 'failure', 'end'],
        ],
      ),
    );
    runtime.start();
    const epoch = runtime.getSnapshot().epoch;
    runtime.advance(2);
    expect(runtime.choose('a', epoch)).toBe(false);
    runtime.failMedia('迟到错误', epoch);
    expect(runtime.getSnapshot().nodeId).toBe('qte');
    runtime.advance(1);
    expect(runtime.qte()).toBe(false);
    expect(runtime.getSnapshot().phase).toBe('ended');
  });
  it('aligns media windows after a backward seek and ignores paused, invalid and stale media clock updates', () => {
    const runtime = createFilmRuntime(
      manifest(
        [node('qte', 'qte', { mediaId: 'v', windowStart: 2, windowEnd: 4 }), node('end', 'ending')],
        [
          ['qte', 'success', 'end'],
          ['qte', 'failure', 'end'],
        ],
        {
          media: {
            v: {
              id: 'v',
              name: 'v.mp4',
              type: 'video',
              mimeType: 'video/mp4',
              bytes: 1,
              duration: 10,
              url: 'v.mp4',
            },
          },
        },
      ),
    );
    runtime.start();
    const epoch = runtime.getSnapshot().epoch;
    runtime.syncMediaTime(3, epoch);
    expect(runtime.getSnapshot().interactionOpen).toBe(true);
    runtime.syncMediaTime(1, epoch);
    expect(runtime.getSnapshot()).toMatchObject({ elapsed: 1, interactionOpen: false });
    runtime.setPaused(true);
    runtime.syncMediaTime(5, epoch);
    expect(runtime.getSnapshot().elapsed).toBe(1);
    runtime.setPaused(false);
    runtime.syncMediaTime(Number.NaN, epoch);
    runtime.syncMediaTime(-1, epoch);
    expect(runtime.getSnapshot().elapsed).toBe(1);
    runtime.syncMediaTime(4, epoch);
    const ended = runtime.getSnapshot();
    runtime.advance(100, epoch);
    runtime.syncMediaTime(0, epoch);
    expect(runtime.qte(epoch)).toBe(false);
    expect(runtime.getSnapshot()).toEqual(ended);
  });
  it('stops a corrupt instant loop and reports missing targets without hanging', () => {
    const runtime = createFilmRuntime(
      manifest([node('start', 'start')], [['start', 'next', 'start']]),
    );
    runtime.start();
    expect(runtime.getSnapshot()).toMatchObject({
      phase: 'error',
      error: expect.stringContaining('100'),
    });
    const broken = createFilmRuntime(
      manifest([node('start', 'start')], [['start', 'next', 'missing']]),
    );
    broken.start();
    expect(broken.getSnapshot().phase).toBe('error');
  });
});
