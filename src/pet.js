import * as THREE from 'three';

// 상태별 지속 시간(초)과 말풍선 대사
export const STATES = {
  work: { label: '작업', duration: [14, 26], lines: ['코딩 중...', '거의 다 됐어!', '버그 잡는 중 🐛', '빌드 돌리는 중', '커밋 완료 ✓'] },
  think: { label: '고민', duration: [4, 6], lines: ['흠...', '🤔', '이게 왜 되지?', '어디서 틀렸지...'] },
  aha: { label: '아하!', duration: [2.6, 3], lines: ['아하! 💡', '알았다!', '그거였구나!', '유레카!'] },
  read: { label: '독서', duration: [9, 14], lines: ['📖 흠흠...', '이 책 재밌다', '다음 장!', '오호...'] },
  stretch: { label: '스트레칭', duration: [3, 4], lines: ['으아~ 🙆', '기지개 쭉!'] },
  sip: { label: '커피', duration: [4, 5], lines: ['커피 타임 ☕', '후루룩'] },
  sleep: { label: '낮잠', duration: [8, 12], lines: ['Zzz...', 'zZ'] },
  wave: {
    label: '인사',
    duration: [2.2, 2.2],
    lines: [
      '안녕!', '앗, 안녕 👋', '나 일하는 중이야!', '같이 일하자!', '왔어? 반가워!', '불렀어?', '응? 무슨 일이야?',
      '헤헤, 나 여기 있어!', '오늘도 파이팅! 💪', '깜짝이야!', '나 보고 싶었구나?', '뭐 도와줄까?',
      '다이아 찾으면 나눠 줄게 💎', '크리퍼는 아니지…?', '톡톡 하지 마~ ㅎㅎ', '심심했어?', '같이 놀까?',
      '잠깐 쉬어도 돼', '물 마셨어? 💧', '집중 집중!',
    ],
  },
  happy: {
    label: '좋아해',
    duration: [2.6, 2.6],
    lines: [
      '헤헤~ 💕', '기분 좋아~', '더 쓰다듬어 줘!', '좋아좋아 😊', '간지러워 ㅎㅎ', '으헤헤…', '행복해~ ✨',
      '머리 쓰담 최고야', '너 손 따뜻하다', '계속 해 줘~', '고양이 된 기분이야 🐱', '힘이 난다!',
      '오늘 하루 다 풀렸어', '나도 너 좋아해 💕', '이러면 일 못 하잖아~',
    ],
  },
  custom: { label: '커스텀', duration: [3, 3], lines: [] },
};

// 잠깐 하고 이전 행동으로 돌아가는 상태
const TRANSIENT = new Set(['wave', 'happy']);
// 상태가 시작되자마자 말하는 상태
const SAY_ON_START = new Set(['sleep', 'wave', 'aha', 'happy']);

const AUTO_NEXT = [
  ['think', 3],
  ['aha', 2],
  ['read', 2],
  ['stretch', 2],
  ['sip', 3],
  ['sleep', 1],
];

// 카메라가 오른쪽 앞에서 바라보므로 고개를 +y 로 돌리면 카메라를 본다
const FACE_CAMERA_YAW = 0.45;
const SIP_TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0));
const JOINTS = ['head', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = ([a, b]) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function weighted(list) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of list) if ((r -= w) <= 0) return v;
  return list[0][0];
}

/** AI 가 만든 동작을 안전한 범위로 정리 (각도는 라디안) */
export function sanitizeMotion(m) {
  const vec = (a, lim) => [0, 1, 2].map((i) => clamp(Number(a?.[i]) || 0, -lim, lim));
  const frames = (Array.isArray(m.keyframes) ? m.keyframes : [])
    .map((f) => ({
      t: clamp(Number(f.t) || 0, 0, 1),
      head: vec(f.head, 1.2),
      rightArm: vec(f.rightArm, Math.PI),
      leftArm: vec(f.leftArm, Math.PI),
      rightLeg: vec(f.rightLeg, Math.PI),
      leftLeg: vec(f.leftLeg, Math.PI),
      bounce: clamp(Number(f.bounce) || 0, -2, 6),
    }))
    .sort((a, b) => a.t - b.t);
  if (!frames.length) throw new Error('동작 키프레임이 비어 있어요');
  return {
    name: String(m.name || '새 동작').slice(0, 16),
    line: String(m.line || '').slice(0, 40),
    duration: clamp(Number(m.duration) || 3, 1, 12),
    loop: !!m.loop,
    prop: ['none', 'book', 'lightbulb', 'heart', 'coffee'].includes(m.prop) ? m.prop : 'none',
    keyframes: frames,
  };
}

