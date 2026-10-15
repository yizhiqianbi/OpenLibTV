// Literal decisions from original dN (272776), 688111, 244434 and 971021.
// Public records are read without fetching/executing source bundles. Expected
// values below are written independently; no production planner builds gold.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  collectVideoClipIncomingSources,
  getVideoClipAgentRefreshDelay,
  isVideoClipComposeGenerating,
  resolveVideoClipNodePresentation,
  shouldUseAuthoritativeVideoClipTimeline,
} from './node-presentation-model.js';

const emptyInput = {
  nodeId: 'clip',
  data: { type: 'video-clip', url: [] },
  incomingData: { videoList: [], audioList: [] },
  editingClipNodeId: null,
  editingClipPreviewExpanded: true,
  readonly: false,
  shouldShowGenerator: true,
  nowMs: 10_000,
  defaultLabel: '智能剪辑节点',
};
const incomingInput = {
  ...emptyInput,
  incomingData: {
    videoList: [{ nodeId: 'video-a', url: '/assets/a.mp4', label: 'A' }],
    audioList: [{ nodeId: 'audio-a', url: '/assets/a.mp3', label: '音乐' }],
  },
};

describe('VideoClipNode four content states and independent active overlay', () => {
  it('renders the exact empty recommendation state without manufacturing a default preset', () => {
    expect(resolveVideoClipNodePresentation(emptyInput)).toEqual({
      state: 'empty',
      label: '智能剪辑节点',
      outputUrl: undefined,
      hasOutput: false,
      firstVideoUrl: undefined,
      firstVideoSourceNodeId: '',
      hasIncomingVideo: false,
      isEditing: false,
      isEmbeddedPreview: false,
      previewPortalId: null,
      width: 350,
      height: 350,
      borderRadius: 12,
      agentActive: false,
      agentPending: false,
      agentBusy: false,
      shouldCloseEditor: false,
      showAgentOverlay: false,
      showOpenButton: false,
      openDisabled: true,
      canOpenEditor: false,
      presetChosen: false,
      showPresets: true,
      presetDisabled: false,
      shouldWarmPresets: true,
      shouldShowGenerator: true,
      composeGenerating: false,
      showDownload: false,
    });
  });

  it('renders the source first-video card at 566×350 with an editable open button', () => {
    expect(resolveVideoClipNodePresentation(incomingInput)).toEqual({
      state: 'incoming',
      label: '智能剪辑节点',
      outputUrl: undefined,
      hasOutput: false,
      firstVideoUrl: '/assets/a.mp4',
      firstVideoSourceNodeId: 'video-a',
      hasIncomingVideo: true,
      isEditing: false,
      isEmbeddedPreview: false,
      previewPortalId: null,
      width: 566,
      height: 350,
      borderRadius: 16,
      agentActive: false,
      agentPending: false,
      agentBusy: false,
      shouldCloseEditor: false,
      showAgentOverlay: false,
      showOpenButton: true,
      openDisabled: false,
      canOpenEditor: true,
      presetChosen: false,
      showPresets: false,
      presetDisabled: false,
      shouldWarmPresets: false,
      shouldShowGenerator: true,
      composeGenerating: false,
      showDownload: false,
    });
  });

  it('keeps an empty first video empty even when the second input is usable', () => {
    const incomingData = {
      videoList: [
        { nodeId: 'pending', url: '' },
        { nodeId: 'ready', url: '/assets/ready.mp4' },
      ],
      audioList: [{ nodeId: 'audio', url: '/assets/a.mp3' }],
    };
    expect(resolveVideoClipNodePresentation({ ...emptyInput, incomingData })).toMatchObject({
      state: 'empty',
      firstVideoUrl: '',
      firstVideoSourceNodeId: 'pending',
      hasIncomingVideo: false,
      width: 350,
      height: 350,
      showOpenButton: false,
      showPresets: true,
    });
    expect(collectVideoClipIncomingSources(incomingData)).toEqual({
      videoSourceNodeIds: ['pending', 'ready'],
      audioSourceNodeIds: ['audio'],
      usableVideoSourceNodeIds: ['ready'],
      usableAudioSourceNodeIds: ['audio'],
      videoUrls: ['/assets/ready.mp4'],
      audioUrls: ['/assets/a.mp3'],
      videoDisplayNames: [''],
      audioDisplayNames: [''],
    });
  });

  it('gives the first output precedence while retaining incoming-based content dimensions', () => {
    expect(
      resolveVideoClipNodePresentation({
        ...incomingInput,
        data: { url: ['/assets/out.mp4', '/assets/out-2.mp4'], width: 1920, height: 1080 },
      }),
    ).toMatchObject({
      state: 'output',
      outputUrl: '/assets/out.mp4',
      hasOutput: true,
      width: 566,
      height: 350,
      borderRadius: 16,
      showDownload: true,
      canOpenEditor: true,
    });
  });

  it('does not inspect a second output or fall back to cached params for first-video eligibility', () => {
    expect(
      resolveVideoClipNodePresentation({
        ...emptyInput,
        data: { url: ['', '/assets/out.mp4'], params: incomingInput.incomingData },
      }),
    ).toMatchObject({ state: 'empty', outputUrl: '', hasOutput: false, hasIncomingVideo: false });
  });

  it('preserves the renderer indexing expression rather than coercing a string URL to an array', () => {
    expect(
      resolveVideoClipNodePresentation({ ...emptyInput, data: { url: 'raw-string' } }),
    ).toMatchObject({ state: 'output', outputUrl: 'r', hasOutput: true, width: 350, height: 350 });
  });

  it('uses the node portal only for matching editing ID and collapsed preview', () => {
    expect(
      resolveVideoClipNodePresentation({
        ...incomingInput,
        data: { url: ['/assets/out.mp4'], embedContentHeight: 197 },
        editingClipNodeId: 'clip',
        editingClipPreviewExpanded: false,
      }),
    ).toMatchObject({
      state: 'editor-drop',
      isEditing: true,
      isEmbeddedPreview: true,
      previewPortalId: 'clip-preview-drop-clip',
      width: 350,
      height: 197,
      borderRadius: 12,
      showOpenButton: false,
      shouldShowGenerator: false,
      showDownload: false,
    });
  });

  it.each([
    [undefined, 260],
    [null, 260],
    [0, 0],
    [-3, -3],
    [NaN, NaN],
  ])('preserves embed height %s using nullish fallback only', (height, expected) => {
    const result = resolveVideoClipNodePresentation({
      ...incomingInput,
      data: { embedContentHeight: height },
      editingClipNodeId: 'clip',
      editingClipPreviewExpanded: false,
    });
    expect(result.height).toBe(expected);
    expect(result.width).toBe(350);
    expect(result.state).toBe('editor-drop');
  });

  it('does not enter the portal for an expanded current editor or another node editor', () => {
    const expanded = resolveVideoClipNodePresentation({
      ...incomingInput,
      editingClipNodeId: 'clip',
      editingClipPreviewExpanded: true,
    });
    expect(expanded).toMatchObject({
      state: 'incoming',
      isEditing: true,
      isEmbeddedPreview: false,
      width: 566,
      previewPortalId: null,
      shouldShowGenerator: false,
      canOpenEditor: true,
    });
    expect(
      resolveVideoClipNodePresentation({
        ...incomingInput,
        editingClipNodeId: 'other',
        editingClipPreviewExpanded: false,
      }),
    ).toMatchObject({ state: 'incoming', isEditing: false, shouldShowGenerator: true });
  });

  it('makes missing expanded state follow the literal negation rather than adding a default', () => {
    expect(
      resolveVideoClipNodePresentation({
        ...incomingInput,
        editingClipNodeId: 'clip',
        editingClipPreviewExpanded: undefined,
      }),
    ).toMatchObject({ state: 'editor-drop', isEmbeddedPreview: true });
  });

  it('keeps compose generation distinct from editing, pending, and button disablement', () => {
    const result = resolveVideoClipNodePresentation({
      ...incomingInput,
      data: { url: ['/assets/out.mp4'], taskInfo: { loading: true, status: 1 } },
    });
    expect(result).toMatchObject({
      state: 'output',
      composeGenerating: true,
      agentBusy: false,
      canOpenEditor: true,
      shouldShowGenerator: true,
      showDownload: false,
    });
  });
});

