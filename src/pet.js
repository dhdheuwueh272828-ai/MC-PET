import * as THREE from 'three';

// 상태별 지속 시간(초)과 말풍선 대사
export const STATES = {
  work: { label: '작업', duration: [14, 26], lines: ['코딩 중...', '거의 다 됐어!', '버그 잡는 중 🐛', '빌드 돌리는 중', '커밋 완료 ✓'] },
  think: { label: '고민', duration: [4, 6], lines: ['흠...', '🤔', '이게 왜 되지?', '어디서 틀렸지...'] },
  stretch: { label: '스트레칭', duration: [3, 4], lines: ['으아~ 🙆', '기지개 쭉!'] },
  sip: { label: '커피', duration: [4, 5], lines: ['커피 타임 ☕', '후루룩'] },
  sleep: { label: '낮잠', duration: [8, 12], lines: ['Zzz...', 'zZ'] },
  wave: { label: '인사', duration: [2.2, 2.2], lines: ['안녕!', '앗, 안녕 👋', '나 일하는 중이야!', '같이 일하자!'] },
};

const AUTO_NEXT = [
  ['think', 3],
  ['stretch', 2],
  ['sip', 3],
  ['sleep', 1],
];

// 카메라가 오른쪽 앞에서 바라보므로 고개를 +y 로 돌리면 카메라를 본다
const FACE_CAMERA_YAW = 0.45;
const SIP_TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0));

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = ([a, b]) => a + Math.random() * (b - a);

function weighted(list) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of list) if ((r -= w) <= 0) return v;
  return list[0][0];
}

export class PetController {
  constructor(model, workspace, { onSay } = {}) {
    this.model = model;
    this.ws = workspace;
    this.onSay = onSay ?? (() => {});
    this.auto = true;
    this.time = 0;
    this.lookTarget = null; // {x, y} NDC, 커서/터치 위치
    this.lookUntil = 0;
    this.typingSpeed = 1;
    this.mouseOffset = new THREE.Vector3();
    this.setState('work');
  }

  setState(name, { manual = false } = {}) {
    const def = STATES[name];
    this.state = name;
    this.stateTime = 0;
    this.stateDuration = manual && name !== 'wave' ? Infinity : rand(def.duration);
    this.nextLineAt = name === 'work' ? 3 + Math.random() * 5 : 0.2;
    if (manual && name !== 'wave') this.auto = false;
    if (name !== 'sip') this.attachMug(false);
    if (name === 'sleep' || name === 'wave') this.onSay(pick(def.lines));
  }

  setAuto(on) {
    this.auto = on;
    if (on && this.stateDuration === Infinity) this.stateDuration = rand(STATES[this.state].duration);
  }

  poke() {
    this.prevState = this.state === 'wave' ? this.prevState : this.state;
    this.setState('wave');
  }

  look(ndcX, ndcY) {
    this.lookTarget = { x: ndcX, y: ndcY };
    this.lookUntil = this.time + 2;
  }

  attachMug(inHand) {
    const mug = this.ws.mug;
    if (inHand && mug.parent !== this.model.leftArm) {
      this.model.leftArm.add(mug);
      mug.position.set(1.5, -11.5, 0);
    } else if (!inHand && mug.parent === this.model.leftArm) {
      this.ws.group.add(mug);
      mug.position.copy(this.ws.mugHome);
      mug.rotation.set(0, 0, 0);
    }
  }

