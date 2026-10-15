// Scene shaders transcribed from public LibTV Blender module 193262.
// See research/blender-functional-audit.md for source evidence.
export const roundedRectSdf = `  float roundedRectSdf(vec2 point, vec2 halfSize, float radius) {
    vec2 offset = abs(point) - halfSize + radius;
    return min(max(offset.x, offset.y), 0.0)
      + length(max(offset, 0.0))
      - radius;
  }
`;

export const shellVertexShader = `  varying vec2 vLocalPoint;

  void main() {
    vLocalPoint = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const shellFragmentShader = `  uniform vec2 uSize;
  uniform vec2 uPointer;
  uniform vec3 uLightColor;
  uniform float uRadius;
  uniform float uBorderWidth;
  uniform float uBorderOpacity;
  uniform float uLightIntensity;
  uniform float uLightRadius;
  uniform float uGlowWidth;
  varying vec2 vLocalPoint;

  ${roundedRectSdf}

  void main() {
    float distanceToEdge = roundedRectSdf(
      vLocalPoint,
      uSize * 0.5,
      uRadius
    );
    float antialiasWidth = max(fwidth(distanceToEdge), 0.0001);
    float halfStrokeWidth = antialiasWidth * uBorderWidth * 0.5;
    float hairline = 1.0 - smoothstep(
      max(halfStrokeWidth - antialiasWidth * 0.5, 0.0),
      halfStrokeWidth + antialiasWidth * 0.5,
      abs(distanceToEdge)
    );

    vec2 lightVector = vLocalPoint - uPointer;
    float lightRadius = uSize.y * uLightRadius;
    float light = exp(
      -dot(lightVector, lightVector)
      / max(lightRadius * lightRadius, 0.0001)
    );
    float glow = 1.0 - smoothstep(
      halfStrokeWidth,
      halfStrokeWidth + antialiasWidth * uGlowWidth,
      abs(distanceToEdge)
    );
    float alpha = clamp(
      hairline * (uBorderOpacity + light * uLightIntensity)
        + glow * light * uLightIntensity * 0.22,
      0.0,
      1.0
    );

    if (alpha <= 0.001) discard;

    vec3 baseColor = vec3(0.56, 0.59, 0.64);
    float colorMix = clamp(light * uLightIntensity * 1.5, 0.0, 1.0);
    gl_FragColor = vec4(mix(baseColor, uLightColor, colorMix), alpha);
  }