function sampleMotion(motion, u) {
  const f = motion.keyframes;
  if (u <= f[0].t) return f[0];
  for (let i = 1; i < f.length; i++) {
    if (u <= f[i].t) {
      const a = f[i - 1];
      const b = f[i];
      const k = (u - a.t) / Math.max(1e-6, b.t - a.t);
      const s = k * k * (3 - 2 * k); // 부드럽게
      const out = { bounce: a.bounce + (b.bounce - a.bounce) * s };
      for (const j of JOINTS) out[j] = a[j].map((v, i2) => v + (b[j][i2] - v) * s);
      return out;
    }
  }
  return f[f.length - 1];
}

export class PetController {
  /**
   * @param props {book, bulb} 소품 (scene.buildProps)
   * @param onSay (line, state) 말풍선 요청 — AI 대사로 바꿔 끼울 수 있다
   * @param onHearts () 하트 파티클
   */
  constructor(model, workspace, { onSay, onHearts, props } = {}) {
    this.model = model;
    this.ws = workspace;
    this.onSay = onSay ?? (() => {});
    this.onHearts = onHearts ?? (() => {});
    this.props = props ?? {};
    this.auto = true;
    this.time = 0;
    this.lookTarget = null; // {x, y} NDC, 커서/터치 위치
    this.lookUntil = 0;
    this.typingSpeed = 1;
    this.mouseOffset = new THREE.Vector3();
    this.bounce = 0;
    this.customMotions = [];
    this.customFreq = 0.5; // 자동 행동에서 직접 만든 동작이 뽑힐 확률 (끔 0 / 가끔 0.2 / 자주 0.5)
    this.lastCustom = null; // 같은 동작이 연달아 나오지 않게
    this.setState('work');
  }

  setState(name, { manual = false, motion = null, line = null } = {}) {
    const def = STATES[name];
    this.state = name;
    this.stateTime = 0;
    this.motion = name === 'custom' ? motion : null;
    const transient = TRANSIENT.has(name) || (name === 'custom' && !motion?.loop);
    this.stateDuration = name === 'custom' ? motion.duration * (motion.loop && manual ? Infinity : motion.loop ? 3 : 1) : manual && !transient ? Infinity : rand(def.duration);
    this.nextLineAt = name === 'work' ? 3 + Math.random() * 5 : name === 'read' ? 2 : 0.2;
    if (manual && !transient) this.auto = false;
    if (name !== 'sip' && !(name === 'custom' && motion?.prop === 'coffee')) this.attachMug(false);
    if (name === 'custom') {
      if (motion.line) this.onSay(motion.line, name);
    } else if (SAY_ON_START.has(name)) this.onSay(line ?? pick(def.lines), name);
  }

  /** 잠깐 하는 동작(인사·쓰다듬기·일회성 커스텀)을 하고 원래 하던 것으로 돌아가기 */
  interrupt(name, opts = {}) {
    if (!(TRANSIENT.has(this.state) || (this.state === 'custom' && !this.motion?.loop))) this.prevState = this.state;
    this.setState(name, opts);
  }

  setAuto(on) {
    this.auto = on;
    if (on && this.stateDuration === Infinity) this.stateDuration = rand(STATES[this.state === 'custom' ? 'work' : this.state].duration);
  }

