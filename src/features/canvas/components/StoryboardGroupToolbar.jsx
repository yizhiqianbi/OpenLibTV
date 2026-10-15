import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Grid3X3, Group, Square, Trash2 } from 'lucide-react';
import { useAgentToolbarPopover } from '../../../hooks/useAgentToolbarPopover.js';
import { readStoredString, writeStoredString } from '../../../services/storage.ts';
import {
  Menu,
  SourceTooltip,
  useToolbarPosition,
  useSourceMenuPosition,
} from './GroupToolbarUI.jsx';

const ratios = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
const resolutionKey = 'libtv.storyboard.stitch.resolution';
const paths = {
  stitch:
    'M12.667 1.4a1.935 1.935 0 0 1 1.934 1.933v9.334a1.935 1.935 0 0 1-1.934 1.934H3.333a1.935 1.935 0 0 1-1.934-1.934V3.333a1.935 1.935 0 0 1 1.934-1.934zM3.333 2.6a.73.73 0 0 0-.732.733v9.334a.73.73 0 0 0 .732.732h4.066V2.601zm5.268 10.8h4.066a.73.73 0 0 0 .732-.733V8.601H8.601zm0-6h4.798V3.332a.73.73 0 0 0-.732-.732H8.601z',
  numbering:
    'M12.667 1.4c1.068 0 1.934.865 1.934 1.933v9.333a1.934 1.934 0 0 1-1.934 1.934H3.333a1.934 1.934 0 0 1-1.934-1.934V3.333c0-1.068.866-1.933 1.934-1.934zM2.601 12.665c0 .405.327.733.732.733h2.066v-2.802H2.601zm4 .733h2.798v-2.802H6.601zm4 0h2.066a.733.733 0 0 0 .732-.733v-2.07h-2.798zM3.333 2.6a.733.733 0 0 0-.732.734v6.063h6.798V2.6zm7.268 6.797h2.798v-2.8h-2.798zM6.25 7.667h-.92V5.688q0-.427-.021-.514a.19.19 0 0 0-.115-.13q-.09-.045-.41-.045h-.09v-.432q.666-.143 1.013-.59h.543zm4.35-2.271h2.798V3.333a.733.733 0 0 0-.732-.733h-2.066z',
  convert:
    'M2.333 12.667a1 1 0 0 0 1 1h2v1h-2l-.103-.003a2 2 0 0 1-1.894-1.894l-.003-.103v-1.334h1zm12.334 0a2 2 0 0 1-1.897 1.997l-.103.003h-2v-1h2a1 1 0 0 0 1-1v-1.334h1zm-6-8.5c.644 0 1.166.522 1.166 1.166v2q0 .086-.013.167h.847c.644 0 1.166.523 1.166 1.167v2c0 .644-.522 1.166-1.166 1.166H7.333a1.166 1.166 0 0 1-1.166-1.166v-2q0-.086.013-.167h-.847a1.167 1.167 0 0 1-1.166-1.167v-2c0-.644.522-1.166 1.166-1.166zM7.333 8.5a.167.167 0 0 0-.166.167v2c0 .092.074.166.166.166h3.334a.166.166 0 0 0 .166-.166v-2a.167.167 0 0 0-.166-.167zm-2-3.333a.166.166 0 0 0-.166.166v2c0 .092.074.167.166.167h3.334a.167.167 0 0 0 .166-.167v-2a.166.166 0 0 0-.166-.166zm0-2.834h-2a1 1 0 0 0-1 1v2h-1v-2a2 2 0 0 1 2-2h2zm7.334-1a2 2 0 0 1 2 2v2h-1v-2a1 1 0 0 0-1-1h-2v-1z',
};
function SourceIcon({ name }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={paths[name]} fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
    </svg>
  );
}
function AspectIcon({ ratio }) {
  const [w, h] = ratio.split(':').map(Number);
  const value = w > 0 && h > 0 ? w / h : 16 / 9;
  return (
    <span className="cv-storyboard-aspect-icon" aria-hidden="true">
      <span
        style={{
          width: value >= 1 ? 13.44 : 13.44 * value,
          height: value >= 1 ? 13.44 / value : 13.44,
        }}
      />
    </span>
  );
}
/** The source ts toolbar is dedicated to standalone image groups, without a run action. */
export function StoryboardGroupToolbar({
  groupId,
  aspect = '16:9',
  cols,
  rows,
  manualCols,
  manualRows,
  showShotNumbers,
  aspectLocked = false,
  isScriptLinked = false,
  isGroupRunning = false,
  pipelineProgress,
  onRunGroup,
  anchor,
  portal,
  disabled = false,
  busy = false,
  onCommand,
  onUngroup,
}) {
  const toolbar = useRef(null);
  const menus = useRef({});
  const [resolution, setResolution] = useState(() => {
    const value = readStoredString(resolutionKey, '2k');
    return value === '4k' ? '4k' : '2k';
  });
  const [hover, setHover] = useState({ cols: 0, rows: 0 });
  const unavailable = disabled || busy || typeof onCommand !== 'function';
  const closeOthers = (name) => {
    for (const [key, menu] of Object.entries(menus.current)) if (key !== name) menu.close();
  };
  const aspectMenu = useAgentToolbarPopover({
    width: 120,
    maxHeight: 272,
    disabled: unavailable || aspectLocked,
    onOpen: () => closeOthers('aspect'),
  });
  const gridMenu = useAgentToolbarPopover({
    width: 150,
    maxHeight: 280,
    disabled: unavailable,
    onOpen: () => closeOthers('grid'),
  });
  const stitchMenu = useAgentToolbarPopover({
    width: 120,
    maxHeight: 96,
    disabled: unavailable,
    trigger: 'hover',
    openDelay: 0,
    closeDelay: 120,
    onOpen: () => closeOthers('stitch'),
  });
  const customMenu = useAgentToolbarPopover({
    width: 205,
    maxHeight: 244,
    disabled: unavailable || !gridMenu.open,
    trigger: 'hover',
    openDelay: 0,
    closeDelay: 120,
  });
  menus.current = { aspect: aspectMenu, grid: gridMenu, stitch: stitchMenu };
  const style = useToolbarPosition(anchor, portal, toolbar);
  const aspectStyle = useSourceMenuPosition(aspectMenu, { width: 120, count: 6, anchor });
  const gridStyle = useSourceMenuPosition(gridMenu, {
    width: 150,
    count: 5,
    align: 'center',
    anchor,
  });
  const stitchStyle = useSourceMenuPosition(stitchMenu, { width: 120, count: 2, anchor });
  const customStyle = useSourceMenuPosition(customMenu, {
    width: 205,
    count: 5,
    anchor,
    parent: gridMenu,
  });
  const send = (command, menu) => {
    if (unavailable) return;
    menu?.close({ restoreFocus: true });
    onCommand(groupId, command);
  };
  const toggle = (menu) => {
    if (menu.open) menu.close({ restoreFocus: true });
    else menu.openPopover({ focus: true });
  };
  const stitch = (value) => {
    if (unavailable) return;
    setResolution(value);
    try {
      writeStoredString(resolutionKey, value);
    } catch {
      /* The current choice remains usable without preference storage. */
    }
    send({ type: 'stitch', resolution: value }, stitchMenu);
  };
  if (!portal || !anchor) return null;
  return createPortal(
    <>
      <div
        ref={toolbar}
        role="toolbar"
        aria-label="分镜组操作"
        aria-busy={busy}
        className="cv-storyboard-group-toolbar nodrag nopan nowheel"
        style={style}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <SourceTooltip label="比例由脚本节点统一配置" disabled={!aspectLocked}>
          <button
            ref={aspectMenu.triggerRef}
            type="button"
            {...aspectMenu.triggerProps}
            aria-haspopup="menu"
            disabled={unavailable || aspectLocked}
            onClick={() => toggle(aspectMenu)}
          >
            <AspectIcon ratio={aspect} />
            <span>{aspect}</span>
            <ChevronDown size={12} />
          </button>
        </SourceTooltip>
        <SourceTooltip label="修改分镜中宫格的数量" disabled={unavailable}>
          <button
            ref={gridMenu.triggerRef}
            type="button"
            {...gridMenu.triggerProps}
            aria-haspopup="menu"
            disabled={unavailable}
            onClick={() => toggle(gridMenu)}
          >
            <Grid3X3 size={16} />
            <span>
              宫格 {cols}×{rows}
            </span>
            <ChevronDown size={12} />
          </button>
        </SourceTooltip>
        <div className="cv-storyboard-control-divider" aria-hidden="true" />
        <SourceTooltip
          label="按分镜比例与当前宫格（含间距）拼接，默认 2K 分辨率"
          disabled={unavailable}
        >
          <button
            ref={stitchMenu.triggerRef}
            type="button"
            {...stitchMenu.triggerProps}
            onMouseEnter={() => stitchMenu.openPopover()}
            onFocus={undefined}
            aria-haspopup="menu"
            disabled={unavailable}
            onClick={() => stitch(resolution)}
          >
            <SourceIcon name="stitch" />
            <span>拼接({resolution})</span>
          </button>
        </SourceTooltip>
        <SourceTooltip
          label={showShotNumbers ? '隐藏分镜序号' : '显示分镜序号'}
          disabled={unavailable}
        >
          <button
            type="button"
            disabled={unavailable}
            aria-pressed={Boolean(showShotNumbers)}
            onClick={() => send({ type: 'toggleShotNumbers' })}
          >
            <SourceIcon name="numbering" />
            <span>序号</span>
          </button>
        </SourceTooltip>
        <SourceTooltip
          label={
            isScriptLinked
              ? '删除组内所有子节点；脚本对应关系保留，可重新生成分镜'
              : '删除组内所有子节点'
          }
          disabled={unavailable}
        >
          <button type="button" disabled={unavailable} onClick={() => send({ type: 'clear' })}>
            <Trash2 size={16} />
            <span>清空</span>
          </button>
        </SourceTooltip>
        {!isScriptLinked && (
          <SourceTooltip
            label="转为普通分组：子图按实际显示尺寸恢复并按宫格重排，取消分镜专属选项"
            disabled={unavailable}
          >
            <button
              type="button"
              disabled={unavailable}
              onClick={() => send({ type: 'convertToNormal' })}
            >
              <SourceIcon name="convert" />
              <span>转普通组</span>
            </button>
          </SourceTooltip>
        )}
        {isScriptLinked && (
          <>
            <div className="cv-storyboard-control-divider" aria-hidden="true" />
            <button
              type="button"
              className={isGroupRunning ? 'cv-storyboard-script-running' : undefined}
              disabled={disabled || busy || typeof onRunGroup !== 'function'}
              onClick={() => onRunGroup?.(groupId)}
            >
              {isGroupRunning ? (
                <Square size={14} />
              ) : (
                <span
                  className="cv-storyboard-script-refresh"
                  aria-hidden="true"
                  style={{
                    maskImage: 'url(/assets/icons/refresh.svg)',
                    WebkitMaskImage: 'url(/assets/icons/refresh.svg)',
                  }}
                />
              )}
              <span>
                {isGroupRunning
                  ? `停止${pipelineProgress ? ` (${pipelineProgress})` : ''}`
                  : '重新生成'}
              </span>
            </button>
          </>
        )}
        <div className="cv-storyboard-control-divider" aria-hidden="true" />
        <button
          type="button"
          disabled={disabled || busy || typeof onUngroup !== 'function'}
          onClick={() => onUngroup?.(groupId)}
        >
          <Group size={16} />
          <span>解组</span>
        </button>
      </div>
      <Menu popover={aspectMenu} label="分镜比例" style={aspectStyle}>
        {ratios.map((value) => (
          <button
            key={value}
            type="button"
            role="menuitem"
            aria-current={aspect === value ? 'true' : undefined}
            onClick={() => send({ type: 'aspect', value }, aspectMenu)}
          >
            <AspectIcon ratio={value} />
            <span>{value}</span>
          </button>
        ))}
      </Menu>
      <Menu
        popover={gridMenu}
        label="分镜宫格"
        className="cv-storyboard-grid-presets"
        style={gridStyle}
      >
        {[2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="menuitem"
            aria-current={manualCols === value && manualRows === value ? 'true' : undefined}
            onClick={() => send({ type: 'grid', cols: value, rows: value }, gridMenu)}
          >
            {value}×{value}
          </button>
        ))}
        <div className="cv-storyboard-menu-divider" aria-hidden="true" />
        <button
          ref={customMenu.triggerRef}
          type="button"
          role="menuitem"
          {...customMenu.triggerProps}
          onMouseEnter={() => customMenu.openPopover()}
          onFocus={undefined}
          aria-haspopup="menu"
          onClick={() => customMenu.openPopover({ focus: true })}
        >
          自定义
          <ChevronDown size={12} className="cv-storyboard-custom-chevron" />
        </button>
      </Menu>
      <Menu
        popover={customMenu}
        label="自定义分镜宫格"
        className="cv-storyboard-custom-grid-menu"
        style={customStyle}
      >
        <div className="cv-storyboard-custom-grid-caption">
          <span>自定义宫格</span>
          <span>{hover.cols && hover.rows ? `${hover.cols} x ${hover.rows}` : ''}</span>
        </div>
        <div
          className="cv-storyboard-custom-grid"
          onMouseLeave={() => setHover({ cols: 0, rows: 0 })}
        >
          {Array.from({ length: 25 }, (_, index) => {
            const row = Math.floor(index / 5) + 1,
              col = (index % 5) + 1;
            return (
              <button
                key={index}
                type="button"
                role="menuitem"
                aria-label={`${col} 列 ${row} 行`}
                data-highlighted={row <= hover.rows && col <= hover.cols ? 'true' : undefined}
                onMouseEnter={() => setHover({ cols: col, rows: row })}
                onFocus={() => setHover({ cols: col, rows: row })}
                onClick={() => {
                  customMenu.close();
                  send({ type: 'grid', cols: col, rows: row }, gridMenu);
                }}
              />
            );
          })}
        </div>
      </Menu>
      <Menu popover={stitchMenu} label="拼接分辨率" style={stitchStyle}>
        {['2k', '4k'].map((value) => (
          <button
            key={value}
            type="button"
            role="menuitem"
            aria-current={resolution === value ? 'true' : undefined}
            onClick={() => stitch(value)}
          >
            {value}
          </button>
        ))}
      </Menu>
    </>,
    portal,
  );
}
