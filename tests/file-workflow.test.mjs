import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const sourceFiles = [
  "src/js/utils.js",
  "src/js/state.js",
  "src/js/parser.js",
  "src/js/json-importer.js",
  "src/js/validator.js",
  "src/js/exporter.js",
  "src/js/workflow.js",
  "src/js/app.js",
];

function createTestContext() {
  const context = vm.createContext({
    console,
    crypto: globalThis.crypto,
    structuredClone,
    Date,
    Math,
    setTimeout,
    clearTimeout,
    localStorage: { getItem: () => null, setItem() {} },
  });
  context.window = context;
  context.document = {
    activeElement: null,
    addEventListener() {},
    getElementById: () => null,
    querySelectorAll: () => [],
  };
  for (const source of sourceFiles) {
    vm.runInContext(readFileSync(new URL(source, root), "utf8"), context, { filename: source });
  }
  vm.runInContext(`
    isDirty = () => false;
    clearDirty = () => {};
    markDirty = () => {};
    renderResume = () => {};
    updateA4Status = () => {};
    updateStatusInfo = () => {};
    renderResumeFileList = (files, name) => {
      _directoryFiles = files;
      _directoryName = name;
      _directoryCanRefresh = false;
    };
    setDirectoryImportStatus = () => {};
    showToast = () => {};
    showDialog = (value) => { window.lastDialog = value; };
  `, context);
  return context;
}

function createWritableHandle(name, initialText = "") {
  let text = initialText;
  let writes = 0;
  return {
    name,
    get writes() { return writes; },
    get text() { return text; },
    queryPermission: async () => "granted",
    requestPermission: async () => "granted",
    getFile: async () => ({ text: async () => text }),
    createWritable: async () => ({
      write: async (next) => { text = String(next); writes += 1; },
      close: async () => {},
      abort: async () => {},
    }),
  };
}

test("打开单个 Markdown 后保存覆盖原文件，另存为后切换到新文件", async () => {
  const context = createTestContext();
  const originalMarkdown = readFileSync(new URL("fixtures/valid/sample-resume.md", root), "utf8");
  const originalHandle = createWritableHandle("sample-resume.md", originalMarkdown);
  const copyHandle = createWritableHandle("sample-resume-副本.md");
  context.originalHandle = originalHandle;
  context.copyHandle = copyHandle;
  context.showOpenFilePicker = async () => [originalHandle];
  context.showSaveFilePicker = async () => copyHandle;

  await vm.runInContext("openResumeFile({ click() {} })", context);
  assert.equal(vm.runInContext("getActiveSourceFile().handle === originalHandle", context), true);

  vm.runInContext("getState().profile.headline = '保存覆盖验证'", context);
  await vm.runInContext("handleSave()", context);
  assert.equal(originalHandle.writes, 1);
  assert.match(originalHandle.text, /headline: 保存覆盖验证/);

  await vm.runInContext("handleSaveAs()", context);
  assert.equal(copyHandle.writes, 1);
  assert.equal(vm.runInContext("getActiveSourceFile().handle === copyHandle", context), true);

  vm.runInContext("getState().profile.headline = '副本后续保存验证'", context);
  await vm.runInContext("handleSave()", context);
  assert.equal(originalHandle.writes, 1);
  assert.equal(copyHandle.writes, 2);
  assert.match(copyHandle.text, /headline: 副本后续保存验证/);
});

test("打开 JSON 后保存和另存为都沿用 JSON 格式", async () => {
  const context = createTestContext();
  const originalJson = JSON.stringify({
    schemaVersion: 2,
    resumeName: "JSON 保存验证",
    profile: {
      name: "示例用户",
      headline: "产品经理",
      phone: "1xx-xxxx-xxxx",
      email: "example@example.com",
    },
    sections: [{
      type: "skills",
      entries: [{ name: "", bullets: ["产品：需求分析"] }],
    }],
  });
  const originalHandle = createWritableHandle("resume.json", originalJson);
  const copyHandle = createWritableHandle("resume-副本.json");
  context.originalHandle = originalHandle;
  context.copyHandle = copyHandle;
  context.showOpenFilePicker = async () => [originalHandle];
  context.showSaveFilePicker = async () => copyHandle;

  await vm.runInContext("openResumeFile({ click() {} })", context);
  vm.runInContext(`
    getState().layout.theme = "d";
    getState().sections[0].entries[0].bullets[0].markerStyle = "circle";
  `, context);
  await vm.runInContext("handleSave()", context);

  const saved = JSON.parse(originalHandle.text);
  assert.equal(saved.profile.headline, "产品经理");
  assert.equal(saved.formatterState.layout.theme, "d");
  assert.equal(saved.formatterState.sections[0].entries[0].bullets[0].markerStyle, "circle");

  await vm.runInContext("handleSaveAs()", context);
  assert.equal(vm.runInContext("getActiveSourceFile().handle === copyHandle", context), true);
  assert.doesNotThrow(() => JSON.parse(copyHandle.text));
  assert.equal(JSON.parse(copyHandle.text).formatterState.layout.theme, "d");
});

