/**
 * browse agent-security — the ML layers of the content-security stack (L4, L4b) and the full L6
 * ensemble orchestration.
 *
 * ARCHITECTURAL CONSTRAINT (a gstack lesson adopted up front): this module MUST NOT be imported by
 * the Bun-compiled `browse` binary. ONNX runtimes `dlopen` from a compiled temp-extract dir and
 * fail. Only the pure string/URL layers in `security.ts` are safe inside the binary. These layers
 * run in the AGENT process (the skill/host that drives `browse` and feeds page text to a model).
 *
 *   L4   ML injection classifier over page content        (injectable model hook, else L3 heuristic)
 *   L4b  transcript classifier over the conversation       (injectable model hook, else heuristic)
 *   L6   ensemble verdict: gathers L3/L4/L4b/L5 signals and calls the pure combiner
 *
 * The Factory ships no bundled ONNX/model client, so L4/L4b are INJECTABLE seams (mirroring the
 * Tier-2 model judge): an operator wires a real classifier by assigning a hook on `globalThis`.
 * With no hook wired, each layer degrades to the deterministic heuristic in `security.ts` — the
 * stack stays honest and fully testable offline, and gets stronger the moment a model is attached.
 */
import {
  LOG_ONLY,
  type Decision,
  type Verdict,
  checkCanaryLeak,
  combineVerdict,
  logAttempt,
  scanForInjection,
  securityOff,
} from './security.ts';

/** A content classifier scores untrusted page text for injection, 0..1. */
export type ContentClassifier = (text: string) => Promise<number> | number;
/** A transcript classifier scores an agent transcript for subversion, 0..1. */
export type TranscriptClassifier = (transcript: string) => Promise<number> | number;

const CONTENT_HOOK = '__FACTORY_CONTENT_CLASSIFIER__';
const TRANSCRIPT_HOOK = '__FACTORY_TRANSCRIPT_CLASSIFIER__';

function readHook<T>(key: string): T | undefined {
  const fn = (globalThis as Record<string, unknown>)[key];
  return typeof fn === 'function' ? (fn as T) : undefined;
}

export interface LayerScore {
  score: number;
  /** 'ml' when an injected model hook produced the score, 'heuristic' otherwise. */
  source: 'ml' | 'heuristic';
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * L4 — classify page content. Uses a wired ML hook if present, otherwise the L3 heuristic. When a
 * hook is wired we take the MAX of the model and the heuristic, so a weak model never scores below
 * the cheap deterministic floor.
 */
export async function classifyContent(text: string): Promise<LayerScore> {
  const heuristic = scanForInjection(text).score;
  const hook = readHook<ContentClassifier>(CONTENT_HOOK);
  if (!hook) return { score: heuristic, source: 'heuristic' };
  const ml = clamp01(await hook(text));
  return { score: Math.max(ml, heuristic), source: 'ml' };
}

/**
 * L4b — classify the agent transcript for signs it has followed injected instructions. Uses a
 * wired ML hook if present, otherwise a heuristic scan of the transcript.
 */
export async function classifyTranscript(transcript: string): Promise<LayerScore> {
  const hook = readHook<TranscriptClassifier>(TRANSCRIPT_HOOK);
  if (!hook) return { score: scanForInjection(transcript).score, source: 'heuristic' };
  return { score: clamp01(await hook(transcript)), source: 'ml' };
}

export interface ExchangeInput {
  /** Untrusted text extracted from the page. */
  pageText: string;
  /** The agent transcript produced after ingesting the page (for L4b + L5 canary check). */
  transcript?: string;
  /** The canary minted into this exchange's untrusted envelope (L5). */
  canary?: string;
  /** Origin for the salted attack log. */
  origin?: string;
  /** Attack-log directory (defaults to the shared security dir); overridable for tests. */
  logDir?: string;
}

export interface ExchangeVerdict extends Verdict {
  contentScore: number;
  contentSource: 'ml' | 'heuristic';
  transcriptScore: number;
  transcriptSource: 'ml' | 'heuristic' | 'skipped';
  canaryLeaked: boolean;
}

/**
 * L6 — the full ensemble. Runs L4 on the page content, checks the L5 canary against the transcript,
 * and runs L4b only when content clears the LOG_ONLY floor (the costly transcript pass is skipped
 * for plainly-benign pages). Combines the signals via the pure `combineVerdict` and logs any
 * non-ALLOW verdict to the salted attack log.
 *
 * BLOCK requires the content AND transcript classifiers to cross-confirm at WARN, OR a lone content
 * score at SOLO_CONTENT_BLOCK, OR a canary leak (always BLOCK) — the anti-false-positive rule that
 * stops a page merely quoting injection text from blocking.
 */
export async function evaluateExchange(input: ExchangeInput): Promise<ExchangeVerdict> {
  if (securityOff()) {
    return {
      decision: 'ALLOW',
      reasons: ['security disabled (FACTORY_SECURITY_OFF=1)'],
      contentScore: 0,
      contentSource: 'heuristic',
      transcriptScore: 0,
      transcriptSource: 'skipped',
      canaryLeaked: false,
    };
  }

  const transcript = input.transcript ?? '';
  const content = await classifyContent(input.pageText);
  const canaryLeaked = !!input.canary && checkCanaryLeak(transcript, input.canary);

  // LOG_ONLY gate: only pay for the transcript classifier when content is non-trivially suspicious.
  let transcriptScore = 0;
  let transcriptSource: 'ml' | 'heuristic' | 'skipped' = 'skipped';
  if (transcript && content.score >= LOG_ONLY) {
    const t = await classifyTranscript(transcript);
    transcriptScore = t.score;
    transcriptSource = t.source;
  }

  const verdict = combineVerdict({
    canaryLeaked,
    contentScore: content.score,
    transcriptScore,
  });

  const result: ExchangeVerdict = {
    ...verdict,
    contentScore: content.score,
    contentSource: content.source,
    transcriptScore,
    transcriptSource,
    canaryLeaked,
  };

  if (verdict.decision !== 'ALLOW') {
    const labels = scanForInjection(input.pageText).labels;
    logAttempt(
      {
        origin: input.origin ?? 'agent-exchange',
        score: content.score,
        labels,
        decision: verdict.decision as Decision,
      },
      input.logDir,
    );
  }

  return result;
}
