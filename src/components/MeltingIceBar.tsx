import { useEffect, useRef } from "react";
import * as THREE from "three";
import { applyFrozenSurface } from "./frozenSurface";

interface MeltingIceBarProps {
  progress: number;
  size?: number;
  autoRotate?: boolean;
  frostEffect?: boolean;
  journeyMotion?: boolean;
}

interface DripParts {
  neck: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
  bulb: THREE.Mesh<THREE.SphereGeometry, THREE.MeshPhysicalMaterial>;
}

interface BarParts {
  group: THREE.Group;
  cream: THREE.Mesh<THREE.CapsuleGeometry, THREE.MeshPhysicalMaterial>;
  frozenAmount: { value: number };
  creamOriginalPositions: Float32Array;
  creamMinY: number;
  creamMaxY: number;
  creamMaterial: THREE.MeshPhysicalMaterial;
  drips: DripParts[];
  puddle: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshPhysicalMaterial>;
}

const MELT_CONFIG = {
  bodyCompressionEarly: 0.12,
  bodyCompressionLate: 0.72,
  bodyWidthLoss: 0.62,
  bottomSpread: 0.2,
  asymmetrySag: 0.2,
  puddleStart: 0.27,
  dripCount: 3,
  floorY: 0.014,
} as const;

const BODY_COLOR = new THREE.Color(0xffaec7);
const BODY_FROZEN_COLOR = new THREE.Color(0xffc9dc);
const BODY_MELTED_COLOR = new THREE.Color(0xf99ab8);
const LIQUID_COLOR = 0xf48fad;

const DRIP_CONFIG = [
  { start: 0.3, end: 0.63, x: 0.27, z: 0.035, size: 0.085, fallBias: 0.92 },
  { start: 0.48, end: 0.82, x: -0.2, z: 0.015, size: 0.067, fallBias: 1.08 },
  { start: 0.65, end: 0.98, x: 0.04, z: 0.06, size: 0.075, fallBias: 1 },
] as const;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smooth(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function createIrregularPuddleGeometry() {
  const shape = new THREE.Shape();
  const segments = 48;
  for (let index = 0; index <= segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    const radius =
      1 +
      0.11 * Math.sin(angle * 3 + 0.4) +
      0.065 * Math.sin(angle * 7 - 0.8) +
      0.035 * Math.sin(angle * 11 + 1.2);
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 1);
}

function buildBarScene(): { scene: THREE.Scene; parts: BarParts } {
  const scene = new THREE.Scene();
  scene.add(
    new THREE.HemisphereLight(0xffffff, 0xffeaf2, 1.55),
    new THREE.DirectionalLight(0xfff9f0, 2.1),
    new THREE.DirectionalLight(0xdcecff, 0.75),
  );
  const lights = scene.children.filter(
    (child): child is THREE.DirectionalLight => child instanceof THREE.DirectionalLight,
  );
  lights[0].position.set(-3, 5, 4);
  lights[1].position.set(4, 2, 2);

  const group = new THREE.Group();
  scene.add(group);

  const creamMaterial = new THREE.MeshPhysicalMaterial({
    color: BODY_COLOR,
    emissive: BODY_COLOR,
    emissiveIntensity: 0.1,
    roughness: 0.58,
    clearcoat: 0.08,
    clearcoatRoughness: 0.72,
  });
  const frozenAmount = applyFrozenSurface(creamMaterial, {
    startY: 0.25,
    endY: 0.92,
    edgeAmount: 0.34,
  });
  const liquidMaterial = new THREE.MeshPhysicalMaterial({
    color: LIQUID_COLOR,
    emissive: LIQUID_COLOR,
    emissiveIntensity: 0.12,
    roughness: 0.18,
    clearcoat: 0.82,
    clearcoatRoughness: 0.14,
    side: THREE.DoubleSide,
  });
  const stickMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe8b773,
    roughness: 0.66,
    clearcoat: 0.08,
  });

  const creamGeometry = new THREE.CapsuleGeometry(0.5, 0.92, 20, 48);
  creamGeometry.computeBoundingBox();
  const bounds = creamGeometry.boundingBox!;
  const cream = new THREE.Mesh(creamGeometry, creamMaterial);
  cream.scale.set(0.92, 1, 0.42);
  cream.position.y = 1.45;
  group.add(cream);
  const creamOriginalPositions = new Float32Array(creamGeometry.attributes.position.array);

  const stick = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.11, 0.55, 10, 20),
    stickMaterial,
  );
  stick.position.y = 0.38;
  stick.scale.z = 0.48;
  group.add(stick);

  const dripGeometry = new THREE.SphereGeometry(1, 20, 16);
  const drips: DripParts[] = [];
  for (let index = 0; index < MELT_CONFIG.dripCount; index++) {
    const neck = new THREE.Mesh(dripGeometry, liquidMaterial);
    const bulb = new THREE.Mesh(dripGeometry, liquidMaterial);
    neck.visible = false;
    bulb.visible = false;
    group.add(neck, bulb);
    drips.push({ neck, bulb });
  }

  const puddle = new THREE.Mesh(createIrregularPuddleGeometry(), liquidMaterial);
  puddle.visible = false;
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(0.08, MELT_CONFIG.floorY, 0.03);
  group.add(puddle);

  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 128;
  const context = shadowCanvas.getContext("2d")!;
  const gradient = context.createRadialGradient(64, 64, 5, 64, 64, 64);
  gradient.addColorStop(0, "rgba(88, 72, 82, 0.14)");
  gradient.addColorStop(1, "rgba(88, 72, 82, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.68, 1.68),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(shadowCanvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.001;
  group.add(shadow);

  return {
    scene,
    parts: {
      group,
      cream,
      frozenAmount,
      creamOriginalPositions,
      creamMinY: bounds.min.y,
      creamMaxY: bounds.max.y,
      creamMaterial,
      drips,
      puddle,
    },
  };
}