const fictionalMarkdown = readFileSync(new URL("fixtures/valid/sample-resume.md", root), "utf8");

test("候选预览识别代码块，不改动当前内容与原文件关联", async () => {
  const context = createTestContext();
  const original = createWritableHandle("original.md", fictionalMarkdown);
  context.originalHandle = original;
  context.showOpenFilePicker = async () => [original];
  await vm.runInContext("openResumeFile({ click() {} })", context);
  const currentId = vm.runInContext("getState().documentId", context);
  context.pasted = "```markdown\n" + fictionalMarkdown + "\n```";
  const candidate = vm.runInContext("parseResumeCandidate(pasted, 'auto', true)", context);
  assert.equal(candidate.format, "markdown");
  assert.ok(candidate.state);
  assert.equal(candidate.state.source.kind, "ai");
  assert.equal(candidate.state.source.fileName, "");
  assert.equal(vm.runInContext("getState().documentId", context), currentId);
  assert.equal(vm.runInContext("getActiveSourceFile().handle === originalHandle", context), true);
  assert.equal(original.writes, 0);
});

test("错误候选拒绝导入；缺失、无效与有效排版设置分别给出准确提示", () => {
  const context = createTestContext();
  context.pasted = "---\nschema_version: 2\nname: 虚构测试\n---\n## 技能\n- 示例技能";
  const invalid = vm.runInContext("parseResumeCandidate(pasted)", context);
  assert.equal(invalid.state, null);
  assert.ok(invalid.errors.some((error) => /phone/.test(error.message)));
  context.pasted = fictionalMarkdown;
  assert.match(vm.runInContext("parseResumeCandidate(pasted).layoutNotice", context), /未包含/);
  context.pasted = fictionalMarkdown.replace("schema_version:", "resume_formatter_state: invalid\nschema_version:");
  assert.match(vm.runInContext("parseResumeCandidate(pasted).layoutNotice", context), /无法识别/);
  context.pasted = fictionalMarkdown;
  vm.runInContext("setState(parseResumeCandidate(pasted).state); getState().layout.lineHeight = 1.42", context);
  const restored = vm.runInContext("parseResumeCandidate(serializeStateToMarkdown(getState()))", context);
  assert.match(restored.layoutNotice, /已读取/);
  assert.equal(restored.state.layout.lineHeight, 1.42);
});

test("确认 AI 候选后首次保存创建新文件，原文件不被写回", async () => {
  const context = createTestContext();
  const original = createWritableHandle("original.md", fictionalMarkdown);
  const copy = createWritableHandle("fictional-new.md");
  context.originalHandle = original;
  context.copyHandle = copy;
  context.pasted = fictionalMarkdown;
  context.showOpenFilePicker = async () => [original];
  context.showSaveFilePicker = async () => copy;
  await vm.runInContext("openResumeFile({ click() {} })", context);
  vm.runInContext("commitResumeCandidate(parseResumeCandidate(pasted, 'auto', true))", context);
  assert.equal(vm.runInContext("getActiveSourceFile()", context), null);
  assert.equal(await vm.runInContext("handleSave()", context), true);
  assert.equal(original.writes, 0);
  assert.equal(copy.writes, 1);
  assert.equal(vm.runInContext("getActiveSourceFile().handle === copyHandle", context), true);
  assert.equal(vm.runInContext("getState().source.kind", context), undefined);
});

test("JSON 粘贴自动识别且首次保存默认 JSON", async () => {
  const context = createTestContext();
  context.pasted = fictionalMarkdown;
  const json = vm.runInContext("serializeStateToJson(parseResumeCandidate(pasted).state)", context);
  context.pasted = "```json\n" + json + "\n```";
  vm.runInContext("commitResumeCandidate(parseResumeCandidate(pasted))", context);
  const copy = createWritableHandle("fictional.json");
  let pickerOptions;
  context.showSaveFilePicker = async (options) => { pickerOptions = options; return copy; };
  assert.equal(await vm.runInContext("handleSave()", context), true);
  assert.match(pickerOptions.suggestedName, /\.json$/);
  assert.ok(JSON.parse(copy.text).sections.length);
});