  /** 탭했을 때: 하던 일·시간·연타 횟수에 따라 대사가 달라진다 */
  poke() {
    const now = this.time;
    this.pokes = (this.pokes ?? []).filter((t) => now - t < 6);
    this.pokes.push(now);
    const n = this.pokes.length;
    const hour = new Date().getHours();
    // 🎭 정한 성격의 터치 대사가 있으면 그걸로 (연타 중이면 연타용)
    const custom = this.tapLine?.(n >= 4 ? 'spam' : 'tap');
    if (custom) return this.interrupt('wave', { line: custom });
    let lines = STATES.wave.lines;
    if (n >= 7) lines = ['그만 눌러~ 😤', '으아아 정신없어!', '나 화났어! …농담이야 ㅎㅎ', '손가락 아프겠다!'];
    else if (n >= 4) lines = ['간지러워!', '왜 자꾸 눌러~ ㅎㅎ', '톡톡톡! 나도 톡톡!', '장난꾸러기네?'];
    else if (this.state === 'sleep') lines = ['으음… 깼잖아 😪', '5분만 더…', '꿈에서 다이아 캐고 있었는데!', '하암~ 잘 잤다'];
    else if (this.state === 'read') lines = ['책 읽는 중이었어 📖', '여기 재밌는 부분이야!', '같이 읽을래?'];
    else if (this.state === 'sip') lines = ['커피 흘릴 뻔했어! ☕', '한 모금 줄까?'];
    else if (this.state === 'think') lines = ['방금 생각나려 했는데!', '흠… 같이 고민해 줄래?'];
    else if (Math.random() < 0.35) {
      if (hour < 5 || hour >= 23) lines = ['이 시간에 안 자?', '밤이 깊었어… 🌙', '나도 졸려~'];
      else if (hour < 11) lines = ['좋은 아침! ☀️', '아침 먹었어?', '오늘도 힘내자!'];
      else if (hour < 14) lines = ['점심 맛있게 먹었어?', '배고프다… 🍙'];
      else if (hour >= 18) lines = ['저녁 먹었어?', '오늘 하루 고생했어!'];
    }
    this.interrupt('wave', { line: pick(lines) });
  }

  /** 쓰다듬는 중: 좋아하는 동작을 이어간다 */
  pet() {
    if (this.state === 'happy') {
      this.stateDuration = Math.max(this.stateDuration, this.stateTime + 1.6);
    } else {
      this.interrupt('happy', { line: this.tapLine?.('pet') ?? undefined });
    }
  }

