import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../../../../components/Modal.jsx';
import { emptyVoiceFilters } from './model.ts';

function FilterSelect({ label, value, options, onChange, disabled }) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleOptions = (options || []).filter((option) => {
    if (!normalizedQuery) return true;
    return `${option.label} ${option.value}`.toLocaleLowerCase().includes(normalizedQuery);
  });
  const selectedOption = (options || []).find((option) => option.value === value);
  const filteredOptions =
    selectedOption && !visibleOptions.some((option) => option.value === selectedOption.value)
      ? [selectedOption, ...visibleOptions]
      : visibleOptions;

  // A new parent selection (for example, changing language resets accent) starts
  // a fresh searchable field instead of retaining a query for an old option set.
  useEffect(() => setQuery(''), [disabled, value]);

  return (
    <label className="cv-voice-filter-field">
      <span>{label}</span>
      <span className="cv-voice-filter-search">
        <input
          type="search"
          aria-label={`搜索${label}`}
          placeholder={`搜索${label}`}
          value={query}
          disabled={disabled || !options?.length}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            aria-label={`清除${label}搜索`}
            disabled={disabled}
            onClick={() => setQuery('')}
          >
            ×
          </button>
        )}
      </span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {!filteredOptions.some((option) => option.value === '') && <option value="">全部</option>}
        {!filteredOptions.length && (
          <option value="" disabled>
            无匹配选项
          </option>
        )}
        {filteredOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
export default function VoiceFilterDialog({ filters, options, onClose, onApply }) {
  const [draft, setDraft] = useState(() => ({ ...filters, ageGroup: [...filters.ageGroup] }));
  return createPortal(
    <Modal title="语音过滤器" className="cv-voice-filter-dialog" onClose={onClose}>
      <h2>语音过滤器</h2>
      <div className="cv-voice-filter-grid">
        <FilterSelect
          label="语言"
          options={options.languages}
          value={draft.language}
          onChange={(language) => setDraft((old) => ({ ...old, language, accent: '' }))}
        />
        <FilterSelect
          label="口音"
          options={options.accents[draft.language] || []}
          value={draft.accent}
          disabled={!draft.language}
          onChange={(accent) => setDraft((old) => ({ ...old, accent }))}
        />
        <FilterSelect
          label="性别"
          options={options.genders}
          value={draft.gender}
          onChange={(gender) => setDraft((old) => ({ ...old, gender }))}
        />
        <fieldset className="cv-voice-age">
          <legend>年龄</legend>
          <div>
            {options.ageGroups.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={draft.ageGroup.includes(option.value)}
                onClick={() =>
                  setDraft((old) => ({
                    ...old,
                    ageGroup: old.ageGroup.includes(option.value)
                      ? old.ageGroup.filter((v) => v !== option.value)
                      : [...old.ageGroup, option.value],
                  }))
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <footer>
        <button type="button" onClick={() => setDraft(emptyVoiceFilters())}>
          重置过滤器
        </button>
        <button
          className="cv-voice-primary"
          type="button"
          onClick={() => {
            onApply(draft);
            onClose();
          }}
        >
          筛选
        </button>
      </footer>
    </Modal>,
    document.body,
  );
}