`;

export const videoVertexShader = `  varying vec2 vUv;
  varying vec2 vLocalPoint;

  void main() {
    vUv = uv;
    vLocalPoint = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const videoFragmentShader = `  uniform sampler2D uVideo;
  uniform vec2 uSize;
  uniform float uRadius;
  varying vec2 vUv;
  varying vec2 vLocalPoint;

  ${roundedRectSdf}

  void main() {
    float distanceToEdge = roundedRectSdf(
      vLocalPoint,
      uSize * 0.5,
      uRadius
    );
    float antialiasWidth = max(fwidth(distanceToEdge), 0.0001);
    float mask = 1.0 - smoothstep(
      -antialiasWidth,
      antialiasWidth,
      distanceToEdge
    );

    if (mask <= 0.001) discard;

    vec4 videoColor = texture2D(uVideo, vUv);
    gl_FragColor = vec4(videoColor.rgb, videoColor.a * mask);
    #include <tonemapping_fragment>
  }
`;

export const sweepVertexShader = `  varying vec2 vGridPosition;
  varying vec3 vWorldPosition;

  void main() {
    vGridPosition = position.xy;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const sweepFragmentShader = `  uniform vec3 uColor;
  uniform float uCellSize;
  uniform float uLineThickness;
  uniform float uProgress;
  uniform float uSweepWidth;
  uniform float uGlow;
  uniform float uOpacity;
  uniform float uStrength;
  uniform float uSweepFar;
  uniform float uSweepNear;
  uniform float uFarOpacity;
  uniform float uFarSoftness;
  uniform float uDepthPower;
  uniform float uFadeDistance;
  uniform float uTime;
  uniform float uIrregularity;
  uniform float uNoiseScale;
  uniform float uNoiseSpeed;
  varying vec2 vGridPosition;
  varying vec3 vWorldPosition;

  float random(vec2 point) {
    return fract(
      sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123
    );
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    vec2 smoothLocal = local * local * (3.0 - 2.0 * local);

    return mix(
      mix(random(cell), random(cell + vec2(1.0, 0.0)), smoothLocal.x),
      mix(
        random(cell + vec2(0.0, 1.0)),
        random(cell + vec2(1.0, 1.0)),
        smoothLocal.x
      ),
      smoothLocal.y
    );
  }

  float gridLine(vec2 position) {
    vec2 gridPosition = position / max(uCellSize, 0.001);
    vec2 distanceToLine = abs(fract(gridPosition - 0.5) - 0.5);
    vec2 antialiasWidth = max(
      fwidth(gridPosition) * max(uLineThickness, 0.001),
      vec2(0.0001)
    );
    vec2 lines = 1.0 - smoothstep(
      vec2(0.0),
      antialiasWidth,
      distanceToLine
    );
    return max(lines.x, lines.y) * step(0.001, uLineThickness);
  }

  void main() {
    float sweepCenter = mix(uSweepFar, uSweepNear, uProgress);
    float depthProgress = clamp(
      (vWorldPosition.z - uSweepFar)
        / max(uSweepNear - uSweepFar, 0.001),
      0.0,
      1.0
    );
    float depthClarity = pow(
      depthProgress,
      max(uDepthPower, 0.001)
    );
    float depthOpacity = mix(uFarOpacity, 1.0, depthClarity);
    float depthSoftness = mix(uFarSoftness, 1.0, depthClarity);
    float primaryNoise = noise(vec2(
      vWorldPosition.x * uNoiseScale,
      uTime * uNoiseSpeed
    ));
    float detailNoise = noise(vec2(
      vWorldPosition.x * uNoiseScale * 2.37 + 8.1,
      uTime * uNoiseSpeed * 0.73 + 4.7
    ));
    float irregularOffset = (
      (primaryNoise - 0.5) * 1.4
        + (detailNoise - 0.5) * 0.6
    ) * uIrregularity;
    float irregularMix = clamp(uIrregularity / 3.0, 0.0, 1.0);
    float widthVariation = mix(
      1.0,
      0.72 + detailNoise * 0.56,
      irregularMix
    );
    float intensityVariation = mix(
      1.0,
      0.76 + primaryNoise * 0.48,
      irregularMix
    );
    float distanceToSweep = abs(
      vWorldPosition.z - sweepCenter - irregularOffset
    );
    float width = max(uSweepWidth, 0.001);
    float localWidth = width * widthVariation * depthSoftness;
    float core = exp(
      -pow(distanceToSweep / localWidth, 2.0) * 4.0
    );
    float glowWidth = localWidth * (1.0 + uGlow);
    float glow = exp(
      -pow(distanceToSweep / max(glowWidth, 0.001), 2.0) * 3.0
    ) * 0.32;
    float radialDistance = length(vWorldPosition.xz);
    float distanceFade = 1.0 - smoothstep(
      uFadeDistance * 0.72,
      uFadeDistance,
      radialDistance
    );
    float alpha = clamp(
      gridLine(vGridPosition)
        * (core + glow)
        * intensityVariation
        * depthOpacity
        * uOpacity
        * uStrength
        * distanceFade,
      0.0,
      1.0
    );

    if (alpha <= 0.001) discard;

    vec3 depthColor = mix(uColor * 0.48, uColor, depthClarity);
    gl_FragColor = vec4(
      mix(depthColor, depthColor * 1.3, core),
      alpha
    );
    #include <colorspace_fragment>
  }
`;

export const gridVertexShader = `    varying vec3 localPosition;
    varying vec4 worldPosition;

    uniform vec3 worldCamProjPosition;
    uniform vec3 worldPlanePosition;
    uniform float fadeDistance;
    uniform bool infiniteGrid;
    uniform bool followCamera;

    void main() {
      localPosition = position.xzy;
      if (infiniteGrid) localPosition *= 1.0 + fadeDistance;

      worldPosition = modelMatrix * vec4(localPosition, 1.0);
      if (followCamera) {
        worldPosition.xyz += (worldCamProjPosition - worldPlanePosition);
        localPosition = (inverse(modelMatrix) * worldPosition).xyz;
      }

      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

export const gridFragmentShader = `    varying vec3 localPosition;
    varying vec4 worldPosition;

    uniform vec3 worldCamProjPosition;
    uniform float cellSize;
    uniform float sectionSize;
    uniform vec3 cellColor;
    uniform vec3 sectionColor;
    uniform float fadeDistance;
    uniform float fadeStrength;
    uniform float fadeFrom;
    uniform float cellThickness;
    uniform float sectionThickness;

    float getGrid(float size, float thickness) {
      vec2 r = localPosition.xz / size;
      vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
      float line = min(grid.x, grid.y) + 1.0 - thickness;
      return 1.0 - min(line, 1.0);
    }

    void main() {
      float g1 = getGrid(cellSize, cellThickness);
      float g2 = getGrid(sectionSize, sectionThickness);

      vec3 from = worldCamProjPosition*vec3(fadeFrom);
      float dist = distance(from, worldPosition.xyz);
      float d = 1.0 - min(dist / fadeDistance, 1.0);
      vec3 color = mix(cellColor, sectionColor, min(1.0, sectionThickness * g2));

      gl_FragColor = vec4(color, (g1 + g2) * pow(d, fadeStrength));
      gl_FragColor.a = mix(0.75 * gl_FragColor.a, gl_FragColor.a, g2);
      if (gl_FragColor.a <= 0.0) discard;

      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;
