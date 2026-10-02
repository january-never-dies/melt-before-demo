import { useEffect, useRef } from "react";
import * as THREE from "three";
import { applyFrozenSurface } from "./frozenSurface";

interface MeltingIceCreamProps {
  /** 0: 살짝 녹기 시작한 상태 → 1: 거의 액체 */
  progress: number;
  /** 캔버스 한 변 크기 (px) */
  size?: number;
  /** 결과 화면처럼 정지된 구도가 필요할 때 false */
  autoRotate?: boolean;
  /** 선택 카드처럼 기존 분홍색 제품 이미지를 보여줄 때 false */
  frostEffect?: boolean;
  /** 이동 화면에서 시작 연출과 살아 있는 움직임을 강화한다. */
  journeyMotion?: boolean;
}

/** 장면 안에서 progress에 따라 움직이는 부품들 */
interface Parts {
  group: THREE.Group;
  cone: THREE.Mesh;
  coneOriginalPositions: Float32Array;
  rim: THREE.Mesh;
  rimOriginalPositions: Float32Array;
  scoop: THREE.Mesh;
  frozenAmount: { value: number };
  scoopOriginalPositions: Float32Array;
  overflowLips: THREE.Mesh[];
  dripMeshes: THREE.Mesh[];
  puddleMain: THREE.Mesh;
  puddleSub: THREE.Mesh;
  scoopMaterial: THREE.MeshPhysicalMaterial;
  meltedMaterial: THREE.MeshPhysicalMaterial;
  dripMaterial: THREE.MeshPhysicalMaterial;
}

// 토스 3D 아이콘처럼 밝고 선명한 파스텔 팔레트
const CREAM_COLOR = 0xffaec7; // 딸기 크림
const FROZEN_CREAM_COLOR = new THREE.Color(0xffc9dc);
const SCOOP_CREAM_COLOR = new THREE.Color(CREAM_COLOR);
const SCOOP_WARM_COLOR = new THREE.Color(0xffa4c1);
const CONE_COLOR = "#f5c47d"; // 와플 콘 (텍스처 베이스)
const WAFFLE_LINE = "rgba(163, 104, 48, 0.22)"; // 낮은 대비의 와플 음영
const WAFFLE_HIGHLIGHT = "rgba(255, 244, 220, 0.3)"; // 얕게 눌린 듯한 하이라이트
const RIM_COLOR = 0xeeb46b; // 콘 테두리

// 형태 비율
const SCOOP_RADIUS = 0.64;
const SCOOP_BASE_Y = 1.84; // 아래 기준은 유지하면서 콘 입구보다 넉넉하게 덮는다
const CONE_TOP_RADIUS = 0.55;
const CONE_HEIGHT = 1.35;
const CONE_TOP_Y = 1.47;
const CONE_TIP_Y = CONE_TOP_Y - CONE_HEIGHT;

// 카메라에서 잘 보이는 앞오른쪽을 주 용융 방향으로 고정한다.
const MAIN_DRIP_ANGLE = 0.9;
const SUB_DRIP_ANGLE = 3.9;

const DRIP_TRAIL_ROWS = 18;
const DRIP_TRAIL_COLUMNS = 6;
const OVERFLOW_ROWS = 10;
const OVERFLOW_COLUMNS = 12;
const MELTED_COLOR = 0xffa6c2;

const CONE_MELT_CONFIG = {
  scoopCompressionAtHalf: 0.16,
  scoopCompressionMax: 0.68,
  scoopBottomSpread: 0.09,
  asymmetryAmount: 0.055,
  dripStart: 0.35,
  puddleStart: 0.68,
  scoopRoughness: 0.46,
  meltedRoughness: 0.18,
} as const;

const OVERFLOW_CONFIG = [
  { angle: MAIN_DRIP_ANGLE, start: 0.18, width: 0.72, maxDrop: 0.34 },
  { angle: SUB_DRIP_ANGLE, start: 0.4, width: 0.46, maxDrop: 0.16 },
] as const;

