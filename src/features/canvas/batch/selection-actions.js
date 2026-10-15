import {
  canvasNodeReference,
  isCanvasMentionNode,
} from '../../../services/agent-node-catalogue.js';
import { canvasGroupMembers, canvasSelectionIds } from './model.js';

const array = (value) => (Array.isArray(value) ? value : []);
const nonempty = (value) => typeof value === 'string' && !!value.trim();
const urlList = (value) => (Array.isArray(value) ? value : [value]).filter(nonempty);
const isBlob = (value) => typeof value === 'string' && value.startsWith('blob:');
const defaults = { image: '图片', video: '视频', audio: '音频', text: '文本', script: '脚本' };
const typeOf = (node) => node?.data?.type || node?.type;
const mediaActions = {
  image: ['image_resource', 'image_generate', 'image_edit'],
  video: ['video_resource', 'video_generate', 'video_edit'],
  audio: ['audio_resource', 'audio_generate'],
};
const mediaExtensions = {
  image: new Set([
    'jpg',
    'jpeg',
    'png',
    'webp',
    'gif',
    'avif',
    'svg',
    'bmp',
    'tif',
    'tiff',
    'ico',
    'heic',
    'heif',
  ]),
  video: new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi', 'mpeg', 'mpg', 'ogv', 'ts']),
  audio: new Set(['mp3', 'wav', 'flac', 'aac', 'ogg', 'oga', 'opus', 'm4a', 'aiff', 'aif', 'weba']),
};
function mediaExtension(value, type, bare = false) {
  if (typeof value !== 'string' || /^(?:data|blob):/i.test(value)) return '';
  if (bare) return mediaExtensions[type]?.has(value.toLowerCase()) ? value.toLowerCase() : '';
  let filename = value.split(/[?#]/, 1)[0].split('/').at(-1);
  try {
    filename = decodeURIComponent(filename);
  } catch {
    // A malformed URL escape is not permission to use an unsafe file suffix.
  }
  const extension = filename.match(/\.([a-z0-9]{1,12})$/i)?.[1]?.toLowerCase();
  return mediaExtensions[type]?.has(extension) ? extension : '';
}
const contentText = (data) => {
  const content = data?.content;
  return Array.isArray(content)
    ? content.filter((item) => typeof item === 'string').join('\n')
    : typeof content === 'string'
      ? content
      : typeof data?.text === 'string'
        ? data.text
        : '';
};

/** Source store sendToChat filters pending uploads, then preserves node identities. */
export function canvasSelectionChatReferences(nodes, selectedIds, projectId, pendingNodeIds) {
  const selected = new Set(canvasSelectionIds(nodes, selectedIds));
  return nodes
    .filter((node) => selected.has(node.id) && isCanvasMentionNode(node, pendingNodeIds))
    .map((node) => canvasNodeReference(node, projectId))
    .filter(Boolean);
}

/** Source 872864: Skill creation targets the selected nodes, not the entire canvas. */
export function canvasSelectionSkillRequest(nodes, selectedIds, projectId, pendingNodeIds) {
  const references = canvasSelectionChatReferences(nodes, selectedIds, projectId, pendingNodeIds);
  if (!references.length) return null;
  return {
    parts: [
      {
        type: 'text',
        text:
          references.map((item) => `{{ node:${item.id} }}`).join('') + '根据这些画布节点总结 Skill',
      },
      ...references,
    ],
  };
}

/** Source 864307: store one actual node resource per v2 material, without task state. */
export function canvasMaterialData(node, now = Date.now()) {
  if (!node?.data) return null;
  const data = JSON.parse(JSON.stringify(node.data));
  delete data.taskInfo;
  delete data.isStale;
  data.type ||= node.type;
  if (Array.isArray(data.url)) data.url = data.url.filter((url) => !isBlob(url));
  if (isBlob(data.poster)) delete data.poster;
  if (data.type === 'text' && !Array.isArray(data.content)) {
    const text = contentText(data);
    data.content = text ? [text] : [];
  }
  if (data.generatorType === 'enhance') {
    delete data.generatorType;
    delete data.params;
    if (data.type === 'image') data.action = 'image_resource';
    if (data.type === 'video') data.action = 'video_resource';
    if (['高清', '增强'].includes(data.label)) delete data.label;
  }
  const hasContent = mediaActions[data.type]
    ? urlList(data.url).some((url) => !isBlob(url))
    : data.type === 'text'
      ? contentText(data).trim().length > 0
      : data.type === 'script';
  return hasContent ? { version: 2, items: [{ data, addedAt: now }] } : null;
}

export function canvasSelectionMaterialItems(
  nodes,
  selectedIds,
  { now = Date.now(), renames = {} } = {},
) {
  const selected = new Set(canvasSelectionIds(nodes, selectedIds));
  return nodes
    .filter((node) => selected.has(node.id))
    .flatMap((node) => {
      const payload = canvasMaterialData(node, now);
      if (!payload) return [];
      const data = payload.items[0].data;
      const name = String(
        renames[node.id] || data.name || data.label || defaults[data.type] || '未命名',
      ).slice(0, 50);
      const coverUrl =
        data.type === 'video'
          ? nonempty(data.poster)
            ? data.poster
            : urlList(data.url)[0]
          : data.type === 'image'
            ? urlList(data.url)[0]
            : undefined;
      return [
        {
          nodeId: node.id,
          name,
          nodeData: data,
          assetData: JSON.stringify(payload),
          ...(coverUrl ? { coverUrl } : {}),
        },
      ];
    });
}

/** Local library adapter; creating this payload does not write or pretend server success. */
export function canvasSelectionLibraryAssets(
  nodes,
  selectedIds,
  {
    makeId = () => crypto.randomUUID(),
    now = Date.now(),
    folderId = null,
    tags = [],
    assetType = null,
    renames = {},
  } = {},
) {
  return canvasSelectionMaterialItems(nodes, selectedIds, { now, renames }).map((item) => {
    const data = item.nodeData;
    const type = ['image', 'video', 'audio'].includes(data.type) ? data.type : 'document';
    const text = contentText(data);
    const url =
      type !== 'document'
        ? urlList(data.url)[0]
        : data.type === 'text'
          ? `data:text/markdown;charset=utf-8,${encodeURIComponent(text)}`
          : `data:application/json;charset=utf-8,${encodeURIComponent(item.assetData)}`;
    const resource = array(nodes.find((node) => node.id === item.nodeId)?.resourceMeta?.items).find(
      (value) => value.sourceUrl === url || !value.sourceUrl,
    );
    const mimeType =
      resource?.mimeType ||
      data.mimeType ||
      {
        image: /\.jpe?g(?:[?#]|$)/i.test(url) ? 'image/jpeg' : 'image/png',
        video: 'video/mp4',
        audio: 'audio/mpeg',
        document: data.type === 'text' ? 'text/markdown' : 'application/json',
      }[type];
    return {
      id: makeId(),
      name: item.name,
      type,
      mimeType,
      url,
      folderId,
      tags: [...tags],
      assetType,
      createdAt: now,
      updatedAt: now,
      assetData: item.assetData,
      sourceNodeId: item.nodeId,
      ...(item.coverUrl ? { thumbnailUrl: item.coverUrl } : {}),
      ...(data.type === 'text' ? { content: text } : {}),
    };
  });
}

/** Source 856685: group expansion, each actual URL, text Markdown, and script CSV. */
export function canvasSelectionDownloadItems(nodes, selectedIds) {
  const lookup = new Map(nodes.map((node) => [node.id, node]));
  const ordered = [];
  const seen = new Set();
  const include = (node) => {
    if (!node || seen.has(node.id)) return;
    seen.add(node.id);
    if (['group', 'video_group', 'video-story'].includes(typeOf(node))) {
      canvasGroupMembers(nodes, node.id).forEach(include);
    } else ordered.push(node);
  };
  canvasSelectionIds(nodes, selectedIds).forEach((id) => include(lookup.get(id)));
  return ordered.flatMap((node) => {
    const data = node.data || {};
    const type = typeOf(node);
    const label = data.label || data.name || defaults[type] || '资源';
    if (mediaActions[type]) {
      // Existing local uploads have no action. Public data with a different
      // explicit action still follows the source whitelist.
      if (data.action && !mediaActions[type].includes(data.action)) return [];
      const urls = urlList(data.url).filter((url) => !isBlob(url));
      return urls.length
        ? [
            {
              nodeId: node.id,
              type,
              urls,
              extensions: urls.map((url) => {
                const resource = array(node.resourceMeta?.items).find(
                  (item) =>
                    item &&
                    (!item.sourceUrl || item.sourceUrl === url) &&
                    (!item.kind || item.kind === type),
                );
                return (
                  mediaExtension(url, type) ||
                  mediaExtension(resource?.extension, type, true) ||
                  mediaExtension(resource?.fileName, type) ||
                  mediaExtension(
                    data.file?.name || node.file?.name || data.fileName || data.name,
                    type,
                  )
                );
              }),
              label,
              ...(data.protectionType === 'watermark' ? { protectionType: 'watermark' } : {}),
            },
          ]
        : [];
    }
    if (type === 'script' || type === 'storyboard')
      return array(data.rows).length
        ? [
            {
              nodeId: node.id,
              type: 'script',
              rows: data.rows,
              label,
              shotColumns: data.shotColumns,
            },
          ]
        : [];
    const markdown = type === 'text' && contentText(data);
    return markdown && markdown.trim() ? [{ nodeId: node.id, type: 'text', markdown, label }] : [];
  });
}

const scriptFields = [
  ['shotNumber', 'shot_number', '镜号'],
  ['durationSeconds', 'duration_seconds', '时长'],
  ['plotDescription', 'plot_description', '画面描述'],
  ['videoReference', 'video_reference', '视频参考图'],
  ['shotSize', 'shot_size', '景别'],
  ['emotion', 'emotion', '表情'],
  ['propTags', 'prop_tags', '道具'],
  ['lightingAndAtmosphere', 'lighting_and_atmosphere', '光影氛围'],
  ['audioEffects', 'audio_effects', '音效'],
  ['dialogue', 'dialogue', '对白'],
  ['imageGenerationPrompt', 'image_generation_prompt', '分镜提示词'],
  ['videoMotionPrompt', 'video_motion_prompt', '视频提示词'],
];
export function canvasScriptCsv(rows, shotColumns) {
  const escape = (value) =>
    /[,"\r\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value);
  const columns = scriptFields.map(([key, apiKey, label]) => ({
    key,
    label: array(shotColumns).find((column) => column.field === apiKey)?.label || label,
  }));
  const characterCount = Math.max(0, ...rows.map((row) => array(row.characters).length));
  const names = columns.slice(0, 3).map((column) => column.label);
  for (let i = 1; i <= characterCount; i++) names.push(`角色${i}`, `角色描述${i}`, `角色图${i}`);
  names.push(...columns.slice(3).map((column) => column.label));
  const fieldValue = (row, column) =>
    column.key === 'videoReference'
      ? row.videoReference?.referenceFrameImage || ''
      : ['string', 'number'].includes(typeof row[column.key])
        ? String(row[column.key])
        : '';
  const lines = rows.map((row) => {
    const values = columns.slice(0, 3).map((column) => fieldValue(row, column));
    for (let i = 0; i < characterCount; i++) {
      const character = array(row.characters)[i];
      values.push(
        character?.characterName || '',
        character?.characterDescription || '',
        character?.characterImageUrl || '',
      );
    }
    return [...values, ...columns.slice(3).map((column) => fieldValue(row, column))]
      .map(escape)
      .join(',');
  });
  return [names.map(escape).join(','), ...lines].join('\n');
}

export function canvasDownloadEntries(items) {
  return items.flatMap((item) => {
    if (item.type === 'text')
      return [
        {
          nodeId: item.nodeId,
          name: `${item.label}.md`,
          content: item.markdown,
          mimeType: 'text/markdown',
        },
      ];
    if (item.type === 'script')
      return [
        {
          nodeId: item.nodeId,
          name: `${item.label}.csv`,
          content: canvasScriptCsv(item.rows, item.shotColumns),
          mimeType: 'text/csv',
        },
      ];
    return item.urls.map((url, index) => {
      const extension =
        mediaExtension(url, item.type) ||
        mediaExtension(item.extensions?.[index], item.type, true) ||
        (item.type === 'image' ? 'png' : item.type === 'video' ? 'mp4' : 'mp3');
      const filenameLabel = String(item.label || defaults[item.type] || '资源');
      const label = filenameLabel.toLowerCase().endsWith(`.${extension}`)
        ? filenameLabel.slice(0, -extension.length - 1)
        : filenameLabel;
      return {
        nodeId: item.nodeId,
        name: `${label}${item.urls.length > 1 ? `(${index + 1})` : ''}.${extension}`,
        url,
        ...(item.protectionType ? { protectionType: item.protectionType } : {}),
      };
    });
  });
}
