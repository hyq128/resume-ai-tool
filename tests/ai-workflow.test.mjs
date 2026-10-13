import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
function context() {
  const c = vm.createContext({ console, structuredClone, crypto: globalThis.crypto, window: {}, document: { addEventListener() {} } });
  for (const file of ["utils", "state", "parser", "json-importer", "validator", "exporter", "workflow"]) vm.runInContext(readFileSync(new URL(`src/js/${file}.js`, root), "utf8"), c);
  vm.runInContext(readFileSync(new URL("src/ai/client.js", root), "utf8"), c);
  c.markdown = readFileSync(new URL("fixtures/valid/sample-resume.md", root), "utf8");
  vm.runInContext("setState(parseResumeCandidate(markdown).state); syncFocusedEditor = () => {}; snapshot = aiCaptureSnapshot();", c);
  return c;
}

test("发送快照遮蔽已知联系字段，不包含照片、排版、原始文件或旧快照", () => {
  const c = context();
  const payload = vm.runInContext(`
    getState().photo.dataUrl = "data:image/png;base64,fictional-photo";
    getState().source.fileName = "fictional-private-file.md";
    getState().importSnapshot = { old: "fictional-deleted-history" };
    snapshot = aiCaptureSnapshot();
    aiBuildPayload(snapshot, "虚构岗位：" + snapshot.state.profile.name, [{ role: "user", content: snapshot.state.profile.email }], "请改写 " + snapshot.state.profile.phone, "candidate", "gpt-fictional")
  `, c);
  const text = JSON.stringify(payload);
  for (const key of ["fictional-photo", "fictional-private-file", "fictional-deleted-history"]) assert.ok(!text.includes(key));
  assert.ok(!payload.instructions.includes('"formatterState":'));
  for (const value of vm.runInContext("[snapshot.state.profile.name, snapshot.state.profile.phone, snapshot.state.profile.email, snapshot.state.resumeName]", c)) if (value) assert.ok(!text.includes(value));
  assert.match(text, /JSON/);
});

test("候选稿恢复本地联系方式、照片和全局排版，忽略 AI 排版并保持原稿", () => {
  const c = context();
  vm.runInContext(`
    getState().photo.dataUrl = "data:image/png;base64,fictional-photo";
    getState().layout.fontSize = 9;
    snapshot = aiCaptureSnapshot();
    candidateData = JSON.parse(JSON.stringify(snapshot.content));
    candidateData.profile.headline = "虚构候选定位";
    candidateData.profile.phone = "模型占位";
    candidateData.formatterState = { invalid: true };
    candidate = aiPrepareCandidate(JSON.stringify(candidateData), snapshot);
  `, c);
  assert.equal(vm.runInContext("candidate.state.profile.phone === snapshot.state.profile.phone", c), true);
  assert.equal(vm.runInContext("candidate.state.photo.dataUrl", c), "data:image/png;base64,fictional-photo");
  assert.equal(vm.runInContext("candidate.state.layout.fontSize", c), 9);
  assert.equal(vm.runInContext("candidate.state.profile.headline", c), "虚构候选定位");
  assert.equal(vm.runInContext("aiFingerprint(getState()) === snapshot.fingerprint", c), true);
  assert.equal(vm.runInContext("candidate.state.source.kind", c), "ai");
});

test("无效或不完整候选稿拒绝应用；文字编辑、排版和文件切换均使快照过期", () => {
  const c = context();
  for (const raw of ["不完整 JSON", "null", "[]", '{"profile":{}}', '{"schemaVersion":99,"profile":{}}']) {
    c.raw = raw;
    assert.throws(() => vm.runInContext("aiPrepareCandidate(raw, snapshot)", c));
  }
  for (const mutation of ["getState().profile.headline += '虚构修改'", "getState().layout.fontSize -= 1", "getState().documentId = 'fictional-other-document'"]) {
    vm.runInContext("setState(structuredClone(snapshot.state));" + mutation, c);
    assert.equal(vm.runInContext("aiFingerprint(getState()) === snapshot.fingerprint", c), false);
  }
});

test("事实检查能发现日期与数字变化；局部排版数据不出现在对比文本", () => {
  const c = context();
  vm.runInContext("changed = structuredClone(snapshot.state); changed.sections[0].entries[0].date = '2099.01 - 2099.02';", c);
  assert.notEqual(vm.runInContext("JSON.stringify(aiFactSummary(changed))", c), vm.runInContext("JSON.stringify(aiFactSummary(snapshot.state))", c));
  assert.doesNotMatch(vm.runInContext("aiReadableMarkdown(snapshot.state)", c), /resume_formatter_state:/);
});

test("HTML 导出清除 AI 界面、令牌、脚本与开启状态，恢复离线隐私说明", () => {
  const c = context();
  let removed = 0;
  let removedClass;
  const privacy = { replaceChildren() {}, append(...items) { this.items = items; } };
  c.clone = {
    body: { classList: { remove(value) { removedClass = value; } } },
    querySelectorAll(selector) { return selector === "[data-ai-private]" ? Array.from({ length: 4 }, () => ({ remove() { removed++; } })) : []; },
    getElementById(id) { return id === "privacy-notice" ? privacy : null; },
    createElement() { return {}; },
  };
  vm.runInContext("cleanupExportClone(clone)", c);
  assert.equal(removed, 4);
  assert.equal(removedClass, "ai-panel-open");
  assert.equal(privacy.items[0].textContent, "本地运行");
});