const DRIP_CONFIG = [
  { angle: MAIN_DRIP_ANGLE, start: 0.3, maxLength: 1.14, width: 0.15, sway: 0.035 },
  { angle: 3.68, start: 0.48, maxLength: 0.66, width: 0.1, sway: -0.025 },
  { angle: 0.05, start: 0.62, maxLength: 0.42, width: 0.075, sway: 0.018 },
] as const;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smooth(t: number): number {
  const s = clamp01(t);
  return s * s * (3 - 2 * s);
}

/** 구간 [from, to]에서 0→1로 부드럽게 올라가는 보조 함수 */
function rampIn(p: number, from: number, to: number): number {
  return smooth((p - from) / (to - from));
}

/** 특정 방향(center) 주변에서만 1에 가까워지는 종 모양 가중치 */
function lobe(theta: number, center: number, width: number): number {
  const wrapped = Math.atan2(Math.sin(theta - center), Math.cos(theta - center));
  return Math.exp(-(wrapped * wrapped) / (2 * width * width));
}

/** 높이 y에서 콘 표면의 반지름 */
function coneRadiusAt(y: number): number {
  if (y >= CONE_TOP_Y) return CONE_TOP_RADIUS;
  return Math.max(0, (CONE_TOP_RADIUS * (y - CONE_TIP_Y)) / CONE_HEIGHT);
}

function buildGridPatchGeometry(rows: number, columns: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const vertexCount = (rows + 1) * (columns + 1);
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3),
  );
  const indices: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  geometry.setIndex(indices);
  return geometry;
}

function buildIrregularPuddleGeometry(segments = 48): THREE.CircleGeometry {
  const geometry = new THREE.CircleGeometry(1, segments);
  const positions = geometry.attributes.position;
  for (let i = 1; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const theta = Math.atan2(y, x);
    const radius =
      1 + 0.09 * Math.sin(theta * 3 + 0.4) + 0.045 * Math.sin(theta * 7 - 0.8);
    positions.setXY(i, Math.cos(theta) * radius, Math.sin(theta) * radius);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function softMaterial(color: number, roughness: number) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.72,
  });
}

