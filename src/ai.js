// AI 연동: 실시간 대사, 말 걸기, 새 동작 만들기
// Gemini(무료 등급) 또는 Claude 를, 사용자가 직접 넣은 API 키로 브라우저(앱)에서 바로 호출한다.
// 키는 이 기기에만 저장되고, 웹사이트 코드나 GitHub 에는 들어가지 않는다.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { GoogleGenAI, ApiError as GeminiApiError } from '@google/genai';
import { z } from 'zod';

// Gemini: 항상 최신 Flash 를 가리키는 별칭. 한도/없음이면 Flash-Lite 로 한 번 더 시도
const GEMINI_MODELS = ['gemini-flash-latest', 'gemini-flash-lite-latest'];

const PERSONA = `너는 마인크래프트 스킨을 입은 작은 데스크톱 펫이야. 책상 의자에 앉아 컴퓨터로 일하는 중이고, 화면 밖의 주인(사용자)과 아주 친한 친구 사이야.
- 말투: 다정하고 밝은 반말. 귀엽고 짧게.
- 대사는 말풍선에 들어가니 한 문장, 25자 이내. 이모지는 0~1개.
- 욕설, 비하, 부정적이거나 무서운 말은 하지 않아.
- 마크 느낌(블록, 크리퍼, 다이아몬드, 곡괭이 등)을 가끔 살짝 섞어도 좋아.`;

const MOTION_GUIDE = `캐릭터는 의자에 앉아 있고, 관절별 회전 [x, y, z] (라디안)으로 자세를 정한다.
기본(타이핑) 자세: head [0.35,0,0], rightArm [-1.25,0,0.18], leftArm [-1.25,0,-0.18], rightLeg [-1.57,0,0.05], leftLeg [-1.57,0,-0.05], bounce 0.
- 팔 x: 0 = 아래로 늘어뜨림, -1.57 = 앞으로 수평, -3.0 = 머리 위로 번쩍. (양수로는 거의 안 씀)
- rightArm z: 양수 = 몸 안쪽으로 모음, 음수 = 바깥으로 벌림. leftArm z 는 반대 (음수 = 안쪽, 양수 = 바깥).
- 오른손을 턱에: rightArm [-2.2,0,0.8]. 두 팔 만세: rightArm [-3.0,0,-0.3], leftArm [-3.0,0,0.3]. 손 흔들기: leftArm [-2.75,0,-0.35] 에서 z 를 ±0.35 로 왕복.
- head x: 양수 = 고개 숙임, 음수 = 고개 듦 (±0.6 정도). head y: 0.45 = 화면(사용자) 정면을 봄, 음수 = 반대쪽. head z: 갸웃 (±0.3).
- 다리: 앉아 있으므로 x 는 -1.57 근처를 유지하고 ±0.3 정도로 동동 흔드는 것만.
- bounce: 몸이 위로 들썩이는 높이 (0~4).
- keyframes 의 t 는 0~1 (전체 시간에 대한 비율), 4~10개, t 오름차순. 시작과 끝은 기본 자세 근처. loop 가 true 면 첫/마지막 키프레임을 같게.
- 빠른 왕복 동작은 키프레임을 촘촘히. duration 은 2~8초.
- prop: 필요하면 book(펼친 책), lightbulb(머리 위 전구), heart(하트가 뿅뿅), coffee(왼손에 커피잔), 아니면 none.`;

const vec3 = z.array(z.number()).describe('[x, y, z] 라디안');
const MotionSchema = z.object({
  name: z.string().describe('동작의 짧은 한국어 이름 (8자 이내)'),
  line: z.string().describe('동작을 시작할 때 할 대사 (25자 이내, 반말)'),
  duration: z.number().describe('초'),
  loop: z.boolean(),
  prop: z.enum(['none', 'book', 'lightbulb', 'heart', 'coffee']),
  keyframes: z.array(
    z.object({
      t: z.number(),
      head: vec3,
      rightArm: vec3,
      leftArm: vec3,
      rightLeg: vec3,
      leftLeg: vec3,
      bounce: z.number(),
    }),
  ),
});

const LineSchema = z.object({ line: z.string().describe('말풍선 대사 (25자 이내)') });

export class AIError extends Error {
  constructor(message, { quota = false } = {}) {
    super(message);
    this.quota = quota; // 무료 한도 초과 → 잠시 내장 AI 로
  }
}

/**
 * @param getProvider () => 'gemini' | 'claude'
 * @param getKey (provider) => string
 * @param getModel () => Claude 모델 ID
 */