function updateIceCreamBody(parts: BarParts, meltProgress: number) {
  const earlyCompression =
    MELT_CONFIG.bodyCompressionEarly * smooth(meltProgress / 0.5);
  const lateCompression =
    MELT_CONFIG.bodyCompressionLate * smooth((meltProgress - 0.35) / 0.65);
  const heightRemain = Math.max(0.16, 1 - earlyCompression - lateCompression);
  const widthRemain = 1 - MELT_CONFIG.bodyWidthLoss * smooth((meltProgress - 0.5) / 0.5);
  const positions = parts.cream.geometry.attributes.position;
  const originals = parts.creamOriginalPositions;
  const height = parts.creamMaxY - parts.creamMinY;

  for (let index = 0; index < positions.count; index++) {
    const x = originals[index * 3];
    const y = originals[index * 3 + 1];
    const z = originals[index * 3 + 2];
    const normalizedY = (y - parts.creamMinY) / height;
    const bottomWeight = 1 - smooth(normalizedY / 0.34);
    const lowerSpread = 1 + MELT_CONFIG.bottomSpread * smooth(meltProgress / 0.55) * bottomWeight;
    const surfaceNoise =
      1 +
      0.018 * meltProgress *
        (Math.sin(normalizedY * 12 + z * 7) + 0.45 * Math.sin(normalizedY * 23 - x * 9));
    const rightLobe = Math.exp(-Math.pow((x - 0.26) / 0.2, 2));
    const asymmetricSag =
      MELT_CONFIG.asymmetrySag *
      smooth((meltProgress - 0.25) / 0.75) *
      bottomWeight *
      rightLobe;
    positions.setXYZ(
      index,
      x * widthRemain * lowerSpread * surfaceNoise,
      parts.creamMinY + (y - parts.creamMinY) * heightRemain - asymmetricSag,
      z * (1 + 0.1 * meltProgress * bottomWeight) * surfaceNoise,
    );
  }
  positions.needsUpdate = true;
  parts.cream.geometry.computeVertexNormals();

}

