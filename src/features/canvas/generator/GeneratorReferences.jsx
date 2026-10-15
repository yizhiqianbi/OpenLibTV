import { useRef } from 'react';
import { Image as ImageIcon, Music2, Play, X } from 'lucide-react';
import { NODE_PROMPT_REFERENCE_MIME } from './node-prompt-model.js';

export default function GeneratorReferences({
  references,
  mixed,
  asset,
  blocked,
  onInsert,
  onDelete,
  onReorder,
  onPreview,
  onFocus,
}) {
  const dragging = useRef(null);
  const visible = mixed
    ? references.mixedList
    : [...references.imageList, ...references.videoList, ...references.audioList];
  if (!visible.length) return null;
  return (
    <div className="cv-inline-references" aria-label="生成参考素材">
      {visible.map((reference, index) => {
        const key = reference.nodeId || reference.url;
        const listType = mixed ? 'mixedList' : reference.mediaType + 'List';
        const list = references[listType],
          listIndex = list.findIndex((item) => (item.nodeId || item.url) === key);
        const url = asset?.(reference.url) || reference.url;
        return (
          <div
            key={key}
            className="cv-inline-reference"
            draggable={!blocked}
            onDragStart={(event) => {
              dragging.current = { key, listType };
              event.dataTransfer.effectAllowed = 'copyMove';
              event.dataTransfer.setData(
                NODE_PROMPT_REFERENCE_MIME,
                JSON.stringify({ listType, index: listIndex }),
              );
            }}
            onDragEnd={() => {
              dragging.current = null;
            }}
            onDragOver={(event) => {
              if (!blocked && dragging.current?.listType === listType) {
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            onDrop={(event) => {
              if (blocked || dragging.current?.listType !== listType) return;
              event.preventDefault();
              event.stopPropagation();
              const order = list.map((item) => item.nodeId || item.url);
              const from = order.indexOf(dragging.current.key),
                to = order.indexOf(key);
              dragging.current = null;
              if (from < 0 || to < 0 || from === to) return;
              order.splice(to, 0, ...order.splice(from, 1));
              onReorder?.(listType, order);
            }}
          >
            <button
              type="button"
              aria-label={`预览参考素材 ${index + 1}`}
              title={reference.label || `参考素材 ${index + 1}`}
              onClick={() =>
                onPreview?.({
                  id: reference.nodeId,
                  type: reference.mediaType,
                  data: { name: reference.label || '参考素材', url: [reference.url] },
                })
              }
              onDoubleClick={() => onFocus?.(reference.nodeId)}
            >
              {reference.mediaType === 'image' ? (
                <img src={url} alt={reference.label || ''} />
              ) : reference.mediaType === 'video' ? (
                <>
                  <video src={url} muted preload="metadata" />
                  <Play className="cv-inline-reference-play" size={10} />
                </>
              ) : reference.mediaType === 'audio' ? (
                <Music2 size={22} />
              ) : (
                <ImageIcon size={22} />
              )}
              <span className="cv-inline-reference-index">{index + 1}</span>
            </button>
            {!blocked && (
              <>
                <button
                  type="button"
                  className="cv-inline-delete-ref"
                  aria-label={`删除参考素材 ${index + 1}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onDelete?.(key)}
                >
                  <X size={7} />
                </button>
                <button
                  type="button"
                  className="cv-inline-insert-ref"
                  aria-label={`引用参考素材 ${index + 1}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onInsert?.({ listType, index: listIndex })}
                >
                  @
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
