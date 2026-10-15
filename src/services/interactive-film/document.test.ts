import { describe, expect, it } from 'vitest';
import {
  assertFilmDocumentShape,
  compileFilmDocument,
  connectFilmNodes,
  createFilmDocument,
  createFilmNode,
  duplicateFilmNodes,
  filmNodePorts,
  FilmValidationError,
  removeFilmNodes,
  validateFilmDocument,
} from './document.ts';
import type { FilmDocument, FilmNode } from './types.ts';

function completeDocument(): FilmDocument {
  let doc = createFilmDocument('test-film', '真实互动');
  const play = { ...createFilmNode('play'), mediaId: 'clip', trimIn: 2, trimOut: 8 };
  const ending = createFilmNode('ending');
  doc.nodes.push(play, ending);
  doc.media.push({
    id: 'clip',
    name: '视频',
    type: 'video',
    mimeType: 'video/mp4',
    bytes: 80,
    duration: 10,
    width: 1920,
    height: 1080,
  });
  doc = connectFilmNodes(doc, doc.nodes[0].id, 'next', play.id);
  return connectFilmNodes(doc, play.id, 'next', ending.id);
}
const insertBetween = (doc: FilmDocument, node: FilmNode) => {
  const play = doc.nodes.find((value) => value.kind === 'play')!;
  const ending = doc.nodes.find((value) => value.kind === 'ending')!;
  const next = { ...doc, nodes: [...doc.nodes, node] };
  return { doc: connectFilmNodes(next, play.id, 'next', node.id), ending };
};

