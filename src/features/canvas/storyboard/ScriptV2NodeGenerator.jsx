import { useLayoutEffect, useRef } from 'react';
import GeneratorFrame from '../generator/GeneratorFrame.jsx';
import { useScriptV2Generator } from './useScriptV2Generator.js';
import ScriptV2GeneratorView from './ScriptV2GeneratorView.jsx';
import '../generator/inline-generator.css';

/** The dedicated ScriptV2 workspace shares frame and input infrastructure, not text defaults. */
export default function ScriptV2NodeGenerator(props) {
  const {
    node,
    documentKey,
    registerDraft,
    getDocument,
    readonly,
    ready,
    position,
    coordinateOrigin,
    zoom,
    view,
    board,
    asset,
    onPreview,
    onFocusReference,
  } = props;
  const promptRef = useRef(null),
    latest = useRef(null);
  const controller = useScriptV2Generator(props);
  const blocked = readonly || !ready || controller.catalogStatus !== 'ready';
  latest.current = { node, documentKey, getDocument, blocked };
  useLayoutEffect(() => {
    const input = promptRef.current;
    const release = registerDraft?.(
      documentKey,
      node.id,
      () => {
        const value = latest.current;
        const graph = value.getDocument?.();
        return {
          basePrompt: value.node.data.params?.prompt ?? '',
          value: promptRef.current?.getValue(),
          writable:
            !value.blocked &&
            (!graph ||
              (graph.documentKey === documentKey &&
                graph.ready &&
                !graph.readonly &&
                graph.nodes.some((item) => item.id === node.id && item.type === 'script-v2'))),
        };
      },
      'script-generator',
      (value) => promptRef.current?.acceptCommittedValue?.(value),
    );
    return () => {
      release?.();
      input?.cancelPending();
    };
  }, [documentKey, node.id, registerDraft]);
  const withDraft = (action) => {
    const accepted = action(promptRef.current?.getValue());
    if (accepted) promptRef.current?.cancelPending();
    return accepted;
  };
  return (
    <div
      className="cv-script-generator-host"
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if ((event.code === 'Space' || event.key === ' ') && event.target.closest('button'))
          event.stopPropagation();
      }}
    >
      <GeneratorFrame
        label={`${node.data.name || node.data.title || '脚本'}生成器`}
        readonly={readonly}
        ready={ready}
        expandedSize={{
          width: node.data.expandedGeneratorWidth,
          height: node.data.expandedGeneratorHeight,
        }}
        onBeforeTransition={() => {
          const value = promptRef.current?.getValue();
          if (
            typeof value !== 'string' ||
            value === (latest.current.node.data.params?.prompt ?? '')
          )
            return true;
          return withDraft((prompt) => controller.changeParams({ prompt }));
        }}
        onExpandedSizeChange={controller.changeExpandedSize}
        placement={{
          node,
          position,
          coordinateOrigin,
          zoom,
          view,
          board,
          documentKey,
          kind: 'script',
        }}
      >
        {({ expanded, portalTarget }) => (
          <ScriptV2GeneratorView
            projection={controller.projection}
            readonly={readonly}
            ready={ready}
            expanded={expanded}
            promptRef={promptRef}
            sessionKey={`${documentKey}:${node.id}`}
            portalTarget={portalTarget}
            asset={asset}
            catalogStatus={controller.catalogStatus}
            error={controller.error}
            pendingSave={controller.pendingSave}
            onRetrySave={controller.retrySave}
            onRetryCatalog={controller.reload}
            onPromptChange={(value) => controller.changeParams({ prompt: value })}
            onModelChange={(key) =>
              withDraft((prompt) => controller.changeParams({ model: key }, prompt))
            }
            onReferenceDelete={(id) =>
              withDraft((prompt) => controller.removeReference(id, prompt))
            }
            onReferenceReorder={(type, order) =>
              withDraft((prompt) => controller.reorder(type, order, prompt))
            }
            onReferencePreview={onPreview}
            onReferenceFocus={onFocusReference}
            onSubmit={() => withDraft((prompt) => controller.submit(prompt))}
            onAddReference={
              props.onAddScriptReference
                ? (kind) =>
                    props.onAddScriptReference(node.id, kind, {
                      onComplete: () => {
                        if (latest.current.documentKey === documentKey && promptRef.current)
                          promptRef.current.focus();
                      },
                    })
                : undefined
            }
          />
        )}
      </GeneratorFrame>
    </div>
  );
}
