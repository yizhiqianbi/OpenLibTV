import AlphaColorSetting from './AlphaColorSetting.jsx';
export default function SubtitleHighlightSettings({ style, disabled, owner, controller, label }) {
  const color = (name, field) => (
    <AlphaColorSetting
      key={field}
      label={name}
      ariaLabel={`${label}${name}`}
      value={style[field]}
      disabled={disabled}
      owner={owner}
      onInteractionStart={(options) => controller.onBeginTextStyle({ ...options, field })}
      onValueChange={controller.onPreviewTextStyle}
      onInteractionEnd={controller.onEndTextStyle}
      onInteractionCancel={controller.onCancelTextStyle}
    />
  );
  return (
    <div>
      <label className="cv-clip-subtitle-setting">
        <span>逐词高亮</span>
        <select
          aria-label={`${label}逐词高亮`}
          disabled={disabled}
          value={style.wordHighlightEnabled ? 'enabled' : 'disabled'}
          onChange={(event) =>
            controller.onEditText({
              fields: { wordHighlightEnabled: event.target.value === 'enabled' },
            })
          }
        >
          <option value="enabled">开启</option>
          <option value="disabled">关闭</option>
        </select>
      </label>
      {color('高亮文字', 'highlightTextColor')}
      {color('高亮背景', 'highlightBackgroundColor')}
    </div>
  );
}
