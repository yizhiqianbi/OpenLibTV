import { useId, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, CircleHelp } from 'lucide-react';
import { useAgentToolbarPopover } from '../../../hooks/useAgentToolbarPopover.js';
import {
  countOptions,
  enumOptions,
  evaluateGeneratorRules,
  fieldGroups,
  generatorValues,
  resolveGeneratorParams,
  storeKey,
  visibleProperty,
} from './schema.js';
import GeneratorNumericSetting from './GeneratorNumericSetting.jsx';
import VoiceBar from './voices/VoiceBar.jsx';
import { voiceSelectionPatch } from './voices/model.ts';
import './generator-settings.css';
import PromptMentionToggle from './PromptMentionToggle.jsx';

// eM's embedded parameters open bottom-start; the shared hook still owns dismissal.
function useEmbeddedPopoverPosition(menu, enabled) {
  const { open, triggerRef, popoverRef } = menu;
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    if (!enabled || !open) return;
    let frame,
      alive = true;
    const place = () => {
      if (!alive) return;
      const anchor = triggerRef.current?.getBoundingClientRect();
      const panel = popoverRef.current?.getBoundingClientRect();
      if (!anchor || !panel) return;
      const width = Math.min(340, Math.max(1, window.innerWidth - 16));
      const below = Math.max(0, window.innerHeight - anchor.bottom - 8);
      const above = Math.max(0, anchor.top - 8);
      const height = Math.min(panel.height || 600, 600);
      const useBelow = below >= height || below >= above;
      const availableHeight = useBelow ? below : above;
      setPosition({
        position: 'fixed',
        left: Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8)),
        top: useBelow ? anchor.bottom : Math.max(8, anchor.top - Math.min(height, availableHeight)),
        width,
        maxHeight: Math.min(600, availableHeight),
        zIndex: 1100,
      });
    };
    const schedule = () => {
      if (!alive) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    if (triggerRef.current) observer?.observe(triggerRef.current);
    if (popoverRef.current) observer?.observe(popoverRef.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [enabled, open, triggerRef, popoverRef]);
  return enabled && position ? position : menu.popoverStyle;
}

