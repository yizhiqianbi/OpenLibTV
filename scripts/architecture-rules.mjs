import path from 'node:path';

// Explicit composition points. A feature may use another feature through these
// small entry points; its private views, hooks and models stay inside its domain.
const featureEntryPoints = new Set([
  'features/canvas/CanvasPage',
  'features/canvas/document-api',
  'features/studio/StudioEditor',
]);
const compatibilityExports = new Map([
  [
    'components/Gallery.jsx',
    new Set([
      'features/gallery/components/Gallery.jsx',
      'features/gallery/components/GalleryCard.jsx',
    ]),
  ],
  [
    'features/shared/secondary/CoursePlayer.jsx',
    new Set(['features/academy/player/CoursePlayer.jsx']),
  ],
]);

function sourcePath(filename) {
  const normalized = filename.replaceAll('\\', '/');
  const marker = normalized.lastIndexOf('/src/');
  return marker < 0 ? null : normalized.slice(marker + 5);
}

function isDomainModel(filename) {
  return (
    /^features\/[^/]+\/domain\//.test(filename) ||
    /^features\/[^/]+\/(?:.*\/)?(?:model|[^/]+-model|schema|geometry)\.[cm]?[jt]s$/.test(filename)
  );
}

const uiPackage =
  /^(?:react(?:-dom)?(?:\/|$)|@tiptap\/react(?:\/|$)|lucide-react(?:\/|$)|@mantine\/(?:core|hooks)(?:\/|$))/;

export function importBoundary(from, to) {
  const fromLayer = from.split('/')[0];
  const toLayer = to.split('/')[0];
  if (
    isDomainModel(from) &&
    (/(?:^|\/)(?:app|pages|components|hooks)\//.test(to) ||
      /(?:^|\/)use[A-Z][^/]*$/.test(to) ||
      /\.[jt]sx$/.test(to) ||
      (featureEntryPoints.has(to.replace(/\.[cm]?[jt]sx?$/, '')) &&
        !to.replace(/\.[cm]?[jt]sx?$/, '').endsWith('/document-api')))
  )
    return '领域规则和模型不能依赖视图或 hooks；由 controller 注入数据、动作或服务。';
  if (['services', 'hooks', 'components'].includes(fromLayer) && /^data(?:\.js)?$/.test(to))
    return '共享层应直接引用对应服务或 hook，不能通过旧 data.js 聚合入口绕过依赖边界。';
  if (
    fromLayer === 'services' &&
    ['app', 'components', 'hooks', 'features', 'pages'].includes(toLayer)
  )
    return '服务层只能依赖服务或纯工具，不能反向依赖 UI、hooks 或业务页面。';
  if (fromLayer === 'hooks' && ['app', 'features', 'pages'].includes(toLayer))
    return '公共 hook 不能依赖业务域内部实现；业务 hook 应留在所属 feature。';
  if (fromLayer === 'components' && ['app', 'features', 'pages'].includes(toLayer))
    return '共享组件不能依赖业务域内部实现；请传入 props 或提取共享协议。';
  if (fromLayer === 'features' && ['app', 'pages'].includes(toLayer))
    return '业务域不能反向依赖应用外壳或旧页面兼容入口。';
  if (fromLayer === 'features' && toLayer === 'features') {
    const fromDomain = from.split('/')[1];
    const toDomain = to.split('/')[1];
    if (
      fromDomain !== toDomain &&
      !['shared', 'editor'].includes(toDomain) &&
      !featureEntryPoints.has(to.replace(/\.[cm]?[jt]sx?$/, ''))
    )
      return '跨业务域只能引用明确的页面或文档入口，不能引用私有组件、hooks 和模型。';
  }
  return null;
}

const boundaryRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: { boundary: '{{reason}}（{{from}} → {{to}}）' },
  },
  create(context) {
    const filename = context.filename || context.getFilename();
    const from = sourcePath(filename);
    if (!from || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(from)) return {};
    const check = (node, source, reexport = false) => {
      if (!source) return;
      const specifier =
        typeof source.value === 'string'
          ? source.value
          : source.type === 'TemplateLiteral' && source.expressions.length === 0
            ? source.quasis[0].value.cooked
            : null;
      if (typeof specifier !== 'string') return;
      if (!specifier.startsWith('.')) {
        if ((from.startsWith('services/') || isDomainModel(from)) && uiPackage.test(specifier))
          context.report({
            node,
            messageId: 'boundary',
            data: { from, to: specifier, reason: '服务和领域模型不能依赖 UI 库。' },
          });
        return;
      }
      if (isDomainModel(from) && /\.css$/.test(specifier)) {
        context.report({
          node,
          messageId: 'boundary',
          data: { from, to: specifier, reason: '领域模型不能承担样式加载。' },
        });
        return;
      }
      // View styles retain their established cascade.
      if (/\.(?:css|svg|png|jpg|jpeg|webp|json)$/.test(specifier)) return;
      const to = sourcePath(path.resolve(path.dirname(filename), specifier));
      if (!to || (reexport && compatibilityExports.get(from)?.has(to))) return;
      const reason = importBoundary(from, to);
      if (reason) context.report({ node, messageId: 'boundary', data: { reason, from, to } });
    };
    return {
      ImportDeclaration: (node) => check(node, node.source),
      ExportNamedDeclaration: (node) => check(node, node.source, true),
      ExportAllDeclaration: (node) => check(node, node.source, true),
      ImportExpression: (node) => check(node, node.source),
    };
  },
};

export default { rules: { 'import-boundaries': boundaryRule } };