/** 와플 대각선 패턴 텍스처 */
function makeWaffleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = CONE_COLOR;
  ctx.fillRect(0, 0, 512, 512);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 성긴 다이아몬드에 밝은 면과 어두운 면을 살짝 어긋나게 그려 단순한 양각 느낌을 낸다.
  for (const pass of [
    { color: WAFFLE_HIGHLIGHT, width: 9, offset: -3 },
    { color: WAFFLE_LINE, width: 5, offset: 2 },
  ]) {
    ctx.strokeStyle = pass.color;
    ctx.lineWidth = pass.width;
    for (let k = -512; k < 1024; k += 112) {
      ctx.beginPath();
      ctx.moveTo(k + pass.offset, 0);
      ctx.lineTo(k + 512 + pass.offset, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(k + 512 + pass.offset, 0);
      ctx.lineTo(k + pass.offset, 512);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.1, 1.45);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildScene(): { scene: THREE.Scene; parts: Parts } {
  const scene = new THREE.Scene();

  // 클레이 느낌의 부드러운 스튜디오 조명 (넓은 하이라이트, 밝게)
  const sky = new THREE.HemisphereLight(0xffffff, 0xffeaf2, 1.55);
  const key = new THREE.DirectionalLight(0xfff9f0, 2.15);
  key.position.set(-3.5, 5.5, 4.5);
  const fill = new THREE.DirectionalLight(0xdcecff, 0.8);
  fill.position.set(4, 2.5, 2);
  const rimLight = new THREE.DirectionalLight(0xffdce8, 0.5);
  rimLight.position.set(0, 3, -4);
  scene.add(sky, key, fill, rimLight);

  const group = new THREE.Group();
  scene.add(group);

  const scoopMaterial = new THREE.MeshPhysicalMaterial({
    color: CREAM_COLOR,
    emissive: CREAM_COLOR,
    emissiveIntensity: 0.16,
    roughness: CONE_MELT_CONFIG.scoopRoughness,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.76,
  });
  const frozenAmount = applyFrozenSurface(scoopMaterial, {
    startY: 0.12,
    endY: 0.56,
    edgeAmount: 0.12,
  });
  const meltedMaterial = new THREE.MeshPhysicalMaterial({
    color: MELTED_COLOR,
    emissive: MELTED_COLOR,
    emissiveIntensity: 0.12,
    roughness: CONE_MELT_CONFIG.meltedRoughness,
    metalness: 0,
    clearcoat: 0.72,
    clearcoatRoughness: 0.2,
    side: THREE.DoubleSide,
  });
  const dripMaterial = meltedMaterial.clone();
  dripMaterial.roughness = 0.12;
  dripMaterial.clearcoat = 0.9;
  dripMaterial.clearcoatRoughness = 0.12;

  // 와플 콘 (대각선 패턴 텍스처)
  const coneGeometry = new THREE.ConeGeometry(CONE_TOP_RADIUS, CONE_HEIGHT, 64, 12);
  const cone = new THREE.Mesh(
    coneGeometry,
    new THREE.MeshPhysicalMaterial({
      map: makeWaffleTexture(),
      roughness: 0.62,
      metalness: 0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.8,
    }),
  );
  cone.rotation.x = Math.PI; // 꼭짓점이 아래로
  cone.position.y = CONE_TOP_Y - CONE_HEIGHT / 2;
  group.add(cone);
  const coneOriginalPositions = new Float32Array(coneGeometry.attributes.position.array);

  // 콘 입구 테두리
  const rimGeometry = new THREE.TorusGeometry(CONE_TOP_RADIUS, 0.06, 20, 64);
  const rim = new THREE.Mesh(
    rimGeometry,
    softMaterial(RIM_COLOR, 0.7),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = CONE_TOP_Y - 0.01;
  group.add(rim);
  const rimOriginalPositions = new Float32Array(rimGeometry.attributes.position.array);

  // 아이스크림 스쿱 (녹을수록 크기가 줄어든다)
  const scoopGeometry = new THREE.SphereGeometry(SCOOP_RADIUS, 64, 48);
  const scoop = new THREE.Mesh(scoopGeometry, scoopMaterial);
  scoop.position.y = SCOOP_BASE_Y;
  group.add(scoop);
  const scoopOriginalPositions = new Float32Array(
    scoopGeometry.attributes.position.array,
  );

  // 전체 둘레 링 대신 특정 방향에서만 넘치는 크림 입술 두 조각
  const overflowLips = OVERFLOW_CONFIG.map(() => {
    const mesh = new THREE.Mesh(
      buildGridPatchGeometry(OVERFLOW_ROWS, OVERFLOW_COLUMNS),
      meltedMaterial,
    );
    mesh.visible = false;
    group.add(mesh);
    return mesh;
  });

  // 콘 경사면에 붙은 메인 드립 하나와 서로 다른 보조 드립 두 개
  const dripMeshes = DRIP_CONFIG.map(() => {
    const mesh = new THREE.Mesh(
      buildGridPatchGeometry(DRIP_TRAIL_ROWS, DRIP_TRAIL_COLUMNS),
      dripMaterial,
    );
    mesh.visible = false;
    group.add(mesh);
    return mesh;
  });

  // 바닥 웅덩이: 작고 비대칭적인 두 덩어리 (0에서는 완전히 숨김)
  const puddleMain = new THREE.Mesh(
    buildIrregularPuddleGeometry(56),
    dripMaterial,
  );
  puddleMain.visible = false;
  puddleMain.rotation.x = -Math.PI / 2;
  puddleMain.rotation.z = 0.5;
  group.add(puddleMain);

  const puddleSub = new THREE.Mesh(
    buildIrregularPuddleGeometry(36),
    dripMaterial,
  );
  puddleSub.visible = false;
  puddleSub.rotation.x = -Math.PI / 2;
  group.add(puddleSub);

  // 접지 그림자: 옅은 회색의 부드러운 타원 (웅덩이와 구분)
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
  gradient.addColorStop(0, "rgba(88, 72, 82, 0.17)");
  gradient.addColorStop(1, "rgba(72, 76, 86, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.06, 2.06),
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
      cone,
      coneOriginalPositions,
      rim,
      rimOriginalPositions,
      scoop,
      frozenAmount,
      scoopOriginalPositions,
      overflowLips,
      dripMeshes,
      puddleMain,
      puddleSub,
      scoopMaterial,
      meltedMaterial,
      dripMaterial,
    },
  };
}

function updateScoopShape(parts: Parts, progress: number) {
  const earlyCompression =
    CONE_MELT_CONFIG.scoopCompressionAtHalf * rampIn(progress, 0.08, 0.5);
  const lateCompression =
    (CONE_MELT_CONFIG.scoopCompressionMax - CONE_MELT_CONFIG.scoopCompressionAtHalf) *
    rampIn(progress, 0.5, 1);
  const compression = earlyCompression + lateCompression;
  const lateVolumeLoss = rampIn(progress, 0.52, 1);
  const finalFlatten = rampIn(progress, 0.75, 1);
  const bottomY = -SCOOP_RADIUS;
  const positions = parts.scoop.geometry.attributes.position;
  const original = parts.scoopOriginalPositions;
  for (let i = 0; i < positions.count; i++) {
    const x = original[i * 3];
    const y = original[i * 3 + 1];
    const z = original[i * 3 + 2];
    const ny = y / SCOOP_RADIUS;
    const theta = Math.atan2(z, x);

    // 녹기 전에도 완벽한 공처럼 보이지 않도록 본체 자체에 낮은 주파수 변형을 준다.
    const fixedSurface =
      1 + 0.014 * Math.sin(theta * 2.1 + ny * 1.7) + 0.008 * Math.sin(theta * 3.4 - ny * 2.2);
    const scoopMarkA =
      0.013 * Math.exp(-Math.pow((ny - 0.22) / 0.2, 2)) * Math.pow(0.5 + 0.5 * Math.cos(theta - 0.45), 5);
    const scoopMarkB =
      0.01 * Math.exp(-Math.pow((ny + 0.02) / 0.25, 2)) * Math.pow(0.5 + 0.5 * Math.cos(theta + 1.75), 6);
    const scoopSurface = fixedSurface - scoopMarkA - scoopMarkB;
    const baseX = x * 1.025 * scoopSurface;
    const baseZ = z * 0.982 * scoopSurface;
    const contactFlatten = smooth((-0.68 - ny) / 0.28);
    const baseY = THREE.MathUtils.lerp(y * 0.97, -SCOOP_RADIUS * 0.86, contactFlatten);

    const bottomWeight = smooth((0.25 - ny) / 1.25);
    const spread =
      1 + CONE_MELT_CONFIG.scoopBottomSpread * rampIn(progress, 0.15, 0.62) * bottomWeight;
    const widthRemain = 1 - 0.52 * lateVolumeLoss * (1 - 0.3 * bottomWeight);
    const asymmetry =
      CONE_MELT_CONFIG.asymmetryAmount *
      rampIn(progress, 0.18, 0.8) *
      bottomWeight *
      lobe(theta, MAIN_DRIP_ANGLE, 1.05);
    const gentleSurface =
      1 + 0.012 * rampIn(progress, 0.12, 0.7) * Math.sin(theta * 2 + ny * 1.3);
    const finalSpread = 1 + 0.14 * finalFlatten;
    const compressedY =
      bottomY + (baseY - bottomY) * (1 - compression) * (1 - 0.18 * finalFlatten);
    const directionalSag = asymmetry * SCOOP_RADIUS * (0.35 + bottomWeight);
    positions.setXYZ(
      i,
      baseX * spread * widthRemain * gentleSurface * finalSpread,
      compressedY - directionalSag,
      baseZ * spread * widthRemain * gentleSurface * finalSpread,
    );
  }
  positions.needsUpdate = true;
  parts.scoop.geometry.computeVertexNormals();
  parts.scoop.scale.set(1, 1, 1);
  const moundLift = 0.22 * rampIn(progress, 0.62, 1);
  const directionalShift = 0.085 * rampIn(progress, 0.3, 1);
  parts.scoop.position.set(
    Math.cos(MAIN_DRIP_ANGLE) * directionalShift,
    SCOOP_BASE_Y + moundLift,
    Math.sin(MAIN_DRIP_ANGLE) * directionalShift,
  );
}

function updateOverflowLips(parts: Parts, progress: number) {
  parts.overflowLips.forEach((mesh, index) => {
    const config = OVERFLOW_CONFIG[index];
    const amount = rampIn(progress, config.start, Math.min(1, config.start + 0.5));
    mesh.visible = amount > 0.01;
    if (!mesh.visible) return;
    const positions = mesh.geometry.attributes.position;
    const topY = CONE_TOP_Y + 0.2 - 0.08 * rampIn(progress, 0.72, 1);
    for (let row = 0; row <= OVERFLOW_ROWS; row++) {
      const t = row / OVERFLOW_ROWS;
      for (let column = 0; column <= OVERFLOW_COLUMNS; column++) {
        const u = (column / OVERFLOW_COLUMNS) * 2 - 1;
        const edgeWeight = smooth(1 - Math.abs(u));
        const theta = config.angle + u * config.width;
        const fixedNoise = 0.012 * Math.sin(theta * 5 + index * 1.7);
        const drop = amount * config.maxDrop * smooth(t) * (0.28 + 0.72 * edgeWeight);
        const y = topY - drop + fixedNoise * t;
        const startRadius = THREE.MathUtils.lerp(0.46, 0.34, rampIn(progress, 0.55, 1));
        const outsideRadius = coneRadiusAt(y) + 0.058;
        const radius =
          THREE.MathUtils.lerp(startRadius, outsideRadius, smooth(t)) +
          0.025 * amount * edgeWeight * Math.sin(Math.PI * t);
        positions.setXYZ(
          row * (OVERFLOW_COLUMNS + 1) + column,
          Math.cos(theta) * radius,
          y,
          Math.sin(theta) * radius,
        );
      }
    }
    positions.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  });
}

function updateDripMeshes(parts: Parts, progress: number) {
  parts.dripMeshes.forEach((mesh, index) => {
    const config = DRIP_CONFIG[index];
    const amount = rampIn(progress, config.start, Math.min(1, config.start + 0.52));
    mesh.visible = amount > 0.01;
    if (!mesh.visible) return;
    const positions = mesh.geometry.attributes.position;
    const startY = CONE_TOP_Y + 0.025 - 0.045 * rampIn(progress, 0.75, 1);
    const tipY = Math.max(CONE_TIP_Y + 0.075, startY - config.maxLength * amount);
    for (let row = 0; row <= DRIP_TRAIL_ROWS; row++) {
      const t = row / DRIP_TRAIL_ROWS;
      const curvedT = t * t * (2 - t);
      const centerAngle = config.angle + config.sway * Math.sin(t * Math.PI * 1.6);
      const baseY = THREE.MathUtils.lerp(startY, tipY, curvedT);
      const bulb = smooth((t - 0.78) / 0.22);
      const halfWidth =
        THREE.MathUtils.lerp(config.width, config.width * 0.38, smooth(t)) +
        config.width * 0.2 * bulb;
      for (let column = 0; column <= DRIP_TRAIL_COLUMNS; column++) {
        const u = (column / DRIP_TRAIL_COLUMNS) * 2 - 1;
        const theta = centerAngle + u * halfWidth;
        const rounded = Math.sqrt(Math.max(0, 1 - u * u));
        const y = baseY + 0.025 * bulb * u * u;
        const radius =
          coneRadiusAt(y) + 0.064 + 0.015 * rounded * Math.sin(Math.PI * t);
        positions.setXYZ(
          row * (DRIP_TRAIL_COLUMNS + 1) + column,
          Math.cos(theta) * radius,
          y,
          Math.sin(theta) * radius,
        );
      }
    }
    positions.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  });
}

function updatePuddle(parts: Parts, progress: number) {
  const puddleAmount = rampIn(progress, CONE_MELT_CONFIG.puddleStart, 1);
  parts.puddleMain.visible = puddleAmount > 0.01;
  if (parts.puddleMain.visible) {
    parts.puddleMain.scale.set(
      0.12 + 0.62 * puddleAmount,
      0.1 + 0.46 * puddleAmount,
      1,
    );
    parts.puddleMain.position.set(
      Math.cos(MAIN_DRIP_ANGLE) * 0.26,
      0.012,
      Math.sin(MAIN_DRIP_ANGLE) * 0.26,
    );
  }

  const subPuddleAmount = rampIn(progress, 0.82, 1);
  parts.puddleSub.visible = subPuddleAmount > 0.01;
  if (parts.puddleSub.visible) {
    const s = 0.08 + 0.2 * subPuddleAmount;
    parts.puddleSub.scale.set(s * 1.35, s, 1);
    parts.puddleSub.position.set(
      Math.cos(MAIN_DRIP_ANGLE + 1.1) * 0.48,
      0.011,
      Math.sin(MAIN_DRIP_ANGLE + 1.1) * 0.48,
    );
  }
}

function updateConeSoftening(parts: Parts, progress: number) {
  const soften = rampIn(progress, 0.8, 1);
  const conePositions = parts.cone.geometry.attributes.position;
  for (let i = 0; i < conePositions.count; i++) {
    const x = parts.coneOriginalPositions[i * 3];
    const y = parts.coneOriginalPositions[i * 3 + 1];
    const z = parts.coneOriginalPositions[i * 3 + 2];
    const topWeight = smooth((-y - 0.05) / (CONE_HEIGHT * 0.45));
    const theta = Math.atan2(z, x);
    const directionalSag =
      0.055 * soften * topWeight * lobe(theta, MAIN_DRIP_ANGLE, 0.9);
    conePositions.setXYZ(
      i,
      x * (1 + 0.025 * soften * topWeight),
      y + directionalSag,
      z * (1 - 0.025 * soften * topWeight),
    );
  }
  conePositions.needsUpdate = true;
  parts.cone.geometry.computeVertexNormals();

  const rimPositions = parts.rim.geometry.attributes.position;
  for (let i = 0; i < rimPositions.count; i++) {
    const x = parts.rimOriginalPositions[i * 3];
    const y = parts.rimOriginalPositions[i * 3 + 1];
    const z = parts.rimOriginalPositions[i * 3 + 2];
    const theta = Math.atan2(y, x);
    const sag =
      soften * (0.012 + 0.045 * lobe(theta, MAIN_DRIP_ANGLE, 0.82));
    rimPositions.setXYZ(
      i,
      x * (1 + 0.025 * soften),
      y * (1 - 0.035 * soften),
      z + sag,
    );
  }
  rimPositions.needsUpdate = true;
  parts.rim.geometry.computeVertexNormals();
}

function updateIceCreamMaterials(parts: Parts, progress: number, frostEffect: boolean) {
  if (!frostEffect) {
    const wet = smooth(progress);
    parts.frozenAmount.value = 0;
    parts.scoopMaterial.color.copy(SCOOP_CREAM_COLOR);
    parts.scoopMaterial.emissive.copy(SCOOP_CREAM_COLOR);
    parts.scoopMaterial.emissiveIntensity = 0.16;
    parts.scoopMaterial.roughness = THREE.MathUtils.lerp(
      CONE_MELT_CONFIG.scoopRoughness,
      0.32,
      wet,
    );
    parts.scoopMaterial.clearcoat = THREE.MathUtils.lerp(0.12, 0.3, wet);
    parts.scoopMaterial.clearcoatRoughness = THREE.MathUtils.lerp(0.76, 0.48, wet);
    parts.meltedMaterial.roughness = THREE.MathUtils.lerp(0.28, CONE_MELT_CONFIG.meltedRoughness, wet);
    parts.meltedMaterial.clearcoat = THREE.MathUtils.lerp(0.48, 0.78, wet);
    parts.meltedMaterial.clearcoatRoughness = THREE.MathUtils.lerp(0.3, 0.16, wet);
    return;
  }
  // 권장 도착 지점(visual progress 0.35) 안에서도 서리가 풀리고 젖는 변화가 보이게 한다.
  const thaw = smooth(progress / 0.35);
  const lateWet = smooth((progress - 0.35) / 0.65);
  parts.scoopMaterial.color.copy(FROZEN_CREAM_COLOR).lerp(SCOOP_CREAM_COLOR, thaw);
  parts.scoopMaterial.color.lerp(SCOOP_WARM_COLOR, 0.16 * lateWet);
  parts.scoopMaterial.emissive.copy(parts.scoopMaterial.color);
  parts.scoopMaterial.emissiveIntensity = THREE.MathUtils.lerp(0.08, 0.17, thaw);
  parts.scoopMaterial.roughness = THREE.MathUtils.lerp(0.72, 0.3, thaw);
  parts.scoopMaterial.roughness = THREE.MathUtils.lerp(parts.scoopMaterial.roughness, 0.22, lateWet);
  parts.scoopMaterial.clearcoat = THREE.MathUtils.lerp(0.05, 0.48, thaw);
  parts.scoopMaterial.clearcoat = THREE.MathUtils.lerp(parts.scoopMaterial.clearcoat, 0.62, lateWet);
  parts.scoopMaterial.clearcoatRoughness = THREE.MathUtils.lerp(0.9, 0.28, thaw);
  parts.scoopMaterial.clearcoatRoughness = THREE.MathUtils.lerp(
    parts.scoopMaterial.clearcoatRoughness,
    0.18,
    lateWet,
  );
  parts.frozenAmount.value = 1 - thaw;
  const wet = smooth(progress);
  parts.meltedMaterial.roughness = THREE.MathUtils.lerp(0.28, CONE_MELT_CONFIG.meltedRoughness, wet);
  parts.meltedMaterial.clearcoat = THREE.MathUtils.lerp(0.48, 0.78, wet);
  parts.meltedMaterial.clearcoatRoughness = THREE.MathUtils.lerp(0.3, 0.16, wet);
}

/** 하나의 deterministic progress로 콘 아이스크림의 모든 녹는 상태를 갱신한다. */
function setConeMeltProgress(parts: Parts, rawProgress: number, frostEffect = true) {
  const progress = clamp01(rawProgress);
  updateScoopShape(parts, progress);
  updateOverflowLips(parts, progress);
  updateDripMeshes(parts, progress);
  updatePuddle(parts, progress);
  updateConeSoftening(parts, progress);
  updateIceCreamMaterials(parts, progress, frostEffect);
}

export function MeltingIceCream({
  progress,
  size = 260,
  autoRotate = true,
  frostEffect = true,
  journeyMotion = false,
}: MeltingIceCreamProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const partsRef = useRef<Parts | null>(null);
  const targetProgressRef = useRef(clamp01(progress));
  const displayedProgressRef = useRef(clamp01(progress));

  // 장면은 처음 한 번만 만든다
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    // 고밀도 모바일 화면에서 2배 제한 때문에 흐려지지 않도록 최대 3배까지 사용한다.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 3));
    renderer.setSize(size, size, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // 살짝 위에서 내려다보는 안정적인 아이콘 구도
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
    camera.position.set(0, 2.18, 5.9);
    camera.lookAt(0, 1.05, 0);

    const { scene, parts } = buildScene();
    const keyLight = scene.children.find(
      (child): child is THREE.DirectionalLight => child instanceof THREE.DirectionalLight,
    );
    partsRef.current = parts;
    displayedProgressRef.current = targetProgressRef.current;
    setConeMeltProgress(parts, displayedProgressRef.current, frostEffect);

    // 천천히 회전시키며 그린다 (배터리를 아끼려 30fps로 제한)
    let rafId = 0;
    let lastFrame = 0;
    let startedAt = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const FRAME_INTERVAL = 1000 / 30;
    const tick = (time: number) => {
      rafId = requestAnimationFrame(tick);
      if (time - lastFrame < FRAME_INTERVAL) return;
      const deltaMs = lastFrame === 0 ? FRAME_INTERVAL : time - lastFrame;
      lastFrame = time;
      if (startedAt === 0) startedAt = time;

      // 타이머/슬라이더가 progress를 듬성듬성 갱신해도 모든 중간 단계를 프레임별로 그린다.
      const current = displayedProgressRef.current;
      const target = targetProgressRef.current;
      const progressEase = 1 - Math.exp(-deltaMs / 180);
      const next = THREE.MathUtils.lerp(current, target, progressEase);
      if (Math.abs(next - current) > 0.00001) {
        displayedProgressRef.current =
          Math.abs(target - next) < 0.0001 ? target : next;
        setConeMeltProgress(parts, displayedProgressRef.current, frostEffect);
      }

      if (autoRotate) {
        if (journeyMotion && !reduceMotion) {
          const age = time - startedAt;
          const entrance = clamp01(age / 2000);
          const entranceEase = 1 - Math.pow(1 - entrance, 3);
          const backOvershoot = Math.sin(entrance * Math.PI) * (1 - entrance) * 0.09;
          const p = displayedProgressRef.current;
          const pulse = Math.max(
            Math.exp(-Math.pow((p - 0.09) / 0.012, 2)),
            Math.exp(-Math.pow((p - 0.18) / 0.012, 2)),
            Math.exp(-Math.pow((p - 0.27) / 0.012, 2)),
          );
          const scale = 0.72 + 0.28 * entranceEase + backOvershoot + pulse * 0.018;
          parts.group.scale.setScalar(scale);
          parts.group.position.y = -0.3 * (1 - entranceEase) + Math.sin(time * 0.00115) * 0.025;
          parts.group.rotation.y =
            -1.55 * (1 - entranceEase) + age * 0.00042 + pulse * 0.16;
          parts.group.rotation.x =
            0.24 * (1 - entranceEase) + Math.sin(time * 0.00062) * 0.12 + pulse * 0.035;
          parts.group.rotation.z =
            -0.18 * (1 - entranceEase) + Math.cos(time * 0.00047) * 0.085;
          renderer.toneMappingExposure = 1.2 + Math.sin(age * 0.004) * 0.055 + pulse * 0.09;
          if (keyLight) keyLight.position.x = -3.5 + Math.sin(age * 0.0011) * 1.15;
        } else {
          parts.group.rotation.y += deltaMs * 0.00029;
          parts.group.rotation.x = Math.sin(time * 0.00045) * 0.09;
          parts.group.rotation.z = Math.cos(time * 0.00034) * 0.06;
        }
      }
      renderer.render(scene, camera);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const material = object.material as THREE.MeshStandardMaterial & {
            alphaMap?: THREE.Texture | null;
          };
          material.map?.dispose();
          material.alphaMap?.dispose();
          material.dispose();
        }
      });
      renderer.dispose();
      partsRef.current = null;
    };
  }, [autoRotate, frostEffect, journeyMotion, size]);

  // progress가 바뀌면 모양만 갱신한다
  useEffect(() => {
    targetProgressRef.current = clamp01(progress);
  }, [progress]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, display: "block" }}
    />
  );
}
