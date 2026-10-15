import type {
  FilmDocument,
  FilmIssue,
  FilmKind,
  FilmManifest,
  FilmMedia,
  FilmNode,
  FilmPort,
  FilmValue,
} from './types.ts';

const kinds = new Set<FilmKind>([
  'start',
  'play',
  'choice',
  'set',
  'condition',
  'hotspot',
  'qte',
  'ending',
]);
const titles: Record<FilmKind, string> = {
  start: '开始',
  play: '播放片段',
  choice: '剧情选择',
  set: '修改变量',
  condition: '条件分支',
  hotspot: '点击热点',
  qte: '单次 QTE',
  ending: '结局',
};
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const valueMatches = (value: FilmValue | undefined, type: 'number' | 'boolean') =>
  type === 'number' ? finite(value) : typeof value === 'boolean';

export function createFilmNode(kind: FilmKind, position = { x: 0, y: 0 }): FilmNode {
  if (!kinds.has(kind)) throw new Error('未知影游节点类型');
  const node: FilmNode = { id: id('node'), kind, title: titles[kind], position: { ...position } };
  if (kind === 'play') Object.assign(node, { trimIn: 0, displaySeconds: 5 });
  if (kind === 'choice')
    Object.assign(node, {
      prompt: '你会如何选择？',
      windowStart: 0,
      choices: [
        { id: id('option'), text: '选项一' },
        { id: id('option'), text: '选项二' },
      ],
    });
  if (kind === 'set') Object.assign(node, { operation: 'set', value: 0 });
  if (kind === 'condition') Object.assign(node, { comparator: 'eq', value: 0 });
  if (kind === 'hotspot')
    Object.assign(node, {
      prompt: '点击画面中的热点',
      trimIn: 0,
      windowStart: 0,
      windowEnd: 5,
      region: { x: 0.35, y: 0.35, width: 0.3, height: 0.3 },
    });
  if (kind === 'qte')
    Object.assign(node, {
      prompt: '点击按钮或按空格',
      trimIn: 0,
      windowStart: 0,
      windowEnd: 3,
    });
  if (kind === 'ending') node.endingText = '故事结束';
  return node;
}

export function createFilmDocument(documentId = id('film'), title = '未命名影游'): FilmDocument {
  return {
    schemaVersion: 1,
    id: documentId,
    title,
    revision: 0,
    savedAt: Date.now(),
    nodes: [createFilmNode('start', { x: 80, y: 120 })],
    edges: [],
    variables: [],
    media: [],
    view: { x: 0, y: 0, z: 1 },
  };
}

export function filmNodePorts(node: FilmNode): FilmPort[] {
  switch (node.kind) {
    case 'ending':
      return [];
    case 'condition':
      return [
        { id: 'yes', label: '成立' },
        { id: 'no', label: '不成立' },
      ];
    case 'choice':
      return [
        ...(node.choices || []).map((choice) => ({ id: choice.id, label: choice.text })),
        ...(node.windowEnd !== undefined ? [{ id: 'timeout', label: '超时' }] : []),
      ];
    case 'hotspot':
    case 'qte':
      return [
        { id: 'success', label: '成功' },
        { id: 'failure', label: '失败 / 超时' },
      ];
    default:
      return [{ id: 'next', label: '继续' }];
  }
}

