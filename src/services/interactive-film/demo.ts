import { createFilmDocument, createFilmNode } from './document.ts';
import { importFilmMediaUrl } from './media.ts';
import type { FilmDocument, FilmKind, FilmNode } from './types.ts';
export const FILM_DEMO_VIDEO = '/assets/c56742d90c78dd32.mp4';
/** A small authored example; five clips refer to one existing representative video. */
export async function createFilmDemo(
  id: string,
  options: { signal?: AbortSignal } = {},
): Promise<FilmDocument> {
  const media = await importFilmMediaUrl('失踪信号 · 演示影片.mp4', FILM_DEMO_VIDEO, options);
  if (!media.duration || media.duration <= 0) throw new Error('演示影片时长无法读取');
  const doc = createFilmDocument(id, '失踪信号 · 互动影游示例');
  doc.media = [media];
  doc.variables = [
    { id: 'trust', name: '好感度', type: 'number', initial: 0 },
    { id: 'clue', name: '找到线索', type: 'boolean', initial: false },
  ];
  const nodes: FilmNode[] = [];
  const add = (
    id: string,
    kind: FilmKind,
    title: string,
    x: number,
    y: number,
    fields: Partial<FilmNode> = {},
  ) => {
    const node = { ...createFilmNode(kind, { x, y }), ...fields, id, title };
    nodes.push(node);
    return node;
  };
  const duration = Math.min(3, media.duration / 5);
  const clip = (index: number) => ({
    mediaId: media.id,
    trimIn: index * duration,
    trimOut: (index + 1) * duration,
  });
  add('start', 'start', '开始', 80, 240);
  add('scene1', 'play', '01 · 收到求救信号', 400, 240, clip(0));
  add('choice', 'choice', '是否回应？', 720, 240, {
    prompt: '通讯器传来一个陌生人的求救声。',
    choices: [
      { id: 'help', text: '回应，建立信任' },
      { id: 'leave', text: '保持沉默' },
    ],
  });
  add('trust-up', 'set', '好感度 +1', 1040, 100, {
    variableId: 'trust',
    operation: 'add',
    value: 1,
  });
  add('trust-down', 'set', '好感度 -1', 1040, 410, {
    variableId: 'trust',
    operation: 'add',
    value: -1,
  });
  add('scene2', 'play', '02 · 寻找信号源', 1360, 240, clip(1));
  add('hotspot', 'hotspot', '找到隐藏线索', 1680, 240, {
    prompt: '点击画面中央的信号标记。',
    windowStart: 0,
    windowEnd: 5,
    region: { x: 0.3, y: 0.25, width: 0.4, height: 0.5 },
  });
  add('clue-set', 'set', '记下线索', 2000, 100, {
    variableId: 'clue',
    operation: 'set',
    value: true,
  });
  add('scene3', 'play', '03 · 危险接近', 2320, 240, clip(2));
  add('qte', 'qte', '及时发送求救', 2640, 240, {
    prompt: '按 Space 或点击按钮发送信号',
    windowStart: 0,
    windowEnd: 3,
  });
  add('scene4', 'play', '04 · 信号发出', 2960, 100, clip(3));
  add('scene5', 'play', '05 · 信号消失', 2960, 540, clip(4));
  add('trust-check', 'condition', '对方愿意帮助吗？', 3280, 100, {
    variableId: 'trust',
    comparator: 'gte',
    value: 1,
  });
  add('clue-check', 'condition', '有定位线索吗？', 3600, 0, {
    variableId: 'clue',
    comparator: 'eq',
    value: true,
  });
  add('rescue', 'ending', '结局一 · 成功获救', 3920, 0, {
    endingText: '你建立了信任，也找到了定位线索。救援终于抵达。',
  });
  add('lost', 'ending', '结局二 · 未知远方', 3920, 280, {
    endingText: '信号成功发出，但救援缺少足够的信息。旅程还未结束。',
  });
  add('failure', 'ending', '结局三 · 错过时机', 3280, 540, {
    endingText: '最后的发送窗口关闭了。重新开始，尝试另一条路径。',
  });
  doc.nodes = nodes;
  const edge = (source: string, sourcePort: string, target: string) =>
    doc.edges.push({ id: crypto.randomUUID(), source, sourcePort, target });
  for (const [a, b] of [
    ['start', 'scene1'],
    ['scene1', 'choice'],
    ['trust-up', 'scene2'],
    ['trust-down', 'scene2'],
    ['scene2', 'hotspot'],
    ['clue-set', 'scene3'],
    ['scene3', 'qte'],
    ['scene4', 'trust-check'],
    ['scene5', 'failure'],
  ])
    edge(a, 'next', b);
  edge('choice', 'help', 'trust-up');
  edge('choice', 'leave', 'trust-down');
  edge('hotspot', 'success', 'clue-set');
  edge('hotspot', 'failure', 'scene3');
  edge('qte', 'success', 'scene4');
  edge('qte', 'failure', 'scene5');
  edge('trust-check', 'yes', 'clue-check');
  edge('trust-check', 'no', 'lost');
  edge('clue-check', 'yes', 'rescue');
  edge('clue-check', 'no', 'lost');
  return doc;
}
