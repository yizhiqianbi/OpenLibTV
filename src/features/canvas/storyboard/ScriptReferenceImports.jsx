import { useEffect, useState } from 'react';
import Modal from '../../../components/Modal.jsx';
import { SCRIPT_V2_REFERENCE_IMAGE_ACCEPT } from './script-reference-import-model.js';
import './script-reference-imports.css';

function LocalReferenceAssetPicker({ controller, request }) {
  const [attempt, setAttempt] = useState(0),
    [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    setResult(null);
    import('../../../components/agent/AgentAssetPicker.jsx').then(
      (module) => active && setResult({ Component: module.default }),
      (error) => active && setResult({ error }),
    );
    return () => {
      active = false;
    };
  }, [request, attempt]);
  if (!result?.Component)
    return (
      <Modal title="个人资产库" onClose={controller.closePicker}>
        {result?.error ? (
          <>
            <p role="alert">资产选择器加载失败，请重试。</p>
            <button onClick={() => setAttempt((value) => value + 1)}>重试加载资产库</button>
          </>
        ) : (
          <p role="status">正在加载个人资产库…</p>
        )}
      </Modal>
    );
  const Picker = result.Component;
  return (
    <Picker
      title="个人资产库"
      scope="personal"
      assetSource={null}
      onClose={controller.closePicker}
      onPickAssets={controller.pickAssets}
      isAssetDisabled={controller.isAssetDisabled}
    />
  );
}

export default function ScriptReferenceImports({ controller }) {
  return (
    <>
      <input
        ref={controller.fileInput}
        hidden
        type="file"
        multiple
        accept={SCRIPT_V2_REFERENCE_IMAGE_ACCEPT}
        aria-label="上传脚本参考图"
        onCancel={controller.cancelChooser}
        onChange={(event) => {
          controller.addFiles(event.target.files);
          event.target.value = '';
        }}
      />
      {controller.picker && (
        <LocalReferenceAssetPicker
          key={`${controller.picker.owner.documentKey}:${controller.picker.targetId}`}
          request={controller.picker}
          controller={controller}
        />
      )}
      {(controller.state.reading || controller.state.errors.length > 0) && (
        <aside
          className="cv-script-reference-import-status cv-floating"
          aria-label="参考图读取状态"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {controller.state.reading && <p role="status">正在读取参考图…</p>}
          {controller.state.errors.map((entry) => (
            <p role="alert" key={entry.id}>
              {entry.file.name}：{entry.error}
            </p>
          ))}
          {controller.state.errors.length > 0 && (
            <button disabled={controller.state.reading} onClick={controller.retry}>
              重试读取失败图片
            </button>
          )}
          <button onClick={controller.dismiss}>
            {controller.state.reading ? '取消读取' : '关闭'}
          </button>
        </aside>
      )}
    </>
  );
}
