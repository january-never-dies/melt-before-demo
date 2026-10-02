import * as THREE from "three";

interface FrozenSurfaceOptions {
  startY: number;
  endY: number;
  edgeAmount: number;
}

/** 별도 메시 없이 기존 재질 위에서만 작동하는 가벼운 냉동 표면 셰이더다. */
export function applyFrozenSurface(
  material: THREE.MeshPhysicalMaterial,
  options: FrozenSurfaceOptions,
) {
  const amount = { value: 1 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFrozenAmount = amount;
    shader.uniforms.uFrozenStartY = { value: options.startY };
    shader.uniforms.uFrozenEndY = { value: options.endY };
    shader.uniforms.uFrozenEdgeAmount = { value: options.edgeAmount };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vFrozenLocalPosition;
        varying vec3 vFrozenLocalNormal;`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
        vFrozenLocalNormal = normalize(objectNormal);`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vFrozenLocalPosition = position;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uFrozenAmount;
        uniform float uFrozenStartY;
        uniform float uFrozenEndY;
        uniform float uFrozenEdgeAmount;
        varying vec3 vFrozenLocalPosition;
        varying vec3 vFrozenLocalNormal;

        float frozenMask() {
          float upper = smoothstep(uFrozenStartY, uFrozenEndY, vFrozenLocalPosition.y);
          float upward = smoothstep(0.05, 0.82, vFrozenLocalNormal.y);
          float edge = smoothstep(0.58, 0.94, abs(vFrozenLocalNormal.x)) * uFrozenEdgeAmount;
          float broadNoise = 0.78
            + 0.12 * sin(vFrozenLocalPosition.x * 17.0 + vFrozenLocalPosition.z * 11.0)
            + 0.10 * sin(vFrozenLocalPosition.x * 9.0 - vFrozenLocalPosition.y * 13.0 + 1.4);
          return clamp((upper * (0.58 + 0.42 * upward) + edge * upper) * broadNoise, 0.0, 1.0)
            * uFrozenAmount;
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float frozenSurfaceMask = frozenMask();
        vec3 coldPinkWhite = vec3(1.0, 0.94, 0.975);
        diffuseColor.rgb = mix(diffuseColor.rgb, coldPinkWhite, frozenSurfaceMask * 0.28);`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.96, frozenSurfaceMask * 0.72);`,
      );
  };
  material.customProgramCacheKey = () =>
    `frozen-surface-${options.startY}-${options.endY}-${options.edgeAmount}`;
  material.needsUpdate = true;
  return amount;
}