/** Incomplete authoring is valid storage; malformed or unsupported data is not. */
export function assertFilmDocumentShape(value: unknown): asserts value is FilmDocument {
  const bad = () => {
    throw new Error('影游数据格式异常，原数据已保留');
  };
  if (!record(value)) return bad();
  if (value.schemaVersion !== 1) throw new Error('影游数据版本不兼容，原数据已保留');
  if (
    !nonempty(value.id) ||
    typeof value.title !== 'string' ||
    !finite(value.revision) ||
    !Number.isInteger(value.revision) ||
    value.revision < 0 ||
    !finite(value.savedAt) ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges) ||
    !Array.isArray(value.variables) ||
    !Array.isArray(value.media) ||
    !record(value.view) ||
    ![value.view.x, value.view.y, value.view.z].every(finite) ||
    Number(value.view.z) <= 0 ||
    (value.deletedAt !== undefined && !finite(value.deletedAt))
  )
    return bad();
  for (const node of value.nodes) {
    if (
      !record(node) ||
      !nonempty(node.id) ||
      !kinds.has(node.kind as FilmKind) ||
      typeof node.title !== 'string' ||
      !record(node.position) ||
      !finite(node.position.x) ||
      !finite(node.position.y)
    )
      return bad();
    for (const key of ['trimIn', 'trimOut', 'displaySeconds', 'windowStart', 'windowEnd'])
      if (node[key] !== undefined && !finite(node[key])) return bad();
    for (const key of ['mediaId', 'prompt', 'variableId', 'endingText'])
      if (node[key] !== undefined && typeof node[key] !== 'string') return bad();
    if (node.value !== undefined && !finite(node.value) && typeof node.value !== 'boolean')
      return bad();
    if (node.operation !== undefined && !['set', 'add'].includes(String(node.operation)))
      return bad();
    if (
      node.comparator !== undefined &&
      !['eq', 'ne', 'gt', 'gte', 'lt', 'lte'].includes(String(node.comparator))
    )
      return bad();
    if (
      node.choices !== undefined &&
      (!Array.isArray(node.choices) ||
        node.choices.some(
          (choice) => !record(choice) || !nonempty(choice.id) || typeof choice.text !== 'string',
        ))
    )
      return bad();
    if (
      node.region !== undefined &&
      (!record(node.region) ||
        !['x', 'y', 'width', 'height'].every((key) =>
          finite((node.region as Record<string, unknown>)[key]),
        ))
    )
      return bad();
  }
  for (const edge of value.edges)
    if (!record(edge) || ![edge.id, edge.source, edge.sourcePort, edge.target].every(nonempty))
      return bad();
  for (const variable of value.variables)
    if (
      !record(variable) ||
      !nonempty(variable.id) ||
      typeof variable.name !== 'string' ||
      !['number', 'boolean'].includes(String(variable.type)) ||
      !valueMatches(variable.initial as FilmValue, variable.type as 'number' | 'boolean')
    )
      return bad();
  for (const media of value.media)
    if (
      !record(media) ||
      !nonempty(media.id) ||
      typeof media.name !== 'string' ||
      !['video', 'audio', 'image'].includes(String(media.type)) ||
      typeof media.mimeType !== 'string' ||
      !finite(media.bytes) ||
      media.bytes < 0 ||
      ['duration', 'width', 'height'].some((key) => media[key] !== undefined && !finite(media[key]))
    )
      return bad();
}

