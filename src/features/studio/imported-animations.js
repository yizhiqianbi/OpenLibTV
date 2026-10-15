import * as THREE from 'three';
import { animationMetadata } from './animation-model.js';

/** One imported scene owns its mixer and bindings, separate from the editor's wrapper transform. */
export function createImportedAnimations(scene) {
  const clips = (scene.animations || []).map((clip) => {
    const copy = clip.clone();
    for (const track of copy.tracks) {
      const binding = THREE.PropertyBinding.parseTrackName(track.name);
      const node = THREE.PropertyBinding.findNode(scene, binding.nodeName);
      if (node && binding.nodeName)
        track.name = node.uuid + track.name.slice(binding.nodeName.length);
    }
    return copy;
  });
  if (!clips.length) return null;
  const mixer = new THREE.AnimationMixer(scene);
  let selection;
  let actions = [];
  let disposed = false;
  return {
    metadata: animationMetadata(clips),
    seek(time, nextSelection = null) {
      if (disposed) return;
      if (selection !== nextSelection) {
        mixer.stopAllAction();
        selection = nextSelection;
        actions = clips
          .filter((_, index) => nextSelection === null || index === nextSelection)
          .map((clip) => mixer.clipAction(clip).reset().play());
      }
      for (const action of actions) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.enabled = true;
        action.paused = false;
        action.time = Math.max(0, Math.min(time, action.getClip().duration));
      }
      mixer.update(0);
    },
    exportClips() {
      // Multiple imports can contain identical node names. UUID bindings keep each export
      // track attached to its own original node instead of the first matching name.
      // A deleted imported subtree is detached from `scene`; omit its tracks so
      // export cannot retain animation channels targeting a missing node.
      return clips
        .map((clip) => {
          const copy = clip.clone();
          copy.tracks = copy.tracks.filter((track) => {
            const binding = THREE.PropertyBinding.parseTrackName(track.name);
            return Boolean(THREE.PropertyBinding.findNode(scene, binding.nodeName));
          });
          return copy;
        })
        .filter((clip) => clip.tracks.length > 0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      actions = [];
    },
  };
}
