import { useState } from 'react';
import { EditorDialog } from '../../../components/EditorDialog.jsx';
import { storyboardRowKey, patchStoryboardRow } from './rows.js';
import { reconcileStoryboardPromptState } from './prompt-state.js';

export function StoryboardDialogueDialog({ controller, row, onClose }) {
  const [lines, setLines] = useState(() => (row.dialogueLines || []).map((line) => ({ ...line })));
  const change = (index, patch) =>
    setLines((values) =>
      values.map((line, position) => (position === index ? { ...line, ...patch } : line)),
    );
  return (
    <EditorDialog title={`镜头 ${row.shotNumber} 对白 / 旁白`} onClose={onClose}>
      <div className="cv-script-dialog-form">
        {lines.map((line, index) => (
          <div className="cv-script-dialogue-line" key={index}>
            <label>
              类型 {index + 1}
              <select
                value={line.kind || 'speech'}
                disabled={controller.disabled}
                onChange={(event) => change(index, { kind: event.target.value })}
              >
                <option value="speech">对白</option>
                <option value="voiceover">旁白</option>
              </select>
            </label>
            <label>
              角色 {index + 1}
              <select
                value={line.characterRef || ''}
                disabled={controller.disabled}
                onChange={(event) =>
                  change(index, { characterRef: event.target.value || undefined })
                }
              >
                <option value="">未指定角色</option>
                {(controller.data.assets?.characters || []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              内容 {index + 1}
              <textarea
                value={line.text || ''}
                readOnly={controller.disabled}
                onChange={(event) => change(index, { text: event.target.value })}
              />
            </label>
            <button
              type="button"
              disabled={controller.disabled}
              onClick={() =>
                setLines((values) => values.filter((_, position) => position !== index))
              }
            >
              删除第 {index + 1} 行
            </button>
          </div>
        ))}
        {!lines.length && <p>暂无对白或旁白</p>}
        <button
          type="button"
          disabled={controller.disabled}
          onClick={() => setLines((values) => [...values, { kind: 'speech', text: '' }])}
        >
          添加对白 / 旁白
        </button>
        {controller.error && <p role="alert">{controller.error}</p>}
        <div className="cv-storyboard-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            disabled={controller.disabled}
            onClick={async () => {
              if (
                await controller.edit(
                  storyboardRowKey(row, controller.rows.indexOf(row)),
                  'dialogueLines',
                  lines,
                )
              )
                onClose();
            }}
          >
            保存
          </button>
        </div>
      </div>
    </EditorDialog>
  );
}
export function StoryboardPromptDialog({ controller, row, onClose }) {
  const [image, setImage] = useState(row.imageGenerationPrompt || '');
  const [video, setVideo] = useState(row.videoMotionPrompt || '');
  const save = async () => {
    const key = storyboardRowKey(row, controller.rows.indexOf(row));
    const retainRefs = (refs, text) => refs?.filter((ref) => text.includes(ref.text));
    const patch = {
      imageGenerationPrompt: image,
      videoMotionPrompt: video,
      imagePromptState: image.trim() ? 'synced' : 'none',
      videoPromptState: video.trim() ? 'synced' : 'none',
      finalImagePromptEntityRefs: retainRefs(row.finalImagePromptEntityRefs, image),
      finalVideoPromptEntityRefs: retainRefs(row.finalVideoPromptEntityRefs, video),
    };
    if (
      await controller.apply({
        rows: reconcileStoryboardPromptState(
          controller.rows,
          patchStoryboardRow(controller.rows, key, patch),
        ),
      })
    )
      onClose();
  };
  return (
    <EditorDialog title={`镜头 ${row.shotNumber} 提示词`} onClose={onClose} wide>
      <div className="cv-script-dialog-form cv-script-prompts">
        <label>
          分镜提示词
          <textarea
            value={image}
            readOnly={controller.disabled}
            onChange={(event) => setImage(event.target.value)}
          />
        </label>
        <label>
          视频提示词
          <textarea
            value={video}
            readOnly={controller.disabled}
            onChange={(event) => setVideo(event.target.value)}
          />
        </label>
        <p>可手动编辑并保存提示词。AI 合成与重算服务尚未连接，未提交任务。</p>
        {controller.error && <p role="alert">{controller.error}</p>}
        <div className="cv-storyboard-actions">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="button" disabled={controller.disabled} onClick={save}>
            保存
          </button>
        </div>
      </div>
    </EditorDialog>
  );
}
