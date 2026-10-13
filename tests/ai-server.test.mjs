import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import { createAiServer } from "../scripts/serve-ai.mjs";
import { readSse } from "../scripts/ai-providers.mjs";

// All keys, models and materials below are explicitly fictional; no vendor calls.
const fakeKey = "fictional-test-credential";
const modelId = "gpt-fictional-test";
const streamResponse = (events) => new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
async function fixture(t, fetchImpl, extra = {}) {
  const server = await createAiServer({ fetchImpl, ...extra });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const page = await (await fetch(origin)).text();
  const token = page.match(/const AI_SESSION_TOKEN = "([a-f0-9]+)"/)[1];
  const post = (path, body, headers = {}) => fetch(origin + path, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "X-AI-Session": token, ...headers }, body: JSON.stringify(body),
  });
  return { origin, page, token, post };
}
const chat = { mode: "chat", model: modelId, instructions: "虚构简历和虚构岗位材料", messages: [{ role: "user", content: "请分析虚构简历。" }] };

test("只允许本机来源、页面令牌和预设服务商，拒绝请求时不调用上游", async (t) => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; throw new Error(); });
  for (const headers of [{ Origin: "https://example.com" }, { "X-AI-Session": "unknown" }, { Origin: "null" }]) {
    const response = await f.post("/api/connect", { provider: "openai", key: fakeKey }, headers);
    assert.ok([401, 403].includes(response.status));
  }
  const hostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(f.origin, { headers: { Host: "example.com" } }, (response) => { response.resume(); resolve(response.statusCode); });
    request.on("error", reject); request.end();
  });
  assert.equal(hostStatus, 403);
  for (const provider of ["custom", "__proto__", "constructor", "https://example.com"]) assert.equal((await f.post("/api/connect", { provider, key: fakeKey })).status, 400);
  assert.equal((await fetch(f.origin + "/.env")).status, 404);
  assert.equal((await fetch(f.origin + "/api/chat")).status, 405);
  assert.equal(calls, 0);
  assert.match(f.page, /data-ai-private/);
});

test("连接只请求模型列表；OpenAI 使用 Responses、禁用存储并流式输出", async (t) => {
  const requests = [];
  const f = await fixture(t, async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/models")) return Response.json({ data: [{ id: modelId }, { id: "gpt-fictional-audio" }, { id: "fictional-embedding" }] });
    return streamResponse([{ type: "response.output_text.delta", delta: "虚构建议" }, { type: "response.completed", response: { usage: { total_tokens: 12 } } }]);
  });
  const connect = await f.post("/api/connect", { provider: "openai", key: fakeKey });
  assert.deepEqual(await connect.json(), { provider: "openai", models: [modelId] });
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[0].options.body, undefined);
  const response = await f.post("/api/chat", chat);
  const events = (await response.text()).trim().split("\n").map(JSON.parse);
  assert.deepEqual(events, [{ type: "delta", text: "虚构建议" }, { type: "done", tokens: 12 }]);
  const request = requests[1];
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.options.redirect, "error");
  assert.equal(request.options.headers.Authorization, `Bearer ${fakeKey}`);
  assert.equal(JSON.parse(request.options.body).store, false);
  assert.equal(JSON.parse(request.options.body).stream, true);
  assert.equal((await f.post("/api/disconnect", {})).status, 200);
  assert.equal((await f.post("/api/chat", chat)).status, 401);
  assert.equal(requests.length, 2);
});

test("DeepSeek 使用 Chat Completions，修改稿启用 JSON；截断回复不能成功", async (t) => {
  const requests = [];
  let truncate = false;
  const f = await fixture(t, async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/models")) return Response.json({ data: [{ id: "deepseek-fictional" }] });
    return streamResponse([{ choices: [{ delta: { content: "{\"schemaVersion\":2}" } }] }, { choices: [{ finish_reason: truncate ? "length" : "stop" }], usage: { total_tokens: 20 } }]);
  });
  await f.post("/api/connect", { provider: "deepseek", key: fakeKey });
  const payload = { ...chat, model: "deepseek-fictional", mode: "candidate" };
  const text = await (await f.post("/api/chat", payload)).text();
  assert.match(text, /"type":"done"/);
  assert.equal(requests[1].url, "https://api.deepseek.com/chat/completions");
  const body = JSON.parse(requests[1].options.body);
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.messages[0].role, "system");
  truncate = true;
  const partial = await (await f.post("/api/chat", payload)).text();
  assert.match(partial, /"type":"error"/);
  assert.doesNotMatch(partial, /"type":"done"/);
});

