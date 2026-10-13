# 发布到 GitHub

公开离线 HTML 与本机 AI 模式分开：`src/ai/` 和本机连接服务可以作为源码分享，但不能注入三个公开 HTML。AI 服务对外部署或推广前须独立隐私与安全审核；开发测试通过不代表完成该审核。数据说明见 [本机 AI 助手](ai-mode.md)。

## 提交范围

| 应提交 | 应忽略 / 留在原交付包 |
| --- | --- |
| `src/`、`scripts/`、`tests/`、虚构 `fixtures/` | 真实简历、JD、照片、个人导出 HTML / PDF / Word |
| `docs/`、README、贡献说明、AGENTS、LICENSE | `.env`、密钥、机器配置、缓存、日志、编辑器文件 |
| `package.json`、`.gitignore`、`.env.example`、CI | `node_modules/`、临时测试结果、覆盖率 |
| 三个由虚构 fixture 构建的公开 HTML | 原补丁、前后对照预览、旧 `.git`、一次性 Python 修补脚本 |

本仓库目前没有第三方依赖，因此没有安装步骤或依赖锁文件；未来引入依赖后提交对应锁文件。`package.json` 的 `private: true` 仅防止误发布到 npm，不影响 GitHub 开源。

## 首次初始化与提交

在新的 `resume-copilot/` 中执行，勿在外层交付包或原快照中执行：

```bash
git init -b main
npm test
npm run build
npm run check

# 明确选择公开文件，避免将整个交付包提交
git add .gitignore .env.example package.json README.md CONTRIBUTING.md AGENTS.md LICENSE
git add src scripts tests fixtures docs .github
git add index.html resume-formatter.html dist/resume-formatter.html
git diff --cached --check
git diff --cached --stat
git diff --cached
npm run check
git commit -m "chore: prepare Resume Copilot for public release"
```

先在 GitHub 创建空仓库，不自动添加 README、许可证或 `.gitignore`，然后将命令中的 `YOUR_USERNAME` 换成自己的用户名：

```bash
git remote add origin https://github.com/YOUR_USERNAME/resume-copilot.git
git remote -v
git push -u origin main
```

HTTPS 推送使用 GitHub 支持的本地认证方式；不要将 Token 写入远程 URL、文档或代码。如果已有 `origin`，先检查其归属，再用 `git remote set-url origin ...` 修改。不要把新的项目推向原上游仓库。

## 后续发布

```bash
npm test
npm run build
npm run check
git diff --check
```

本地和 CI 同时检查候选文件及产物与源码的一致性，CI 还重新构建并拒绝未提交的产物变化。`npm run check` 支持没有 `.git` 的源码目录，也支持首次提交前的暂存文件检查。它不会扫描所有历史提交或替代人工隐私审阅。

若启用 GitHub Pages，在仓库 Settings → Pages 中选择从 `main` 分支的 `/ (root)` 发布；`index.html` 为入口。发布站点后再将真实地址写入 README，不把上游网站当成本项目部署地址。详见 [GitHub Pages 发布源说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

`.gitignore` 不会删除已跟踪文件或历史中的敏感内容。已提交的密钥应先撤销或轮换，再处理历史；不要直接推送带敏感历史的旧 `.git`。参见 [GitHub 敏感数据处理说明](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)。
