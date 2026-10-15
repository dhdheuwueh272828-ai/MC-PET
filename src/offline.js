// 키 없이 쓰는 무료 "내장 AI": 상황 조합 대사, 키워드 대화, 키워드로 동작 조립
// (Gemini/Claude 를 못 쓸 때 자동으로 이걸 쓴다)

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;

function timeOfDay(h) {
  if (h < 5) return 'night';
  if (h < 11) return 'morning';
  if (h < 14) return 'noon';
  if (h < 18) return 'afternoon';
  if (h < 22) return 'evening';
  return 'night';
}

const BY_TIME = {
  morning: ['좋은 아침! ☀️', '아침엔 역시 커피지', '오늘도 힘내 보자!', '아직 잠이 덜 깼어…'],
  noon: ['점심 먹었어?', '배고프다… 🍙', '점심 먹고 하자!'],
  afternoon: ['오후엔 집중이 잘 돼', '조금만 더 하면 끝!', '간식 타임 언제야?'],
  evening: ['저녁 먹었어?', '오늘 하루 고생했어', '노을 예쁘겠다'],
  night: ['벌써 밤이야…', '졸려… 이것만 하고 잘래', '밤샘은 안 돼!', '별 보고 싶다 ✨'],
};

const BY_PLACE = {
  classroom: ['칠판에 뭐라고 쓸까?', '쉬는 시간 언제야?', '여기서 공부하니까 학생 같다', '선생님 오시기 전에 끝내자!'],
  winter: ['난로 앞이라 따뜻해 🔥', '밖에 눈 온다 ❄️', '코코아 마시고 싶다', '장작 하나 더 넣을까?'],
  cafe: ['카페 음악 좋다 ☕', '라떼 한 잔 더?', '카페에선 집중이 잘 돼', '창밖 구경 중~'],
  office: ['회의 언제였지?', '옆자리도 열일 중이네', '메일 하나만 보내고…', '정수기 물 한 잔 마시고 올까'],
  library: ['쉿, 도서관이야 🤫', '다들 열공 중이네 📚', '이 책 빌려 갈까?', '조용해서 집중 잘 된다'],
  outdoor: ['바람 시원하다 🍃', '하늘 진짜 맑다 ☀️', '산책하는 사람 많네', '밖에서 일하니까 기분 좋아'],
  none: ['여기 조용해서 좋아', '책상 정리 좀 할까?'],
};

const BY_STATE = {
  work: ['코드가 술술 써진다!', '버그야 나와라~ 🐛', '커밋 하나 더!', '세미콜론 빠뜨렸나?', '빌드 성공하자…', '오늘은 다이아몬드급 코드 💎', '크리퍼 같은 버그 발견!'],
  think: ['흠… 어떻게 하지?', '이게 왜 되지?', '머리 굴리는 중 🤔', '레드스톤 회로 같네…'],
  read: ['이 책 진짜 재밌어', '한 장만 더…', '오, 이런 방법이!', '마법 부여 책인가 📖'],
  sip: ['커피 수혈 중 ☕', '역시 커피가 최고야'],
  stretch: ['어깨 뭉쳤다~', '스트레칭은 중요해!'],
};

/** 상황(시간·장소·행동)을 조합한 한마디 */
export function offlineLine(ctx) {
  const pools = [];
  if (BY_STATE[ctx.stateId]) pools.push(BY_STATE[ctx.stateId], BY_STATE[ctx.stateId]);
  pools.push(BY_TIME[timeOfDay(ctx.hour)]);
  pools.push(BY_PLACE[ctx.themeId] ?? BY_PLACE.none);
  let line = pick(pick(pools));
  // 최근에 한 말은 피한다
  for (let i = 0; i < 4 && ctx.recent?.includes(line); i++) line = pick(pick(pools));
  return line;
}

