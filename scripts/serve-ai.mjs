/** Local-only AI gateway. Keys are held per page in memory; no body logging. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { AiError, PROVIDERS, listModels, streamCompletion } from "./ai-providers.mjs";

const root = new URL("../", import.meta.url);
const TTL = 6 * 60 * 60 * 1000;

export function validateChat(body) {
  if (!["chat", "candidate"].includes(body.mode)) throw new AiError("请求类型无效。");
  if (typeof body.model !== "string" || !/^[a-zA-Z0-9._:-]{1,120}$/.test(body.model)) throw new AiError("请选择或填写文本模型名称。");
  if (typeof body.instructions !== "string" || body.instructions.length > 100_000) throw new AiError("简历或 JD 过长，请缩短后重试。");
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 60) throw new AiError("对话过长，请清空对话后重试。");
  if (body.messages.some((m) => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || !m.content.trim() || m.content.length > 100_000)) throw new AiError("对话内容无效或过长。");
  return { mode: body.mode, model: body.model, instructions: body.instructions, messages: body.messages };
}

async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) throw new AiError("请求必须为 JSON。", 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 256_000) throw new AiError("简历或对话过长，请缩短后重试。", 413);
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new AiError("请求内容不是有效的 JSON。"); }
}

export async function createAiServer({ fetchImpl = globalThis.fetch, timeoutMs = 180_000, ttlMs = TTL } = {}) {
  const [html, client, styles] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("src/ai/client.js", root), "utf8"),
    readFile(new URL("src/ai/panel.css", root), "utf8"),
  ]);
  const sessions = new Map();
  const clearSession = (session) => { session.controller?.abort(); session.config = null; };
  const cleanup = () => {
    for (const [token, session] of sessions) if (Date.now() - session.created > ttlMs) { clearSession(session); sessions.delete(token); }
  };
  const timer = setInterval(cleanup, 60_000);
  timer.unref();
  const server = createServer(async (request, response) => {
    const port = server.address()?.port;
    const host = `127.0.0.1:${port}`;
    const origin = `http://${host}`;
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const json = (status, body) => {
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(body));
    };
    let activeSession;
    let controller;
    let deadline;
    try {
      if (request.headers.host !== host) throw new AiError("仅允许从本机地址访问。", 403);
      const path = new URL(request.url, origin).pathname;
      if (path === "/" && request.method === "GET") {
        if (request.headers["sec-fetch-site"] === "cross-site") throw new AiError("请直接打开本机地址。", 403);
        cleanup();
        if (sessions.size >= 32) throw new AiError("打开的页面过多，请重启服务。", 429);
        const token = randomBytes(32).toString("hex");
        sessions.set(token, { created: Date.now(), config: null, controller: null });
        const injection = `<style data-ai-private>${styles}</style><script data-ai-private>const AI_SESSION_TOKEN = ${JSON.stringify(token)};</script><script data-ai-private>${client}</script>`;
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(html.replace("</body>", injection + "\n</body>"));
        return;
      }
      if (!["/api/connect", "/api/disconnect", "/api/chat"].includes(path)) throw new AiError("未找到该入口。", 404);
      if (request.method !== "POST") throw new AiError("仅支持 POST。", 405);
      if (request.headers.origin !== origin || request.headers["sec-fetch-site"] === "cross-site") throw new AiError("拒绝来自其他页面的请求。", 403);
      cleanup();
      const session = sessions.get(request.headers["x-ai-session"]);
      if (!session) throw new AiError("页面连接已过期，请保存简历并刷新页面后重新连接。", 401);
      if (path === "/api/disconnect") { clearSession(session); json(200, { disconnected: true }); return; }
      if (session.controller) throw new AiError("已有请求正在进行，请先停止或等待完成。", 409);
      const body = await readJson(request);
      if (session.controller) throw new AiError("已有请求正在进行，请先停止或等待完成。", 409);
      controller = new AbortController();
      session.controller = controller;
      activeSession = session;
      deadline = setTimeout(() => controller.abort(), path === "/api/connect" ? Math.min(timeoutMs, 20_000) : timeoutMs);
      response.on("close", () => controller.abort());
      if (path === "/api/connect") {
        // Replacing a connection clears the old key even if validation fails.
        session.config = null;
        if (!Object.hasOwn(PROVIDERS, body.provider)) throw new AiError("请选择 OpenAI 或 DeepSeek。");
        if (typeof body.key !== "string" || !/^[\x21-\x7E]{8,512}$/.test(body.key)) throw new AiError("请输入有效的 API Key。");
        const config = { provider: body.provider, key: body.key };
        const models = await listModels(fetchImpl, config, controller.signal);
        if (controller.signal.aborted) throw new AiError("连接已取消，请重新连接。", 408);
        session.config = config;
        json(200, { provider: config.provider, models });
      } else {
        if (!session.config) throw new AiError("请先输入 API Key 并测试连接。", 401);
        const input = validateChat(body);
        response.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8" });
        await streamCompletion(fetchImpl, session.config, input, controller.signal, async (event) => {
          if (response.destroyed) throw new AiError("连接已中断。", 408);
          if (!response.write(JSON.stringify(event) + "\n")) await once(response, "drain", { signal: controller.signal });
        });
        response.end();
      }
    } catch (error) {
      // Never echo a vendor error or exception text: it can contain keys/content.
      const message = error instanceof AiError ? error.message
        : controller?.signal.aborted ? "请求已停止或超时，请手动重试。"
        : "无法连接模型服务，请检查网络后重试。";
      if (!response.destroyed) {
        if (response.headersSent) response.end(JSON.stringify({ type: "error", message }) + "\n");
        else json(error instanceof AiError ? error.status : 502, { error: message });
      }
    } finally {
      clearTimeout(deadline);
      if (activeSession && activeSession.controller === controller) activeSession.controller = null;
    }
  });
  server.on("close", () => { clearInterval(timer); for (const session of sessions.values()) clearSession(session); sessions.clear(); });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await createAiServer();
  server.on("error", (error) => {
    console.error(error.code === "EADDRINUSE" ? "8001 端口已占用，请关闭之前的 AI 服务后重试。" : "本机 AI 服务无法启动。");
    process.exitCode = 1;
  });
  server.listen(8001, "127.0.0.1", () => console.log("Resume Copilot AI: http://127.0.0.1:8001 (Ctrl+C to stop)"));
}