test("会话之间的密钥隔离，断开或认证失败后不残留旧连接", async (t) => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; return Response.json({ error: { message: fakeKey } }, { status: calls === 1 ? 200 : 401 }); });
  const secondPage = await (await fetch(f.origin)).text();
  const otherToken = secondPage.match(/const AI_SESSION_TOKEN = "([a-f0-9]+)"/)[1];
  assert.notEqual(otherToken, f.token);
  assert.equal((await f.post("/api/chat", chat, { "X-AI-Session": otherToken })).status, 401);
  const error = await f.post("/api/connect", { provider: "openai", key: fakeKey });
  assert.equal(error.status, 502); // Invalid model list never installs a key.
  assert.doesNotMatch(await error.text(), new RegExp(fakeKey));
  const denied = await f.post("/api/connect", { provider: "openai", key: fakeKey });
  assert.equal(denied.status, 401);
  assert.doesNotMatch(await denied.text(), new RegExp(fakeKey));
  assert.equal((await f.post("/api/chat", chat)).status, 401);
});

test("拒绝过长、无效对话和工具角色，不向上游发送", async (t) => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; return Response.json({ data: [{ id: modelId }] }); });
  await f.post("/api/connect", { provider: "openai", key: fakeKey });
  for (const payload of [{ ...chat, messages: [{ role: "tool", content: "虚构" }] }, { ...chat, mode: "execute" }, { ...chat, model: "https://example.com" }, { ...chat, instructions: "x".repeat(100_001) }]) assert.equal((await f.post("/api/chat", payload)).status, 400);
  assert.equal((await f.post("/api/chat", { ...chat, instructions: "x".repeat(260_000) })).status, 413);
  assert.equal(calls, 1);
});

test("停止请求或超时会中止上游，释放会话供后续使用", async (t) => {
  let aborted = 0;
  const f = await fixture(t, async (url, options) => {
    if (url.endsWith("/models")) return Response.json({ data: [{ id: modelId }] });
    return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => { aborted++; reject(new Error("fictional-secret-error")); }, { once: true }));
  }, { timeoutMs: 80 });
  await f.post("/api/connect", { provider: "openai", key: fakeKey });
  const first = await (await f.post("/api/chat", chat)).text();
  assert.match(first, /超时/);
  assert.doesNotMatch(first, /fictional-secret-error/);
  const second = await (await f.post("/api/chat", chat)).text();
  assert.match(second, /超时/);
  assert.equal(aborted, 2);
});

test("浏览器取消会中止上游，不留下占用的会话", async (t) => {
  let started;
  let stopped;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const stoppedPromise = new Promise((resolve) => { stopped = resolve; });
  const f = await fixture(t, async (url, options) => {
    if (url.endsWith("/models")) return Response.json({ data: [{ id: modelId }] });
    started();
    return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => { stopped(); reject(new Error("fictional abort")); }, { once: true }));
  });
  await f.post("/api/connect", { provider: "openai", key: fakeKey });
  const controller = new AbortController();
  const request = fetch(f.origin + "/api/chat", { method: "POST", signal: controller.signal,
    headers: { Origin: f.origin, "Content-Type": "application/json", "X-AI-Session": f.token }, body: JSON.stringify(chat) }).catch((error) => error.name);
  await startedPromise;
  controller.abort();
  assert.equal(await request, "AbortError");
  await stoppedPromise;
  assert.equal((await f.post("/api/connect", { provider: "openai", key: fakeKey })).status, 200);
});

test("过期页面会话被拒绝，必须刷新重新连接", async (t) => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; return Response.json({ data: [{ id: modelId }] }); }, { ttlMs: 50 });
  assert.equal((await f.post("/api/connect", { provider: "openai", key: fakeKey })).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal((await f.post("/api/chat", chat)).status, 401);
  assert.equal(calls, 1);
});

test("SSE 读取正确处理跨 chunk 的中文、CRLF、多行 data 和 EOF", async () => {
  const bytes = new TextEncoder().encode('data: {"text":\r\ndata: "虚构中文"}\r\n\r\ndata: [DONE]');
  const stream = new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i++) controller.enqueue(bytes.slice(i, i + 1)); controller.close(); } });
  const values = [];
  for await (const data of readSse(stream)) values.push(data);
  assert.deepEqual(values, ['{"text":\n"虚构中文"}', "[DONE]"]);
});
