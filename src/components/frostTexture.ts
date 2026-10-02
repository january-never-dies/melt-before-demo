import * as THREE from "three";

/** 고정된 얼음 결정 얼룩을 만드는 가벼운 절차적 알파 텍스처다. */
export function createFrostTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#000";
  context.fillRect(0, 0, 256, 256);

  for (let index = 0; index < 420; index += 1) {
    const x = (index * 73 + Math.sin(index * 2.17) * 61 + 256) % 256;
    const y = (index * 47 + Math.cos(index * 1.63) * 83 + 256) % 256;
    const radius = 0.7 + ((index * 19) % 17) / 10;
    const brightness = 95 + ((index * 37) % 150);
    context.fillStyle = `rgb(${brightness},${brightness},${brightness})`;
    context.beginPath();
    context.ellipse(x, y, radius * 1.8, radius, index * 0.31, 0, Math.PI * 2);
    context.fill();
  }

  // 표면에서 읽히는 작은 얼음 결정. 중심에서 뾰족한 가지가 뻗도록 그려
  // 단순한 흰색 얼룩이나 색 변화처럼 보이지 않게 한다.
  context.lineCap = "round";
  for (let index = 0; index < 34; index += 1) {
    const centerX = (index * 83 + 19) % 256;
    const centerY = (index * 59 + 37) % 256;
    const armCount = index % 3 === 0 ? 6 : 5;
    const length = 7 + (index % 6) * 1.6;
    const rotation = index * 0.47;
    context.strokeStyle = index % 4 === 0 ? "rgba(255,255,255,0.98)" : "rgba(238,248,255,0.88)";
    context.lineWidth = index % 4 === 0 ? 1.8 : 1.25;

    for (let arm = 0; arm < armCount; arm += 1) {
      const angle = rotation + (arm / armCount) * Math.PI * 2;
      const tipX = centerX + Math.cos(angle) * length;
      const tipY = centerY + Math.sin(angle) * length;
      context.beginPath();
      context.moveTo(centerX, centerY);
      context.lineTo(tipX, tipY);
      context.stroke();

      // 각 가지 끝에 짧은 가시를 더해 눈 결정처럼 삐죽삐죽 보이게 한다.
      const branchX = centerX + Math.cos(angle) * length * 0.64;
      const branchY = centerY + Math.sin(angle) * length * 0.64;
      for (const side of [-1, 1]) {
        const branchAngle = angle + side * 0.68;
        context.beginPath();
        context.moveTo(branchX, branchY);
        context.lineTo(
          branchX + Math.cos(branchAngle) * length * 0.3,
          branchY + Math.sin(branchAngle) * length * 0.3,
        );
        context.stroke();
      }
    }
  }

  // 작은 점만 보이지 않도록 넓고 흐린 성에 얼룩도 섞는다.
  for (let index = 0; index < 18; index += 1) {
    const x = (index * 91) % 256;
    const y = (index * 57 + 31) % 256;
    const radius = 12 + (index % 5) * 4;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "rgba(210,210,210,0.7)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.35, 1.15);
  texture.needsUpdate = true;
  return texture;
}

/** 둥근 스쿱용: 상단에만 얇고 흐릿하게 남는 보송한 성에 마스크다. */
export function createScoopIceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#000";
  context.fillRect(0, 0, 256, 256);
  const image = context.createImageData(256, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      // SphereGeometry의 상단 UV에 해당하는 캔버스 윗부분에만 성에를 둔다.
      const unevenEdge = 73 + 8 * Math.sin(x * 0.047) + 5 * Math.sin(x * 0.113 + 1.7);
      const upperMask = Math.max(0, Math.min(1, (unevenEdge - y) / 34));
      const fineNoise =
        0.82 +
        0.1 * Math.sin(x * 0.71 + y * 0.43) +
        0.08 * Math.sin(x * 0.19 - y * 0.61);
      const value = Math.round(255 * upperMask * Math.max(0.58, Math.min(1, fineNoise)));
      const offset = (y * 256 + x) * 4;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.needsUpdate = true;
  return texture;
}
