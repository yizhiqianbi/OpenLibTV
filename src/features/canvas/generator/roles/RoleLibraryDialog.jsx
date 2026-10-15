import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { DialogFocusBoundary } from '../../../../components/DialogFocusBoundary.jsx';
import { useDialogBehavior } from '../../../../hooks/useDialogBehavior.js';
import {
  readRoleLibraryTab,
  unavailableRoleLibrarySource,
  writeRoleLibraryTab,
} from '../../../../services/canvas-role-library.ts';
import PublicCharacterLibrary from './PublicCharacterLibrary.jsx';
import ComplianceAssetLibrary from './ComplianceAssetLibrary.jsx';
import { identityRoleAsset } from './RoleLibraryChrome.jsx';

const sourceScopes = new WeakMap();
let nextScope = 0;
const scopeId = (scope) => {
  if (!sourceScopes.has(scope)) sourceScopes.set(scope, ++nextScope);
  return sourceScopes.get(scope);
};

export default function RoleLibraryDialog({
  source = unavailableRoleLibrarySource,
  context,
  onConfirm,
  onClose,
  asset = identityRoleAsset,
  ownerKey,
  onNotice,
}) {
  const ref = useRef(null);
  const [tab, setTab] = useState(() => readRoleLibraryTab(context.seedanceTabVisible));
  useDialogBehavior(ref, { onClose });
  const activeTab = context.seedanceTabVisible ? tab : 'public';
  const branchKey = `${scopeId(source)}:${ownerKey && typeof ownerKey === 'object' ? scopeId(ownerKey) : (ownerKey ?? '')}`;
  const switchTab = (value) => {
    setTab(value);
    writeRoleLibraryTab(value, context.seedanceTabVisible);
  };
  return createPortal(
    <div
      className="cv-role-overlay nopan"
      data-role-library-modal=""
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <section
        className={`cv-role-dialog ${context.theme === 'light' ? 'cv-role-light' : ''}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="角色库"
        tabIndex={-1}
      >
        <DialogFocusBoundary edge="start" />
        <header>
          <div className="cv-role-tabs" role="tablist" aria-label="角色库分类">
            <button
              role="tab"
              aria-selected={activeTab === 'public'}
              onClick={() => switchTab('public')}
            >
              公共角色库
            </button>
            {context.seedanceTabVisible && (
              <button
                role="tab"
                aria-selected={activeTab === 'seedance'}
                onClick={() => switchTab('seedance')}
              >
                Seedance、Seedance 2.5 合规素材库
              </button>
            )}
          </div>
          <button className="cv-role-close" aria-label="关闭角色库" onClick={onClose}>
            <X size={10} />
          </button>
        </header>
        {activeTab === 'public' ? (
          <PublicCharacterLibrary
            key={branchKey}
            source={source}
            context={context}
            onConfirm={onConfirm}
            onClose={onClose}
            asset={asset}
            onNotice={onNotice}
          />
        ) : (
          <ComplianceAssetLibrary
            key={branchKey}
            source={source}
            context={context}
            onConfirm={onConfirm}
            onClose={onClose}
            asset={asset}
          />
        )}
        <DialogFocusBoundary edge="end" />
      </section>
    </div>,
    document.body,
  );
}