  update(dt) {
    this.time += dt;
    this.stateTime += dt;
    const t = this.time;
    const st = this.stateTime;

    if (this.stateTime > this.stateDuration) {
      if (this.state === 'wave') this.setState(this.auto ? 'work' : this.prevState ?? 'work', { manual: !this.auto });
      else if (this.auto) this.setState(this.state === 'work' ? weighted(AUTO_NEXT) : 'work');
    }

    if (this.state !== 'sleep' && this.state !== 'wave' && st > this.nextLineAt) {
      this.onSay(pick(STATES[this.state].lines));
      this.nextLineAt = st + (this.state === 'work' ? 8 + Math.random() * 10 : 99);
    }

    // 목표 자세 계산 (rotation x,y,z)
    const P = {
      head: [0.35, 0, 0],
      rightArm: [-1.25, 0, 0.18],
      leftArm: [-1.25, 0, -0.18],
      rightLeg: [-Math.PI / 2, 0, 0.05],
      leftLeg: [-Math.PI / 2, 0, -0.05],
    };
    let typing = 0;

    switch (this.state) {
      case 'work': {
        // 타이핑 버스트: 가끔 멈칫한다
        const burst = Math.sin(t * 0.9) + Math.sin(t * 2.3) > -0.6 ? 1 : 0.15;
        typing = burst;
        P.rightArm[0] += Math.sin(t * 24) * 0.07 * burst;
        P.leftArm[0] += Math.sin(t * 24 + Math.PI + Math.sin(t * 3)) * 0.07 * burst;
        P.rightArm[2] += Math.sin(t * 5.1) * 0.05;
        P.leftArm[2] += Math.sin(t * 4.3) * 0.05;
        P.head[0] += Math.sin(t * 12) * 0.02 * burst;
        P.head[1] = Math.sin(t * 0.5) * 0.08;
        // 키보드+마우스 모드: 몇 초씩 오른손을 마우스로 옮겨 클릭/스크롤
        if (this.ws.setup === 'desktop' && Math.sin(t * 0.55) + Math.sin(t * 0.21) > 0.6) {
          const dx = Math.sin(t * 1.7) * 0.6 + Math.sin(t * 4.1) * 0.25;
          const dz = Math.sin(t * 1.3) * 0.5;
          P.rightArm = [-1.27 + dz * 0.04, 0, -0.44 - dx * 0.03];
          this.mouseOffset.set(dx, 0, dz);
          P.head[1] = -0.1;
        } else {
          this.mouseOffset.multiplyScalar(0.9);
        }
        break;
      }
      case 'think':
        P.rightArm = [-2.2, 0, 0.8];
        P.head = [-0.15, 0.35 + Math.sin(t * 0.8) * 0.05, 0.12];
        P.leftArm[0] -= 0.05;
        typing = 0.1;
        break;
      case 'stretch': {
        const k = Math.min(1, st / 0.6);
        P.rightArm = [-1.25 - k * 1.85, 0, 0.18 - k * 0.45];
        P.leftArm = [-1.25 - k * 1.85, 0, -0.18 + k * 0.45];
        P.head = [0.35 - k * 0.75, Math.sin(st * 2) * 0.1, 0];
        P.rightLeg[2] = 0.15 * k;
        P.leftLeg[2] = -0.15 * k;
        break;
      }
      case 'sip': {
        // 0~0.7초: 손을 컵으로, 이후 들어 올려 마시고, 마지막에 내려놓음
        const d = this.stateDuration;
        if (st > 0.7 && st < d - 0.7) this.attachMug(true);
        else this.attachMug(false);
        const lifted = st > 0.7 && st < d - 0.7;
        if (lifted) {
          P.leftArm = [-2.3, 0, -0.9];
          P.head = [-0.25 + Math.sin(st * 3) * 0.04, 0.1, 0];
        } else {
          P.leftArm = [-1.15, 0, 0.45];
          P.head = [0.25, 0.3, 0];
        }
        const mug = this.ws.mug;
        if (mug.parent === this.model.leftArm) {
          // 팔 회전을 상쇄해 컵이 (살짝 기울어진 채) 똑바로 서 있게
          mug.quaternion.copy(this.model.leftArm.quaternion).invert().multiply(SIP_TILT);
        }
        P.rightArm[0] += Math.sin(t * 20) * 0.03;
        typing = 0.3;
        break;
      }
      case 'sleep':
        P.head = [0.75 + Math.sin(t * 1.4) * 0.06, 0.15, 0.1];
        P.rightArm = [-1.4, 0.3, 0.45];
        P.leftArm = [-1.4, -0.3, -0.45];
        break;
      case 'wave': {
        P.head = [0.0, FACE_CAMERA_YAW, 0];
        P.leftArm = [-2.75, 0, -0.35 + Math.sin(st * 14) * 0.35];
        break;
      }
    }

    // 커서 바라보기 (작업 중엔 살짝만)
    if (this.lookTarget && t < this.lookUntil && this.state !== 'sleep') {
      const w = this.state === 'wave' ? 0.8 : 0.45;
      const yaw = THREE.MathUtils.clamp(FACE_CAMERA_YAW + this.lookTarget.x * 0.9, -0.9, 0.9);
      const pitch = THREE.MathUtils.clamp(-this.lookTarget.y * 0.5, -0.4, 0.4);
      P.head[1] = THREE.MathUtils.lerp(P.head[1], yaw, w);
      P.head[0] = THREE.MathUtils.lerp(P.head[0], pitch, w);
    }

    const k = 1 - Math.exp(-dt * (this.state === 'work' ? 18 : 8));
    for (const [name, [x, y, z]] of Object.entries(P)) {
      const r = this.model[name].rotation;
      r.x += (x - r.x) * k;
      r.y += (y - r.y) * k;
      r.z += (z - r.z) * k;
    }

    if (this.state !== 'work') this.mouseOffset.multiplyScalar(0.9);
    this.ws.mouse.position.copy(this.ws.mouseHome).add(this.mouseOffset);

    this.typingSpeed = typing;
    return typing;
  }
}
