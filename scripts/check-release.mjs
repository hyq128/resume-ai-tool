import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, realpathSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

// Git applies the actual ignore rules. A disposable index supports source ZIPs
// and prevents an unrelated parent repository from determining the scan scope.
function getCandidateFiles() {
  let isOwnRepository = false;
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    isOwnRepository = realpathSync(top) === realpathSync(root);
  } catch {}

  let temporaryRepository;
  try {
    let args = [];
    if (!isOwnRepository) {
      temporaryRepository = mkdtempSync(join(tmpdir(), "resume-copilot-scan-"));
      execFileSync("git", ["init", "--bare", "--quiet", temporaryRepository], { stdio: "pipe" });
      args = [`--git-dir=${temporaryRepository}`, `--work-tree=${root}`];
    }
    const files = execFileSync("git", [...args, "ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root })
      .toString("utf8").split("\0").filter(Boolean);
    const staged = isOwnRepository
      ? new Set(execFileSync("git", ["ls-files", "--cached", "-z"], { cwd: root }).toString("utf8").split("\0").filter(Boolean))
      : new Set();
    return { files: [...new Set(files)], staged };
  } finally {
    if (temporaryRepository) rmSync(temporaryRepository, { recursive: true, force: true });
  }
}

const forbiddenFiles = [
  { label: "环境或凭据文件", pattern: /(?:^|\/)(?:\.env(?:\..+)?|\.npmrc|\.netrc)$|\.(?:pem|key|p12|pfx)$/i },
  { label: "私人输入或导出文件类型", pattern: /\.(?:pdf|docx?|png|jpe?g|webp|gif|heic|csv|tsv|jsonl|zip|patch)$/i },
  { label: "本地目录或缓存", pattern: /(?:^|\/)(?:private|resumes|uploads|exports|node_modules|\.aws|\.ssh|\.cache|\.venv|venv|__pycache__|coverage|test-results|playwright-report|tmp|temp|build|\.worktrees|\.idea|\.vscode)(?:\/|$)/ },
  { label: "临时文件", pattern: /(?:^|\/)(?:\.DS_Store|Thumbs\.db)$|\.(?:log|tmp|temp|bak|swp|swo|pyc)$/i },
];
const publicHtml = new Set(["src/index.template.html", "index.html", "resume-formatter.html", "dist/resume-formatter.html"]);
const forbiddenText = [
  { label: "绝对用户路径", pattern: /\/Users\// },
  { label: "内部系统引用", pattern: /GraceOS|Grace OS/ },
  { label: "未脱敏手机号", pattern: /(?<![\d])1[3-9]\d{9}(?![\d])/ },
  { label: "非示例邮箱", pattern: /[A-Z0-9._%+-]+@(?!example\.(?:com|org)\b)[A-Z0-9.-]+\.[A-Z]{2,}/i },
  { label: "私钥", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { label: "常见服务密钥", pattern: /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,})\b/ },
  { label: "硬编码凭据", pattern: /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["'][^"'\s]{12,}["']/i },
];

function checkRelease() {
  const { files: candidates, staged } = getCandidateFiles();
  const failures = [];
  for (const relativePath of candidates) {
    for (const rule of forbiddenFiles) {
      if (relativePath === ".env.example") continue;
      if (rule.pattern.test(relativePath)) failures.push(`${relativePath}: ${rule.label}`);
    }
    if (/\.(?:md|markdown)$/i.test(relativePath) && !["README.md", "CONTRIBUTING.md", "AGENTS.md"].includes(relativePath)
      && !/^(?:docs|fixtures)\//.test(relativePath)) failures.push(`${relativePath}: 非公开文档或样例位置`);
    if (/\.json$/i.test(relativePath) && !["package.json", "package-lock.json"].includes(relativePath)
      && !/^fixtures\//.test(relativePath)) failures.push(`${relativePath}: 非公开 JSON 位置`);
    if (/\.html$/i.test(relativePath) && !publicHtml.has(relativePath)) failures.push(`${relativePath}: 非公开 HTML 位置`);

    const contents = [];
    try {
      if (lstatSync(join(root, relativePath)).isSymbolicLink()) {
        failures.push(`${relativePath}: 公开文件不能链接到外部本地内容`);
        continue;
      }
      contents.push({ label: relativePath, value: readFileSync(join(root, relativePath), "utf8") });
      if (staged.has(relativePath)) {
        contents.push({ label: `${relativePath}（暂存区）`, value: execFileSync("git", ["show", `:${relativePath}`], { cwd: root, stdio: ["ignore", "pipe", "pipe"] }).toString("utf8") });
      }
    } catch {
      failures.push(`${relativePath}: 候选文件缺失或不可读，请检查 Git 索引`);
      continue;
    }
    for (const content of contents) {
      if (content.value.includes("\0")) failures.push(`${content.label}: 未批准的二进制内容`);
      for (const rule of forbiddenText) {
        // This file contains literal detection patterns; never print matched values.
        if (relativePath === "scripts/check-release.mjs") continue;
        if (rule.pattern.test(content.value)) failures.push(`${content.label}: 命中${rule.label}`);
      }
    }
  }

  const artifacts = ["index.html", "resume-formatter.html", "dist/resume-formatter.html"];
  const hashes = artifacts.map((path) => createHash("sha256").update(readFileSync(join(root, path))).digest("hex"));
  if (new Set(hashes).size !== 1) failures.push("三个公开 HTML 必须来自同一次构建");
  const artifact = readFileSync(join(root, "index.html"), "utf8");
  for (const api of ["fetch(", "XMLHttpRequest", "WebSocket(", "sendBeacon("]) {
    if (artifact.includes(api)) failures.push(`index.html: 发现运行时网络 API ${api}`);
  }
  if (/(?:src|href)=["'](?:https?:)?\/\//i.test(artifact)) failures.push("index.html: 发现外部运行时资源");
  try {
    execFileSync(process.execPath, [join(root, "scripts/build.mjs"), "--check"], { cwd: root, stdio: "pipe" });
  } catch {
    failures.push("公开 HTML 与当前源码不一致或构建输入缺失，请运行 npm run build");
  }
  if (failures.length) throw new Error("发布检查失败：\n- " + failures.join("\n- "));
  console.log(`发布检查通过：${candidates.length} 个候选文件，公开 HTML SHA-256 ${hashes[0]}`);
}

try {
  checkRelease();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