// ── 말 걸기: 키워드 → 대답 + 동작 ──
const RULES = [
  [/안녕|하이|ㅎㅇ|hello|hi\b/i, ['안녕! 반가워 👋', '왔구나! 보고 싶었어', '안녕안녕~'], 'wave'],
  [/잘\s*자|굿나잇|자러/i, ['잘 자! 좋은 꿈 꿔 🌙', '나도 이제 졸려…'], 'sleep'],
  [/졸려|피곤|힘들/i, ['조금 쉬었다 하자', '기지개 한 번 켜 볼까?', '커피 한 잔 어때?'], 'stretch'],
  [/커피|음료|마실/i, ['커피 좋지! ☕', '나도 한 모금!'], 'sip'],
  [/밥|배고|먹었|점심|저녁|아침/i, ['나는 쿠키 먹었어 🍪', '밥은 꼭 챙겨 먹어!', '구운 감자 먹고 싶다'], 'think'],
  [/책|공부|읽/i, ['같이 공부하자 📖', '책 읽는 거 좋아해!'], 'read'],
  [/좋아|사랑|귀여|최고|짱/i, ['헤헤, 나도 좋아 💕', '부끄러워…', '너도 최고야!'], 'happy'],
  [/잘했|대단|천재|멋져|고마/i, ['헤헤 칭찬 고마워!', '더 열심히 할게!', '아하! 비결은 비밀이야'], 'aha'],
  [/뭐\s*해|뭐하|하는\s*중/i, ['코딩하는 중이야!', '일하고 있지~ 같이 할래?'], 'work'],
  [/춤|댄스|신나/i, ['신난다~ 🎶', '내 춤 실력 볼래?'], 'dance'],
  [/모르|어떡|고민|어떻게/i, ['같이 생각해 보자 🤔', '흠… 어려운 문제네'], 'think'],
  [/알았|깨달|아하|그렇구나/i, ['아하! 그거였구나 💡', '역시 그렇지!'], 'aha'],
  [/크리퍼|creeper/i, ['쉿… 크리퍼 소리 들렸어?', '크리퍼는 무서워!'], 'think'],
  [/다이아|diamond/i, ['다이아몬드 찾으러 가자! 💎', '다이아는 Y=-58 근처!'], 'aha'],
];

/** @returns {{line: string, motion: string}} motion 은 상태 이름 또는 'dance' */
export function offlineChat(message, name = '') {
  if (/이름|누구|who/i.test(message)) return { line: name ? `나는 ${name}! 반가워 😊` : '나? 너의 작업 펫이지!', motion: 'wave' };
  for (const [re, lines, motion] of RULES) if (re.test(message)) return { line: pick(lines), motion };
  return { line: pick(['응응, 듣고 있어!', '그렇구나~', '오 진짜?', '더 얘기해 줘!', '음… 무슨 말인지 알 것 같아']), motion: chance(0.5) ? 'happy' : 'think' };
}

// ── 키워드로 동작 조립 ──
const BASE = { head: [0.35, 0, 0], rightArm: [-1.25, 0, 0.18], leftArm: [-1.25, 0, -0.18], rightLeg: [-1.57, 0, 0.05], leftLeg: [-1.57, 0, -0.05], bounce: 0 };
const pose = (o) => ({ ...structuredClone(BASE), ...o });

