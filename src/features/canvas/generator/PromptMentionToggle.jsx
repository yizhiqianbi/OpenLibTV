import { CircleHelp } from 'lucide-react';
import { usePromptMentionPreference } from './usePromptMentionPreference.js';

export default function PromptMentionToggle({ disabled }) {
  const { enabled, setEnabled, error } = usePromptMentionPreference();
  return (
    <div className="cv-prompt-mention-preference">
      <label className="cv-generator-field cv-generator-switch">
        <span>
          智能引用 AutoLink{' '}
          <span
            title="自动匹配参考素材名称，一键 AutoLink，省去手动 @ 的麻烦"
            aria-label="自动匹配参考素材名称，一键 AutoLink，省去手动 @ 的麻烦"
            tabIndex={0}
          >
            <CircleHelp size={14} />
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label="智能引用 AutoLink"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
      </label>
      {error && <p role="status">偏好保存失败，请重试</p>}
    </div>
  );
}
