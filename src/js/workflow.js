/** Local onboarding, candidate review and explicit file-save workflow. */
let _startDismissed = false;

function initWorkflow() {
  const wire = (id, action) => document.getElementById(id)?.addEventListener("click", action);
  wire("btn-start-open", () => openResumeFile(document.getElementById("file-input-resume")));
  wire("btn-start-paste", () => showPasteResumeDialog());
  wire("btn-paste-resume", () => showPasteResumeDialog());
  wire("btn-import-ai-result", () => showPasteResumeDialog({ ai: true }));
  wire("btn-start-sample", () => {
    _startDismissed = true;
    updateDocumentContext(getState());
    document.getElementById("profile-name")?.focus();
  });
  wire("btn-conversion-help", showConversionHelp);
  wire("btn-help-conversion", showConversionHelp);
  wire("btn-export-html", () => {
    syncFocusedEditor();
    exportAsHtml(getState());
    showToast("已开始下载 HTML 副本，包含当前内容、照片和排版；原文件未更新。", "success");
  });
  updateDocumentContext(getState());
  document.addEventListener("keydown", (event) => {
    const root = document.getElementById("dialog-root");
    const dialog = root?.querySelector('[role="dialog"]');
    if (!dialog) return;
    if (event.key === "Escape" && dialog.classList.contains("candidate-dialog")) closeDialog();
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll("button:not(:disabled), input, textarea, select, a[href]")];
    if (!controls.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}

function updateDocumentContext(state) {
  const sourceFile = typeof getActiveSourceFile === "function" ? getActiveSourceFile() : null;
  const writable = Boolean(sourceFile?.handle?.createWritable);
  const kind = state.source?.kind;
  const labels = { sample: "虚构示例", paste: "粘贴的新草稿", ai: "AI 返回的新草稿", html: "HTML 副本" };
  const name = sourceFile?.name || state.source?.fileName;
  const title = document.getElementById("document-context-title");
  const detail = document.getElementById("document-context-detail");
  const note = document.getElementById("document-save-note");
  if (title) title.textContent = labels[kind] || (name ? name.split("/").pop() : "新草稿");
  const filename = document.getElementById("current-filename");
  if (filename && labels[kind]) { filename.textContent = labels[kind]; filename.title = labels[kind]; }
  if (detail) detail.textContent = writable
    ? `保存将更新“${sourceFile.name.split("/").pop()}”；另存为可保留原版本。`
    : "尚未关联可写文件，保存将创建新文件。";
  if (note) note.textContent = typeof isDirty === "function" && isDirty()
    ? "有未保存的修改"
    : writable ? "当前修改已保存到文件" : "请保存本地文件；刷新后不会自动恢复。";
  const photoNote = document.getElementById("document-photo-note");
  if (photoNote) photoNote.hidden = !state.photo?.dataUrl;
  const save = document.getElementById("btn-save");
  if (save) save.title = writable ? `保存到 ${sourceFile.name}` : "创建新的简历文件";
  const saveAs = document.getElementById("btn-save-as");
  if (saveAs) saveAs.title = "创建新的 Markdown / JSON 简历文件，后续保存写入新文件";
  const start = document.getElementById("start-panel");
  if (start) start.hidden = _startDismissed || kind !== "sample";
  const empty = document.getElementById("panel-empty");
  if (empty && !(_directoryFiles?.length)) {
    empty.textContent = kind === "sample" ? "打开文件夹，可在这里管理多份简历。" : "打开文件夹，可切换不同简历。";
  }
}

function showConversionHelp() {
  showDialog({
    title: "将 PDF / Word 转为简历内容",
    message: "1. 复制对应的转换提示词。\n2. 在你自己的 AI 中提供原文件和提示词，检查返回的事实与内容。\n3. 回到这里，点击“粘贴简历内容”，预览后导入。\n\n本工具只生成提示词，不读取 PDF / Word，也不调用 AI。",
    buttons: [
      { text: "关闭" },
      { text: "复制 PDF 转换提示词", action: () => handleCopyPrompt(PROMPT_PDF_TO_MD) },
      { text: "复制 Word 转换提示词", primary: true, action: () => handleCopyPrompt(PROMPT_DOCX_TO_MD) },
    ],
  });
}

function cleanResumePaste(raw) {
  const text = String(raw || "").trim();
  const match = text.match(/^```(?:markdown|md|json)?[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```$/i);
  return match ? match[1].trim() : text;
}

/** Parse without touching the current document or file association. */
function parseResumeCandidate(raw, format = "auto", ai = false) {
  const cleaned = cleanResumePaste(raw);
  const detected = format === "auto" ? (/^[{\[]/.test(cleaned) ? "json" : "markdown") : format;
  const fileName = detected === "json" ? "粘贴简历.json" : "粘贴简历.md";
  let parsed;
  let result;
  if (detected === "json") {
    result = importJsonResume(cleaned, fileName);
    try { parsed = JSON.parse(cleaned); } catch { parsed = null; }
  } else {
    parsed = parseMarkdown(cleaned);
    result = validateAndBuildState(parsed, fileName);
  }
  const metadata = detected === "json" ? parsed?.formatterState : parsed?.frontmatter?.[FORMATTER_STATE_FIELD];
  const invalidMetadata = result.errors.some((error) => error.code === "INVALID_FORMATTER_STATE");
  const layoutNotice = metadata && !invalidMetadata
    ? "已读取返回内容中的排版设置；导入后请检查换行和局部格式。"
    : metadata ? "排版设置无法识别，将使用默认排版。" : "未包含排版设置，将使用默认排版。";
  if (result.state) {
    result.state.source.kind = ai ? "ai" : "paste";
    result.state.source.format = detected;
    result.state.source.fileName = "";
  }
  return { ...result, format: detected, layoutNotice };
}

/** Resolve false on cancellation, write failure, or an unconfirmed download. */
async function confirmResumeReplacement() {
  syncFocusedEditor();
  if (!isDirty()) return true;
  return new Promise((resolve) => {
    showDialog({
      title: "当前简历有未保存的修改",
      message: "导入新内容会替换当前编辑草稿。你可以先保存当前简历，再继续。",
      onDismiss: () => resolve(false),
      buttons: [
        { text: "取消", action: () => resolve(false) },
        { text: "放弃修改并导入", action: () => resolve(true) },
        { text: "保存后导入", primary: true, action: async () => resolve(Boolean(await handleSave())) },
      ],
    });
  });
}

function commitResumeCandidate(candidate) {
  detachActiveSource();
  setState(candidate.state);
  renderResume(candidate.state);
  updateA4Status();
  // Imported content is a new, unsaved draft, even before further editing.
  markDirty();
  _startDismissed = true;
  updateDocumentContext(candidate.state);
}

function workflowElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** Read-only content preview; no mutation and no external links/resources. */
function appendCandidatePreview(container, state) {
  container.appendChild(workflowElement("h4", "", state.profile.name));
  if (state.profile.headline) container.appendChild(workflowElement("p", "", state.profile.headline));
  container.appendChild(workflowElement("p", "candidate-contact", [state.profile.phone, state.profile.email].filter(Boolean).join(" · ")));
  const inline = (tokens) => (tokens || []).map((token) => token.value || "").join("");
  const appendList = (bullets) => {
    if (!bullets?.length) return;
    const list = workflowElement("ul");
    bullets.forEach((bullet) => list.appendChild(workflowElement("li", "", inline(bullet.content))));
    container.appendChild(list);
  };
  state.sections.forEach((section) => {
    container.appendChild(workflowElement("h5", "", section.title || getSectionTitle(section.type)));
    [...(section.entries || []), ...(section.blocks || [])].forEach((block) => {
      if (block.type === "text") container.appendChild(workflowElement("p", "", inline(block.content)));
      else {
        const label = [block.name, block.role, block.date, block.location].filter(Boolean).join(" · ");
        if (label) container.appendChild(workflowElement("p", "candidate-entry", label));
        appendList(block.bullets);
      }
    });
  });
}

function showPasteResumeDialog({ ai = false, raw = "", format = "auto", preview = false } = {}) {
  const root = document.getElementById("dialog-root");
  if (!root) return;
  closeDialog();
  root.classList.add("active");
  const backdrop = workflowElement("div", "dialog-backdrop");
  backdrop.addEventListener("click", closeDialog);
  const box = workflowElement("div", "dialog-box candidate-dialog");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", "candidate-dialog-title");
  const title = workflowElement("h3", "dialog-title", ai ? "导入 AI 返回结果" : "粘贴简历内容");
  title.id = "candidate-dialog-title";
  box.appendChild(title);
  box.appendChild(workflowElement("p", "dialog-message", ai
    ? "粘贴你已核实的返回内容。确认导入后创建新草稿，保存时创建新文件。"
    : "支持符合简历格式的 Markdown / JSON。先检查内容预览，再导入。"));
  const grid = workflowElement("div", "candidate-grid");
  const inputPane = workflowElement("div", "candidate-input-pane");
  const formatLabel = workflowElement("label", "candidate-format", "内容格式 ");
  const select = workflowElement("select", "dialog-input");
  select.setAttribute("aria-label", "内容格式");
  [["auto", "自动识别"], ["markdown", "Markdown"], ["json", "JSON"]].forEach(([value, text]) => {
    const option = workflowElement("option", "", text);
    option.value = value;
    select.appendChild(option);
  });
  select.value = format;
  formatLabel.appendChild(select);
  inputPane.appendChild(formatLabel);
  const textarea = workflowElement("textarea", "dialog-input candidate-input");
  textarea.setAttribute("aria-label", "简历内容");
  textarea.placeholder = "在此粘贴 Markdown 或 JSON 简历…";
  textarea.value = raw;
  inputPane.appendChild(textarea);
  const example = workflowElement("button", "workflow-text-btn", "填入虚构示例");
  example.type = "button";
  inputPane.appendChild(example);
  const reviewPane = workflowElement("div", "candidate-review-pane");
  reviewPane.appendChild(workflowElement("h4", "candidate-review-title", "内容预览"));
  reviewPane.appendChild(workflowElement("p", "candidate-review-hint", "确认后在编辑器检查 A4 排版。"));
  const feedback = workflowElement("div", "candidate-feedback");
  feedback.setAttribute("role", "status");
  const content = workflowElement("div", "candidate-preview");
  reviewPane.append(feedback, content);
  grid.append(inputPane, reviewPane);
  box.appendChild(grid);
  const actions = workflowElement("div", "dialog-actions");
  const cancel = workflowElement("button", "dialog-btn", "取消");
  const check = workflowElement("button", "dialog-btn", "校验并预览");
  const confirm = workflowElement("button", "dialog-btn dialog-btn-primary", "确认导入");
  confirm.disabled = true;
  cancel.addEventListener("click", closeDialog);
  let candidate = null;
  const invalidate = () => {
    candidate = null;
    confirm.disabled = true;
    content.replaceChildren();
    feedback.textContent = "点击“校验并预览”检查内容。";
    feedback.removeAttribute("data-level");
  };
  textarea.addEventListener("input", invalidate);
  select.addEventListener("change", invalidate);
  example.addEventListener("click", () => {
    textarea.value = select.value === "json" ? JSON_EXAMPLE : MARKDOWN_EXAMPLE;
    invalidate();
  });
  const validate = () => {
    invalidate();
    if (!textarea.value.trim()) {
      feedback.textContent = "请先粘贴简历内容。";
      feedback.dataset.level = "error";
      textarea.focus();
      return;
    }
    candidate = parseResumeCandidate(textarea.value, select.value, ai);
    feedback.replaceChildren();
    const errors = candidate.errors.filter((error) => error.level === "error");
    if (!candidate.state) {
      feedback.dataset.level = "error";
      feedback.appendChild(workflowElement("strong", "", "还不能导入，请修改以下内容："));
      errors.forEach((error) => feedback.appendChild(workflowElement("p", "", `${error.line ? `第 ${error.line} 行：` : ""}${error.message}${error.suggestion ? ` ${error.suggestion}` : ""}`)));
      return;
    }
    feedback.dataset.level = "success";
    feedback.appendChild(workflowElement("p", "", `已识别 ${candidate.format === "json" ? "JSON" : "Markdown"} · ${candidate.state.sections.length} 个板块`));
    feedback.appendChild(workflowElement("p", "", candidate.layoutNotice));
    candidate.errors.filter((error) => error.level === "warning" && error.code !== "INVALID_FORMATTER_STATE").forEach((error) => {
      feedback.appendChild(workflowElement("p", "", error.message));
    });
    appendCandidatePreview(content, candidate.state);
    confirm.disabled = false;
  };
  check.addEventListener("click", validate);
  confirm.addEventListener("click", async () => {
    if (!candidate?.state) return;
    const reviewed = candidate;
    const reopen = { ai, raw: textarea.value, format: select.value, preview: true };
    confirm.disabled = true;
    if (!await confirmResumeReplacement()) {
      // Keep save-failure messages visible. Returning to review preserves input.
      const activeDialog = root.querySelector(".dialog-title");
      if (activeDialog && activeDialog !== title) {
        const back = workflowElement("button", "dialog-btn", "返回导入预览");
        const returnToReview = () => showPasteResumeDialog(reopen);
        back.addEventListener("click", returnToReview);
        root.querySelector(".dialog-actions")?.replaceChildren(back);
        root.querySelector(".dialog-backdrop")?.addEventListener("click", returnToReview);
        activeDialog.closest(".dialog-box")?.addEventListener("keydown", (event) => {
          if (event.key === "Escape") { event.stopPropagation(); returnToReview(); }
        });
        back.focus();
      } else showPasteResumeDialog(reopen);
      return;
    }
    closeDialog();
    commitResumeCandidate(reviewed);
    showToast("已导入为新草稿。点击保存创建本地文件。", "success");
  });
  actions.append(cancel, check, confirm);
  box.appendChild(actions);
  root.append(backdrop, box);
  invalidate();
  if (preview) validate();
  textarea.focus();
}
