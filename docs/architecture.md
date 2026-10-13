# 架构与维护说明

## 当前数据流

```text
Markdown ─→ parser.js ─→ validator.js ─┐
JSON ─────→ json-importer.js ──────────┤
                                     ↓
                            state.js / Resume State
                                     ↓
                         renderer.js → 可编辑 A4 DOM
                                     ↑
                            editor.js / photo.js
                                     ↓
                exporter.js 序列化 → app.js 写入本地文件
                overflow.js 检测 → exporter.js 调用浏览器打印
```

`Resume State` 是内容与版面参数的真源。源码为按顺序拼接的浏览器经典脚本，使用共享作用域；不是 ES Module。不要仅为目录整理改变加载顺序或模块机制。

## 模块职责

| 文件 | 职责 |
| --- | --- |
| `utils.js` | ID、克隆、安全 JSON、文件名、单位换算与提示 |
| `state.js` | 默认状态、排序、快照；保留旧草稿辅助函数 |
| `parser.js` | 受限 Frontmatter 与 Markdown、中文栏目别名、行内 token |
| `json-importer.js` | JSON 校验和状态转换、格式示例、转换及 JD 优化提示词 |
| `validator.js` | Markdown Schema 校验、构建状态、恢复排版元数据 |
| `renderer.js` | 从状态创建页头、板块、条目、照片与编辑控件 |
| `editor.js` | 正文编辑、局部格式、增删、撤销及拖动排序 |
| `persistence.js` | 优先读取 HTML 内嵌状态；自动持久化初始化仍是占位实现 |
| `workflow.js` | 开始入口、候选内容校验与预览、替换保护、来源与保存状态 |
| `exporter.js` | Markdown / JSON 序列化、清理后的完整 HTML 副本导出、打印 |
| `overflow.js` | A4 测量、状态提示、逐步压缩间距与行高 |
| `photo.js` | 图片读取、Canvas 缩放压缩、照片及相框调整 |
| `app.js` | 页面初始化、文件读写、目录列表、浏览器存储、菜单与对话框 |

`src/styles/` 分别管理应用外壳、简历主题及打印。字体从本机读取，没有远程静态资源。照片由用户运行时选择，不作为仓库资产。

## 可选本机 AI 适配层

`npm run start:ai` 先构建公开离线 HTML，再启动 `scripts/serve-ai.mjs`。该服务读取离线 HTML 并在响应中注入 `src/ai/client.js`、`src/ai/panel.css` 和随机页面令牌，不创建新的 AI HTML 产物、不修改公开三个入口。独立的 `scripts/ai-providers.mjs` 适配 OpenAI Responses 与 DeepSeek Chat Completions；浏览器只向同源本机 `/api/connect`、`/api/chat` 和 `/api/disconnect` 发起请求。

服务监听 IPv4 回环地址，验证 Host、Origin 和令牌；每页连接及 Key 单独保存在内存，有六小时上限。请求限制大小、角色、并发和超时；上游仅使用固定域名且拒绝重定向。响应转换为 NDJSON，只返回文本增量、完成状态、数字用量或固定错误说明，不执行工具、不记录输入和密钥。聊天由页面持有完整成功轮次，简历或 JD 变化后清空旧对话上下文。

生成时发送无照片、无排版元数据的 JSON 内容快照与 JD，遮蔽已知联系字段。候选 JSON 复用 `parseResumeCandidate()`，恢复本地联系字段、照片和全局排版；不按位置迁移局部格式。确认后通过 `commitResumeCandidate()` 创建未关联新草稿。应用前及来源替换确认后均检查快照，防止等待期间的修改被覆盖。HTML 导出移除所有 `data-ai-private` 节点和侧栏状态，恢复离线隐私说明。

细节与独立发布审核要求见 [本机 AI 助手](ai-mode.md)。本机 AI 层不参与公开 JS 拼接，现有公开发布检查不放宽。

## 构建与验证

`scripts/build.mjs` 将模板、三份 CSS、按依赖顺序排列的十三份 JS 及 `fixtures/valid/sample-resume.md` 合并为三个相同的 HTML。构建只使用 Node.js 原生模块。`scripts/serve.mjs` 仅是开发预览工具，不是产品后端。

`tests/` 使用 `node:test` 和 `vm` 验证纯数据流程及模拟文件句柄的读写。它们不能替代浏览器交互和真实 PDF 验收。

`scripts/check-release.mjs` 扫描 Git 已跟踪及未忽略的候选文件，并检查已有暂存内容；未初始化 Git 时用临时空索引按当前 `.gitignore` 获取候选范围，不改变工作目录。检查常见密钥、私人数据及文件类型，拒绝链接到本地文件的符号链接，校验 HTML 哈希一致、无运行时网络 API 或外部资源，并校验产物与当前源码构建结果一致。规则扫描不是所有敏感信息的证明，提交前仍需人工审阅。

## 已有行为与边界

- 当前文件“保存”会显式写回获得授权的源文件。没有后台自动回写。
- Markdown / JSON 保存排版元数据，不嵌入手动上传的照片数据；Markdown 可通过同目录 `photo` 引用重新读取图片。
- 首屏提供打开、粘贴和示例体验；粘贴导入先校验并预览，确认后替换当前草稿。AI 返回结果作为未关联新草稿，首次保存创建新文件。
- 文件写入不可用时下载副本，不清除未保存状态；取消或保存失败不继续替换。
- HTML 导出保留当前简历、照片和排版，清除其他文件列表、临时输入和导入前快照；独立 HTML 不自动恢复原目录授权。
- `saveDraft()` 存在但当前编辑链路没有调用；自动草稿恢复不能作为现有功能宣传。
- 离线提示词生成是本地文本处理；可选本机 AI 层仅在用户主动发送后调用其选择的服务商，返回待审核候选文本。
- AI 若重排或删除经历，保留下来的排版元数据按位置恢复，局部格式可能需要重新核对。

## 来源与兼容性

- 上游仓库：<https://github.com/gracexygu/resume-formatter>。
- 本地快照基线：`315ea4d`（`fix: unify markdown and json file workflows`）。原仓库为浅克隆，仅有该提交可供本地历史审计。
- 快照已经包含 JD 提示词与暖色界面改动；整理版从该工作目录提取，不重新应用补丁。
- 保留原 `LICENSE`、运行时 `APP_VERSION = 1.1.0`、HTML 文件名与 `resume-formatter:*` 浏览器存储键。
- 新目录不复制原 `.git`，不设置原上游为推送目标；首次发布使用新的 Git 仓库与自己的远程地址。

外层补丁、前后对照 HTML、旧 `.git` 和两个一次性 Python 样式修补脚本保留在原交付包。它们不参与构建，不纳入新的公开仓库。历史 PRD 与技术设计存于 `docs/reference/`，用于理解设计背景，不能视为当前实现清单。