export function validateFilmDocument(document: FilmDocument): FilmIssue[] {
  try {
    assertFilmDocumentShape(document);
  } catch (error) {
    return [{ code: 'document-invalid', message: (error as Error).message }];
  }
  const issues: FilmIssue[] = [];
  const issue = (code: string, message: string, nodeId?: string) =>
    issues.push({ code, message, ...(nodeId ? { nodeId } : {}) });
  const nodes = new Map(document.nodes.map((node) => [node.id, node]));
  const variables = new Map(document.variables.map((variable) => [variable.id, variable]));
  const media = new Map(document.media.map((item) => [item.id, item]));
  const duplicateIds = (items: { id: string }[], label: string) => {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.id)) issue('duplicate-id', `${label} ID 重复：${item.id}`);
      seen.add(item.id);
    }
  };
  duplicateIds(document.nodes, '节点');
  duplicateIds(document.edges, '连线');
  duplicateIds(document.variables, '变量');
  duplicateIds(document.media, '素材');
  const starts = document.nodes.filter((node) => node.kind === 'start');
  if (starts.length !== 1) issue('start-count', '作品必须有且只有一个开始节点');
  if (!document.title.trim()) issue('title-empty', '请填写作品标题');
  if (document.deletedAt !== undefined) issue('document-deleted', '请先恢复回收站中的作品');
  const usedNames = new Set<string>();
  for (const variable of document.variables) {
    if (!variable.name.trim() || usedNames.has(variable.name.trim()))
      issue('variable-name', '变量名称不能为空或重复');
    usedNames.add(variable.name.trim());
  }
  const outgoing = new Map<string, Set<string>>();
  for (const edge of document.edges) {
    const source = nodes.get(edge.source),
      target = nodes.get(edge.target);
    if (!source || !target) {
      issue('edge-target', '连线引用了不存在的节点', edge.source);
      continue;
    }
    if (target.kind === 'start') issue('start-incoming', '开始节点不能接受跳转', source.id);
    if (!filmNodePorts(source).some((port) => port.id === edge.sourcePort))
      issue('edge-port', '连线引用了不存在的输出端口', source.id);
    const ports = outgoing.get(source.id) || new Set<string>();
    if (ports.has(edge.sourcePort))
      issue('edge-multiple', '一个输出端口只能连接一个目标', source.id);
    ports.add(edge.sourcePort);
    outgoing.set(source.id, ports);
  }
  for (const node of document.nodes) {
    if (!node.title.trim()) issue('node-title', '请填写节点标题', node.id);
    for (const port of filmNodePorts(node))
      if (!outgoing.get(node.id)?.has(port.id))
        issue('port-unconnected', `请连接“${port.label}”输出`, node.id);
    if (node.kind === 'choice') {
      if (!node.choices?.length) issue('choice-empty', '选择节点至少需要一个选项', node.id);
      const ids = new Set<string>();
      for (const choice of node.choices || []) {
        if (ids.has(choice.id) || choice.id === 'timeout')
          issue('choice-id', '选项 ID 重复或与超时端口冲突', node.id);
        ids.add(choice.id);
        if (!choice.text.trim()) issue('choice-text', '选项文字不能为空', node.id);
      }
    }
    if (node.kind === 'set' || node.kind === 'condition') {
      const variable = variables.get(node.variableId || '');
      if (!variable) issue('variable-reference', '请选择存在的变量', node.id);
      else {
        if (!valueMatches(node.value, variable.type))
          issue('variable-value', '变量值与变量类型不一致', node.id);
        if (node.kind === 'set' && node.operation !== 'set' && node.operation !== 'add')
          issue('variable-operation', '请选择变量操作', node.id);
        if (node.kind === 'set' && node.operation === 'add' && variable.type !== 'number')
          issue('variable-add', '只有数字变量可以增加数值', node.id);
        if (
          node.kind === 'condition' &&
          (!node.comparator || !['eq', 'ne', 'gt', 'gte', 'lt', 'lte'].includes(node.comparator))
        )
          issue('variable-comparator', '请选择条件运算符', node.id);
        if (
          node.kind === 'condition' &&
          variable.type === 'boolean' &&
          !['eq', 'ne'].includes(node.comparator || '')
        )
          issue('variable-comparator', '布尔变量只支持等于或不等于', node.id);
      }
    }
    let clipDuration: number | undefined;
    if (node.mediaId) {
      const item = media.get(node.mediaId);
      if (!item) issue('media-reference', '节点引用的素材不存在', node.id);
      else if (node.kind === 'hotspot' && item.type === 'audio')
        issue('hotspot-media', '点击热点需要图片或视频画面', node.id);
      else if (item.type === 'image') {
        if (!finite(item.width) || !finite(item.height) || item.width <= 0 || item.height <= 0)
          issue('media-metadata', '图片尺寸尚不可用', node.id);
        clipDuration = node.displaySeconds;
        if (!finite(clipDuration) || clipDuration <= 0)
          issue('clip-duration', '图片显示时长必须大于零', node.id);
      } else {
        const start = node.trimIn ?? 0,
          end = node.trimOut ?? item.duration;
        if (!finite(item.duration) || item.duration <= 0)
          issue('media-metadata', '媒体真实时长尚不可用', node.id);
        if (
          !finite(end) ||
          start < 0 ||
          end <= start ||
          (finite(item.duration) && end > item.duration)
        )
          issue('clip-range', '片段范围必须处于媒体真实时长内', node.id);
        else clipDuration = end - start;
      }
    } else if (node.kind === 'play') issue('media-required', '播放节点需要素材', node.id);
    if (['choice', 'hotspot', 'qte'].includes(node.kind)) {
      const start = node.windowStart ?? 0,
        end = node.windowEnd;
      if (start < 0 || (end !== undefined && end <= start))
        issue('window-range', '互动窗口必须为非负起点且结束晚于起点', node.id);
      if (node.kind !== 'choice' && end === undefined)
        issue('window-required', '热点和 QTE 必须设置结束时间', node.id);
      if (
        node.mediaId &&
        clipDuration !== undefined &&
        (start > clipDuration || (end !== undefined && end > clipDuration))
      )
        issue('window-clip', '互动窗口超出当前片段', node.id);
    }
    if (node.kind === 'hotspot') {
      const region = node.region;
      if (
        !region ||
        region.x < 0 ||
        region.y < 0 ||
        region.width <= 0 ||
        region.height <= 0 ||
        region.x + region.width > 1 ||
        region.y + region.height > 1
      )
        issue('hotspot-region', '热点必须完全处于画面范围内', node.id);
    }
  }
  const reached = new Set<string>();
  const pending = starts.length === 1 ? [starts[0].id] : [];
  while (pending.length) {
    const next = pending.pop()!;
    if (reached.has(next)) continue;
    reached.add(next);
    pending.push(
      ...document.edges
        .filter((edge) => edge.source === next && nodes.has(edge.target))
        .map((edge) => edge.target),
    );
  }
  for (const node of document.nodes)
    if (starts.length === 1 && !reached.has(node.id))
      issue('node-unreachable', '节点无法从开始节点到达', node.id);
  if (![...reached].some((nodeId) => nodes.get(nodeId)?.kind === 'ending'))
    issue('ending-unreachable', '作品至少需要一个可到达的结局');
  const instant = new Set(
    document.nodes
      .filter((node) => ['start', 'set', 'condition'].includes(node.kind))
      .map((node) => node.id),
  );
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const stack: { id: string; targets: string[]; index: number }[] = [];
  for (const nodeId of instant) {
    if (visited.has(nodeId)) continue;
    stack.push({
      id: nodeId,
      targets: document.edges
        .filter((edge) => edge.source === nodeId && instant.has(edge.target))
        .map((edge) => edge.target),
      index: 0,
    });
    visiting.add(nodeId);
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const target = frame.targets[frame.index++];
      if (target === undefined) {
        stack.pop();
        visiting.delete(frame.id);
        visited.add(frame.id);
        continue;
      }
      if (visiting.has(target)) {
        issue('instant-cycle', '即时节点组成循环，必须经过播放或玩家互动', target);
        continue;
      }
      if (!visited.has(target)) {
        visiting.add(target);
        stack.push({
          id: target,
          targets: document.edges
            .filter((edge) => edge.source === target && instant.has(edge.target))
            .map((edge) => edge.target),
          index: 0,
        });
      }
    }
  }
  return issues;
}

