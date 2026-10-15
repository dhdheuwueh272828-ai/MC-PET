import * as THREE from 'three';

// 박스 UV를 마인크래프트 스킨 전개도에 맞춰 설정한다.
// (u, v): 텍스처 상의 시작점, w/h/d: 박스 크기 (64 기준 픽셀 단위)
function setBoxUV(geometry, u, v, w, h, d) {
  const T = 64;
  const face = (x1, y1, x2, y2) => [
    [x1 / T, 1 - y2 / T],
    [x2 / T, 1 - y2 / T],
    [x2 / T, 1 - y1 / T],
    [x1 / T, 1 - y1 / T],
  ];
  const top = face(u + d, v, u + d + w, v + d);
  const bottom = face(u + d + w, v, u + d + w * 2, v + d);
  const right = face(u, v + d, u + d, v + d + h); // 캐릭터 기준 오른쪽 (-x)
  const front = face(u + d, v + d, u + d + w, v + d + h);
  const left = face(u + d + w, v + d, u + d * 2 + w, v + d + h); // 캐릭터 기준 왼쪽 (+x)
  const back = face(u + d * 2 + w, v + d, u + d * 2 + w * 2, v + d + h);

  // BoxGeometry 면 순서: +x, -x, +y, -y, +z, -z / 각 면 정점 순서: 좌상, 우상, 좌하, 우하
  const order = (f) => [f[3], f[2], f[0], f[1]];
  const faces = [
    order(left),
    order(right),
    order(top),
    [bottom[0], bottom[1], bottom[3], bottom[2]],
    order(front),
    order(back),
  ];
  const uv = geometry.attributes.uv;
  let i = 0;
  for (const f of faces) for (const [x, y] of f) uv.setXY(i++, x, y);
  uv.needsUpdate = true;
}

function boxMesh(material, u, v, w, h, d, inflate = 0) {
  const geo = new THREE.BoxGeometry(w + inflate * 2, h + inflate * 2, d + inflate * 2);
  setBoxUV(geo, u, v, w, h, d);
  return new THREE.Mesh(geo, material);
}

/**
 * 관절(pivot) 그룹 + 기본 레이어 + 오버레이 레이어로 구성된 신체 부위
 * offsetY: pivot 기준 박스 중심의 y 위치
 */
function part(inner, outer, base, overlay, size, offsetY, inflate) {
  const [w, h, d] = size;
  const pivot = new THREE.Group();
  const a = boxMesh(inner, base[0], base[1], w, h, d);
  const b = boxMesh(outer, overlay[0], overlay[1], w, h, d, inflate);
  a.position.y = offsetY;
  b.position.y = offsetY;
  a.castShadow = b.castShadow = true;
  pivot.add(a, b);
  return pivot;
}

export class PlayerModel {
  constructor(skin) {
    this.root = new THREE.Group();
    this.setSkin(skin);
  }

  setSkin(skin, forceSlim) {
    this.dispose();
    const slim = forceSlim ?? skin.slim;
    this.slim = slim;

    const tex = new THREE.CanvasTexture(skin.canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.texture = tex;

    // 기본 레이어: 불투명 / 오버레이(모자·자켓·소매·바지): 알파 컷아웃 + 양면
    this.inner = new THREE.MeshLambertMaterial({ map: tex });
    this.outer = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.1, side: THREE.DoubleSide });

    const I = this.inner;
    const O = this.outer;
    const aw = slim ? 3 : 4;

    // 좌표계: 1 = 스킨 1픽셀, 캐릭터는 +z 방향을 바라본다. 발바닥 y=0 기준.
    this.head = part(I, O, [0, 0], [32, 0], [8, 8, 8], 4, 0.5);
    this.head.position.set(0, 24, 0);

    this.body = part(I, O, [16, 16], [16, 32], [8, 12, 4], 0, 0.25);
    this.body.position.set(0, 18, 0);

    this.rightArm = part(I, O, [40, 16], [40, 32], [aw, 12, 4], -4, 0.25);
    this.rightArm.position.set(-(4 + aw / 2), 22, 0);

    this.leftArm = part(I, O, [32, 48], [48, 48], [aw, 12, 4], -4, 0.25);
    this.leftArm.position.set(4 + aw / 2, 22, 0);

    this.rightLeg = part(I, O, [0, 16], [0, 32], [4, 12, 4], -6, 0.25);
    this.rightLeg.position.set(-2, 12, 0);

    this.leftLeg = part(I, O, [16, 48], [0, 48], [4, 12, 4], -6, 0.25);
    this.leftLeg.position.set(2, 12, 0);

    this.root.add(this.head, this.body, this.rightArm, this.leftArm, this.rightLeg, this.leftLeg);
  }

  dispose() {
    for (const child of [...this.root.children]) {
      child.traverse((o) => o.geometry?.dispose());
      this.root.remove(child);
    }
    this.texture?.dispose();
    this.inner?.dispose();
    this.outer?.dispose();
  }
}
