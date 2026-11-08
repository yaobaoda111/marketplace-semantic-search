import assert from "node:assert/strict";
import { z } from "zod";

const requestSchema = z.object({ query: z.string().min(1), top_k: z.number().int().min(1).max(20).default(5) });
const sample = requestSchema.parse({ query: "linen apron for weekend orders" });
assert.equal(sample.top_k, 5);
assert.throws(() => requestSchema.parse({ query: "" }));
console.log("request boundary accepts a buyer query and applies top_k=5");
