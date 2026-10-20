#!/usr/bin/env node
/**
 * PenStudio read-only MCP server for CodeAgent.
 *
 * The browser workspace is intentionally local and unauthenticated in this build.
 * This bridge exposes only public/data JSON snapshots and the checked-in route
 * catalogue. It never reads cookies/localStorage and has no write, generation,
 * payment, or account operation.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = join(ROOT, 'public', 'data');
const MAX_BYTES = 1_500_000;
const MAX_SOURCE_BYTES = 50_000_000;
const MAX_ITEMS = 100;
const PROTOCOL_VERSION = '2024-11-05';

/** The route order mirrors src/app/router/routes.ts. */
const ROUTES = [
  ['home', /^(?:\/home_page)?$/, 'shell', '首页'],
  ['gallery', /^\/show$/, 'shell', 'TV Show'],
  ['skills', /^\/skill$/, 'shell', 'PenStudio Agent'],
  ['skill-create', /^\/skill\/create$/, 'shell', '创建 Skill'],
  ['skill-share', /^\/skill\/share$/, 'shell', 'Skill'],
  ['studio', /^\/3d-box$/, 'shell', 'PenStudio 3D-BOX'],
  ['studio-editor', /^\/animation-preview$/, 'standalone', '3D-BOX'],
  ['projects', /^\/project$/, 'shell', '项目'],
  ['interactive-film', /^\/interactive-film$/, 'standalone', '互动影游编辑器'],
  ['film-release', /^\/interactive-film\/play\/[^/]+$/, 'standalone', '互动影游'],
  ['assets', /^\/assets$/, 'shell', '资产'],
  ['profile', /^\/profile$/, 'shell', '用户主页'],
  ['detail', /^\/detail\/[^/]+$/, 'standalone', '作品'],
  ['canvas', /^\/canvas(?:\/(?:share|chat-share|import\/blender))?$/, 'standalone', '画布'],
  ['academy', /^\/academy$/, 'shell', '学院'],
  ['academy-course', /^\/academy\/course\/[^/]+$/, 'standalone', '课程播放'],
  ['academy-practice', /^\/academy\/practice\/[^/]+$/, 'standalone', 'AI 跟练室'],
  ['academy-product', /^\/academy\/product\/[^/]+$/, 'chrome', '课程'],
  ['academy-article', /^\/academy\/article\/[^/]+$/, 'standalone', '图文教程'],
  ['academy-video', /^\/academy\/(?:tutorial|masterclass)\/[^/]+$/, 'standalone', '视频教程'],
  ['activities', /^\/activity$/, 'shell', '创作者挑战赛'],
  ['activity-detail', /^\/activity\/[^/]+$/, 'shell', '挑战赛'],
  ['updates', /^\/feature-updates$/, 'shell', '版本更新记录'],
  ['plugin', /^\/plugin$/, 'shell', '插件与扩展'],
  ['blender', /^\/blender$/, 'standalone', 'Blender 插件'],
  ['mcp-authorize', /^\/mcp\/authorize$/, 'standalone', '授权'],
  ['seedance-verify', /^\/seedance-verify$/, 'standalone', 'Seedance 任务核验'],
].map(([id, pattern, layout, title]) => ({ id, pattern, layout, title }));

export class ToolError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.details = details;
  }
}

export const toolDefinitions = [
  {
    name: 'get_capabilities',
    title: 'Get PenStudio capabilities',
    description: 'Return the local PenStudio MCP capabilities and explicit service boundaries.',
    inputSchema: { type: 'object', additionalProperties: false },
  },
  {
    name: 'list_routes',
    title: 'List PenStudio routes',
    description: 'List the routes registered by PenStudio, including layout and title.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Optional substring filter.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'resolve_route',
    title: 'Resolve a PenStudio route',
    description: 'Resolve a pathname to the route id, layout, and title used by PenStudio.',
    inputSchema: {
      type: 'object',
      required: ['pathname'],
      properties: { pathname: { type: 'string', description: 'A path such as /detail/abc.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'search_content',
    title: 'Search public PenStudio content',
    description: 'Search the checked-in public JSON snapshots for a text query.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1 },
        prefix: { type: 'string', description: 'Optional public/data path prefix.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_content',
    title: 'Read public PenStudio content',
    description: 'Read one checked-in public/data JSON snapshot.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Snapshot path, with or without .json.' },
        jsonPointer: {
          type: 'string',
          description: 'Optional RFC 6901 pointer for a nested value.',
        },
        limit: { type: 'integer', minimum: 1, maximum: MAX_ITEMS, default: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_content',
    title: 'List public PenStudio content',
    description: 'List available JSON snapshots under public/data.',
    inputSchema: {
      type: 'object',
      properties: {
        prefix: { type: 'string', description: 'Optional public/data path prefix.' },
        limit: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
      },
      additionalProperties: false,
    },
  },
].map((tool) => ({
  ...tool,
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}));

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ToolError('INVALID_ARGUMENT', `${label} must be an object`);
  return value;
}

function normalizeRelative(value, label) {
  if (typeof value !== 'string' || !value.trim())
    throw new ToolError('INVALID_ARGUMENT', `${label} must be a non-empty string`);
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\/+/, '');
  if (normalized.includes('\0') || normalized.split('/').some((part) => part === '..'))
    throw new ToolError('INVALID_ARGUMENT', `${label} cannot escape public/data`);
  return normalized;
}

function normalizeDataName(value) {
  const normalized = normalizeRelative(value, 'name');
  const withExtension = extname(normalized) ? normalized : `${normalized}.json`;
  if (extname(withExtension).toLowerCase() !== '.json')
    throw new ToolError('INVALID_ARGUMENT', 'only JSON snapshots are exposed');
  const target = resolve(DATA_ROOT, withExtension);
  if (target !== DATA_ROOT && !target.startsWith(DATA_ROOT + sep))
    throw new ToolError('INVALID_ARGUMENT', 'name cannot escape public/data');
  return { name: relative(DATA_ROOT, target).split(sep).join('/'), target };
}

function normalizePrefix(value) {
  if (value === undefined || value === null || value === '') return '';
  return normalizeRelative(value, 'prefix');
}

async function walkJsonFiles(directory = DATA_ROOT) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const target = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkJsonFiles(target)));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) files.push(target);
  }
  return files.sort();
}

