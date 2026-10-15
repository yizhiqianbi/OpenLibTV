import * as THREE from 'three';

// Planar reflection and five-pass Kawase blur from the public scene's Drei
// MeshReflectorMaterial implementation, adapted to the installed Three API.
const reflectionFragment = `
  float distortionFactor = 0.0;
  vec4 new_vUv = my_vUv;
  vec4 base = texture2DProj(tDiffuse, new_vUv);
  vec4 blur = texture2DProj(tDiffuseBlur, new_vUv);
  vec4 merge = base;
  #ifdef USE_NORMALMAP
    vec4 normalColor = texture2D(normalMap, vUv * normalScale);
    vec3 my_normal = normalize(vec3(normalColor.r * 2.0 - 1.0, normalColor.b, normalColor.g * 2.0 - 1.0));
    vec3 coord = new_vUv.xyz / new_vUv.w;
    vec2 normal_uv = coord.xy + coord.z * my_normal.xz * 0.05;
    merge = texture2D(tDiffuse, normal_uv);
    blur = texture2D(tDiffuseBlur, normal_uv);
  #endif
  float reflectorRoughnessFactor = roughness;
  #ifdef USE_ROUGHNESSMAP
    reflectorRoughnessFactor *= texture2D(roughnessMap, vUv).g;
  #endif
  float blurFactor = min(1.0, mixBlur * reflectorRoughnessFactor);
  merge = mix(merge, blur, blurFactor);
  diffuseColor.rgb *= (1.0 - min(1.0, mirror)) + merge.rgb * mixStrength;
`;
const blurVertex = `
  uniform vec2 texelSize;
  uniform float kernel;
  varying vec2 vUv0;
  varying vec2 vUv1;
  varying vec2 vUv2;
  varying vec2 vUv3;
  void main() {
    vec2 uv = position.xy * 0.5 + 0.5;
    vec2 dUv = texelSize * (kernel + 0.5);
    vUv0 = vec2(uv.x - dUv.x, uv.y + dUv.y);
    vUv1 = vec2(uv.x + dUv.x, uv.y + dUv.y);
    vUv2 = vec2(uv.x + dUv.x, uv.y - dUv.y);
    vUv3 = vec2(uv.x - dUv.x, uv.y - dUv.y);
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;
const blurFragment = `
  uniform sampler2D inputBuffer;
  varying vec2 vUv0;
  varying vec2 vUv1;
  varying vec2 vUv2;
  varying vec2 vUv3;
  void main() {
    gl_FragColor = (texture2D(inputBuffer, vUv0) + texture2D(inputBuffer, vUv1)
      + texture2D(inputBuffer, vUv2) + texture2D(inputBuffer, vUv3)) * 0.25;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function createBlurPass(config) {
  const targetOptions = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
  };
  const a = new THREE.WebGLRenderTarget(config.resolution, config.resolution, targetOptions);
  const b = a.clone();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      inputBuffer: { value: null },
      kernel: { value: 0 },
      texelSize: { value: new THREE.Vector2(1 / config.blurX, 1 / config.blurY) },
    },
    vertexShader: blurVertex,
    fragmentShader: blurFragment,
    blending: THREE.NoBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  );
  const screen = new THREE.Mesh(geometry, material);
  screen.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(screen);
  const camera = new THREE.Camera();
  return {
    render(renderer, input, output) {
      const kernels = [0, 1, 2, 2, 3];
      let previous = input;
      kernels.forEach((kernel, index) => {
        const target = index === kernels.length - 1 ? output : index % 2 === 0 ? a : b;
        material.uniforms.kernel.value = kernel;
        material.uniforms.inputBuffer.value = previous.texture;
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
        previous = target;
      });
    },
    setSize(resolution) {
      a.setSize(resolution, resolution);
      b.setSize(resolution, resolution);
    },
    dispose() {
      a.dispose();
      b.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

export function createGroundReflection(config) {
  const options = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.HalfFloatType,
  };
  const reflection = new THREE.WebGLRenderTarget(config.resolution, config.resolution, options);
  const blurred = new THREE.WebGLRenderTarget(config.resolution, config.resolution, options);
  const blur = createBlurPass(config);
  const textureMatrix = new THREE.Matrix4(),
    virtualCamera = new THREE.PerspectiveCamera();
  const material = new THREE.MeshStandardMaterial({
    color: config.groundColor,
    roughness: config.roughness,
    metalness: config.metalness,
    normalScale: new THREE.Vector2(config.normalScale, config.normalScale),
  });
  const uniforms = {
    tDiffuse: { value: reflection.texture },
    tDiffuseBlur: { value: blurred.texture },
    textureMatrix: { value: textureMatrix },
    mirror: { value: config.mirror },
    mixBlur: { value: config.mixBlur },
    mixStrength: { value: config.mixStrength },
  };
  material.onBeforeCompile = (shader) => {
    shader.defines ||= {};
    shader.defines.USE_UV = '';
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `uniform mat4 textureMatrix; varying vec4 my_vUv;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      '#include <project_vertex>\nmy_vUv = textureMatrix * vec4(position, 1.0);',
    );
    shader.fragmentShader = `uniform sampler2D tDiffuse; uniform sampler2D tDiffuseBlur;
      uniform float mixBlur; uniform float mirror; uniform float mixStrength;
      varying vec4 my_vUv;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n${reflectionFragment}`,
    );
  };
  material.customProgramCacheKey = () => 'libtv-blender-reflector-v1';
  const plane = new THREE.Plane(),
    normal = new THREE.Vector3(),
    reflectorPosition = new THREE.Vector3(),
    cameraPosition = new THREE.Vector3();
  const rotation = new THREE.Matrix4(),
    lookAt = new THREE.Vector3(0, 0, -1),
    view = new THREE.Vector3(),
    target = new THREE.Vector3();
  const clip = new THREE.Vector4(),
    q = new THREE.Vector4();
  let disposed = false;
  return {
    material,
    update(renderer, scene, camera, ground) {
      if (disposed) return;
      ground.updateMatrixWorld();
      camera.updateMatrixWorld();
      reflectorPosition.setFromMatrixPosition(ground.matrixWorld);
      cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      rotation.extractRotation(ground.matrixWorld);
      normal.set(0, 0, 1).applyMatrix4(rotation);
      view.subVectors(reflectorPosition, cameraPosition);
      if (view.dot(normal) > 0) return;
      view.reflect(normal).negate().add(reflectorPosition);
      rotation.extractRotation(camera.matrixWorld);
      lookAt.set(0, 0, -1).applyMatrix4(rotation).add(cameraPosition);
      target.subVectors(reflectorPosition, lookAt).reflect(normal).negate().add(reflectorPosition);
      virtualCamera.position.copy(view);
      virtualCamera.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal);
      virtualCamera.lookAt(target);
      virtualCamera.far = camera.far;
      virtualCamera.updateMatrixWorld();
      virtualCamera.projectionMatrix.copy(camera.projectionMatrix);
      textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
      textureMatrix
        .multiply(virtualCamera.projectionMatrix)
        .multiply(virtualCamera.matrixWorldInverse)
        .multiply(ground.matrixWorld);
      plane
        .setFromNormalAndCoplanarPoint(normal, reflectorPosition)
        .applyMatrix4(virtualCamera.matrixWorldInverse);
      clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
      const projection = virtualCamera.projectionMatrix;
      q.set(
        (Math.sign(clip.x) + projection.elements[8]) / projection.elements[0],
        (Math.sign(clip.y) + projection.elements[9]) / projection.elements[5],
        -1,
        (1 + projection.elements[10]) / projection.elements[14],
      );
      clip.multiplyScalar(2 / clip.dot(q));
      projection.elements[2] = clip.x;
      projection.elements[6] = clip.y;
      projection.elements[10] = clip.z + 1;
      projection.elements[14] = clip.w;
      const previousTarget = renderer.getRenderTarget(),
        visible = ground.visible;
      const xrEnabled = renderer.xr.enabled,
        autoShadow = renderer.shadowMap.autoUpdate;
      try {
        ground.visible = false;
        renderer.xr.enabled = false;
        renderer.shadowMap.autoUpdate = false;
        renderer.setRenderTarget(reflection);
        renderer.state.buffers.depth.setMask(true);
        if (!renderer.autoClear) renderer.clear();
        renderer.render(scene, virtualCamera);
        blur.render(renderer, reflection, blurred);
      } finally {
        ground.visible = visible;
        renderer.xr.enabled = xrEnabled;
        renderer.shadowMap.autoUpdate = autoShadow;
        renderer.setRenderTarget(previousTarget);
      }
    },
    setResolution(resolution) {
      reflection.setSize(resolution, resolution);
      blurred.setSize(resolution, resolution);
      blur.setSize(resolution);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      reflection.dispose();
      blurred.dispose();
      blur.dispose();
    },
  };
}
