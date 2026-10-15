import { filmNodePorts } from '../../../services/interactive-film/document.ts';
import { resolveFilmInheritedBackground } from '../../../services/interactive-film/presentation.ts';

export const FILM_LABELS = {
  start: '开始',
  play: '播放',
  choice: '选择',
  set: '修改变量',
  condition: '条件判断',
  hotspot: '热点',
  qte: 'QTE',
  ending: '结局',
};
export const FILM_NODE_WIDTH = 280;
export const FILM_NODE_HEIGHT = 184;
export const FILM_NODE_TITLE_HEIGHT = 36;

export const filmGraphNodes = (nodes) =>
  nodes.map((node) => ({ ...node, width: FILM_NODE_WIDTH, height: FILM_NODE_HEIGHT }));
export function filmGraphPortOffset(node, port) {
  const ports = filmNodePorts(node);
  return (
    (FILM_NODE_HEIGHT * (ports.findIndex((item) => item.id === port) + 1)) / (ports.length + 1)
  );
}
export const filmGraphOutputPoint = (node, port) => ({
  x: node.position.x + FILM_NODE_WIDTH,
  y: node.position.y + filmGraphPortOffset(node, port),
});
export const filmGraphInputPoint = (node) => ({
  x: node.position.x,
  y: node.position.y + FILM_NODE_HEIGHT / 2,
});

/** A display projection; an inherited preview never assigns a node's mediaId. */
export function filmGraphPreview(document, node) {
  if (!['play', 'choice', 'hotspot', 'qte'].includes(node.kind)) return {};
  if (node.mediaId !== undefined) {
    const media = document.media.find((item) => item.id === node.mediaId);
    return media
      ? { media, frameTime: node.trimIn ?? 0, inherited: false }
      : { error: '素材记录不存在，请重新导入' };
  }
  if (node.kind === 'play') return {};
  const inherited = resolveFilmInheritedBackground(document, node.id);
  return inherited ? { ...inherited, inherited: true } : { inherited: true };
}

/** Hotspots follow the visible contain image, excluding the thumbnail's letterbox. */
export function filmGraphRegionStyle(media, region) {
  const sourceWidth = media.width || FILM_NODE_WIDTH,
    sourceHeight = media.height || FILM_NODE_HEIGHT;
  const scale = Math.min(FILM_NODE_WIDTH / sourceWidth, FILM_NODE_HEIGHT / sourceHeight);
  const width = sourceWidth * scale,
    height = sourceHeight * scale;
  return {
    left: `${(((FILM_NODE_WIDTH - width) / 2 + region.x * width) / FILM_NODE_WIDTH) * 100}%`,
    top: `${(((FILM_NODE_HEIGHT - height) / 2 + region.y * height) / FILM_NODE_HEIGHT) * 100}%`,
    width: `${((region.width * width) / FILM_NODE_WIDTH) * 100}%`,
    height: `${((region.height * height) / FILM_NODE_HEIGHT) * 100}%`,
  };
}

export function filmGraphNodeSummary(document, node) {
  const variable = document.variables.find((item) => item.id === node.variableId);
  const value = typeof node.value === 'boolean' ? (node.value ? '是' : '否') : node.value;
  if (node.kind === 'set')
    return `${variable?.name || '选择变量'} ${node.operation === 'add' ? '+=' : '='} ${value ?? ''}`;
  if (node.kind === 'condition') {
    const comparators = { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' };
    return `${variable?.name || '选择变量'} ${comparators[node.comparator] || '='} ${value ?? ''}`;
  }
  if (node.kind === 'start') return '剧情从此开始';
  if (node.kind === 'ending') return node.endingText || '设置故事结局';
  return node.prompt || '';
}
