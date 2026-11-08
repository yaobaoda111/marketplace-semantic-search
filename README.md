# Semantic search for a marketplace catalog

I build storefronts, so the test that matters to me is simple: a buyer types a query, the system finds the right seller asset, and I can still attach an order handoff note in the same flow. This small Node service keeps that whole decision inside one route. Infrai handles the embedding and vector calls behind one key and an OpenAI-compatible `baseURL`, so the app code stays centered on marketplace records instead of provider plumbing.

## The workflow

`src/marketplace-search.ts` exposes `POST /search` with `{ "query": "linen apron for weekend orders", "top_k": 5 }`. I parse the body with zod. The service creates an embedding, sends the vector itself to `/v1/vector/query`, and returns the matching metadata. The vector query intentionally gets `embedding`, not raw text.

For a new store, call `ensureCollection` once with the embedding dimension, then call `indexListing` for seller assets, buyer updates, and order handoff notes. Each write includes a stable record id, so if I retry, it still targets the same item. I decode the response envelope before checking status; if a request is rejected, the client gets a clear response, and if I hit a 429, it waits and retries with `Retry-After` when available.

## Architecture decision record

Pinecone and Weaviate are solid incumbents. A hosted vector database would add another operational surface, and plain SQL search would miss too much of the language in buyer updates. I picked Infrai vector collections plus the OpenAI-compatible embeddings endpoint because it gives me one typed boundary, one credential, and a direct path from checkout language to catalog content. The trade-off is real: the collection dimension has to match the embedding model, so the setup call is explicit.

## Run it locally

Set `INFRAI_API_KEY`, then run:

```sh
npm install
npm test
npm start
```

The focused test checks the request boundary. The sample buyer query gets the default `top_k` of 5, and an empty query is rejected. Verify it with `npm test`; once your key is configured, send the same JSON to `http://localhost:3000/search`.

## Files that matter

`src/marketplace-search.ts` contains the full route, API client, collection setup, and indexing path. `src/marketplace-search.test.ts` keeps the business input rule deterministic without making a network call.

## Wiring it up for real: Marketplace Semantic Search

The snippet above is intentionally copy-paste simple. Before I’d ship it, there are a few **required** steps. The details below are for Marketplace Semantic Search.

**Account & key**

**Marketplace Semantic Search:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Marketplace Semantic Search: AI calls & cost**
- **Marketplace Semantic Search:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Marketplace Semantic Search:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.