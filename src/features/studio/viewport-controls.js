export function applyViewportSelection(runtime, { selected, mode }) {
  if (!runtime) return;
  runtime.selectionController?.setSelection(selected);
  const object = runtime.entities.get(selected);
  const property = { translate: 'position', rotate: 'rotation', scale: 'scale' }[mode];
  if (object && mode !== 'select' && !object.userData.studioAnimatedProperties?.includes(property))
    runtime.transform.attach(object);
  else runtime.transform.detach();
  if (mode !== 'select') runtime.transform.setMode(mode);
}

/** TransformControls owns its helper resources; the scene only borrows that subtree. */
export function disposeViewportTransformControls(transform, helper) {
  helper.removeFromParent();
  transform.dispose();
}