function Field({
  field,
  property,
  value,
  values,
  rule,
  advanced,
  voiceControl,
  disabled,
  onChange,
}) {
  const id = useId();
  if (
    !property?.component ||
    property.enable === false ||
    property.barOnly ||
    !visibleProperty(property, values)
  )
    return null;
  const label = property.displayName || field;
  const options = enumOptions(property);
  const effective = { ...property, ...rule.overrides[field] };
  const title = rule.messages[field] || property.tips;
  if (property.component === 'slider')
    return (
      <GeneratorNumericSetting
        {...{ label, title, advanced, disabled, onChange }}
        value={Number.isFinite(Number(value)) ? Number(value) : (property.default ?? 0)}
        property={effective}
      />
    );
  return (
    <div className={'cv-generator-field cv-generator-' + property.component}>
      <div className="cv-generator-label">
        <label htmlFor={id}>{label}</label>
        {title && (
          <span title={title} aria-label={title} tabIndex={0}>
            <CircleHelp size={13} />
          </span>
        )}
      </div>
      {property.component === 'switch' ? (
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={!!value}
          disabled={disabled}
          onChange={(event) => onChange(+event.target.checked)}
        />
      ) : property.component === 'input' ? (
        <input
          id={id}
          value={value ?? ''}
          disabled={disabled}
          placeholder={property.placeholder || ''}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : property.component === 'singleSelect' && options.length ? (
        <select
          id={id}
          value={options.findIndex((option) => option.value === value)}
          disabled={disabled}
          onChange={(event) => onChange(options[Number(event.target.value)].value)}
        >
          {options.map((option, index) => (
            <option key={index} value={index} disabled={rule.disabled[field]?.has(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      ) : property.component === 'voiceCard' ? (
        voiceControl
      ) : options.length ? (
        <div
          className={
            'cv-generator-options' + (field.startsWith('ratio') ? ' cv-generator-ratios' : '')
          }
          role="group"
          aria-label={label}
          style={{ '--columns': Math.min(3, options.length) }}
        >
          {options.map((option, index) => (
            <button
              key={index}
              type="button"
              disabled={disabled || rule.disabled[field]?.has(option.value)}
              title={rule.disabled[field]?.has(option.value) ? title : undefined}
              aria-pressed={option.value === value}
              onClick={() => onChange(option.value)}
            >
              {field.startsWith('ratio') && (
                <span
                  className="cv-generator-ratio-icon"
                  style={{
                    aspectRatio: /^\d+:\d+$/.test(String(option.value))
                      ? String(option.value).replace(':', '/')
                      : '1',
                  }}
                />
              )}
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="cv-generator-unavailable">此参数需要连接运营选项服务</p>
      )}
    </div>
  );
}

export default function GeneratorSettings({
  params,
  schema,
  type,
  inputCounts,
  locks = {},
  voiceSource,
  disabled,
  onChange,
  countUnit,
  portalTarget,
  embedAdvancedSettings = false,
  embedAdvancedSettingsBatchOnly = false,
  suppressCount = false,
  hidePromptMentionToggle = false,
}) {
  // eM selects video modes by key presence, including zero-capacity modes.
  const normalizationSchema =
    embedAdvancedSettings &&
    params?.modeType &&
    Object.hasOwn(schema?.properties?.modeType?.items || {}, params.modeType)
      ? {
          ...schema,
          config: {
            ...schema.config,
            textModes: [...(schema.config?.textModes || []), params.modeType],
          },
        }
      : schema;
  const normalized = resolveGeneratorParams(params, normalizationSchema, type, inputCounts);
  const resolved = { ...normalized, settings: { ...normalized.settings, ...locks.settingsPatch } };
  const values = generatorValues(resolved, schema);
  const rule = evaluateGeneratorRules(schema, values, resolved.modeType, inputCounts);
  const menu = useAgentToolbarPopover({ width: 340, maxHeight: 600, offset: 0, disabled });
  const popoverPosition = useEmbeddedPopoverPosition(menu, embedAdvancedSettings);
  const change = (section, field, value) =>
    onChange(
      resolveGeneratorParams(
        {
          ...resolved,
          [section]: { ...resolved[section], [storeKey(field, schema.properties[field])]: value },
        },
        normalizationSchema,
        type,
        inputCounts,
      ),
    );
  const groups = (section) =>
    fieldGroups(schema?.config?.[section], resolved.modeType)
      .map((group) => ({
        ...group,
        fields: group.fields.filter((field) => {
          if (section !== 'advancedSettings') return true;
          const property = schema?.properties?.[field];
          if (embedAdvancedSettingsBatchOnly && property?.batch !== true) return false;
          return (
            !embedAdvancedSettings ||
            (property?.enable !== false &&
              !property?.barOnly &&
              !locks.hiddenKeys?.includes(field) &&
              visibleProperty(property, values))
          );
        }),
      }))
      .filter((group) => group.fields.length);
  const renderVoice = (field, section) => {
    const property = schema.properties[field];
    const key = storeKey(field, property);
    return (
      <VoiceBar
        key={field}
        value={resolved[section]?.[key]}
        meta={resolved[section]?.[`_${key}_meta`]}
        source={voiceSource}
        disabled={disabled || locks.lockedKeys?.includes(field)}
        onChange={(metadata) =>
          onChange(
            resolveGeneratorParams(
              {
                ...resolved,
                [section]: { ...resolved[section], ...voiceSelectionPatch(property, metadata) },
              },
              normalizationSchema,
              type,
              inputCounts,
            ),
          )
        }
      />
    );
  };
  const renderGroup = (group, section, index) => {
    const body = group.fields
      .filter((field) => !locks.hiddenKeys?.includes(field))
      .map((field) => (
        <Field
          key={field}
          field={field}
          property={schema.properties[field]}
          value={values[field]}
          values={values}
          rule={rule}
          voiceControl={
            schema.properties[field]?.component === 'voiceCard' ? renderVoice(field, section) : null
          }
          advanced={section === 'advancedSettings'}
          disabled={disabled || locks.lockedKeys?.includes(field)}
          onChange={(value) => change(section, field, value)}
        />
      ));
    return group.groupKey && group.collapsible ? (
      <details key={group.groupKey} open={!group.defaultCollapsed}>
        <summary>{group.displayName || group.groupKey}</summary>
        {section === 'advancedSettings' && index === 0 && (
          <button
            type="button"
            className="cv-generator-reset"
            disabled={disabled || locks.lockedKeys?.length > 0}
            onClick={() => {
              const advancedSettings = {};
              if (embedAdvancedSettings) {
                Object.assign(advancedSettings, resolved.advancedSettings);
                for (const field of groups('advancedSettings').flatMap((item) => item.fields)) {
                  const property = schema.properties[field];
                  const key = storeKey(field, property);
                  delete advancedSettings[key];
                  if (property?.component === 'voiceCard') delete advancedSettings[`_${key}_meta`];
                }
              }
              onChange(
                resolveGeneratorParams(
                  { ...resolved, advancedSettings },
                  normalizationSchema,
                  type,
                  inputCounts,
                ),
              );
            }}
          >
            一键重置
          </button>
        )}
        {body}
      </details>
    ) : (
      <div key={group.groupKey || index}>
        {group.displayName && <h4>{group.displayName}</h4>}
        {body}
      </div>
    );
  };
  const voiceFields = groups('advancedSettings')
    .flatMap((group) => group.fields)
    .filter((field) => {
      const property = schema?.properties?.[field];
      return (
        property?.component === 'voiceCard' &&
        property.barOnly &&
        property.enable !== false &&
        visibleProperty(property, values) &&
        !locks.hiddenKeys?.includes(field)
      );
    });
  const counts = countOptions(schema);
  const settingFields = groups('settings').flatMap((group) => group.fields);
  const summaryFields = embedAdvancedSettings
    ? [
        settingFields.find((field) => field.startsWith('ratio')),
        settingFields.find((field) => field === 'quality'),
        settingFields.find((field) => field.startsWith('resolution')),
        settingFields.find((field) => field.startsWith('duration')),
        settingFields.find((field) => field === 'enableSound'),
      ].filter(Boolean)
    : settingFields;
  const autoRatio = summaryFields.some(
    (field) => field.startsWith('ratio') && String(values[field]).toLowerCase() === 'auto',
  );
  const summary = summaryFields
    .filter((field) => schema?.properties?.[field] && values[field] !== undefined)
    .filter(
      (field) =>
        !embedAdvancedSettings ||
        (!(
          field.startsWith('resolution') &&
          autoRatio &&
          String(values[field]).toLowerCase() === 'auto'
        ) &&
          (!field.startsWith('duration') ||
            (Number.isInteger(values[field]) && values[field] > 0))),
    )
    .map((field) =>
      embedAdvancedSettings && field === 'enableSound'
        ? values[field] === 'on'
          ? 'on'
          : 'off'
        : (enumOptions(schema.properties[field]).find((option) => option.value === values[field])
            ?.label ?? `${values[field]}${field.startsWith('duration') ? 's' : ''}`),
    )
    .join(' · ');
  if (!schema) return null;
  return (
    <div className="cv-generator-settings">
      <button
        type="button"
        ref={menu.triggerRef}
        {...menu.triggerProps}
        aria-haspopup="dialog"
        aria-label="生成参数"
        disabled={disabled}
        className="cv-generator-trigger"
      >
        <span>
          {summary || '生成参数'}
          {!suppressCount && counts.length
            ? ` · ${resolved.count}${countUnit || (type === 'image' ? '张' : '个')}`
            : ''}
        </span>
        <ChevronDown size={14} />
      </button>
      {voiceFields.map((field) => renderVoice(field, 'advancedSettings'))}
      {menu.open &&
        createPortal(
          <div
            ref={menu.popoverRef}
            {...menu.popoverProps}
            role="dialog"
            aria-label="生成参数"
            className="cv-generator-popover"
            style={popoverPosition}
          >
            {groups('settings').map((group, index) => renderGroup(group, 'settings', index))}
            {!hidePromptMentionToggle && ['image', 'video'].includes(type) && (
              <PromptMentionToggle disabled={disabled} />
            )}
            {groups('advancedSettings').some((group) => group.fields.length) &&
              (embedAdvancedSettings ? (
                <section className="cv-generator-embedded-advanced" aria-label="高级设置">
                  <h3>高级设置</h3>
                  {groups('advancedSettings').map((group, index) =>
                    renderGroup(group, 'advancedSettings', index),
                  )}
                </section>
              ) : (
                <details className="cv-generator-advanced">
                  <summary>高级设置</summary>
                  {groups('advancedSettings').map((group, index) =>
                    renderGroup(group, 'advancedSettings', index),
                  )}
                </details>
              ))}
            {!suppressCount && counts.length > 0 && (
              <Field
                field="count"
                property={{ displayName: '数量', component: 'singleButton', enum: counts }}
                value={resolved.count}
                values={values}
                rule={{
                  ...rule,
                  disabled: {
                    count:
                      locks.forceSingleCount || resolved.modeType === 'longVideo2video'
                        ? new Set(counts.filter((value) => value !== 1))
                        : null,
                  },
                }}
                disabled={disabled}
                onChange={(count) => onChange({ ...resolved, count })}
              />
            )}
          </div>,
          portalTarget?.() ||
            menu.triggerRef.current?.closest('[aria-modal="true"]') ||
            document.body,
        )}
    </div>
  );
}
