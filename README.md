# Resume Copilot

浏览器本地运行的简历编辑与 A4 排版工具。面向需要维护不同岗位简历版本的求职者，将结构化 Markdown / JSON 简历转换为可编辑页面，减少反复调整字号、照片和分页的时间。

项目基于 [Resume Formatter](https://github.com/gracexygu/resume-formatter) 的 MIT 版本整理，包含按 JD 生成优化提示词及暖色界面改动。页面沿用“简历排版器”名称，现有文件名与浏览器存储键保持兼容。

## 核心功能

| 能力 | 当前实现 |
| --- | --- |
| 简历解析 | 打开文件或粘贴 Markdown / JSON，校验并预览后确认导入；支持 Schema v1/v2、字段校验、预置栏目及自定义板块 |
| 内容编辑 | 直接编辑文字，增删条目和列表，撤销编辑，调整板块与工作经历顺序 |
| 排版 | 黑体、宋体、思源、学术四种风格；全局字号与行高、局部格式和项目符号调整 |
| 照片 | 本地上传 JPEG / PNG / WebP，压缩、拖动、缩放和调整照片框 |
| 版面诊断 | 检测 A4 溢出；“修复溢出”逐步压缩板块间距与行高，不改写正文 |
| 文件保存 | 获得浏览器文件授权后，“保存”写回当前 Markdown / JSON，“另存为”创建并切换到新文件；文件包含排版元数据 |
| HTML 导出 | 下载含当前内容、照片与排版的可独立打开、继续编辑的完整副本 |
| PDF 导出 | 调用桌面 Chrome 打印窗口生成 PDF |
| JD 优化辅助 | 本地组合当前简历与目标 JD，生成可复制的提示词；由用户自己的 AI 执行，审核后重新导入 |
| 本机 AI 助手 | 本机启动后输入 OpenAI / DeepSeek API Key，连续问答、生成修改稿、对比核实后应用为新草稿 |
| 格式转换辅助 | 提供 PDF / Word 转 Markdown / JSON 的提示词，转换由外部 AI 完成 |

公开离线版不调用模型。可选的**本机 AI 模式**支持 OpenAI / DeepSeek API，在页面侧栏连续问答、生成完整候选稿、核实对比后应用为新草稿。没有自动 JD 匹配评分、PDF / Word 直接解析、云端同步或自动投递。

## 技术栈

- 原生 HTML5、CSS3、JavaScript，无 React / Vue 或第三方运行时依赖；可选 AI 模式由 Node.js 原生模块提供本机连接服务。
- 浏览器 File System Access API、FileReader、Canvas、Pointer Events、ResizeObserver、Clipboard API 和 `window.print()`。
- `localStorage` 保存置顶记录与旧版副本；IndexedDB 保存已授权的目录句柄。
- Node.js 原生模块负责构建、测试、发布检查及本地预览；无 npm 依赖，无需执行 `npm install`。

## 快速开始

### 直接使用

用桌面 Chrome 打开 [dist/resume-formatter.html](dist/resume-formatter.html)，即可离线使用。不要直接打开 `src/index.template.html`，它需要经过构建。

建议使用桌面 Chrome 稳定版、100% 浏览器缩放及较宽窗口。文件选择、保存和剪贴板能力受浏览器权限与运行环境限制；遇到本地文件权限问题，可按下方步骤通过 localhost 打开。

### 本地开发

环境要求：Node.js 22 或更高版本（建议 LTS）、随 Node.js 提供的 npm；发布检查需要 Git。

```bash
# 下载或克隆仓库后，进入包含 package.json 的目录
cd resume-copilot
npm run build
npm test
npm run check
npm start
```

打开 [http://127.0.0.1:8000](http://127.0.0.1:8000)，按 `Ctrl+C` 停止服务。预览服务仅监听本机，仅提供三个公开 HTML 入口。修改源码后重新构建并刷新页面，不提供自动热更新。

离线模式无需 API Key、数据库或 `.env` 配置。应用不会读取 `.env`。

### 本机 AI 模式

```bash
npm run start:ai
```

打开 [http://127.0.0.1:8001](http://127.0.0.1:8001)，点击右侧「AI 助手」。选择 OpenAI 或 DeepSeek，输入自己的 API Key 并测试连接，选择账户可用的文本模型，然后粘贴 JD、直接聊天或点击「生成修改稿」。下方对比原文和候选稿，核实后应用。新草稿首次保存创建新文件。

OpenAI 这里使用 API Key 和 API 额度，不复用 Codex / ChatGPT 登录。连接测试仅验证模型列表访问，余额和文本生成权限以实际请求为准。Key 仅在本机服务内存中保存，刷新页面后重新连接。对话与 JD 不自动保存；断开连接清除 Key，`Ctrl+C` 退出本机服务。

发送会将文本交给所选服务商；发送预览显示实际内容，照片和排版不发送。完整的数据范围、密钥生命周期与限制见 [本机 AI 助手说明](docs/ai-mode.md)。GitHub Pages 或直接打开离线 HTML 不提供 AI 侧栏。

也可直接使用原生命令：

```bash
node scripts/build.mjs
node --test tests/*.test.mjs
node scripts/check-release.mjs
node scripts/serve.mjs
```

## 使用说明

1. 首屏选择“打开简历文件”“粘贴简历内容”或“使用示例体验”。下方默认显示明确虚构的示例；需要管理多份简历时，可在右侧“打开 → 打开文件夹”选择目录。
2. 粘贴入口自动识别 Markdown / JSON（也可手动选择），支持常见代码块包裹。点击“校验并预览”检查内容，再“确认导入”；错误时保留输入并显示修复建议。格式示例在“打开”菜单中。当前有未保存修改时，可保存后导入、明确放弃修改或取消；保存失败或取消保存不会继续替换。
3. 点击简历正文编辑，调整风格、字号、行高及照片；检查 A4 状态。较窄窗口可能裁切工具栏或改变预览换行，当前以桌面宽屏使用为主。
4. 选择“AI 提示词 → 生成岗位优化提示词”，粘贴 JD 并复制提示词，交给自己的 AI。核实返回内容后，从“AI 提示词 → 导入 AI 返回结果”粘贴、预览并确认。返回结果作为未关联的新草稿，首次保存创建新文件；有效排版元数据会被恢复，缺失或无效时使用默认排版。AI 调整经历顺序或数量后仍须检查局部格式。
5. “保存”对示例、粘贴内容和 AI 返回结果直接创建新文件；已关联且获授权的 Markdown / JSON 会被主动保存操作更新，右侧显示保存目标。“另存为”创建并切换到新文件，后续保存写入新文件。JSON 粘贴默认保存 JSON，Markdown 默认保存 Markdown。取消、权限拒绝或写入失败时保留当前草稿。
6. 不支持文件写入的浏览器会下载 Markdown / JSON 副本，不更新原文件，也不会将下载发起视为已写入成功。请检查下载完成；在“保存后导入”流程中，此时会停止替换，返回预览后可再次确认并明确放弃当前修改。
7. “导出 → 导出 HTML”下载包含当前内容、照片与排版的完整副本，重新打开可以继续编辑。副本不带入其他简历列表、残留 JD 或粘贴输入；不会自动恢复原目录授权。HTML 导出不改变当前来源文件关联，也不表示原 Markdown / JSON 已更新。
8. “导出 → 导出 PDF”打开浏览器打印窗口。在桌面 Chrome 中选择“另存为 PDF”、A4、100% 缩放、无边距、关闭页眉页脚、开启背景图形，并检查打印预览。

只有 PDF / Word 时，使用首屏或“打开”菜单中的转换帮助，复制提示词给自己的 AI，再将核实后的 Markdown / JSON 粘贴导回。本工具不会直接读取 PDF / Word；自动复制不可用时会展示完整提示词供手动复制。本机 AI 模式处理已导入的简历文本。

通过文件夹导入时，Markdown 的可选 `photo: profile.png` 可以读取同目录照片。手动上传的照片不会嵌入保存的 Markdown / JSON；重新打开时可能需要重新上传。照片存在时右侧显示此限制，需要完整副本可导出 HTML。当前自动草稿保存与恢复仍未接入，刷新前请主动保存。

Markdown 必填字段为 `schema_version`、`resume_name`、`name`、`phone`、`email`；JSON 还要求 `profile.headline`。Schema v1/v2 均可导入，保存使用 v2。详细格式见 [输入格式](docs/input-format.md)。

## 项目结构

```text
resume-copilot/
├── src/
│   ├── index.template.html       # 页面模板
│   ├── js/                      # 解析、校验、状态、编辑、导出与交互
│   └── styles/                  # 工具界面、简历主题与打印样式
├── fixtures/                    # 明确虚构的合法 / 非法输入
├── tests/                       # 解析校验、格式往返与文件保存测试
├── scripts/                     # 构建、发布检查与本地预览
├── docs/                        # 架构、格式、发布说明与历史设计
├── .github/workflows/ci.yml      # 自动测试与构建一致性检查
├── dist/resume-formatter.html    # 可下载的单文件产物
├── index.html                   # GitHub Pages 根入口
├── resume-formatter.html        # 兼容原文件名的入口
├── .env.example
├── .gitignore
├── package.json
├── CONTRIBUTING.md
├── AGENTS.md
└── LICENSE
```

三个公开 HTML 由同一次构建生成且内容完全一致，用于下载、Pages 和原文件名兼容，必须一起更新。字体使用本机字体栈；仓库不包含照片、在线字体或其他外部静态资源。

模块关系与开发边界见 [架构说明](docs/architecture.md)。旧 PRD 与技术设计保留在 `docs/reference/`，包含历史规划，当前能力以本 README 和源码为准。

## 隐私与发布

公开离线页面不会主动上传简历、照片或 JD，不包含模型调用、统计脚本或外部运行时资源。用户点击简历中的外部链接，或将提示词粘贴给外部 AI 后，相关行为由用户与该服务控制。本机 AI 模式仅在主动发送后向所选服务商提交文本，密钥和会话仅保存在内存；导出 HTML 会移除整个 AI 界面与连接脚本，PDF 打印隐藏 AI 界面。

当前编辑内容主要保存在内存，不能依赖刷新后恢复；请主动保存本地文件。浏览器中的旧版副本、置顶记录与目录授权可通过清除该站点的浏览器数据移除。

公开样例均为虚构。不要提交真实简历、照片、JD、个人导出 HTML / PDF、密钥或 `.env`。发布检查覆盖候选提交文件的敏感文本、常见密钥、私人文件类型、网络依赖及三个产物的一致性。完整流程见 [发布到 GitHub](docs/publishing.md)。

## Roadmap

以下为待办方向，尚未承诺版本或交付日期，本次整理不实现新功能：

- [ ] 修复较窄窗口下的工具栏裁切，完善移动端及浏览器兼容性。
- [x] 补齐开始入口、粘贴校验预览、AI 返回导入、首次保存和 HTML 导出。
- [ ] 完善自动草稿保存与恢复，明确照片在不同保存格式中的行为。
- [ ] 扩大浏览器、照片、打印和 JD 提示词工作流的回归覆盖。

本机 AI 调用已实现，尚未使用真实账户完成服务商联调；对外部署或推广 AI 服务前仍需独立隐私与安全审核。自动 JD 评分未实现。

## 贡献与许可

欢迎提交问题和改进，见 [贡献指南](CONTRIBUTING.md)。使用 [MIT License](LICENSE)，保留 Resume Formatter contributors 的原始版权声明。上游来源及基线记录见 [架构说明](docs/architecture.md#来源与兼容性)。