function updateIceCreamMaterial(parts: BarParts, meltProgress: number, frostEffect: boolean) {
  if (!frostEffect) {
    const wet = smooth(meltProgress);
    parts.frozenAmount.value = 0;
    parts.creamMaterial.color.copy(BODY_COLOR).lerp(BODY_MELTED_COLOR, 0.42 * wet);
    parts.creamMaterial.emissive.copy(parts.creamMaterial.color);
    parts.creamMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.1, 0.2, wet);
    parts.creamMaterial.roughness = THREE.MathUtils.lerp(0.58, 0.2, wet);
    parts.creamMaterial.clearcoat = THREE.MathUtils.lerp(0.08, 0.76, wet);
    parts.creamMaterial.clearcoatRoughness = THREE.MathUtils.lerp(0.72, 0.16, wet);
    return;
  }
  // 권장 도착 전에도 흰 서리층이 사라지고 표면 광택이 살아나는 흐름을 보여준다.
  const thaw = smooth(meltProgress / 0.35);
  const lateWet = smooth((meltProgress - 0.35) / 0.65);
  parts.creamMaterial.color.copy(BODY_FROZEN_COLOR).lerp(BODY_COLOR, thaw);
  parts.creamMaterial.color.lerp(BODY_MELTED_COLOR, 0.42 * lateWet);
  parts.creamMaterial.emissive.copy(parts.creamMaterial.color);
  parts.creamMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.08, 0.18, thaw);
  parts.creamMaterial.roughness = THREE.MathUtils.lerp(0.72, 0.28, thaw);
  parts.creamMaterial.roughness = THREE.MathUtils.lerp(parts.creamMaterial.roughness, 0.2, lateWet);
  parts.creamMaterial.clearcoat = THREE.MathUtils.lerp(0.04, 0.5, thaw);
  parts.creamMaterial.clearcoat = THREE.MathUtils.lerp(parts.creamMaterial.clearcoat, 0.76, lateWet);
  parts.creamMaterial.clearcoatRoughness = THREE.MathUtils.lerp(0.88, 0.24, thaw);
  parts.creamMaterial.clearcoatRoughness = THREE.MathUtils.lerp(
    parts.creamMaterial.clearcoatRoughness,
    0.16,
    lateWet,
  );
  parts.frozenAmount.value = 1 - thaw;
}

function updateDrips(parts: BarParts, meltProgress: number) {
  const bodyBottom =
    parts.cream.position.y + parts.creamMinY -
    MELT_CONFIG.asymmetrySag * smooth((meltProgress - 0.25) / 0.75);

  parts.drips.forEach((drip, index) => {
    const config = DRIP_CONFIG[index];
    const life = (meltProgress - config.start) / (config.end - config.start);
    if (life <= 0 || life >= 1) {
      drip.neck.visible = false;
      drip.bulb.visible = false;
      return;
    }

    const attachedEnd = 0.44;
    const detachEnd = 0.58;
    const attached = smooth(life / attachedEnd);
    const neckLength = 0.025 + 0.31 * attached;
    const radius = config.size * (0.5 + 0.5 * attached);
    const x = config.x * parts.cream.scale.x;
    const z = config.z;

    if (life < detachEnd) {
      const thinning = smooth((life - attachedEnd) / (detachEnd - attachedEnd));
      drip.neck.visible = true;
      drip.bulb.visible = true;
      drip.neck.position.set(x, bodyBottom - neckLength / 2 + 0.018, z);
      drip.neck.rotation.z = 0;
      drip.neck.scale.set(
        radius * (0.72 - 0.42 * thinning),
        neckLength / 2,
        radius * 0.62,
      );
      drip.bulb.position.set(x, bodyBottom - neckLength + 0.01, z);
      drip.bulb.scale.set(radius, radius * (1.08 + 0.65 * attached), radius * 0.86);
      return;
    }

    drip.neck.visible = false;
    const fall = smooth((life - detachEnd) / (1 - detachEnd));
    const detachY = bodyBottom - neckLength - 0.015;
    const landingY = MELT_CONFIG.floorY + radius * 0.4;
    drip.bulb.visible = fall < 0.94;
    drip.bulb.position.set(
      x + 0.025 * fall * (index - 1),
      THREE.MathUtils.lerp(detachY, landingY, Math.min(1, fall * config.fallBias)),
      z,
    );
    const absorbedScale = 1 - smooth((fall - 0.78) / 0.22);
    drip.bulb.scale.set(
      radius * absorbedScale,
      radius * (1.45 - 0.5 * fall) * absorbedScale,
      radius * 0.86 * absorbedScale,
    );
  });
}

function updatePuddle(parts: BarParts, meltProgress: number) {
  const raw = clamp01(
    (meltProgress - MELT_CONFIG.puddleStart) / (1 - MELT_CONFIG.puddleStart),
  );
  const slowGrowth = smooth(raw);
  const lateGrowth = smooth((meltProgress - 0.6) / 0.4);
  const growth = slowGrowth * (0.42 + 0.58 * lateGrowth);
  parts.puddle.visible = raw > 0.001;
  if (!parts.puddle.visible) return;
  parts.puddle.scale.set(0.04 + 0.86 * growth, 0.035 + 0.57 * growth, 1);
  parts.puddle.position.x = 0.08 + 0.1 * growth;
}

function setMeltProgress(parts: BarParts, progress: number, frostEffect = true) {
  const meltProgress = clamp01(progress);
  updateIceCreamBody(parts, meltProgress);
  updateIceCreamMaterial(parts, meltProgress, frostEffect);
  updateDrips(parts, meltProgress);
  updatePuddle(parts, meltProgress);
}

