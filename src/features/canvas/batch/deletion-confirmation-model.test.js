// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { canvasDeletionConfirmation } from './deletion-confirmation-model.js';

const node = (id, type, data = {}) => ({ id, type, data });
const group = (id = 'g', extra = {}) =>
  node(id, 'group', { sourceScriptNodeId: 'script', ...extra });
const call = (nodes, extra = {}) =>
  canvasDeletionConfirmation({ nodes, nodeIds: nodes.map((item) => item.id), ...extra });
const notice = (title, message) => ({
  title,
  message,
  confirmText: '确定删除',
  cancelText: '取消',
});

describe('source keyboard and menu deletion qualification', () => {
  it.each(['script', 'script-v2'])(
    'confirms keyboard %s before old groups and opening videos',
    (type) => {
      expect(
        call(
          [
            group('g', { storyboardGroupType: 'video' }),
            node('v', 'video', { openingUsed: true }),
            node('s', type),
          ],
          { isMac: true },
        ),
      ).toEqual(
        notice('确认删除', '删除当前节点后，数据可能会丢失，也可通过 ⌘Z 撤销。确定要删除吗？'),
      );
    },
  );
  it('uses the Windows undo shortcut and only the requested node IDs', () => {
    expect(
      canvasDeletionConfirmation({
        nodes: [node('s', 'script'), node('i', 'image')],
        nodeIds: ['i'],
      }),
    ).toBeNull();
    expect(call([node('s', 'script')])).toEqual(
      notice('确认删除', '删除当前节点后，数据可能会丢失，也可通过 Ctrl+Z 撤销。确定要删除吗？'),
    );
  });
  it('distinguishes the three literal old storyboard group policies', () => {
    expect(call([group('g', { storyboardGroupType: 'image' })])).toEqual(
      notice(
        '删除分镜图组',
        '删除分镜图组后，组内所有分镜图及其与脚本的关联关系将消失。确定要删除吗？',
      ),
    );
    expect(call([group('g', { storyboardGroupType: 'video' })])).toEqual(
      notice(
        '删除分镜视频组',
        '删除分镜视频组后，组内所有视频及其与分镜图的关联关系将消失。确定要删除吗？',
      ),
    );
    expect(call([group('i'), group('v', { storyboardGroupType: 'video' })])).toEqual(
      notice(
        '删除分镜组',
        '删除后组内所有节点及其与脚本的关联关系将消失，无法重新生成关联分镜图和批量生视频了。确定要删除吗？',
      ),
    );
  });
  it('treats whitespace source IDs as linked, and every non-video group kind as image', () => {
    expect(
      call([group('g', { sourceScriptNodeId: ' ', storyboardGroupType: 'other' })])?.title,
    ).toBe('删除分镜图组');
  });
  it.each(['', null, undefined, 0])(
    'does not qualify a group with invalid source ID %s',
    (sourceScriptNodeId) => {
      expect(call([group('g', { sourceScriptNodeId })])).toBeNull();
    },
  );
  it('uses flow type for UI qualification and does not create video_group/story aliases', () => {
    expect(
      call([
        node('v', 'video_group', { sourceScriptNodeId: 's' }),
        node('story', 'video-story', { sourceScriptNodeId: 's' }),
        node('image', 'image', { type: 'script' }),
      ]),
    ).toBeNull();
  });
  it('gives old group policy priority over opening-used videos and excludes exact v2', () => {
    expect(call([node('v', 'video', { openingUsed: true }), group()])?.title).toBe('删除分镜图组');
    expect(call([group('g', { sourceScriptVersion: 'v2' })])).toBeNull();
    expect(call([group('g', { sourceScriptVersion: 'V2' })])?.title).toBe('删除分镜图组');
  });
  it('uses the literal opening-used video warning and a truthy source predicate', () => {
    expect(call([node('v', 'video', { openingUsed: 'linked' })])).toEqual(
      notice(
        '确认删除该节点？',
        '删除该视频节点后，与「创意片头」相关的生成内容也将被永久删除，已发送到画布的内容不受影响',
      ),
    );
    expect(call([node('i', 'image', { openingUsed: true })])).toBeNull();
    expect(call([node('v', 'video', { openingUsed: false })])).toBeNull();
  });
  it('does not confirm ordinary generated media on the keyboard', () => {
    expect(call([node('i', 'image', { url: ['/picture.png'], content: ['content'] })])).toBeNull();
  });
  it('menu confirms script, but script-v2 follows the ordinary generated-content rule', () => {
    expect(call([node('s', 'script')], { trigger: 'menu' })?.title).toBe('确认删除');
    expect(call([node('s', 'script-v2')], { trigger: 'menu' })).toBeNull();
    expect(
      call([node('s', 'script-v2', { content: ['script text'] })], { trigger: 'menu' })?.title,
    ).toBe('删除节点');
  });
  it('menu skips generated content only for a linked exact v2 group', () => {
    expect(
      call([group('g', { sourceScriptVersion: 'v2', url: ['/generated.png'] })], {
        trigger: 'menu',
      }),
    ).toBeNull();
    expect(
      call(
        [
          group('g', {
            sourceScriptVersion: 'v2',
            sourceScriptNodeId: '',
            url: ['/generated.png'],
          }),
        ],
        { trigger: 'menu' },
      )?.title,
    ).toBe('删除节点');
  });
  it.each(['url', 'content'])(
    'menu confirms trim-nonempty %s array with its literal content warning',
    (key) => {
      expect(
        call([node('i', 'image', { [key]: [null, ' ', '\n', ' content '] })], {
          trigger: 'menu',
          isMac: true,
        }),
      ).toEqual(notice('删除节点', '该节点包含已生成的内容，删除后可通过 ⌘Z 撤销。确定删除？'));
    },
  );
  it('menu does not invent confirmation for string fields, empty arrays, arbitrary params or openingUsed', () => {
    for (const data of [
      { url: '/picture' },
      { content: 'text' },
      { url: [' ', null] },
      { content: [] },
      { rows: ['text'], params: { prompt: 'text' }, openingUsed: true },
    ])
      expect(call([node('i', 'image', data)], { trigger: 'menu' })).toBeNull();
  });
  it('defensively ignores malformed nonstring array values without claiming source supports them', () => {
    expect(
      call([node('i', 'image', { url: [5, {}, true, null] })], { trigger: 'menu' }),
    ).toBeNull();
  });
  it('is read-only and returns null for missing selections or unsupported triggers', () => {
    const selected = Object.freeze(
      node('s', 'script', Object.freeze({ content: Object.freeze(['original']) })),
    );
    const nodes = Object.freeze([selected]);
    expect(canvasDeletionConfirmation({ nodes, nodeIds: [] })).toBeNull();
    expect(canvasDeletionConfirmation({ nodes, nodeIds: ['missing'] })).toBeNull();
    expect(canvasDeletionConfirmation({ nodes, nodeIds: ['s'], trigger: 'other' })).toBeNull();
    expect(selected.data.content).toEqual(['original']);
  });
});