async function readContent(name) {
  const normalized = normalizeDataName(name);
  let text;
  try {
    text = await readFile(normalized.target, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT')
      throw new ToolError('NOT_FOUND', `content snapshot not found: ${normalized.name}`);
    throw new ToolError('READ_FAILED', `unable to read content snapshot: ${normalized.name}`);
  }
  if (Buffer.byteLength(text) > MAX_SOURCE_BYTES)
    throw new ToolError('TOO_LARGE', `content snapshot exceeds ${MAX_SOURCE_BYTES} bytes`);
  try {
    return { name: normalized.name, data: JSON.parse(text) };
  } catch {
    throw new ToolError(
      'INVALID_CONTENT',
      `content snapshot is not valid JSON: ${normalized.name}`,
    );
  }
}

function routeRecord(route) {
  return { id: route.id, pattern: String(route.pattern), layout: route.layout, title: route.title };
}

function resolveRoute(pathname) {
  if (typeof pathname !== 'string' || !pathname.trim())
    throw new ToolError('INVALID_ARGUMENT', 'pathname must be a non-empty string');
  let path = pathname.trim();
  let hasSearch = false;
  try {
    if (path.includes('?') || path.includes('#')) {
      const url = new URL(path, 'http://penstudio.local');
      path = url.pathname;
      hasSearch = Boolean(url.search);
    }
  } catch {
    throw new ToolError('INVALID_ARGUMENT', 'pathname is invalid');
  }
  if (!path.startsWith('/')) throw new ToolError('INVALID_ARGUMENT', 'pathname must begin with /');
  if (path === '/en' || path.startsWith('/en/')) path = path.slice(3) || '/';
  if (path === '/forbidden' && !hasSearch) path = '/';
  const route = ROUTES.find((candidate) => candidate.pattern.test(path));
  return {
    pathname: path,
    route: route
      ? routeRecord(route)
      : { id: 'not-found', pattern: '/.*/', layout: 'shell', title: '404' },
  };
}

export async function callTool(name, rawArguments = {}) {
  const args = assertRecord(rawArguments, 'arguments');
  switch (name) {
    case 'get_capabilities':
      return {
        name: 'penstudio',
        version: '0.1.0',
        protocolVersion: PROTOCOL_VERSION,
        workspace: relative(process.cwd(), ROOT),
        scope: 'local-read-only',
        allowedRoots: ['public/data'],
        capabilities: [
          'get_capabilities',
          'list_routes',
          'resolve_route',
          'list_content',
          'get_content',
          'search_content',
        ],
        unavailable: [
          'account authentication',
          'generation',
          'payment',
          'project writes',
          'asset writes',
          'server mutations',
        ],
      };
    case 'list_routes': {
      const query = String(args.query || '')
        .trim()
        .toLowerCase();
      return {
        routes: ROUTES.map(routeRecord).filter(
          (route) => !query || JSON.stringify(route).toLowerCase().includes(query),
        ),
      };
    }
    case 'resolve_route':
      return resolveRoute(args.pathname);
    case 'get_content': {
      const content = await readContent(args.name);
      const pointer = args.jsonPointer === undefined ? '' : args.jsonPointer;
      if (typeof pointer !== 'string' || (pointer && !pointer.startsWith('/')))
        throw new ToolError(
          'INVALID_ARGUMENT',
          'jsonPointer must be an RFC 6901 pointer beginning with /',
        );
      let value = content.data;
      const tokens = pointer
        ? pointer
            .slice(1)
            .split('/')
            .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
        : [];
      for (const token of tokens) {
        if (Array.isArray(value)) {
          const index = Number(token);
          if (!Number.isInteger(index) || index < 0 || index >= value.length)
            throw new ToolError('NOT_FOUND', `jsonPointer does not exist: ${pointer}`);
          value = value[index];
        } else if (value && typeof value === 'object' && Object.hasOwn(value, token))
          value = value[token];
        else throw new ToolError('NOT_FOUND', `jsonPointer does not exist: ${pointer}`);
      }
      const limit = Number.isInteger(args.limit)
        ? Math.min(MAX_ITEMS, Math.max(1, args.limit))
        : 20;
      const bounded = (entry, depth = 0) => {
        if (depth > 8) return '[depth limit]';
        if (Array.isArray(entry)) {
          const output = entry.slice(0, limit).map((item) => bounded(item, depth + 1));
          if (entry.length > limit) output.push(`[${entry.length - limit} more items omitted]`);
          return output;
        }
        if (entry && typeof entry === 'object')
          return Object.fromEntries(
            Object.entries(entry).map(([key, item]) => [key, bounded(item, depth + 1)]),
          );
        return entry;
      };
      const result = { name: content.name, jsonPointer: pointer || '/', data: bounded(value) };
      if (Buffer.byteLength(JSON.stringify(result)) > MAX_BYTES)
        throw new ToolError(
          'TOO_LARGE',
          `selected content exceeds ${MAX_BYTES} bytes; narrow jsonPointer or limit`,
        );
      return result;
    }
    case 'list_content': {
      const prefix = normalizePrefix(args.prefix);
      const limit = Number.isInteger(args.limit) ? Math.min(500, Math.max(1, args.limit)) : 100;
      const all = await walkJsonFiles();
      const items = [];
      for (const target of all) {
        const name = relative(DATA_ROOT, target).split(sep).join('/');
        if (prefix && !name.startsWith(prefix)) continue;
        items.push({ name, bytes: (await stat(target)).size });
        if (items.length >= limit) break;
      }
      return {
        items,
        totalMatching: all.filter(
          (target) =>
            !prefix || relative(DATA_ROOT, target).split(sep).join('/').startsWith(prefix),
        ).length,
      };
    }
    case 'search_content': {
      const query = String(args.query || '')
        .trim()
        .toLowerCase();
      if (!query) throw new ToolError('INVALID_ARGUMENT', 'query must be a non-empty string');
      const prefix = normalizePrefix(args.prefix);
      const limit = Number.isInteger(args.limit) ? Math.min(100, Math.max(1, args.limit)) : 20;
      const matches = [];
      for (const target of await walkJsonFiles()) {
        const name = relative(DATA_ROOT, target).split(sep).join('/');
        if (prefix && !name.startsWith(prefix)) continue;
        const text = await readFile(target, 'utf8');
        const lower = text.toLowerCase();
        const index = lower.indexOf(query);
        if (index < 0) continue;
        matches.push({
          name,
          snippet: text.slice(
            Math.max(0, index - 100),
            Math.min(text.length, index + query.length + 180),
          ),
        });
        if (matches.length >= limit) break;
      }
      return { query, matches };
    }
    default:
      throw new ToolError('UNKNOWN_TOOL', `unknown tool: ${name}`);
  }
}

function jsonRpcError(id, code, message, data = undefined) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string')
    return jsonRpcError(message?.id, -32600, 'Invalid Request');
  if (
    message.method === 'notifications/initialized' ||
    message.method === 'notifications/cancelled'
  )
    return null;
  if (message.method === 'ping') return { jsonrpc: '2.0', id: message.id ?? null, result: {} };
  if (message.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: message.id ?? null,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'penstudio', version: '0.1.0' },
        instructions:
          'Read-only local snapshots and route tools. Account, generation, payment, and write services are unavailable.',
      },
    };
  }
  if (message.method === 'tools/list')
    return { jsonrpc: '2.0', id: message.id ?? null, result: { tools: toolDefinitions } };
  if (message.method === 'tools/call') {
    try {
      const params = assertRecord(message.params || {}, 'params');
      const value = await callTool(params.name, params.arguments || {});
      return {
        jsonrpc: '2.0',
        id: message.id ?? null,
        result: {
          content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
          structuredContent: value,
          isError: false,
        },
      };
    } catch (error) {
      const known = error instanceof ToolError;
      const body = {
        code: known ? error.code : 'INTERNAL_ERROR',
        message: known ? error.message : 'tool failed',
      };
      return {
        jsonrpc: '2.0',
        id: message.id ?? null,
        result: { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }], isError: true },
      };
    }
  }
  return jsonRpcError(message.id, -32601, `Method not found: ${message.method}`);
}

export async function runStdio(input = process.stdin, output = process.stdout) {
  let buffer = '';
  for await (const chunk of input) {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        output.write(JSON.stringify(jsonRpcError(null, -32700, 'Parse error')) + '\n');
        continue;
      }
      const response = await handleMessage(message);
      if (response) output.write(JSON.stringify(response) + '\n');
    }
  }
  if (buffer.trim()) {
    try {
      const response = await handleMessage(JSON.parse(buffer));
      if (response) output.write(JSON.stringify(response) + '\n');
    } catch {
      output.write(JSON.stringify(jsonRpcError(null, -32700, 'Parse error')) + '\n');
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes('--help') || process.argv.includes('-h'))
    process.stderr.write('PenStudio MCP server (stdio, local read-only)\n');
  else await runStdio();
}
