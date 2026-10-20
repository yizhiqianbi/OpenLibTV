import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HtmlSubtitleWorkspace, { useHtmlSubtitleView } from './HtmlSubtitleWorkspace.jsx';
import { createSubtitleHtml } from './html-document.js';
import { archiveHtmlSubtitle } from './subtitle-archive.js';
import { htmlSubtitleLoadPlan } from '../domain/html-subtitle-sources.js';

function Preview({ mounted, disposed }) {
  useEffect(() => {
    mounted();
    return disposed;
  }, [mounted, disposed]);
  return (
    <div>
      <video data-testid="preview-video" controls />
      <iframe title="字幕画面" srcDoc="<p>字幕画面</p>" />
    </div>
  );
}

function fixture() {
  const html = createSubtitleHtml({
    compositionId: 'subtitle',
    width: 1920,
    height: 1080,
    duration: 10,
    cues: [{ cueId: 'caption', start: 0, duration: 3, text: '字幕正文', trackIndex: 0 }],
  });
  const state = {
    draftSession: {},
    ready: true,
    previewExpanded: true,
    htmlSubtitlePanelOpen: true,
    htmlSubtitleStatus: 'ready',
    selectedHtmlSubtitle: { key: 'video', cueId: 'caption', clipId: 'clip' },
    timeline: {
      clips: [
        {
          id: 'clip',
          sourceNodeId: 'video',
          type: 'video',
          startTime: 0,
          duration: 10,
          sourceOffset: 0,
          speed: 1,
          width: 1920,
          height: 1080,
        },
      ],
      currentTime: 1.25,
      totalDuration: 10,
      subtitlesHtml: { video: archiveHtmlSubtitle({ key: 'video', nodeId: 'video', html }) },
    },
  };
  return { state, controller: { onCloseHtmlSubtitles: vi.fn() } };
}

function Workspace({ state, controller, mounted, disposed }) {
  const view = useHtmlSubtitleView(state);
  return (
    <HtmlSubtitleWorkspace state={state} controller={controller} view={view}>
      <Preview mounted={mounted} disposed={disposed} />
    </HtmlSubtitleWorkspace>
  );
}