describe('independent pending, readonly and one-hour agent-active source gates', () => {
  it('pending disables incoming/output buttons without switching card dimensions or adding active overlay', () => {
    expect(
      resolveVideoClipNodePresentation({ ...incomingInput, agentEditingPending: true }),
    ).toMatchObject({
      state: 'incoming',
      width: 566,
      height: 350,
      borderRadius: 16,
      agentPending: true,
      agentActive: false,
      agentBusy: true,
      showAgentOverlay: false,
      openDisabled: true,
      canOpenEditor: false,
      shouldShowGenerator: false,
      shouldCloseEditor: false,
    });
    expect(
      resolveVideoClipNodePresentation({
        ...incomingInput,
        data: { url: ['/assets/out.mp4'] },
        agentEditingPending: true,
      }),
    ).toMatchObject({ state: 'output', openDisabled: true, showDownload: true });
  });

  it('pending in the empty panel does not invent a readonly preset restriction', () => {
    expect(
      resolveVideoClipNodePresentation({ ...emptyInput, agentEditingPending: true }),
    ).toMatchObject({
      state: 'empty',
      showPresets: true,
      presetDisabled: false,
      shouldWarmPresets: true,
      shouldShowGenerator: false,
      showAgentOverlay: false,
    });
  });

  it('active without output renders only the busy layer, closing only a matching editor', () => {
    const data = { agentEditing: { state: 'running', startedAtMs: 0 } };
    expect(
      resolveVideoClipNodePresentation({ ...incomingInput, data, editingClipNodeId: 'clip' }),
    ).toMatchObject({
      state: 'agent-active',
      width: 350,
      height: 350,
      borderRadius: 12,
      agentActive: true,
      agentBusy: true,
      showAgentOverlay: true,
      showPresets: false,
      showOpenButton: false,
      shouldShowGenerator: false,
      shouldCloseEditor: true,
    });
    expect(
      resolveVideoClipNodePresentation({ ...incomingInput, data, editingClipNodeId: 'other' }),
    ).toMatchObject({ state: 'agent-active', shouldCloseEditor: false });
  });

  it('active output remains rendered underneath its busy layer, with download controlled only by the task gate', () => {
    expect(
      resolveVideoClipNodePresentation({
        ...incomingInput,
        data: { url: ['/assets/out.mp4'], agentEditing: { state: 'running' } },
        readonly: true,
      }),
    ).toMatchObject({
      state: 'output',
      width: 350,
      height: 350,
      showAgentOverlay: true,
      openDisabled: true,
      canOpenEditor: false,
      showDownload: true,
    });
  });

  it('portal precedence suppresses the active overlay but still requests current editor closure', () => {
    expect(
      resolveVideoClipNodePresentation({
        ...incomingInput,
        data: { agentEditing: { state: 'running' }, embedContentHeight: 205 },
        editingClipNodeId: 'clip',
        editingClipPreviewExpanded: false,
      }),
    ).toMatchObject({
      state: 'editor-drop',
      width: 350,
      height: 205,
      showAgentOverlay: false,
      shouldCloseEditor: true,
      agentBusy: true,
    });
  });

  it.each([
    ['running', undefined, 3_600_000, true],
    ['running', null, 3_600_000, true],
    ['running', '0', 3_600_000, true],
    ['running', 0, 3_599_999, true],
    ['running', 0, 3_600_000, false],
    ['running', 0, 3_600_001, false],
    ['running', 50_000, 0, true],
    ['running', NaN, 0, false],
    ['running', Infinity, 0, true],
    ['running', -Infinity, 0, false],
    ['finished', undefined, 0, false],
    ['pending', 0, 0, false],
  ])(
    'retains active typeof/boundary semantics for %s/%s at %s',
    (state, startedAtMs, nowMs, active) => {
      const result = resolveVideoClipNodePresentation({
        ...incomingInput,
        data: { agentEditing: { state, startedAtMs } },
        nowMs,
      });
      expect(result.agentActive).toBe(active);
      expect(result.state).toBe(active ? 'agent-active' : 'incoming');
    },
  );

  it.each([
    [undefined, 0, null],
    [null, 0, null],
    ['0', 0, null],
    [0, 0, 3_600_050],
    [0, 3_599_999, 51],
    [0, 3_600_000, null],
    [0, 3_600_001, null],
    [NaN, 0, NaN],
    [Infinity, 0, Infinity],
    [-Infinity, 0, null],
  ])(
    'retains the one-shot hook delay expression for started %s at %s',
    (startedAtMs, nowMs, expected) => {
      expect(getVideoClipAgentRefreshDelay({ state: 'running', startedAtMs }, nowMs)).toBe(
        expected,
      );
      expect(getVideoClipAgentRefreshDelay({ state: 'finished', startedAtMs }, nowMs)).toBeNull();
    },
  );

  it('readonly disables open and presets without adding another generator visibility predicate', () => {
    expect(resolveVideoClipNodePresentation({ ...incomingInput, readonly: true })).toMatchObject({
      state: 'incoming',
      openDisabled: true,
      shouldShowGenerator: true,
      width: 566,
    });
    expect(resolveVideoClipNodePresentation({ ...emptyInput, readonly: true })).toMatchObject({
      state: 'empty',
      showPresets: true,
      presetDisabled: true,
      shouldWarmPresets: false,
    });
  });

  it('does not coerce the original base generator helper result to boolean', () => {
    expect(
      resolveVideoClipNodePresentation({ ...emptyInput, shouldShowGenerator: null })
        .shouldShowGenerator,
    ).toBeNull();
    expect(
      resolveVideoClipNodePresentation({ ...emptyInput, shouldShowGenerator: 0 })
        .shouldShowGenerator,
    ).toBe(0);
  });

  it('uses source truthy names and mode keys without trimming or assuming a preset catalogue', () => {
    expect(
      resolveVideoClipNodePresentation({
        ...emptyInput,
        data: { name: '', label: '  ', agentComposerData: { modeKey: '  ' } },
      }),
    ).toMatchObject({
      label: '  ',
      presetChosen: true,
      showPresets: false,
      shouldWarmPresets: false,
    });
    expect(
      resolveVideoClipNodePresentation({
        ...emptyInput,
        data: { name: '', label: '备用标签', agentComposerData: { modeKey: '' } },
      }),
    ).toMatchObject({ label: '备用标签', presetChosen: false, showPresets: true });
  });
});