export function MeltingIceBar({
  progress,
  size = 260,
  autoRotate = true,
  frostEffect = true,
  journeyMotion = false,
}: MeltingIceBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(clamp01(progress));
  const displayedRef = useRef(clamp01(progress));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
    renderer.setSize(size, size, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    camera.position.set(0, 1.72, 5.55);
    camera.lookAt(0, 0.96, 0);
    const { scene, parts } = buildBarScene();
    const keyLight = scene.children.find(
      (child): child is THREE.DirectionalLight => child instanceof THREE.DirectionalLight,
    );
    setMeltProgress(parts, displayedRef.current, frostEffect);

    let rafId = 0;
    let lastFrame = 0;
    let startedAt = 0;
    let journeyDripStartedAt: number | null = null;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tick = (time: number) => {
      rafId = requestAnimationFrame(tick);
      if (time - lastFrame < 1000 / 30) return;
      const delta = lastFrame === 0 ? 1000 / 30 : time - lastFrame;
      lastFrame = time;
      if (startedAt === 0) startedAt = time;
      const next = THREE.MathUtils.lerp(
        displayedRef.current,
        targetRef.current,
        1 - Math.exp(-delta / 180),
      );
      displayedRef.current =
        Math.abs(targetRef.current - next) < 0.0001 ? targetRef.current : next;
      setMeltProgress(parts, displayedRef.current, frostEffect);
      // 실제 녹는 진행은 유지하되, 이동 중 드립 한 번이 수십 초간 멈춘 듯 보이지 않도록
      // 생성→늘어짐→낙하 과정을 짧은 연속 주기로 보여준다.
      if (journeyMotion && displayedRef.current >= 0.28 && !reduceMotion) {
        if (journeyDripStartedAt == null) journeyDripStartedAt = time;
        const dripCycle = ((time - journeyDripStartedAt) % 22_000) / 22_000;
        updateDrips(parts, 0.3 + dripCycle * 0.68);
      } else if (displayedRef.current < 0.28) {
        journeyDripStartedAt = null;
      }
      if (autoRotate) {
        if (journeyMotion && !reduceMotion) {
          const age = time - startedAt;
          const entrance = clamp01(age / 2000);
          const entranceEase = 1 - Math.pow(1 - entrance, 3);
          const backOvershoot = Math.sin(entrance * Math.PI) * (1 - entrance) * 0.085;
          const p = displayedRef.current;
          const pulse = Math.max(
            Math.exp(-Math.pow((p - 0.09) / 0.012, 2)),
            Math.exp(-Math.pow((p - 0.18) / 0.012, 2)),
            Math.exp(-Math.pow((p - 0.27) / 0.012, 2)),
          );
          const scale = 0.72 + 0.28 * entranceEase + backOvershoot + pulse * 0.018;
          parts.group.scale.setScalar(scale);
          parts.group.position.y = -0.28 * (1 - entranceEase) + Math.sin(time * 0.00108) * 0.024;
          parts.group.rotation.y =
            -1.45 * (1 - entranceEase) + age * 0.00036 + pulse * 0.15;
          parts.group.rotation.x =
            0.2 * (1 - entranceEase) + Math.sin(time * 0.00058) * 0.1 + pulse * 0.03;
          parts.group.rotation.z =
            -0.15 * (1 - entranceEase) + Math.cos(time * 0.00044) * 0.075;
          renderer.toneMappingExposure = 1.2 + Math.sin(age * 0.004) * 0.055 + pulse * 0.09;
          if (keyLight) keyLight.position.x = -3 + Math.sin(age * 0.0011) * 1.05;
        } else {
          parts.group.rotation.y += delta * 0.00022;
          parts.group.rotation.x = Math.sin(time * 0.00042) * 0.065;
          parts.group.rotation.z = Math.cos(time * 0.00031) * 0.04;
        }
      }
      renderer.render(scene, camera);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        objectMaterials.forEach((material) => materials.add(material));
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => {
        const mappedMaterial = material as THREE.Material & {
          map?: THREE.Texture | null;
          alphaMap?: THREE.Texture | null;
        };
        mappedMaterial.map?.dispose();
        mappedMaterial.alphaMap?.dispose();
        material.dispose();
      });
      renderer.dispose();
    };
  }, [autoRotate, frostEffect, journeyMotion, size]);

  useEffect(() => {
    targetRef.current = clamp01(progress);
  }, [progress]);

  return <canvas ref={canvasRef} style={{ width: size, height: size, display: "block" }} />;
}
