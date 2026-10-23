// Smash the Tables high scores: GET returns the top 20, POST {i:"ABC", s:540} adds one.
// Stored as one small JSON list in Netlify Blobs (store "scores", key "top").
import { getStore } from "@netlify/blobs";

const MAX_SCORE = 700;   // 7 levels x 100
const KEEP = 50;         // keep a few extra so the top 20 stays full if entries are removed
const BAD = new Set(["ASS","FUK","FUC","FUQ","FCK","FKU","SHT","CUM","KKK","NIG","NGR","NGA","DIK","DIC","COK","FAG","TIT","VAG","SEX","JIZ","CNT","KYS","NAZ","HOE","WTF","PUS","POO","PEE","GAY","SUK","SUX","XXX","DAM","GOD","JEW","RAP","PIS","POS","STD","ANL","ANS","BCH","BJS","CLT","SOB","BUM","HIV","LSD","THC"]);
const headers = { "content-type": "application/json", "cache-control": "no-store" };
const sortTop = (l) => l.sort((a, b) => b.s - a.s || a.t - b.t);

export default async (req) => {
  const store = getStore({ name: "scores", consistency: "strong" });
  let list = (await store.get("top", { type: "json" })) || [];

  if (req.method === "GET") return new Response(JSON.stringify(sortTop(list).slice(0, 20)), { headers });

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return new Response('{"error":"bad json"}', { status: 400, headers }); }
    const i = String(body?.i ?? "").toUpperCase();
    const s = Number(body?.s);
    if (!/^[A-Z]{3}$/.test(i) || BAD.has(i)) return new Response('{"error":"initials"}', { status: 400, headers });
    if (!Number.isInteger(s) || s < 0 || s > MAX_SCORE) return new Response('{"error":"score"}', { status: 400, headers });
    list.push({ i, s, t: Date.now() });
    list = sortTop(list).slice(0, KEEP);
    await store.setJSON("top", list);
    return new Response(JSON.stringify(list.slice(0, 20)), { headers });
  }

  return new Response('{"error":"method"}', { status: 405, headers });
};

export const config = { path: "/api/scores" };
