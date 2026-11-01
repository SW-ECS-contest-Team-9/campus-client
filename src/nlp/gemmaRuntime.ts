// APK 자산의 Gemma를 로컬 캐시로 풀어 읽는다. 외부 복사나 서버 다운로드 불필요.
import { Asset } from 'expo-asset';
import { initLlama, loadLlamaModelInfo, type LlamaContext } from 'llama.rn';
import { AppState, Platform } from 'react-native';
import { messages, jsonSchema, toRouteRequest, type ModelOutput } from './gemma';
import type { MapPackage, RouteRequest } from './types';

export const MODEL_FILE = 'gemma3-270m-route-Q4_K_M.gguf';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL_ASSET = require('../../assets/models/gemma3-270m-route-Q4_K_M.gguf');
async function modelUri(): Promise<string> {
  const asset = Asset.fromModule(MODEL_ASSET);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('Bundled model is unavailable');
  return asset.localUri;
}

let ctx: LlamaContext | null = null;
let loading: Promise<LlamaContext> | null = null;
let lastLoadMs: number | null = null;

/** 내장 모델을 로컬 파일로 준비하고 GGUF 머리말을 확인한다(추론 검증과 별도). */
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
    // S21 실측(llama-bench): 4 스레드가 가장 빠름. 문맥 2048, CPU 만(GPU 층 0)
    loading = modelUri()
      .then((model) => initLlama({ model, n_ctx: 2048, n_threads: 4, n_gpu_layers: 0, use_mlock: false }))
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
  req: RouteRequest | null;
  raw: string;
  loadMs: number | null;
  totalMs: number;
  promptMs: number | null;
  genMs: number | null;
  promptN: number | null;
  genN: number | null;
}

/** 문장 → 요청(AI). 출력은 JSON 스키마로 제한(목록 안 이름만). 해석 실패면 req null. */
export async function interpretWithGemma(text: string, pkg: MapPackage): Promise<GemmaResult> {
  const t0 = Date.now();
  const firstLoad = !ctx;
  const c = await load();
  const { places, messages: msgs } = messages(text, pkg);
  const r = await c.completion({
    messages: msgs,
    // 모델의 Gemma 3 채팅 틀(jinja)로 프롬프트를 만들고 답 자리부터 생성(문법 제한도 이 경로에서 적용)
    jinja: true,
    add_generation_prompt: true,
    temperature: 0,
    n_predict: 300,
    response_format: { type: 'json_schema', json_schema: { schema: jsonSchema(places, pkg) } },
  });
  let req: RouteRequest | null = null;
  try {
    // 앞에 채팅 틀 글이 붙어 나와도 JSON 부분만
    const j = r.text.slice(r.text.indexOf('{'), r.text.lastIndexOf('}') + 1);
    req = toRouteRequest(JSON.parse(j) as ModelOutput, pkg);
  } catch {
    req = null;
  }
  const tm = r.timings as { prompt_ms?: number; predicted_ms?: number; prompt_n?: number; predicted_n?: number } | undefined;
  return {
    req,
    raw: r.text,
    loadMs: firstLoad ? lastLoadMs : null,
    totalMs: Date.now() - t0,
    promptMs: tm?.prompt_ms ?? null,
    genMs: tm?.predicted_ms ?? null,
    promptN: tm?.prompt_n ?? null,
    genN: tm?.predicted_n ?? null,
  };
}