test("首次保存取消或拒绝写权限时，保留当前草稿且不关联新文件", async () => {
  for (const mode of ["cancel", "denied"]) {
    const context = createTestContext();
    context.pasted = fictionalMarkdown;
    vm.runInContext("commitResumeCandidate(parseResumeCandidate(pasted))", context);
    const copy = createWritableHandle("fictional.md");
    if (mode === "denied") {
      copy.queryPermission = async () => "denied";
      copy.requestPermission = async () => "denied";
    }
    context.showSaveFilePicker = async () => {
      if (mode === "cancel") { const error = new Error("Cancelled"); error.name = "AbortError"; throw error; }
      return copy;
    };
    const currentId = vm.runInContext("getState().documentId", context);
    assert.equal(await vm.runInContext("handleSave()", context), false);
    assert.equal(copy.writes, 0);
    assert.equal(vm.runInContext("getActiveSourceFile()", context), null);
    assert.equal(vm.runInContext("getState().documentId", context), currentId);
  }
});

test("未保存修改的导入保护：取消、关闭、保存失败均停止替换", async () => {
  for (const action of ["cancel", "dismiss", "save-failed", "discard", "save-success"]) {
    const context = createTestContext();
    context.pasted = fictionalMarkdown;
    vm.runInContext("setState(parseResumeCandidate(pasted).state); isDirty = () => true", context);
    context.saveResult = action === "save-success";
    vm.runInContext("handleSave = async () => saveResult", context);
    const currentId = vm.runInContext("getState().documentId", context);
    const pending = vm.runInContext("confirmResumeReplacement()", context);
    if (action === "dismiss") context.lastDialog.onDismiss();
    else {
      const label = action === "cancel" ? "取消" : action === "discard" ? "放弃修改并导入" : "保存后导入";
      await context.lastDialog.buttons.find((button) => button.text === label).action();
    }
    assert.equal(await pending, ["discard", "save-success"].includes(action));
    assert.equal(vm.runInContext("getState().documentId", context), currentId);
  }
});

test("不支持文件写入时下载副本，保留未保存状态且不冒称更新原文件", async () => {
  const context = createTestContext();
  context.pasted = fictionalMarkdown;
  vm.runInContext("commitResumeCandidate(parseResumeCandidate(pasted)); isDirty = () => true", context);
  let download;
  context.downloadFile = (content, name, mime) => { download = { content, name, mime }; };
  assert.equal(await vm.runInContext("handleSave()", context), false);
  assert.match(download.name, /\.md$/);
  assert.match(download.content, /schema_version: 2/);
  assert.match(context.lastDialog.message, /原文件没有更新/);
  assert.equal(vm.runInContext("isDirty()", context), true);
  assert.equal(vm.runInContext("getActiveSourceFile()", context), null);
});

test("写入失败时不清除未保存状态，也不继续导入", async () => {
  const context = createTestContext();
  context.console = { ...console, error() {} };
  const original = createWritableHandle("original.md", fictionalMarkdown);
  context.originalHandle = original;
  context.showOpenFilePicker = async () => [original];
  await vm.runInContext("openResumeFile({ click() {} })", context);
  vm.runInContext("isDirty = () => true; clearDirty = () => { window.wasCleared = true; }", context);
  original.createWritable = async () => ({ write: async () => { throw new Error("Fictional write failure"); }, abort: async () => {} });
  const pending = vm.runInContext("confirmResumeReplacement()", context);
  await context.lastDialog.buttons.find((button) => button.text === "保存后导入").action();
  assert.equal(await pending, false);
  assert.equal(context.wasCleared, undefined);
  assert.equal(context.lastDialog.title, "保存失败");
  assert.equal(vm.runInContext("getActiveSourceFile().handle === originalHandle", context), true);
});

test("HTML 副本保留当前照片和排版，移除来源关联及已删除的旧快照内容", () => {
  const context = createTestContext();
  context.pasted = fictionalMarkdown;
  vm.runInContext(`
    setState(parseResumeCandidate(pasted).state);
    getState().source.fileName = 'fictional-directory/original.md';
    getState().source.rawMarkdownHash = 'fictional-source-hash';
    getState().importSnapshot.profile.name = '已删除的虚构旧名';
    getState().photo.dataUrl = 'data:image/png;base64,fictional-test-data';
    getState().layout.theme = 'b';
  `, context);
  const originalId = vm.runInContext("getState().documentId", context);
  const portable = vm.runInContext("createPortableResumeState(getState())", context);
  assert.notEqual(portable.documentId, originalId);
  assert.equal(portable.source.kind, "html");
  assert.equal(portable.source.fileName, "");
  assert.equal(portable.source.rawMarkdownHash, undefined);
  assert.equal(portable.photo.dataUrl, 'data:image/png;base64,fictional-test-data');
  assert.equal(portable.layout.theme, 'b');
  assert.equal(portable.importSnapshot.profile.name, portable.profile.name);
  assert.equal(JSON.stringify(portable).includes('已删除的虚构旧名'), false);
  assert.equal(vm.runInContext("getState().importSnapshot.profile.name", context), '已删除的虚构旧名');
  assert.equal(vm.runInContext("getState().source.fileName", context), 'fictional-directory/original.md');
});