export class FilmValidationError extends Error {
  readonly issues: FilmIssue[];
  constructor(issues: FilmIssue[], document?: FilmDocument) {
    const first = issues[0];
    const title = document?.nodes.find((node) => node.id === first?.nodeId)?.title;
    super(`${title ? `${title}：` : ''}${first?.message || '影游校验失败'}`);
    this.name = 'FilmValidationError';
    this.issues = issues;
  }
}

const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
export function compileFilmDocument(
  document: FilmDocument,
  urls: Record<string, string>,
): FilmManifest {
  const issues = validateFilmDocument(document);
  if (issues.some((issue) => issue.code === 'document-invalid'))
    throw new FilmValidationError(issues);
  const referenced = new Set(
    document.nodes.map((node) => node.mediaId).filter((value): value is string => !!value),
  );
  for (const mediaId of referenced)
    if (!nonempty(urls[mediaId]))
      issues.push({
        code: 'media-url',
        message: '素材尚未读取或打包',
        nodeId: document.nodes.find((node) => node.mediaId === mediaId)?.id,
      });
  if (issues.length) throw new FilmValidationError(issues, document);
  const manifest: FilmManifest = {
    schemaVersion: 1,
    runtimeVersion: '1',
    title: document.title,
    revision: document.revision,
    startNodeId: document.nodes.find((node) => node.kind === 'start')!.id,
    nodes: clone(document.nodes),
    edges: clone(document.edges),
    variables: clone(document.variables),
    media: Object.fromEntries(
      document.media
        .filter((item) => referenced.has(item.id))
        .map((item) => [item.id, { ...clone(item), url: urls[item.id] }]),
    ),
  };
  return freeze(manifest);
}

