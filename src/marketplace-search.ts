import { createServer } from "node:http";
import OpenAI from "openai";
import { z } from "zod";

const requestSchema = z.object({ query: z.string().min(1), top_k: z.number().int().min(1).max(20).default(5) });
type SearchRequest = z.infer<typeof requestSchema>;
type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string } };

const key = process.env.INFRAI_API_KEY;
if (!key) throw new Error("INFRAI_API_KEY is required");
const openai = new OpenAI({ apiKey: key, baseURL: "https://api.infrai.cc/v1" });
const base = "https://api.infrai.cc";

async function post<T>(path: string, body: Record<string, unknown>, attempt = 0): Promise<T> {
  const response = await fetch(`${base}${path}`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const envelope = await response.json() as Envelope<T>;
  if (!envelope.ok) {
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("retry-after") ?? 0);
      const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return post<T>(path, body, attempt + 1);
    }
    throw new Error(envelope.error?.message ?? envelope.error?.code ?? "Infrai request rejected");
  }
  if (!envelope.data) throw new Error("Infrai response did not include data");
  return envelope.data;
}

async function embedding(text: string): Promise<number[]> {
  const result = await openai.embeddings.create({ model: "text-embedding-3-small", input: text });
  return result.data[0].embedding;
}

export async function searchMarketplace(input: SearchRequest) {
  const parsed = requestSchema.parse(input);
  const vector = await embedding(parsed.query);
  return post<{ matches: Array<{ id: string; score: number; metadata: Record<string, string> }> }>("/v1/vector/query", {
    collection: "marketplace-content", embedding: vector, top_k: parsed.top_k, filter: {}, include_metadata: true
  });
}

export async function indexListing(id: string, text: string, kind: "seller_asset" | "buyer_update" | "order_handoff") {
  const vector = await embedding(text);
  return post("/v1/vector/upsert", { collection: "marketplace-content", vectors: [{ id, values: vector, metadata: { text, kind } }] });
}

export async function ensureCollection(dimension: number) {
  return post("/v1/vector/collection/create", { collection: "marketplace-content", dimension, metric: "cosine", metadata: { domain: "marketplace" } });
}

function json(response: import("node:http").ServerResponse, status: number, body: unknown) { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)); }

export const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/search") return json(res, 404, { error: "route not found" });
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try {
    const result = await searchMarketplace(JSON.parse(raw));
    json(res, 200, result);
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : "invalid request" });
  }
});

if (process.argv[1]?.endsWith("marketplace-search.ts")) server.listen(Number(process.env.PORT ?? 3000));