describe('original compose task-state and authoritative timeline predicates', () => {
  it.each([
    [undefined, false],
    [{ loading: false, status: 1 }, false],
    [{ loading: 1, status: 1 }, false],
    [{ loading: 'true', status: 1 }, false],
    [{ loading: true }, true],
    [{ loading: true, status: null }, true],
    [{ loading: true, status: 0 }, true],
    [{ loading: true, status: 1 }, true],
    [{ loading: true, status: 2 }, false],
    [{ loading: true, status: 3 }, false],
    [{ loading: true, status: 4 }, false],
    [{ loading: true, status: ' 2 ' }, false],
    [{ loading: true, status: '3.0' }, false],
    [{ loading: true, status: '0x4' }, false],
    [{ loading: true, status: '' }, true],
    [{ loading: true, status: '   ' }, true],
    [{ loading: true, status: 'bad' }, true],
    [{ loading: true, status: NaN }, true],
    [{ loading: true, status: Infinity }, true],
    [{ loading: true, status: 'Infinity' }, true],
    [{ loading: true, status: [2] }, true],
    [{ loading: true, status: { valueOf: () => 2 } }, true],
    [{ loading: true, status: true }, true],
    [{ loading: true, status: 2.1 }, true],
  ])('uses typed finite terminal statuses for %o', (task, expected) => {
    expect(isVideoClipComposeGenerating(task)).toBe(expected);
  });

  it.each([
    [undefined, false],
    [{ clipTimelineData: { clipsAuthoritative: true } }, true],
    [{ clipTimelineData: { clipsAuthoritative: 1 } }, false],
    [{ clipTimelineData: { clipsAuthoritative: 'true' } }, false],
    [{ agentEditing: null }, false],
    [{ agentEditing: undefined }, false],
    [{ agentEditing: false }, true],
    [{ agentEditing: 0 }, true],
    [{ agentEditing: { state: 'finished' } }, true],
  ])('keeps authority separate from current busy state for %o', (data, expected) => {
    expect(shouldUseAuthoritativeVideoClipTimeline(data)).toBe(expected);
  });
});

