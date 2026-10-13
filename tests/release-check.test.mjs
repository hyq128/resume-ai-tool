import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));

function makeProject(t) {
  const path = mkdtempSync(join(tmpdir(), "resume-copilot-release-test-"));
  t.after(() => rmSync(path, { recursive: true, force: true }));
  for (const name of ["src", "scripts", "fixtures", ".gitignore", "package.json"]) {
    cpSync(join(root, name), join(path, name), { recursive: true });
  }
  execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: path, stdio: "pipe" });
  return path;
}

function check(path) {
  const result = spawnSync(process.execPath, ["scripts/check-release.mjs"], { cwd: path, encoding: "utf8" });
  return { status: result.status, output: result.stdout + result.stderr };
}

test("未初始化 Git 的源码包可检查，忽略本地环境文件且不创建 .git", (t) => {
  const path = makeProject(t);
  writeFileSync(join(path, ".env"), "LOCAL_VALUE=fictional-local-setting\n");
  const result = check(path);
  assert.equal(result.status, 0, result.output);
  assert.equal(existsSync(join(path, ".git")), false);
});

test("强制跟踪的环境文件与私人导出不能绕过发布检查", (t) => {
  const path = makeProject(t);
  execFileSync("git", ["init", "--quiet"], { cwd: path });
  writeFileSync(join(path, ".env"), "LOCAL_VALUE=fictional-setting\n");
  writeFileSync(join(path, "personal-export.html"), "<p>Fictional private export</p>");
  execFileSync("git", ["add", "--force", ".env", "personal-export.html"], { cwd: path });
  const result = check(path);
  assert.equal(result.status, 1);
  assert.match(result.output, /环境或凭据文件/);
  assert.match(result.output, /非公开 HTML 位置/);
});

test("公开源码中的合成密钥被阻止，日志不泄露匹配值", (t) => {
  const path = makeProject(t);
  const syntheticSecret = "sk-" + "A".repeat(40);
  writeFileSync(join(path, "src/js/credential-demo.js"), `const demo = '${syntheticSecret}';\n`);
  const result = check(path);
  assert.equal(result.status, 1);
  assert.match(result.output, /常见服务密钥/);
  assert.equal(result.output.includes(syntheticSecret), false);
});

test("三个 HTML 相同但未随源码更新时也会阻止发布", (t) => {
  const path = makeProject(t);
  const source = join(path, "src/js/utils.js");
  writeFileSync(source, readFileSync(source, "utf8") + "\n// Fictional maintenance change\n");
  const result = check(path);
  assert.equal(result.status, 1);
  assert.match(result.output, /公开 HTML 与当前源码不一致/);
});

test("只存在于暂存区的合成密钥也会阻止提交", (t) => {
  const path = makeProject(t);
  execFileSync("git", ["init", "--quiet"], { cwd: path });
  const demo = "src/js/staged-demo.js";
  writeFileSync(join(path, demo), `const demo = '${"sk-" + "A".repeat(40)}';\n`);
  execFileSync("git", ["add", demo], { cwd: path });
  writeFileSync(join(path, demo), "// Fictional clean working-tree content\n");
  const result = check(path);
  assert.equal(result.status, 1);
  assert.match(result.output, /暂存区.*常见服务密钥/);
});

test("产物不一致或构建输入缺失时发布检查失败", (t) => {
  const path = makeProject(t);
  writeFileSync(join(path, "index.html"), "<p>stale build</p>");
  let result = check(path);
  assert.equal(result.status, 1);
  assert.match(result.output, /三个公开 HTML/);
  rmSync(join(path, "src/js/parser.js"));
  result = check(path);
  assert.equal(result.status, 1);
  assert.match(result.output, /构建输入缺失/);
});
