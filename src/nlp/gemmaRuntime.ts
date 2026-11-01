// Gemma 4 모델은 APK 밖의 앱 전용 파일에서 읽는다.
import { initLlama, loadLlamaModelInfo, type LlamaContext } from 'llama.rn';
import { AppState, Platform } from 'react-native';
import { intentMessages, intentJsonSchema, parseSearchIntent, intentContextSize, intentMaxTokens, type SearchIntent } from './searchIntent';
import type { MapPackage } from './types';

export const MODEL_FILE = 'gemma-4-E2B_q4_0-it.gguf';
// The 3.35 GB model is installed separately in this app's Android external files directory.
export const MODEL_URI = `file:///storage/emulated/0/Android/data/kr.ac.skuniv.campusclient/files/models/${MODEL_FILE}`;
async function modelUri(): Promise<string> {
  return MODEL_URI;
}

let ctx: LlamaContext | null = null;
let loading: Promise<LlamaContext> | null = null;
let lastLoadMs: number | null = null;

/** 별도 설치한 모델의 GGUF 머리말을 확인한다(추론 검증과 별도). */
export async function checkModel(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    await loadLlamaModelInfo(await modelUri());
    return true;
  } catch {
    return false;
  }
}

async function load(): Promise<LlamaContext> {
  if (ctx) return ctx;
  if (!loading) {
    const t0 = Date.now();
    // S21 실측(llama-bench): 4 스레드가 가장 빠름. 평가와 같은 문맥 4096, CPU 만(GPU 층 0)
    loading = modelUri()
      .then((model) => initLlama({ model, n_ctx: intentContextSize, n_threads: 4, n_gpu_layers: 0, use_mlock: false }))
      .then((c) => {
        ctx = c;
        lastLoadMs = Date.now() - t0;
        return c;
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

/** 놓기(메모리 반환). 앱이 뒤로 가면 부름. */
export async function freeModel(): Promise<void> {
  const c = ctx;
  ctx = null;
  if (c) await c.release().catch(() => undefined);
}
AppState.addEventListener('change', (s) => {
  if (s !== 'active') void freeModel();
});

export async function cancelInterpret(): Promise<void> {
  await ctx?.stopCompletion().catch(() => undefined);
}

export interface GemmaResult {
  intent: SearchIntent | null;
  raw: string;
  loadMs: number | null;
  totalMs: number;
  promptMs: number | null;
  genMs: number | null;
  promptN: number | null;
  genN: number | null;
}

/** 문장 → 요청(AI). 목록 없는 의도 JSON만 추출한다. 실제 자료 조회는 앱에서 별도로 수행한다. */
export async function interpretWithGemma(text: string, _pkg?: MapPackage): Promise<GemmaResult> {
  const t0 = Date.now();
  const firstLoad = !ctx;
  const c = await load();
  const msgs = intentMessages(text);
  const r = await c.completion({
    messages: msgs,
    // 모델의 Gemma 3 채팅 틀(jinja)로 프롬프트를 만들고 답 자리부터 생성(문법 제한도 이 경로에서 적용)
    jinja: true,
    add_generation_prompt: true,
    enable_thinking: false,
    temperature: 0,
    seed: 0,
    n_predict: intentMaxTokens,
    response_format: { type: 'json_schema', json_schema: { schema: intentJsonSchema } },
  });
  let intent: SearchIntent | null = null;
  try {
    // 앞에 채팅 틀 글이 붙어 나와도 JSON 부분만
    const j = r.text.slice(r.text.indexOf('{'), r.text.lastIndexOf('}') + 1);
    intent = parseSearchIntent(JSON.parse(j));
  } catch {
    intent = null;
  }
  const tm = r.timings as { prompt_ms?: number; predicted_ms?: number; prompt_n?: number; predicted_n?: number } | undefined;
  return {
    intent,
    raw: r.text,
    loadMs: firstLoad ? lastLoadMs : null,
    totalMs: Date.now() - t0,
    promptMs: tm?.prompt_ms ?? null,
    genMs: tm?.predicted_ms ?? null,
    promptN: tm?.prompt_n ?? null,
    genN: tm?.predicted_n ?? null,
  };
}
