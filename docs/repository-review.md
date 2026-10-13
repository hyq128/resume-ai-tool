# 仓库整理与验证记录

验证日期：2026-10-11。验证环境：macOS、Node.js v26.0.0、Git 2.54.0、Codex 内置浏览器。

## 整理结果

- 从已应用改动的完整项目快照提取独立公开仓库；原交付包、补丁、预览、快照与旧 Git 元数据保留。
- 产品源码、样式、模板、公开 fixture 及三个 HTML 未改动；逐字节对照原快照一致。
- 原测试保留，增加六项发布检查回归测试；共 22 项。
- 重写 README，补充实际输入格式、模块关系、贡献、发布和后续计划。
- 旧需求与技术设计归入 reference，并标注历史状态，避免将设计要求误写成已实现能力。
- 保留原 MIT 版权；没有引入第三方代码或新运行时依赖。
- 新增 package.json 命令、本机预览、忽略规则、环境说明、敏感信息和构建一致性检查、GitHub Actions。
- 未复制旧 .git、前后对照预览、补丁及两个一次性 Python 修补脚本；原件均未删除。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| npm run build | 通过；三个 HTML 相同，单文件约 336 KB |
| npm test | 22 / 22 通过，包括原 16 项数据与文件流程测试 |
| npm run check | 通过，未发现规则覆盖的密钥、私人联系方式或网络依赖 |
| README 命令与相对链接 | 无第三方依赖，无需安装；命令可执行，文档链接存在 |
| 首次 Git 初始化及暂存模拟 | 在临时副本验证，全部公开文件可暂存，diff --cached --check 通过；交付目录没有创建 .git |
| 忽略规则 | .env、私人 Markdown / HTML / JD、依赖目录被忽略；公开文档、fixture、配置和产物保留 |
| 本机预览 | 启动成功；四个公开入口返回 200；.env、private 和源码路径返回 404；POST 返回 405 |
| 浏览器基本运行 | 默认样例渲染正常；1440×1000 桌面视口显示 A4 排版正常，工具栏无横向溢出 |
| JD 提示词 | 对话框和复制成功；包含虚构 JD、当前简历、Schema v2 与排版元数据 |
| 溢出修复 | 窄视口触发溢出后可修复，状态恢复正常 |
| 浏览器错误日志 | 本次示例及 JD 操作未捕获 error / warn |

公开 HTML SHA-256：`8c848a13c147ee5529952a0131b464c2b81e793dea686c8bd92faea4d9863f97`。

## 实测边界

- 内置浏览器的原生文件选择器未能由自动化接管；取消后页面正常。文件保存与另存为的数据流程已由现有模拟文件句柄测试覆盖，未将其等同于真实 Chrome 文件权限验收。
- 未生成并验收真实 PDF，也未完成 Windows / Chrome 跨设备打印、真实照片读写或 Safari / Firefox 验收；发布前仍应按 README 检查 Chrome 打印预览。
- GitHub Actions 已配置 Node.js 22 / 24，尚未在 GitHub 上执行；本地实际测试版本为 Node.js 26。
- 常见密钥扫描覆盖当前交付文件；旧快照为浅克隆，只能审计一个可用历史提交，未发现常见服务密钥。新的公开目录不携带这段历史。
- 较窄窗口工具栏裁切、粘贴导入和 HTML 导出缺少入口、自动草稿恢复未接入、照片未嵌入 Markdown / JSON 等已有边界已写入文档，本次未开发新产品功能。

## 最终文件结构

```text
resume-copilot/
├── .github/
│   └── workflows/
│       └── ci.yml
├── dist/
│   └── resume-formatter.html
├── docs/
│   ├── reference/
│   │   ├── PRD.md
│   │   └── TECH_DESIGN.md
│   ├── architecture.md
│   ├── input-format.md
│   ├── publishing.md
│   └── repository-review.md
├── fixtures/
│   ├── invalid/
│   │   └── missing-required-field.md
│   └── valid/
│       └── sample-resume.md
├── scripts/
│   ├── build.mjs
│   ├── check-release.mjs
│   └── serve.mjs
├── src/
│   ├── js/
│   │   ├── app.js
│   │   ├── editor.js
│   │   ├── exporter.js
│   │   ├── json-importer.js
│   │   ├── overflow.js
│   │   ├── parser.js
│   │   ├── persistence.js
│   │   ├── photo.js
│   │   ├── renderer.js
│   │   ├── state.js
│   │   ├── utils.js
│   │   └── validator.js
│   ├── styles/
│   │   ├── app.css
│   │   ├── print.css
│   │   └── resume.css
│   └── index.template.html
├── tests/
│   ├── file-workflow.test.mjs
│   ├── parser-validator.test.mjs
│   └── release-check.test.mjs
├── .env.example
├── .gitignore
├── AGENTS.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── index.html
├── package.json
└── resume-formatter.html
```

## 主流程体验更新

首屏开始入口、统一粘贴校验预览、AI 返回新草稿、首次保存与 HTML 导出已接通。上述历史记录中的入口缺失问题已解决；窄窗口 A4 预览、自动草稿恢复和精细排版诊断仍为后续工作。当前行为以 README 和源码为准。
