/** Fixed vendor adapters. No user-selected URLs, tool execution or file access. */
export const PROVIDERS = Object.freeze({
  openai: { label: "OpenAI", base: "https://api.openai.com/v1", protocol: "responses" },
  deepseek: { label: "DeepSeek", base: "https://api.deepseek.com", protocol: "chat" },
});

export class AiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function vendorError(status) {
  if ([401, 403].includes(status)) return new AiError("认证失败或没有权限，请检查 API Key 和模型权限。", 401);
  if (status === 402) return new AiError("账户余额不足，请在服务商处检查余额。", 402);
  if (status === 429) return new AiError("请求受限或额度不足，请检查账户额度，稍后手动重试。", 429);
  if ([400, 404, 422].includes(status)) return new AiError("模型或请求不可用，请选择支持文本生成的模型，或缩短内容后重试。", 400);
  return new AiError("模型服务暂时不可用，请稍后重试。", 502);
}

async function vendorFetch(fetchImpl, config, path, options) {
  const response = await fetchImpl(PROVIDERS[config.provider].base + path, {
    ...options, redirect: "error",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw vendorError(response.status);
  }
  return response;
}

export async function listModels(fetchImpl, config, signal) {
  const response = await vendorFetch(fetchImpl, config, "/models", { method: "GET", signal });
  // Only IDs are returned to the browser. This response contains no resume data.
  const body = await response.json();
  if (!Array.isArray(body.data)) throw new AiError("无法读取模型列表，请重新连接。", 502);
  const models = [...new Set(body.data.map((item) => item.id).filter((id) => typeof id === "string" && /^[a-zA-Z0-9._:-]{1,120}$/.test(id)))].sort();
  return config.provider === "openai"
    ? models.filter((id) => /^(gpt-|o[1-9])/.test(id) && !/audio|realtime|image|transcrib|tts|search/.test(id) && !/^(?:gpt-3\.5|gpt-4(?:$|-))/.test(id))
    : models;
}

/** Handles UTF-8 splits, CRLF, multi-line SSE data and bounded frames. */
export async function* readSse(body) {
  if (!body) throw new AiError("模型没有返回数据。", 502);
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let end;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
        if (data) yield data;
      }
      if (buffer.length > 512_000) throw new AiError("模型返回内容过大，请缩短请求。", 502);
      if (done) break;
    }
    // A terminal frame without an empty line is still valid at EOF.
    const data = buffer.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (data) yield data;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function buildVendorRequest(config, input) {
  const messages = input.messages.map(({ role, content }) => ({ role, content }));
  if (config.provider === "openai") return {
    path: "/responses",
    body: { model: input.model, instructions: input.instructions, input: messages,
      stream: true, store: false, max_output_tokens: 8192,
      ...(input.mode === "candidate" ? { text: { format: { type: "json_object" } } } : {}),
    },
  };
  return {
    path: "/chat/completions",
    body: { model: input.model, messages: [{ role: "system", content: input.instructions }, ...messages],
      stream: true, max_tokens: 8192, thinking: { type: "disabled" },
      ...(input.mode === "candidate" ? { response_format: { type: "json_object" } } : {}),
    },
  };
}

export async function streamCompletion(fetchImpl, config, input, signal, emit) {
  const request = buildVendorRequest(config, input);
  const response = await vendorFetch(fetchImpl, config, request.path, {
    method: "POST", body: JSON.stringify(request.body), signal,
  });
  let completed = false;
  let contentLength = 0;
  let usage;
  for await (const data of readSse(response.body)) {
    if (data === "[DONE]") break;
    let event;
    try { event = JSON.parse(data); } catch { throw new AiError("模型返回了无效数据，请重试。", 502); }
    let delta;
    if (config.provider === "openai") {
      if (event.type === "response.output_text.delta") delta = event.delta;
      if (event.type === "response.completed") { completed = true; usage = event.response?.usage; }
      if (["response.incomplete", "response.failed", "error"].includes(event.type)) throw new AiError("生成未完成，可能达到长度限制或模型拒绝请求。请缩短内容后重试。", 502);
    } else {
      if (event.error) throw new AiError("模型生成失败，请稍后重试。", 502);
      const choice = event.choices?.[0];
      delta = choice?.delta?.content;
      if (choice?.finish_reason === "stop") completed = true;
      else if (choice?.finish_reason) throw new AiError("生成未完成，可能达到长度限制或模型拒绝请求。请缩短内容后重试。", 502);
      if (event.usage) usage = event.usage;
    }
    if (typeof delta === "string" && delta) {
      contentLength += delta.length;
      if (contentLength > 300_000) throw new AiError("模型返回内容过大，请缩短请求。", 502);
      await emit({ type: "delta", text: delta });
    }
  }
  if (!completed || !contentLength) throw new AiError("回复为空或连接中断，未生成可应用的修改稿。请重试。", 502);
  // Return only numeric token usage, never vendor debug/error objects.
  const tokens = usage?.total_tokens;
  await emit({ type: "done", tokens: Number.isFinite(tokens) ? tokens : null });
}
