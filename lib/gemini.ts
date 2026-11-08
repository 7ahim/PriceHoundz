// lib/gemini.ts
// Google Gemini AI product verification
// Model: gemini-2.0-flash (current stable, replaces deprecated gemini-1.5-flash)

export interface GeminiVerifyResult {
  isSameProduct: boolean;
  confidence:    number;   // 0.0 – 1.0
  reasoning:     string;
}

export interface ProductInfo {
  name:      string | null;
  url:       string;
  price:     number | null;
  platform:  string;
  imageUrl?: string | null;
}

// Try multiple models in order — falls back gracefully if one is unavailable
const GEMINI_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-latest",
];

export async function verifyProductMatch(
  source:    ProductInfo,
  candidate: ProductInfo,
): Promise<GeminiVerifyResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn("[gemini] No GEMINI_API_KEY — using heuristic fallback");
    return heuristicMatch(source, candidate);
  }

  const prompt = buildPrompt(source, candidate);

  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature:      0.1,
              maxOutputTokens:  256,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(15_000),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        // 404 = model not found, try next; other errors break immediately
        if (response.status === 404) {
          console.warn(`[gemini] Model ${model} not found, trying next...`);
          continue;
        }
        console.error(`[gemini] API error (${model}):`, errText);
        break;
      }

      const data = await response.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const clean = text.replace(/```json|```/g, "").trim();

      const parsed = JSON.parse(clean);
      return {
        isSameProduct: !!parsed.isSameProduct,
        confidence:    Math.min(1, Math.max(0, parseFloat(parsed.confidence ?? "0"))),
        reasoning:     String(parsed.reasoning ?? "").slice(0, 500),
      };
    } catch (err: any) {
      console.error(`[gemini] Model ${model} failed:`, err.message);
      // Try next model
    }
  }

  // All models failed — heuristic fallback
  console.warn("[gemini] All models failed — using heuristic fallback");
  return heuristicMatch(source, candidate);
}

function buildPrompt(source: ProductInfo, candidate: ProductInfo): string {
  return `You are a product matching expert for Indian e-commerce.

Determine if these two product listings are the EXACT same physical product (same model number, storage variant, color variant, etc).

SOURCE:
- Platform: ${source.platform}
- Name: ${source.name ?? "(unknown)"}
- Price: ${source.price != null ? "₹" + source.price : "unknown"}

CANDIDATE (found on ${candidate.platform}):
- Name: ${candidate.name ?? "(unknown)"}
- Price: ${candidate.price != null ? "₹" + candidate.price : "unknown"}
- URL: ${candidate.url}

Rules:
1. Same product family but different storage/RAM/color = NOT the same
2. Price within 20% of each other = likely same product
3. If names share key model numbers/identifiers = likely same product

Respond with ONLY valid JSON (no markdown):
{"isSameProduct":true,"confidence":0.95,"reasoning":"one sentence"}`;
}

// ── Heuristic fallback ────────────────────────────────────────
function heuristicMatch(source: ProductInfo, candidate: ProductInfo): GeminiVerifyResult {
  const a = normaliseName(source.name    ?? "");
  const b = normaliseName(candidate.name ?? "");

  if (!a || !b) {
    return { isSameProduct: false, confidence: 0.1, reasoning: "Insufficient product name data." };
  }

  const aTokens = new Set(a.split(" ").filter((t) => t.length > 1));
  const bTokens = new Set(b.split(" ").filter((t) => t.length > 1));
  const intersection = [...aTokens].filter((t) => bTokens.has(t));
  const union        = new Set([...aTokens, ...bTokens]);
  const jaccard      = union.size === 0 ? 0 : intersection.length / union.size;

  const aModels  = extractModelNumbers(a);
  const bModels  = extractModelNumbers(b);
  const modelMatch = aModels.length > 0 && aModels.some((m) => bModels.includes(m));

  // Price similarity check — within 15%
  const priceSimilar = source.price && candidate.price
    ? Math.abs(source.price - candidate.price) / source.price < 0.15
    : null;

  let score = modelMatch ? Math.min(1, jaccard + 0.35) : jaccard;
  if (priceSimilar === true)  score = Math.min(1, score + 0.1);
  if (priceSimilar === false) score = Math.max(0, score - 0.1);

  const isSame = score >= 0.5;

  return {
    isSameProduct: isSame,
    confidence:    parseFloat(score.toFixed(2)),
    reasoning: modelMatch
      ? `Model identifiers match — high confidence same product.`
      : isSame
        ? `${Math.round(jaccard * 100)}% name token overlap${priceSimilar === true ? ", price similar" : ""}.`
        : `Low name similarity (${Math.round(jaccard * 100)}%), no model match.`,
  };
}

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function extractModelNumbers(name: string): string[] {
  return (name.match(/[a-z]{1,4}[-\s]?\d{2,}[a-z0-9]*/gi) ?? [])
    .map((m) => m.toLowerCase().replace(/\s/g, ""));
}

// ── Batch verification (max 3 concurrent) ─────────────────────
export async function verifyProductMatchBatch(
  source:     ProductInfo,
  candidates: ProductInfo[],
): Promise<Array<GeminiVerifyResult & { candidate: ProductInfo }>> {
  const CONCURRENCY = 3;
  const results: Array<GeminiVerifyResult & { candidate: ProductInfo }> = [];

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch   = candidates.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((c) => verifyProductMatch(source, c)));
    settled.forEach((s, idx) => {
      results.push(
        s.status === "fulfilled"
          ? { ...s.value, candidate: batch[idx] }
          : { isSameProduct: false, confidence: 0, reasoning: "Verification error.", candidate: batch[idx] }
      );
    });
    if (i + CONCURRENCY < candidates.length) await new Promise((r) => setTimeout(r, 400));
  }

  return results;
}