  playCustom(motion, { manual = false } = {}) {
    if (motion.loop && manual) this.setState('custom', { manual: true, motion });
    else this.interrupt('custom', { motion });
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

  nextAuto() {
    // 직접 만든 동작은 개수와 상관없이 정한 확률로, 그 안에서는 균등하게 (⭐ 끈 동작 제외)
    const mine = this.customMotions.filter((m) => m.auto !== false);
    if (mine.length && Math.random() < this.customFreq) {
      const pool = mine.length > 1 ? mine.filter((m) => m.name !== this.lastCustom) : mine;
      const next = pool[Math.floor(Math.random() * pool.length)] ?? mine[0];
      this.lastCustom = next.name;
      this.setState('custom', { motion: next });
      return;
    }
    this.setState(weighted(AUTO_NEXT));
  }

  update(dt) {
    this.time += dt;
    this.stateTime += dt;
    const t = this.time;
    const st = this.stateTime;

    if (this.stateTime > this.stateDuration) {
      const oneShot = TRANSIENT.has(this.state) || (this.state === 'custom' && !this.motion?.loop);
      if (oneShot) {
        const back = this.auto ? 'work' : this.prevState && this.prevState !== 'custom' ? this.prevState : 'work';
        this.setState(back, { manual: !this.auto });
      } else if (this.auto) {
        if (this.state === 'work') this.nextAuto();
        else this.setState('work');
      }
    }

    const lines = STATES[this.state].lines;
    if (lines.length && !SAY_ON_START.has(this.state) && st > this.nextLineAt) {
      this.onSay(pick(lines), this.state);
      this.nextLineAt = st + (this.state === 'work' ? 8 + Math.random() * 10 : this.state === 'read' ? 6 + Math.random() * 4 : 99);
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
    let bounce = 0;
    let prop = 'none';

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
      case 'aha': {
        // 번뜩! 고개 들고 오른손 검지를 위로, 살짝 들썩
        const k = Math.min(1, st / 0.25);
        P.head = [-0.3 * k, 0.2, 0];
        P.rightArm = [-1.25 - 1.6 * k, 0, 0.18 - 0.1 * k];
        P.leftArm = [-1.25 + 0.2 * k, 0, -0.18];
        bounce = st < 0.5 ? Math.sin((st / 0.5) * Math.PI) * 2.2 : 0;
        if (st > 0.6) P.rightArm[0] += Math.sin(st * 9) * 0.08; // 손가락 까딱
        prop = 'lightbulb';
        break;
      }
      case 'read': {
        // 두 손으로 책을 들고 읽는다. 가끔 책장을 넘긴다
        P.head = [0.45 + Math.sin(t * 0.7) * 0.03, Math.sin(t * 0.4) * 0.06, 0];
        P.rightArm = [-1.32, 0, 0.42];
        P.leftArm = [-1.32, 0, -0.42];
        const flip = (st % 4.5) / 4.5;
        if (flip > 0.85) P.leftArm = [-1.5, 0.2, -0.2];
        prop = 'book';
        break;
      }
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
        const lifted = st > 0.7 && st < d - 0.7;
        this.attachMug(lifted);
        if (lifted) {
          P.leftArm = [-2.3, 0, -0.9];
          P.head = [-0.25 + Math.sin(st * 3) * 0.04, 0.1, 0];
        } else {
          P.leftArm = [-1.15, 0, 0.45];
          P.head = [0.25, 0.3, 0];
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
      case 'happy': {
        // 쓰다듬어 주면: 눈 감은 듯 고개를 갸웃갸웃, 몸을 들썩, 다리 동동
        P.head = [-0.05, FACE_CAMERA_YAW * 0.6, Math.sin(st * 6) * 0.22];
        P.rightArm = [-0.5 + Math.sin(st * 8) * 0.15, 0, 0.35];
        P.leftArm = [-0.5 - Math.sin(st * 8) * 0.15, 0, -0.35];
        P.rightLeg[0] += Math.sin(st * 10) * 0.18;
        P.leftLeg[0] -= Math.sin(st * 10) * 0.18;
        bounce = Math.abs(Math.sin(st * 6)) * 1.2;
        prop = 'heart';
        break;
      }
      case 'custom': {
        const m = this.motion;
        const u = m.loop ? (st / m.duration) % 1 : Math.min(1, st / m.duration);
        const f = sampleMotion(m, u);
        for (const j of JOINTS) P[j] = f[j];
        bounce = f.bounce;
        prop = m.prop;
        if (prop === 'coffee') this.attachMug(true);
        break;
      }
    }

    // 커서 바라보기 (작업 중엔 살짝만)
    if (this.lookTarget && t < this.lookUntil && !['sleep', 'read', 'custom'].includes(this.state)) {
      const w = this.state === 'wave' ? 0.8 : 0.45;
      const yaw = THREE.MathUtils.clamp(FACE_CAMERA_YAW + this.lookTarget.x * 0.9, -0.9, 0.9);
      const pitch = THREE.MathUtils.clamp(-this.lookTarget.y * 0.5, -0.4, 0.4);
      P.head[1] = THREE.MathUtils.lerp(P.head[1], yaw, w);
      P.head[0] = THREE.MathUtils.lerp(P.head[0], pitch, w);
    }

    const k = 1 - Math.exp(-dt * (this.state === 'work' ? 18 : this.state === 'custom' ? 14 : 8));
    for (const [name, [x, y, z]] of Object.entries(P)) {
      const r = this.model[name].rotation;
      r.x += (x - r.x) * k;
      r.y += (y - r.y) * k;
      r.z += (z - r.z) * k;
    }
    this.bounce += (bounce - this.bounce) * Math.min(1, dt * 20);
    this.model.root.position.y = this.bounce;

    const mug = this.ws.mug;
    if (mug.parent === this.model.leftArm) {
      // 팔 회전을 상쇄해 컵이 (살짝 기울어진 채) 똑바로 서 있게
      mug.quaternion.copy(this.model.leftArm.quaternion).invert().multiply(SIP_TILT);
    }

    this.updateProps(prop, dt);

    if (this.state !== 'work') this.mouseOffset.multiplyScalar(0.9);
    this.ws.mouse.position.copy(this.ws.mouseHome).add(this.mouseOffset);

    this.typingSpeed = typing;
    return typing;
  }

  updateProps(prop, dt) {
    const { book, bulb } = this.props;
    if (book) {
      book.visible = prop === 'book';
      if (book.visible) book.userData.tick?.(dt, this.stateTime);
    }
    if (bulb) {
      bulb.visible = prop === 'lightbulb';
      if (bulb.visible) {
        this.model.head.getWorldPosition(bulb.position);
        bulb.position.y += 14 + Math.sin(this.time * 4) * 0.4;
        const s = Math.min(1, this.stateTime / 0.25);
        bulb.scale.setScalar(0.3 + 0.7 * s);
      }
    }
    if (prop === 'heart') {
      this.heartAcc = (this.heartAcc ?? 0) + dt;
      if (this.heartAcc > 0.35) {
        this.heartAcc = 0;
        this.onHearts();
      }
    }
  }
}