export function createAI({ getProvider, getKey, getModel }) {
  const clients = {};

  function getClient(provider) {
    const key = getKey(provider);
    if (!key) throw new AIError(`${provider === 'gemini' ? 'Gemini' : 'Claude'} API 키를 먼저 입력해 주세요 (🤖 AI 탭)`);
    const cached = clients[provider];
    if (cached?.key === key) return cached.client;
    // 브라우저에서 직접 호출: 키는 사용자 본인 것이고 이 기기에만 저장된다
    const client =
      provider === 'gemini'
        ? new GoogleGenAI({ apiKey: key })
        : new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });
    clients[provider] = { key, client };
    return client;
  }

  async function askGemini(system, user, schema) {
    const ai = getClient('gemini');
    const { $schema, ...jsonSchema } = z.toJSONSchema(schema);
    let lastErr;
    for (const model of GEMINI_MODELS) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: user,
          config: { systemInstruction: system, responseMimeType: 'application/json', responseJsonSchema: jsonSchema },
        });
        const parsed = schema.safeParse(JSON.parse(res.text ?? ''));
        if (!parsed.success) throw new AIError('Gemini 응답을 읽지 못했어요');
        return parsed.data;
      } catch (e) {
        lastErr = e;
        // 모델이 없거나(404) 한도 초과(429)면 다음 모델로
        if (e instanceof GeminiApiError && (e.status === 404 || e.status === 429)) continue;
        break;
      }
    }
    const e = lastErr;
    if (e instanceof GeminiApiError) {
      if (e.status === 429) throw new AIError('Gemini 무료 한도에 걸렸어요. 잠시 내장 대사로 할게요', { quota: true });
      if (e.status === 400 || e.status === 401 || e.status === 403) throw new AIError('Gemini API 키를 확인해 주세요');
      throw new AIError(`Gemini 오류 (${e.status})`);
    }
    if (e instanceof AIError) throw e;
    throw new AIError('Gemini 에 연결하지 못했어요 (인터넷 확인)');
  }

  async function ask(system, user, schema, effort) {
    if (getProvider() === 'gemini') return askGemini(system, user, schema);
    const model = getModel();
    const params = {
      model,
      max_tokens: 8000,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort, format: betaZodOutputFormat(schema) },
    };
    // Opus 는 안전 필터로 거절될 때 서버가 다른 모델로 자동 재시도 (fallbacks)
    if (model.startsWith('claude-opus')) {
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
    }
    let res;
    try {
      res = await getClient('claude').beta.messages.parse(params);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new AIError('API 키가 올바르지 않아요');
      if (e instanceof Anthropic.PermissionDeniedError) throw new AIError('이 키로는 해당 모델을 쓸 수 없어요');
      if (e instanceof Anthropic.RateLimitError) throw new AIError('요청이 너무 많아요. 잠시 후 다시 해 주세요', { quota: true });
      if (e instanceof Anthropic.APIConnectionError) throw new AIError('Claude 에 연결하지 못했어요 (인터넷 확인)');
      if (e instanceof Anthropic.APIError) throw new AIError(`Claude 오류 (${e.status ?? '?'})`);
      throw e;
    }
    if (res.stop_reason === 'refusal') throw new AIError('Claude 가 이 요청은 할 수 없대요');
    if (!res.parsed_output) throw new AIError('Claude 응답을 읽지 못했어요');
    return res.parsed_output;
  }

  const describe = (ctx) =>
    [
      `지금 하는 행동: ${ctx.state}`,
      `장소: ${ctx.place}`,
      `작업 도구: ${ctx.setup}`,
      `현재 시각: ${ctx.time}`,
      ctx.event ? `방금 있었던 일: ${ctx.event}` : '',
      ctx.recent?.length ? `최근에 한 말 (반복 금지): ${ctx.recent.join(' / ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

  return {
    /** 지금 상황에 맞는 한마디 */
    async line(ctx) {
      const out = await ask(PERSONA, `${describe(ctx)}\n\n지금 상황에 어울리는 혼잣말이나 주인에게 하는 한마디를 해 줘.`, LineSchema, 'low');
      return out.line.trim();
    },

    /** 주인이 말을 걸었을 때: 대답 + 할 동작 */
    async chat(message, ctx, motions, history) {
      const names = motions.map(([id]) => id);
      const Schema = z.object({
        line: z.string().describe('대답 (25자 이내, 반말)'),
        motion: z.enum(names).describe('대답하면서 할 동작'),
      });
      const menu = motions.map(([id, label]) => `- ${id}: ${label}`).join('\n');
      const past = history.map(([u, a]) => `주인: ${u}\n나: ${a}`).join('\n');
      const out = await ask(
        `${PERSONA}\n\n대답과 함께 아래 동작 중 하나를 골라서 해.\n${menu}`,
        `${describe(ctx)}\n${past ? `\n이전 대화:\n${past}\n` : ''}\n주인이 말을 걸었어: "${message}"`,
        Schema,
        'low',
      );
      return { line: out.line.trim(), motion: out.motion };
    },

    /** 설명대로 새 동작(키프레임) 만들기 */
    async motion(description) {
      return ask(`${PERSONA}\n\n${MOTION_GUIDE}`, `이런 동작을 만들어 줘: ${description}`, MotionSchema, 'medium');
    },
  };
}
