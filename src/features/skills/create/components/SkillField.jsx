import React, { useState } from 'react';

function SkillField({ field, form, setField, error, t }) {
  const [focused, setFocused] = useState(false),
    [name, label, placeholder, max] = field,
    multiline = max === 200;
  return (
    <label className="secondary-skill-field">
      <span>
        {t[label]} <b>*</b>
      </span>
      <div
        className={`secondary-skill-input ${error ? 'invalid' : ''} ${multiline ? 'multiline' : ''}`}
      >
        {multiline ? (
          <textarea
            rows={3}
            value={form[name]}
            maxLength={max}
            placeholder={t[placeholder]}
            onChange={(e) => setField(name, e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        ) : (
          <input
            value={form[name]}
            maxLength={max}
            placeholder={t[placeholder]}
            onChange={(e) => setField(name, e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
        )}
        <small className={focused ? 'visible' : ''}>
          {form[name].length}/{max}
        </small>
      </div>
      {error && <small className="secondary-skill-error">{error}</small>}
    </label>
  );
}

export default SkillField;