describe('film authoring and frozen compilation', () => {
  it('creates one start, keeps incomplete drafts structurally valid and reports missing outputs', () => {
    const doc = createFilmDocument();
    expect(doc.nodes.map((node) => node.kind)).toEqual(['start']);
    expect(() => assertFilmDocumentShape(doc)).not.toThrow();
    expect(validateFilmDocument(doc).map((issue) => issue.code)).toContain('port-unconnected');
  });
  it('uses option identity for ports and only exposes a configured deadline', () => {
    const choice = createFilmNode('choice');
    expect(filmNodePorts(choice).map((port) => port.id)).toEqual(
      choice.choices!.map((option) => option.id),
    );
    expect(filmNodePorts({ ...choice, windowEnd: 4 }).at(-1)?.id).toBe('timeout');
  });
  it('replaces a source port target atomically without changing another option', () => {
    const doc = completeDocument(),
      play = doc.nodes[1],
      ending = doc.nodes[2];
    const other = createFilmNode('ending');
    doc.nodes.push(other);
    const previous = doc.edges.find((edge) => edge.source === play.id)!;
    const next = connectFilmNodes(doc, play.id, 'next', other.id);
    expect(next.edges.filter((edge) => edge.source === play.id)).toEqual([
      { ...previous, target: other.id },
    ]);
    expect(doc.edges.find((edge) => edge.source === play.id)?.target).toBe(ending.id);
    expect(() => connectFilmNodes(doc, ending.id, 'next', play.id)).toThrow();
    expect(() => connectFilmNodes(doc, play.id, 'next', doc.nodes[0].id)).toThrow();
  });
  it('compiles an independent frozen revision with referenced media only', () => {
    const doc = completeDocument();
    doc.media.push({
      id: 'unused',
      name: '未使用',
      type: 'audio',
      mimeType: 'audio/mpeg',
      bytes: 50,
      duration: 2,
    });
    const manifest = compileFilmDocument(doc, { clip: 'media/clip.mp4' });
    expect(Object.keys(manifest.media)).toEqual(['clip']);
    doc.nodes[1].title = '之后的编辑';
    doc.media[0].name = '修改';
    expect(manifest.nodes[1].title).toBe('播放片段');
    expect(manifest.media.clip.name).toBe('视频');
    expect(Object.isFrozen(manifest.nodes[1])).toBe(true);
  });
  it('reports the node whose media could not be resolved', () => {
    const doc = completeDocument();
    try {
      compileFilmDocument(doc, {});
      throw new Error('must reject');
    } catch (error) {
      expect(error).toBeInstanceOf(FilmValidationError);
      expect((error as FilmValidationError).issues).toContainEqual({
        code: 'media-url',
        message: '素材尚未读取或打包',
        nodeId: doc.nodes[1].id,
      });
    }
  });
  it('validates numeric add, typed values and boolean comparator restrictions', () => {
    const { doc, ending } = insertBetween(completeDocument(), {
      ...createFilmNode('set'),
      variableId: 'flag',
      operation: 'add',
      value: 1,
    });
    doc.variables.push({ id: 'flag', name: '开关', type: 'boolean', initial: false });
    const node = doc.nodes.at(-1)!;
    const wired = connectFilmNodes(doc, node.id, 'next', ending.id);
    expect(validateFilmDocument(wired).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['variable-value', 'variable-add']),
    );
    node.kind = 'condition';
    node.comparator = 'gt';
    expect(validateFilmDocument(doc).map((issue) => issue.code)).toContain('variable-comparator');
  });
  it('rejects dangling variable and option references without guessing replacements', () => {
    const { doc, ending } = insertBetween(completeDocument(), createFilmNode('choice'));
    const node = doc.nodes.at(-1)!;
    doc.edges.push({
      id: 'old-option',
      source: node.id,
      sourcePort: 'deleted-option',
      target: ending.id,
    });
    expect(validateFilmDocument(doc).map((issue) => issue.code)).toContain('edge-port');
    const setter = { ...createFilmNode('set'), variableId: 'deleted-variable' };
    expect(
      validateFilmDocument({ ...doc, nodes: [...doc.nodes, setter] }).map((issue) => issue.code),
    ).toContain('variable-reference');
  });
  it('checks real trim duration and hotspot window against its own clip', () => {
    const node = {
      ...createFilmNode('hotspot'),
      mediaId: 'clip',
      trimIn: 2,
      trimOut: 5,
      windowEnd: 4,
    };
    const { doc, ending } = insertBetween(completeDocument(), node);
    let wired = connectFilmNodes(doc, node.id, 'success', ending.id);
    wired = connectFilmNodes(wired, node.id, 'failure', ending.id);
    expect(validateFilmDocument(wired).map((issue) => issue.code)).toContain('window-clip');
    wired.nodes.at(-1)!.windowEnd = 3;
    expect(validateFilmDocument(wired)).toEqual([]);
    wired.nodes.at(-1)!.region = { x: 0.9, y: 0, width: 0.2, height: 1 };
    expect(validateFilmDocument(wired).map((issue) => issue.code)).toContain('hotspot-region');
  });
  it('requires exactly one start and flags instant-only loops while allowing player loops', () => {
    const doc = completeDocument();
    doc.nodes.push(createFilmNode('start'));
    expect(validateFilmDocument(doc).map((issue) => issue.code)).toContain('start-count');
    const set = { ...createFilmNode('set'), variableId: 'score' };
    const condition = { ...createFilmNode('condition'), variableId: 'score' };
    const base = completeDocument();
    base.nodes.push(set, condition);
    base.variables.push({ id: 'score', name: '分数', type: 'number', initial: 0 });
    let wired = connectFilmNodes(base, base.nodes[1].id, 'next', set.id);
    wired = connectFilmNodes(wired, set.id, 'next', condition.id);
    wired = connectFilmNodes(wired, condition.id, 'yes', set.id);
    wired = connectFilmNodes(wired, condition.id, 'no', base.nodes[2].id);
    expect(validateFilmDocument(wired).map((issue) => issue.code)).toContain('instant-cycle');
    wired = connectFilmNodes(wired, condition.id, 'yes', base.nodes[1].id);
    expect(validateFilmDocument(wired)).toEqual([]);
  });
  it('duplicates internal paths with new node and option IDs and preserves external media/variable references', () => {
    const choice = createFilmNode('choice');
    const { doc, ending } = insertBetween(completeDocument(), choice);
    let wired = connectFilmNodes(doc, choice.id, choice.choices![0].id, ending.id);
    wired = connectFilmNodes(wired, choice.id, choice.choices![1].id, ending.id);
    const next = duplicateFilmNodes(wired, [wired.nodes[0].id, choice.id, ending.id]);
    const copies = next.nodes.slice(wired.nodes.length);
    expect(copies).toHaveLength(2);
    const copiedChoice = copies.find((node) => node.kind === 'choice')!;
    const copiedEnding = copies.find((node) => node.kind === 'ending')!;
    expect(copiedChoice.choices![0].id).not.toBe(choice.choices![0].id);
    expect(
      next.edges.filter((edge) => edge.source === copiedChoice.id).map((edge) => edge.target),
    ).toEqual([copiedEnding.id, copiedEnding.id]);
    expect(
      removeFilmNodes(next, [copiedEnding.id]).edges.some(
        (edge) => edge.target === copiedEnding.id,
      ),
    ).toBe(false);
    expect(next.nodes.filter((node) => node.kind === 'start')).toHaveLength(1);
  });
  it('rejects unknown version and nonfinite geometry without treating them as empty documents', () => {
    expect(() => assertFilmDocumentShape({ ...createFilmDocument(), schemaVersion: 2 })).toThrow(
      '版本不兼容',
    );
    const document = createFilmDocument();
    document.nodes[0].position.x = NaN;
    expect(() => assertFilmDocumentShape(document)).toThrow('原数据已保留');
  });
  it('preserves the irreplaceable start and its edges when deleting a mixed selection', () => {
    const doc = completeDocument();
    const start = doc.nodes[0],
      ending = doc.nodes.find((node) => node.kind === 'ending')!;
    expect(removeFilmNodes(doc, [start.id, 'missing'])).toBe(doc);
    const next = removeFilmNodes(doc, [start.id, ending.id]);
    expect(next.nodes.filter((node) => node.kind === 'start')).toEqual([start]);
    expect(next.nodes.some((node) => node.id === ending.id)).toBe(false);
    expect(next.edges).toEqual(doc.edges.filter((edge) => edge.source === start.id));
    expect(doc.nodes).toHaveLength(3);
  });
});
