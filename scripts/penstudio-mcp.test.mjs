import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { callTool } from './penstudio-mcp-server.mjs';

const serverPath = new URL('./penstudio-mcp-server.mjs', import.meta.url);

async function nextJson(child) {
  child._mcpBuffer ||= '';
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      child._mcpBuffer += chunk.toString();
      const newline = child._mcpBuffer.indexOf('\n');
      if (newline < 0) return;
      const line = child._mcpBuffer.slice(0, newline);
      child._mcpBuffer = child._mcpBuffer.slice(newline + 1);
      child.stdout.off('data', onData);
      resolve(JSON.parse(line));
    };
    child.stdout.on('data', onData);
    child.once('error', reject);
    child.once('close', () => reject(new Error('MCP server exited before responding')));
  });
}

test('exposes read-only capabilities and route resolution', async () => {
  const status = await callTool('get_capabilities');
  assert.equal(status.scope, 'local-read-only');
  assert.equal(status.capabilities.includes('search_content'), true);
  assert.equal(status.unavailable.includes('generation'), true);

  const route = await callTool('resolve_route', { pathname: '/en/academy/course/demo?from=test' });
  assert.equal(route.pathname, '/academy/course/demo');
  assert.equal(route.route.id, 'academy-course');
  assert.equal(
    (await callTool('resolve_route', { pathname: '/forbidden?reason=private' })).route.id,
    'not-found',
  );

  const routes = await callTool('list_routes', { query: 'canvas' });
  assert.equal(routes.routes.length, 1);
  assert.equal(routes.routes[0].id, 'canvas');
});

test('reads bounded public content and searches snapshots', async () => {
  const content = await callTool('get_content', {
    name: 'gallery',
    jsonPointer: '/items',
    limit: 1,
  });
  assert.equal(content.name, 'gallery.json');
  assert.equal(content.jsonPointer, '/items');
  assert.equal(content.data.length, 2);
  assert.match(content.data[1], /more items omitted/);

  const search = await callTool('search_content', { query: '大象', prefix: 'gallery', limit: 2 });
  assert.ok(search.matches.length > 0);
  assert.ok(search.matches.every((match) => match.name.startsWith('gallery')));

  await assert.rejects(() => callTool('get_content', { name: '../package.json' }), {
    code: 'INVALID_ARGUMENT',
  });
  await assert.rejects(
    () => callTool('get_content', { name: 'gallery', jsonPointer: '/missing' }),
    { code: 'NOT_FOUND' },
  );
});

test('speaks JSON-RPC over stdio', async () => {
  const child = spawn(process.execPath, [serverPath.pathname], { stdio: ['pipe', 'pipe', 'pipe'] });
  try {
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } })}\n`,
    );
    const initialized = await nextJson(child);
    assert.equal(initialized.result.serverInfo.name, 'penstudio');
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`,
    );
    const listed = await nextJson(child);
    assert.ok(listed.result.tools.some((tool) => tool.name === 'search_content'));
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'resolve_route', arguments: { pathname: '/show' } } })}\n`,
    );
    const called = await nextJson(child);
    assert.equal(called.result.structuredContent.route.id, 'gallery');
  } finally {
    child.kill();
    await new Promise((resolve) => child.once('close', resolve));
  }
});
