import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Square } from 'lucide-react';
import { useAgentToolbarPopover } from '../../../hooks/useAgentToolbarPopover.js';
import {
  GENERAL_GROUP_COLORS,
  GENERAL_GROUP_LAYOUTS,
} from '../domain/general-group-controls-model.js';
import {
  Menu,
  SourceTooltip,
  useSourceMenuPosition,
  useToolbarPosition,
} from './GroupToolbarUI.jsx';
import './general-group-toolbar.css';

const layoutPresentation = {
  grid: ['宫格排列', 'layout-grid'],
  horizontal: ['水平排列', 'workflow'],
  vertical: ['垂直排列', 'list'],
};

function SourceAssetIcon({ name, size = 20 }) {
  return (
    <span
      className="cv-general-group-icon"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        maskImage: `url(/assets/icons/${name}.svg)`,
        WebkitMaskImage: `url(/assets/icons/${name}.svg)`,
      }}
    />
  );
}

export function GeneralGroupToolbar({
  groupId,
  groupColor,
  linked = false,
  sourceScriptVersion,
  anyChildHasContent = false,
  isGroupRunning = false,
  pipelineProgress,
  workflowUuid,
  allChildrenAreImageNodes = false,
  batchVideoAvailability = { visible: false, enabled: false },
  canDownload = false,
  isDownloading = false,
  downloadProgress,
  anchor,
  portal,
  disabled = false,
  busy = false,
  onCommand,
  onRun,
  onUngroup,
  onCreateWorkflow,
  onBatchGenerateVideo,
  onDownload,
  onCancelDownload,
}) {
  const toolbar = useRef(null),
    menus = useRef({});
  const unavailable = disabled || busy;
  const colorMenu = useAgentToolbarPopover({
    width: 252,
    maxHeight: 120,
    disabled: unavailable || typeof onCommand !== 'function',
    onOpen: () => menus.current.layout?.close(),
  });
  const layoutMenu = useAgentToolbarPopover({
    width: 120,
    maxHeight: 156,
    disabled: unavailable || typeof onCommand !== 'function',
    onOpen: () => menus.current.color?.close(),
  });
  menus.current = { color: colorMenu, layout: layoutMenu };
  const style = useToolbarPosition(anchor, portal, toolbar);
  const colorStyle = useSourceMenuPosition(colorMenu, {
    width: 252,
    count: 2,
    anchor,
    preferAbove: true,
  });
  const layoutStyle = useSourceMenuPosition(layoutMenu, {
    width: 120,
    count: 3,
    align: 'center',
    anchor,
    preferAbove: true,
  });
  const branded = linked && sourceScriptVersion === 'v2' && !isGroupRunning;
  const runLabel = isGroupRunning
    ? `停止${pipelineProgress ? ` (${pipelineProgress})` : ''}`
    : linked && sourceScriptVersion !== 'v2'
      ? '重新生成'
      : '整组执行';
  const send = (command, menu) => {
    if (unavailable || typeof onCommand !== 'function') return;
    menu?.close({ restoreFocus: true });
    onCommand(groupId, command);
  };
  const toggle = (menu) =>
    menu.open ? menu.close({ restoreFocus: true }) : menu.openPopover({ focus: true });
  if (!anchor || !portal) return null;
  return createPortal(
    <>
      <div
        ref={toolbar}
        className="cv-general-group-toolbar nodrag nopan nowheel"
        role="toolbar"
        aria-label="分组操作"
        aria-busy={busy}
        style={style}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          ref={colorMenu.triggerRef}
          {...colorMenu.triggerProps}
          aria-label="分组颜色"
          aria-haspopup="menu"
          className="cv-general-group-color-trigger"
          disabled={unavailable || typeof onCommand !== 'function'}
          onClick={() => toggle(colorMenu)}
        >
          <span style={{ background: groupColor ?? '#B8B8B8' }} />
        </button>
        <button
          type="button"
          ref={layoutMenu.triggerRef}
          {...layoutMenu.triggerProps}
          aria-label="分组布局"
          aria-haspopup="menu"
          disabled={unavailable || typeof onCommand !== 'function'}
          onClick={() => toggle(layoutMenu)}
        >
          <SourceAssetIcon name="icon-auto-arrange" />
          <ChevronDown size={12} />
        </button>
        <div className="cv-general-group-divider" aria-hidden="true" />
        <SourceTooltip
          label="请点击下方的生成器，检查提示词和参考图连接无问题后，点击整组执行开始批量生成"
          disabled={!branded}
          delay={300}
        >
          <button
            type="button"
            className={`cv-general-group-run${branded ? ' cv-general-group-brand' : ''}${isGroupRunning ? ' cv-general-group-running' : ''}`}
            disabled={unavailable || typeof onRun !== 'function'}
            onClick={() => onRun?.(groupId)}
          >
            {isGroupRunning ? (
              <Square size={16} />
            ) : (
              <SourceAssetIcon
                name={linked && sourceScriptVersion !== 'v2' ? 'refresh' : 'icon-play'}
              />
            )}
            <span>{runLabel}</span>
            {branded && !anyChildHasContent && <GroupRunHandCue />}
          </button>
        </SourceTooltip>
        {batchVideoAvailability.visible && (
          <SourceTooltip
            label={batchVideoAvailability.reason || '批量生成视频'}
            disabled={batchVideoAvailability.enabled}
            delay={300}
          >
            <button
              type="button"
              disabled={
                unavailable ||
                !batchVideoAvailability.enabled ||
                typeof onBatchGenerateVideo !== 'function'
              }
              aria-disabled={!batchVideoAvailability.enabled}
              onClick={() => onBatchGenerateVideo?.(groupId)}
            >
              <SourceAssetIcon name="video-add" />
              <span>批量生成视频</span>
            </button>
          </SourceTooltip>
        )}
        {!linked && (
          <button
            type="button"
            disabled={unavailable || typeof onCreateWorkflow !== 'function'}
            onClick={() => onCreateWorkflow?.(groupId)}
          >
            <SourceAssetIcon name="icon-tool-box" />
            <span>{workflowUuid ? '更新工具箱' : '添加到工具箱'}</span>
          </button>
        )}
        {!linked && (
          <SourceTooltip
            label="组内须全部为图片节点"
            disabled={allChildrenAreImageNodes}
            delay={300}
          >
            <button
              type="button"
              disabled={unavailable || !allChildrenAreImageNodes || typeof onCommand !== 'function'}
              onClick={() => send({ type: 'convertToStoryboard' })}
            >
              <SourceAssetIcon name="icon-group-storyboard" />
              <span>转分镜组</span>
            </button>
          </SourceTooltip>
        )}
        <button
          type="button"
          disabled={unavailable || typeof onUngroup !== 'function'}
          onClick={() => onUngroup?.(groupId)}
        >
          <SourceAssetIcon name="icon-ungroup" />
          <span>解组</span>
        </button>
        <div className="cv-general-group-divider" aria-hidden="true" />
        {isDownloading ? (
          <button
            type="button"
            className="cv-general-group-zip-running"
            disabled={unavailable || typeof onCancelDownload !== 'function'}
            onClick={() => onCancelDownload?.(groupId)}
          >
            <Square size={16} />
            <span>
              停止下载 ({downloadProgress?.current ?? 0}/{downloadProgress?.total ?? 0})
            </span>
          </button>
        ) : (
          <SourceTooltip label={canDownload ? '批量下载' : '当前选区无可下载的资源'} delay={300}>
            <button
              type="button"
              aria-label="批量下载"
              className="cv-general-group-download"
              disabled={unavailable || !canDownload || typeof onDownload !== 'function'}
              onClick={() => onDownload?.(groupId)}
            >
              <SourceAssetIcon name="icon-download" />
            </button>
          </SourceTooltip>
        )}
      </div>
      <Menu
        popover={colorMenu}
        label="分组颜色选择"
        className="cv-general-group-color-menu"
        style={colorStyle}
      >
        {GENERAL_GROUP_COLORS.map((color) => (
          <button
            type="button"
            key={color}
            role="menuitem"
            aria-label={`分组颜色 ${color}`}
            aria-pressed={groupColor === color}
            style={{
              outline: groupColor === color ? `2px solid ${color}` : 'none',
              outlineOffset: 2,
            }}
            onClick={() =>
              send({ type: 'color', value: groupColor === color ? null : color }, colorMenu)
            }
          >
            <span style={{ background: color }} />
          </button>
        ))}
      </Menu>
      <Menu
        popover={layoutMenu}
        label="分组排列"
        className="cv-general-group-layout-menu"
        style={layoutStyle}
      >
        {GENERAL_GROUP_LAYOUTS.map((mode) => (
          <button
            type="button"
            key={mode}
            role="menuitem"
            onClick={() => send({ type: 'layout', mode }, layoutMenu)}
          >
            <SourceAssetIcon name={layoutPresentation[mode][1]} size={16} />
            <span>{layoutPresentation[mode][0]}</span>
          </button>
        ))}
      </Menu>
    </>,
    portal,
  );
}