export function connectFilmNodes(
  document: FilmDocument,
  source: string,
  sourcePort: string,
  target: string,
): FilmDocument {
  const from = document.nodes.find((node) => node.id === source),
    to = document.nodes.find((node) => node.id === target);
  if (
    !from ||
    !to ||
    to.kind === 'start' ||
    !filmNodePorts(from).some((port) => port.id === sourcePort)
  )
    throw new Error('无法连接当前节点或端口');
  const remaining = document.edges.filter(
    (edge) => !(edge.source === source && edge.sourcePort === sourcePort),
  );
  const previous = document.edges.find(
    (edge) => edge.source === source && edge.sourcePort === sourcePort,
  );
  if (previous?.target === target) return document;
  return {
    ...document,
    edges: [...remaining, { id: previous?.id || id('edge'), source, sourcePort, target }],
  };
}

export function duplicateFilmNodes(document: FilmDocument, ids: string[]): FilmDocument {
  const selected = new Set(ids);
  const originals = document.nodes.filter((node) => selected.has(node.id) && node.kind !== 'start');
  if (!originals.length) return document;
  const mapping = new Map(originals.map((node) => [node.id, id('node')]));
  const ports = new Map<string, Map<string, string>>();
  const copies = originals.map((node) => {
    const copy = clone(node),
      optionIds = new Map<string, string>();
    copy.id = mapping.get(node.id)!;
    copy.title += ' 副本';
    copy.position = { x: copy.position.x + 36, y: copy.position.y + 36 };
    if (copy.choices)
      copy.choices = copy.choices.map((option) => {
        const next = id('option');
        optionIds.set(option.id, next);
        return { ...option, id: next };
      });
    ports.set(node.id, optionIds);
    return copy;
  });
  const edges = document.edges
    .filter((edge) => mapping.has(edge.source) && mapping.has(edge.target))
    .map((edge) => ({
      ...edge,
      id: id('edge'),
      source: mapping.get(edge.source)!,
      target: mapping.get(edge.target)!,
      sourcePort: ports.get(edge.source)?.get(edge.sourcePort) || edge.sourcePort,
    }));
  return {
    ...document,
    nodes: [...document.nodes, ...copies],
    edges: [...document.edges, ...edges],
  };
}

export function removeFilmNodes(document: FilmDocument, ids: string[]): FilmDocument {
  const requested = new Set(ids);
  const removed = new Set(
    document.nodes
      .filter((node) => requested.has(node.id) && node.kind !== 'start')
      .map((node) => node.id),
  );
  if (!removed.size) return document;
  return {
    ...document,
    nodes: document.nodes.filter((node) => !removed.has(node.id)),
    edges: document.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target)),
  };
}

export type { FilmDocument, FilmIssue, FilmKind, FilmManifest, FilmMedia, FilmNode };
