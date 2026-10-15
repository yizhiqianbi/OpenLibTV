import { LoadingManager } from 'three';

/** Decoder instances belong to a single parse; their workers and blob URLs are released in finally. */
export async function createStudioGltfLoader(json) {
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
    import('three/addons/loaders/GLTFLoader.js'),
    import('three/addons/libs/meshopt_decoder.module.js'),
  ]);
  const manager = new LoadingManager();
  const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
  let draco;
  if (
    [...(json.extensionsUsed || []), ...(json.extensionsRequired || [])].includes(
      'KHR_draco_mesh_compression',
    )
  ) {
    const [{ DRACOLoader }, javascript, wrapper, wasm] = await Promise.all([
      import('three/addons/loaders/DRACOLoader.js'),
      import('three/addons/libs/draco/gltf/draco_decoder.js?url'),
      import('three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url'),
      import('three/addons/libs/draco/gltf/draco_decoder.wasm?url'),
    ]);
    const decoderUrls = {
      'draco_decoder.js': javascript.default,
      'draco_wasm_wrapper.js': wrapper.default,
      'draco_decoder.wasm': wasm.default,
    };
    manager.setURLModifier((url) => decoderUrls[url.split('/').at(-1)] || url);
    draco = new DRACOLoader(manager)
      .setDecoderPath('/assets/animation-preview/draco/')
      .setWorkerLimit(2);
    loader.setDRACOLoader(draco);
  }
  return { loader, dispose: () => draco?.dispose() };
}