function GroupRunHandCue() {
  return (
    <svg
      aria-hidden="true"
      className="cv-general-group-hand-cue"
      viewBox="0 0 19.2 19.2"
      fill="none"
    >
      <path d={handPaths[0]} fill="var(--scriptv2-run-group-hand-fill, #F7F7F7)" />
      <path d={handPaths[1]} fill="var(--scriptv2-run-group-hand-stroke, #111111)" />
    </svg>
  );
}
const handPaths = [
  'M16.7467 9.42909C16.7467 10.9446 16.1475 12.398 15.0809 13.4696C14.0143 14.5412 12.5676 15.1433 11.0592 15.1433H9.63746C7.64686 15.1433 6.43828 14.529 5.379 13.4719L2.81966 10.9005C2.57505 10.6283 2.444 10.2721 2.45362 9.90547C2.46324 9.53889 2.61281 9.19006 2.87136 8.93121C3.1299 8.67237 3.47762 8.52333 3.84252 8.51496C4.20742 8.50659 4.56155 8.63953 4.83158 8.88624L5.37182 9.42909V2.28636C5.37182 1.90748 5.52162 1.54413 5.78827 1.27622C6.05492 1.00832 6.41657 0.857813 6.79367 0.857813C7.17077 0.857813 7.53243 1.00832 7.79908 1.27622C8.06573 1.54413 8.21553 1.90748 8.21553 2.28636V5.85773C8.21553 5.47885 8.36533 5.11549 8.63198 4.84759C8.89863 4.57969 9.26028 4.42918 9.63738 4.42918C10.0145 4.42918 10.3761 4.57969 10.6428 4.84759C10.9094 5.11549 11.0592 5.47885 11.0592 5.85773V6.572C11.0592 6.19312 11.209 5.82977 11.4757 5.56186C11.7423 5.29396 12.104 5.14345 12.4811 5.14345C12.8582 5.14345 13.2198 5.29396 13.4865 5.56186C13.7531 5.82977 13.903 6.19312 13.903 6.572V7.28627C13.903 6.9074 14.0528 6.54404 14.3195 6.27614C14.5861 6.00823 14.9478 5.85773 15.3249 5.85773C15.702 5.85773 16.0636 6.00823 16.3303 6.27614C16.5969 6.54404 16.7467 6.9074 16.7467 7.28627L16.7467 9.42909Z',
  'M10.7184 6.57328V5.85845C10.7183 5.5706 10.6044 5.29442 10.4018 5.09088C10.2246 4.91299 9.9924 4.80341 9.74531 4.77866L9.63784 4.77281C9.35134 4.77288 9.07646 4.88734 8.87387 5.09088C8.67128 5.29442 8.55736 5.5706 8.55728 5.85845V6.57328C8.55713 6.76241 8.40478 6.91547 8.21654 6.91563C8.02817 6.91563 7.87511 6.7625 7.87496 6.57328V2.28764C7.87496 1.99976 7.76094 1.72367 7.55838 1.52007C7.35572 1.31646 7.081 1.202 6.79441 1.202C6.50781 1.202 6.23309 1.31646 6.03044 1.52007C5.82787 1.72367 5.71385 1.99976 5.71385 2.28764V9.28779L6.32453 9.90218L6.36868 9.95575C6.45608 10.0888 6.44111 10.2697 6.32453 10.3868C6.2078 10.5039 6.0279 10.5185 5.89547 10.4304L5.84215 10.3868L4.60247 9.14131L4.52249 9.07435C4.32977 8.92968 4.09348 8.85283 3.851 8.85839C3.57373 8.86476 3.30933 8.97814 3.11285 9.17479C2.91636 9.37152 2.80275 9.63697 2.79544 9.91557C2.7882 10.1919 2.88653 10.4602 3.06953 10.6664L5.62054 13.2294L5.80883 13.411C6.76015 14.2938 7.85786 14.8013 9.63784 14.8014H11.06C12.4779 14.8014 13.8381 14.2359 14.8407 13.2286C15.7806 12.2842 16.3339 11.0239 16.3994 9.69627L16.4061 9.43009V7.28727C16.4061 7.03525 16.3188 6.79244 16.1612 6.59922L16.0895 6.51971C15.9121 6.34151 15.6796 6.23128 15.4322 6.20665L15.3255 6.20163C15.039 6.20165 14.7642 6.31612 14.5616 6.51971C14.3842 6.69793 14.2745 6.93157 14.25 7.18013L14.245 7.28727L14.2383 7.35674C14.2064 7.51283 14.0682 7.63046 13.9034 7.63046C13.7151 7.63031 13.5627 7.47653 13.5627 7.28727V6.57328C13.5627 6.28546 13.4486 6.00929 13.2461 5.80571C13.0435 5.60217 12.7686 5.48771 12.4821 5.48764C12.1955 5.48764 11.9208 5.6021 11.7181 5.80571C11.5155 6.00932 11.4016 6.28533 11.4016 6.57328L11.3941 6.64191C11.3623 6.79821 11.2249 6.91563 11.06 6.91563C10.895 6.91563 10.7577 6.79821 10.7259 6.64191L10.7184 6.57328ZM8.55728 4.46059C8.86488 4.22055 9.24423 4.08733 9.63784 4.08727L9.81279 4.09564C10.2163 4.13598 10.5958 4.31565 10.885 4.60623C11.0712 4.79338 11.2096 5.01878 11.2966 5.26331C11.6204 4.9675 12.0425 4.80126 12.4821 4.80126C12.9495 4.80134 13.3979 4.98818 13.7285 5.32023C13.915 5.50769 14.053 5.73395 14.14 5.97898C14.4639 5.68268 14.8855 5.51611 15.3255 5.5161L15.4997 5.52447C15.9034 5.56469 16.2834 5.74433 16.5727 6.03506L16.6894 6.1648C16.9464 6.48 17.0884 6.87622 17.0884 7.28727V9.43009L17.0809 9.73059C17.007 11.2276 16.3829 12.6483 15.323 13.7132C14.1924 14.8491 12.6589 15.4869 11.06 15.4869H9.63784C7.55572 15.4868 6.26099 14.8354 5.139 13.7157L2.57883 11.1435L2.56716 11.131C2.26394 10.7935 2.10118 10.3517 2.11311 9.89716C2.12511 9.44269 2.31078 9.01022 2.63131 8.68931C2.95183 8.36845 3.38283 8.18331 3.83517 8.17286C4.27444 8.16278 4.70062 8.31913 5.03153 8.60812V2.28764C5.03153 1.81783 5.21741 1.36679 5.54806 1.03459C5.87868 0.702562 6.32693 0.515625 6.79441 0.515625C7.26188 0.515625 7.71013 0.702562 8.04075 1.03459C8.3714 1.36679 8.55728 1.81783 8.55728 2.28764V4.46059Z',
];
