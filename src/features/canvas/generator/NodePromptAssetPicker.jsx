import { lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../../../components/Icon.jsx';
import './node-prompt-asset-picker.css';

const AssetPicker = lazy(() => import('../../../components/agent/AgentAssetPicker.jsx'));

export default function NodePromptAssetPicker({ picker }) {
  if (!picker.open) return null;
  return createPortal(
    <Suspense fallback={<span role="status">加载资产库…</span>}>
      <AssetPicker
        title="引用资产"
        assetSource={picker.assetSource}
        getPreviewAsset={picker.getPreviewAsset}
        isAssetDisabled={picker.isAssetDisabled}
        onSelectDisabledAsset={picker.onSelectDisabledAsset}
        onClose={picker.close}
        onPickAssets={picker.pick}
        selectionFooter={({ selected, submitting, submit, onClose }) => {
          const segments = picker.getAssetCapacity?.(selected) || [];
          const limit = segments.every((segment) => segment.selected >= segment.max);
          const labels = { image: '图片', video: '视频', audio: '音频' };
          return (
            <>
              <span className={`node-prompt-asset-caption ${limit ? 'is-at-capacity' : ''}`}>
                <Icon name="image-more" size={20} />
                {segments.length <= 1
                  ? `已选择 ${selected.length} 项 / 上限 ${segments[0]?.max ?? 0} 项`
                  : segments
                      .map(
                        (segment) => `${labels[segment.kind]} ${segment.selected}/${segment.max}`,
                      )
                      .join(' · ')}
              </span>
              <span className="node-prompt-asset-actions">
                <button type="button" className="soft-button" onClick={onClose}>
                  取消
                </button>
                <button
                  type="button"
                  className="white-button"
                  disabled={submitting || !selected.length}
                  onClick={submit}
                >
                  确定引用
                </button>
              </span>
            </>
          );
        }}
      />
    </Suspense>,
    picker.portalTarget,
  );
}