describe('HTML subtitle sidebar and stable preview ownership', () => {
  it('shows an explicit L2 conversion confirmation and keeps the source read-only until confirmed', () => {
    const props = { ...fixture(), mounted: vi.fn(), disposed: vi.fn() };
    props.controller.onConvertHtmlSubtitle = vi.fn(() => true);
    props.state.timeline.subtitlesHtml.video.htmlInline =
      props.state.timeline.subtitlesHtml.video.htmlInline.replace(
        /<style>[\s\S]*?<\/style>/,
        '<style>@keyframes original { to { font-family: A; font-size: 40px; font-weight: 600; line-height: 1.4; color: red; letter-spacing: 2px; text-shadow: none; -webkit-text-stroke: 1px black; } } .hf-text { animation: original 2s linear infinite; }</style>',
      );
    render(<Workspace {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '样式', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '转为可编辑字幕', exact: true }));
    expect(screen.getByRole('dialog', { name: '转为可编辑字幕' })).toBeTruthy();
    expect(screen.getByText(/可能移除动画效果/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '取消', exact: true }));
    expect(props.controller.onConvertHtmlSubtitle).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '转为可编辑字幕', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '确认转为可编辑', exact: true }));
    expect(props.controller.onConvertHtmlSubtitle).toHaveBeenCalledOnce();
  });
  it('shows source timing warnings while preserving editable legacy subtitle content', () => {
    const props = { ...fixture(), mounted: vi.fn(), disposed: vi.fn() };
    props.state.timeline.subtitlesHtml.video.htmlInline =
      props.state.timeline.subtitlesHtml.video.htmlInline
        .replace('libtv-subtitle/4', 'libtv-subtitle/3')
        .replace('data-duration="10"', 'data-duration="1"');
    render(<Workspace {...props} />);
    expect(screen.getByText('部分字幕超出文档总时长，末句可能被截断')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '样式', exact: true }));
    expect(screen.getByRole('textbox', { name: '字幕内容' }).disabled).toBe(false);
    expect(screen.getByRole('textbox', { name: '字幕内容' }).value).toBe('字幕正文');
    expect(screen.getByText('部分字幕超出文档总时长，末句可能被截断')).toBeTruthy();
  });
  it('keeps the successful layer editable when another source failed and disables only blocked style fields', () => {
    const props = { ...fixture(), mounted: vi.fn(), disposed: vi.fn() };
    const archive = props.state.timeline.subtitlesHtml.video;
    archive.htmlInline = archive.htmlInline.replace(
      /<style>[\s\S]*?<\/style>/,
      '<style>.hf-text { font: 32px sans-serif; color: red; }</style>',
    );
    const plan = htmlSubtitleLoadPlan(props.state.timeline);
    props.state.htmlSubtitleLoadKey = plan.key;
    props.state.htmlSubtitleSourceStates = [{ key: 'video', nodeId: 'video', status: 'ready' }];
    props.state.htmlSubtitleStatus = 'error';
    props.state.htmlSubtitleError = '另一字幕来源读取失败';
    render(<Workspace {...props} />);
    expect(screen.getByRole('button', { name: '删除字幕 caption' }).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '样式', exact: true }));
    expect(screen.getByRole('textbox', { name: '字幕内容' }).disabled).toBe(false);
    expect(screen.getByRole('combobox', { name: '字幕字体' }).disabled).toBe(true);
    expect(screen.getByLabelText('字幕字号').disabled).toBe(true);
    expect(screen.getByLabelText('字幕文字颜色').disabled).toBe(false);
    expect(screen.getByText('部分字幕样式无法注入，对应属性暂不可编辑。')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('另一字幕来源读取失败');
  });
  it('allows readonly subtitle selection while disabling body, layout, delete and style controls', () => {
    const props = { ...fixture(), mounted: vi.fn(), disposed: vi.fn() };
    props.controller.onSelectHtmlSubtitle = vi.fn();
    props.state.timeline.subtitlesHtml.video.htmlInline =
      props.state.timeline.subtitlesHtml.video.htmlInline.replace(
        /<style>[\s\S]*?<\/style>/,
        '<style>@keyframes original { to { font: 32px sans-serif; color:red; letter-spacing:2px; text-shadow:none; -webkit-text-stroke:1px black; } }</style>',
      );
    const plan = htmlSubtitleLoadPlan(props.state.timeline);
    props.state.htmlSubtitleLoadKey = plan.key;
    props.state.htmlSubtitleSourceStates = [{ key: 'video', nodeId: 'video', status: 'readonly' }];
    render(<Workspace {...props} />);
    expect(screen.getByRole('button', { name: '删除字幕 caption' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '选择字幕 caption' }));
    expect(props.controller.onSelectHtmlSubtitle).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '样式', exact: true }));
    expect(screen.getByRole('textbox', { name: '字幕内容' }).disabled).toBe(true);
    expect(screen.getByLabelText('字幕X').disabled).toBe(true);
    expect(screen.getByRole('button', { name: '删除字幕', exact: true }).disabled).toBe(true);
    expect(screen.getByText('当前字幕样式无法注入，已保留原内容并以只读方式预览。')).toBeTruthy();
  });
  it('preserves media DOM, playhead and preview lifecycle through list/style/preset switches', async () => {
    const props = { ...fixture(), mounted: vi.fn(), disposed: vi.fn() };
    const view = render(<Workspace {...props} />);
    expect(
      screen
        .getByRole('complementary', { name: '字幕', exact: true })
        .style.getPropertyValue('--rail-width'),
    ).toBe('300px');
    const video = screen.getByTestId('preview-video');
    const frame = screen.getByTitle('字幕画面');
    video.currentTime = 1.25;
    fireEvent.click(screen.getByRole('button', { name: '样式', exact: true }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '字幕', exact: true }));
    expect(screen.getByRole('textbox', { name: '字幕内容' }).value).toBe('字幕正文');
    fireEvent.click(screen.getByRole('button', { name: '字幕', exact: true }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '样式', exact: true }));
    expect(screen.getByRole('textbox', { name: '搜索字幕' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '样式', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '默认样式', exact: true }));
    await screen.findByRole('searchbox', { name: '搜索预设样式' });
    fireEvent.click(screen.getByRole('button', { name: '字幕', exact: true }));
    await screen.findByRole('textbox', { name: '搜索字幕' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '样式', exact: true }));
    expect(screen.queryByRole('searchbox', { name: '搜索预设样式' })).toBeNull();
    expect(screen.getByTestId('preview-video')).toBe(video);
    expect(video.currentTime).toBe(1.25);
    expect(screen.getByTitle('字幕画面')).toBe(frame);
    expect(props.mounted).toHaveBeenCalledTimes(1);
    expect(props.disposed).not.toHaveBeenCalled();
    view.unmount();
    expect(props.disposed).toHaveBeenCalledTimes(1);
  });

  it('resets the sidebar after closing without recreating the preview', async () => {
    const props = { ...fixture(), mounted: vi.fn(), disposed: vi.fn() };
    const view = render(<Workspace {...props} />);
    const video = screen.getByTestId('preview-video');
    fireEvent.click(screen.getByRole('button', { name: '样式', exact: true }));
    await screen.findByRole('textbox', { name: '字幕内容' });
    view.rerender(
      <Workspace {...props} state={{ ...props.state, htmlSubtitlePanelOpen: false }} />,
    );
    expect(screen.queryByRole('textbox', { name: '字幕内容' })).toBeNull();
    view.rerender(<Workspace {...props} />);
    await waitFor(() => expect(screen.getByRole('textbox', { name: '搜索字幕' })).toBeTruthy());
    expect(screen.getByTestId('preview-video')).toBe(video);
    expect(props.mounted).toHaveBeenCalledTimes(1);
    expect(props.disposed).not.toHaveBeenCalled();
  });
});
