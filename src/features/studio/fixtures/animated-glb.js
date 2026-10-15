/** Small synthetic GLB for actual loader/mixer/export regressions and local browser QA. */
export function encodeGlb(json, binary) {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const binaryLength = Math.ceil(binary.byteLength / 4) * 4;
  const result = new ArrayBuffer(28 + jsonLength + binaryLength);
  const view = new DataView(result);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(result, 20, jsonLength).fill(32);
  new Uint8Array(result, 20, text.length).set(text);
  view.setUint32(20 + jsonLength, binaryLength, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true);
  new Uint8Array(result, 28 + jsonLength, binary.byteLength).set(new Uint8Array(binary));
  return result;
}

export function createAnimatedGlb() {
  const arrays = [
    new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0]),
    new Float32Array([0, 2]),
    new Float32Array([0, 0, 0, 4, 0, 0]),
    new Float32Array([0, 4]),
    new Float32Array([1, 1, 1, 1, 3, 1]),
  ];
  let offset = 0;
  const bufferViews = arrays.map((array) => {
    const view = { buffer: 0, byteOffset: offset, byteLength: array.byteLength };
    offset += array.byteLength;
    return view;
  });
  const binary = new Uint8Array(offset);
  arrays.forEach((array, index) =>
    binary.set(new Uint8Array(array.buffer), bufferViews[index].byteOffset),
  );
  return encodeGlb(
    {
      asset: { version: '2.0', generator: 'LibTV synthetic animation regression' },
      scene: 0,
      scenes: [{ nodes: [0, 1] }],
      nodes: [
        { name: 'MovingTriangle', mesh: 0 },
        { name: 'GrowingTriangle', mesh: 1, translation: [0, 0, -1] },
      ],
      meshes: [0, 1].map((material) => ({
        primitives: [{ attributes: { POSITION: 0 }, material }],
      })),
      materials: ['OrangeAnimation', 'BlueAnimation'].map((name, index) => ({
        name,
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: index ? [0.1, 0.4, 1, 1] : [1, 0.3, 0.03, 1],
          metallicFactor: 0,
        },
      })),
      buffers: [{ byteLength: offset }],
      bufferViews,
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: 'VEC3',
          min: [-0.5, 0, 0],
          max: [0.5, 1, 0],
        },
        { bufferView: 1, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [2] },
        { bufferView: 2, componentType: 5126, count: 2, type: 'VEC3' },
        { bufferView: 3, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [4] },
        { bufferView: 4, componentType: 5126, count: 2, type: 'VEC3' },
      ],
      animations: [
        {
          name: 'Slide',
          samplers: [{ input: 1, output: 2 }],
          channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
        },
        {
          name: 'Grow',
          samplers: [{ input: 3, output: 4 }],
          channels: [{ sampler: 0, target: { node: 1, path: 'scale' } }],
        },
      ],
    },
    binary.buffer,
  );
}

/** The same original clips, with a real parent and a nested static mesh for outliner QA. */
export function createNestedAnimatedGlb() {
  const source = createAnimatedGlb();
  const view = new DataView(source);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(source, 20, jsonLength)));
  const binary = source.slice(28 + jsonLength);
  json.scenes[0].nodes = [2];
  json.nodes[0].children = [3];
  json.nodes.push(
    { name: 'Assembly', children: [0, 1] },
    {
      name: 'Detail',
      mesh: 0,
      translation: [0, 0, 0.5],
      scale: [0.25, 0.25, 0.25],
    },
  );
  return encodeGlb(json, binary);
}