describe('URL-qualified editor sources and representative public clips', () => {
  it('keeps source order, duplicate IDs and URL truthiness rather than protocol/metadata guessing', () => {
    expect(
      collectVideoClipIncomingSources({
        videoList: [
          { nodeId: 'empty', url: '', label: 'unused' },
          { nodeId: 'v', url: 'blob:one', label: '  V  ' },
          { nodeId: 'v', url: '/assets/two.mp4', label: '' },
          { url: ' ', label: '  ' },
        ],
        audioList: [
          { nodeId: 'a', url: null, label: 'unused' },
          { nodeId: 'a', url: 'data:audio/mpeg;base64,AA==', label: ' 音乐 ' },
          { nodeId: 'b', url: false },
        ],
      }),
    ).toEqual({
      videoSourceNodeIds: ['empty', 'v', 'v', undefined],
      audioSourceNodeIds: ['a', 'a', 'b'],
      usableVideoSourceNodeIds: ['v', 'v', undefined],
      usableAudioSourceNodeIds: ['a'],
      videoUrls: ['blob:one', '/assets/two.mp4', ' '],
      audioUrls: ['data:audio/mpeg;base64,AA=='],
      videoDisplayNames: ['V', '', ''],
      audioDisplayNames: ['音乐'],
    });
    expect(collectVideoClipIncomingSources(undefined)).toEqual({
      videoSourceNodeIds: [],
      audioSourceNodeIds: [],
      usableVideoSourceNodeIds: [],
      usableAudioSourceNodeIds: [],
      videoUrls: [],
      audioUrls: [],
      videoDisplayNames: [],
      audioDisplayNames: [],
    });
  });

  const publicChats = JSON.parse(readFileSync('public/data/chat-shares.json', 'utf8'));

  it('projects the public clip with video, BGM and saved 197px portal height without mutation', () => {
    const node = publicChats.HHcwG6xmqD.snapshot.nodes.find(
      (entry) => entry.id === 'v-9kwv7gcek6u8',
    );
    const before = JSON.stringify(node);
    const presentation = resolveVideoClipNodePresentation({
      ...emptyInput,
      nodeId: node.id,
      data: node.data,
      incomingData: node.data.params,
    });
    expect(presentation).toMatchObject({
      state: 'incoming',
      label: '视频合成',
      firstVideoUrl: '/assets/5d038d9959cc9a1a.mp4',
      firstVideoSourceNodeId: 'v-jyp9gn9mqfjf',
      width: 566,
      height: 350,
      composeGenerating: false,
      canOpenEditor: true,
    });
    expect(collectVideoClipIncomingSources(node.data.params)).toEqual({
      videoSourceNodeIds: ['v-jyp9gn9mqfjf'],
      audioSourceNodeIds: ['a-duvh3e5m9b92'],
      usableVideoSourceNodeIds: ['v-jyp9gn9mqfjf'],
      usableAudioSourceNodeIds: ['a-duvh3e5m9b92'],
      videoUrls: ['/assets/5d038d9959cc9a1a.mp4'],
      audioUrls: [
        'https://libtv-res.liblib.art/sd-gen-save-img/genius_playground/audio/beda8103d1a8414aa15aa0eb1db95a07/eb0ef56cbf5565f76cc9fd62a8049a3bb299eadfacb896342a135d8293fb9d73.mp3',
      ],
      videoDisplayNames: ['视频3-字幕'],
      audioDisplayNames: ['BGM · The Right Compartment（韦氏风格）'],
    });
    expect(
      resolveVideoClipNodePresentation({
        ...emptyInput,
        nodeId: node.id,
        data: node.data,
        incomingData: node.data.params,
        editingClipNodeId: node.id,
        editingClipPreviewExpanded: false,
      }),
    ).toMatchObject({
      state: 'editor-drop',
      previewPortalId: 'clip-preview-drop-v-9kwv7gcek6u8',
      width: 350,
      height: 197,
    });
    expect(JSON.stringify(node)).toBe(before);
  });

  it('keeps public incoming V02/V03/V01 order even though saved main timeline is V01/V02/V03', () => {
    const node = publicChats.rWdxENmCi9.snapshot.nodes.find(
      (entry) => entry.id === 'v-uu3bt36bpdpn',
    );
    const before = JSON.stringify(node);
    expect(node.data.clipTimelineData.videoSourceNodeIds).toEqual([
      'v-7c2z94759ff8',
      'v-qyaqzd3sdqzb',
      'v-6nyw27q7bkz4',
    ]);
    expect(collectVideoClipIncomingSources(node.data.params)).toEqual({
      videoSourceNodeIds: ['v-qyaqzd3sdqzb', 'v-6nyw27q7bkz4', 'v-7c2z94759ff8'],
      audioSourceNodeIds: [],
      usableVideoSourceNodeIds: ['v-qyaqzd3sdqzb', 'v-6nyw27q7bkz4', 'v-7c2z94759ff8'],
      usableAudioSourceNodeIds: [],
      videoUrls: [
        '/assets/12e9abfa23fede32.mp4',
        '/assets/032b919a34d057f8.mp4',
        '/assets/e484af8218c5ce8b.mp4',
      ],
      audioUrls: [],
      videoDisplayNames: [
        'V02 · 裂缝（t15–t35s）',
        'V03 · 分离（t35–t50s）',
        'V01 · 相遇（t0–t15s）',
      ],
      audioDisplayNames: [],
    });
    expect(
      resolveVideoClipNodePresentation({
        ...emptyInput,
        nodeId: node.id,
        data: node.data,
        incomingData: node.data.params,
      }),
    ).toMatchObject({
      state: 'incoming',
      firstVideoUrl: '/assets/12e9abfa23fede32.mp4',
      firstVideoSourceNodeId: 'v-qyaqzd3sdqzb',
      width: 566,
      height: 350,
    });
    expect(JSON.stringify(node)).toBe(before);
  });
});