// 각 조각: 기본 자세 → … → 기본 자세 로 끝나는 프레임 목록 (시간은 상대값)
const PIECES = {
  hooray: { words: /만세|환호|야호/, line: '만세~! 🙌', prop: 'none', frames: (n = 3) => Array.from({ length: n }, () => [pose({ rightArm: [-3, 0, -0.3], leftArm: [-3, 0, 0.3], head: [-0.3, 0.45, 0], bounce: 3 }), pose({ rightArm: [-2.4, 0, -0.5], leftArm: [-2.4, 0, 0.5], head: [-0.1, 0.45, 0] })]).flat() },
  clap: { words: /박수|짝짝|clap/, line: '짝짝짝! 👏', prop: 'none', frames: (n = 4) => Array.from({ length: n }, () => [pose({ rightArm: [-1.6, 0, 0.6], leftArm: [-1.6, 0, -0.6], head: [0, 0.45, 0] }), pose({ rightArm: [-1.6, 0, 0.1], leftArm: [-1.6, 0, -0.1], head: [0.05, 0.45, 0] })]).flat() },
  dance: { words: /춤|댄스|dance|흔들흔들/, line: '신난다~ 🎶', prop: 'none', frames: (n = 3) => Array.from({ length: n }, () => [pose({ rightArm: [-2.8, 0, -0.4], leftArm: [-0.6, 0, 0.4], head: [0, 0.3, 0.25], rightLeg: [-1.3, 0, 0], leftLeg: [-1.8, 0, 0], bounce: 2.5 }), pose({ rightArm: [-0.6, 0, -0.4], leftArm: [-2.8, 0, 0.4], head: [0, 0.6, -0.25], rightLeg: [-1.8, 0, 0], leftLeg: [-1.3, 0, 0], bounce: 0 })]).flat() },
  jump: { words: /점프|뛰|폴짝|jump/, line: '폴짝! 🐸', prop: 'none', frames: (n = 3) => Array.from({ length: n }, () => [pose({ bounce: 4, rightArm: [-0.4, 0, -0.5], leftArm: [-0.4, 0, 0.5], head: [-0.2, 0.45, 0] }), pose({ bounce: 0, rightArm: [-0.8, 0, 0], leftArm: [-0.8, 0, 0] })]).flat() },
  wave: { words: /인사|손\s*흔|안녕|바이|bye/, line: '안녕~ 👋', prop: 'none', frames: (n = 4) => Array.from({ length: n }, (_, i) => pose({ head: [0, 0.45, 0], leftArm: [-2.75, 0, i % 2 ? 0 : -0.7] })) },
  nod: { words: /끄덕|그래그래|응응/, line: '응응!', prop: 'none', frames: (n = 3) => Array.from({ length: n }, () => [pose({ head: [0.6, 0.45, 0] }), pose({ head: [-0.1, 0.45, 0] })]).flat() },
  shake: { words: /도리도리|아니|싫어/, line: '아니아니~', prop: 'none', frames: (n = 3) => Array.from({ length: n }, () => [pose({ head: [0.1, 0.9, 0] }), pose({ head: [0.1, -0.1, 0] })]).flat() },
  heart: { words: /하트|사랑|좋아|love/, line: '사랑해 💕', prop: 'heart', frames: () => [pose({ rightArm: [-2.6, 0, 0.9], leftArm: [-2.6, 0, -0.9], head: [-0.1, 0.45, 0.15], bounce: 1 }), pose({ rightArm: [-2.6, 0, 0.9], leftArm: [-2.6, 0, -0.9], head: [-0.1, 0.45, -0.15], bounce: 1 })] },
  think: { words: /생각|고민|궁금/, line: '흠…🤔', prop: 'lightbulb', frames: () => [pose({ rightArm: [-2.2, 0, 0.8], head: [-0.15, 0.35, 0.12] }), pose({ rightArm: [-2.2, 0, 0.8], head: [-0.25, 0.1, -0.1] }), pose({ rightArm: [-3, 0, 0], head: [-0.3, 0.45, 0], bounce: 2 })] },
  read: { words: /책|독서|읽/, line: '책 읽는 중 📖', prop: 'book', frames: () => [pose({ rightArm: [-1.32, 0, 0.42], leftArm: [-1.32, 0, -0.42], head: [0.45, 0, 0] }), pose({ rightArm: [-1.32, 0, 0.42], leftArm: [-1.5, 0.2, -0.2], head: [0.45, 0.05, 0] })] },
  coffee: { words: /커피|마시|음료/, line: '한 모금~ ☕', prop: 'coffee', frames: () => [pose({ leftArm: [-2.3, 0, -0.9], head: [-0.25, 0.1, 0] }), pose({ leftArm: [-2.2, 0, -0.85], head: [-0.2, 0.1, 0] })] },
  stretch: { words: /기지개|스트레칭|쭉/, line: '으아~ 쭉!', prop: 'none', frames: () => [pose({ rightArm: [-3.1, 0, -0.27], leftArm: [-3.1, 0, 0.27], head: [-0.4, 0, 0] }), pose({ rightArm: [-3.1, 0, -0.5], leftArm: [-3.1, 0, 0.5], head: [-0.4, 0.2, 0], rightLeg: [-1.57, 0, 0.15], leftLeg: [-1.57, 0, -0.15] })] },
  kick: { words: /발|동동|발장구/, line: '동동동~', prop: 'none', frames: (n = 4) => Array.from({ length: n }, () => [pose({ rightLeg: [-1.2, 0, 0], leftLeg: [-1.9, 0, 0] }), pose({ rightLeg: [-1.9, 0, 0], leftLeg: [-1.2, 0, 0] })]).flat() },
};

const NUM = { 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5 };

/** "만세 세 번 하고 박수" → 조각들을 이어 붙인 키프레임 동작 */
export function offlineMotion(desc) {
  const found = Object.entries(PIECES)
    .map(([id, p]) => ({ id, p, at: desc.search(p.words) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at);
  // 아는 단어가 없으면 아무 동작이나 하나 골라서 해 본다
  const parts = found.length ? found : [Object.entries(PIECES).map(([id, p]) => ({ id, p }))[Math.floor(Math.random() * Object.keys(PIECES).length)]];
  const countMatch = desc.match(/(\d+|한|하나|두|둘|세|셋|네|넷|다섯)\s*(번|회|개)/);
  const count = countMatch ? Math.min(6, Number(countMatch[1]) || NUM[countMatch[1]] || 3) : undefined;

  const frames = [structuredClone(BASE)];
  for (const { p } of parts) frames.push(...p.frames(count));
  frames.push(structuredClone(BASE));
  const step = 0.45;
  const duration = Math.min(12, Math.max(2, frames.length * step));
  const keyframes = frames.map((f, i) => ({ ...f, t: i / (frames.length - 1) }));
  const name = desc.replace(/\s+/g, ' ').trim().slice(0, 10).trim() || parts.map(({ id }) => id).join('+');
  return {
    name,
    line: found.length ? parts[0].p.line : '이렇게 하는 거 맞아? 😅',
    duration,
    loop: /계속|반복|무한/.test(desc),
    prop: parts.find(({ p }) => p.prop !== 'none')?.p.prop ?? 'none',
    keyframes,
  };
}
