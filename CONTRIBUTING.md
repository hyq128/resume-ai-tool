# 贡献指南

欢迎提交问题、文档修正或范围明确的改进。先阅读 [README](README.md)、[架构说明](docs/architecture.md) 和 [开发边界](AGENTS.md)。

## 开发流程

1. 使用 Node.js 22+、npm 和 Git，无需安装第三方依赖。
2. 从主分支创建工作分支，例如 `git switch -c fix/import-validation`。
3. 在 `src/` 修改源码；不要直接编辑生成的 HTML。保持无网络运行依赖与单文件离线能力。
4. 行为修改应补充能验证真实输入输出或文件流程的测试；纯文档修改检查链接和命令即可。
5. 执行以下检查，并提交源码和三个同步生成的 HTML：

```bash
npm test
npm run build
npm run check
git diff --check
```

## Issue 与 Pull Request

- Issue 写清浏览器、操作系统、复现步骤、预期与实际结果。使用虚构简历复现，截图与日志也要脱敏。
- PR 说明解决的问题、用户可见变化、验证结果和已知限制；避免混入无关重构。
- 新配置应更新 `.env.example` 和 README；当前应用没有环境变量。
- 新公开样例只放入 `fixtures/`，必须明确虚构。不要通过强制添加绕过私人文件忽略规则。
- 每次发布检查也会扫描已跟踪的文件；`.gitignore` 无法撤回已经提交的敏感内容。

贡献按仓库现有 MIT 许可分发，请保留原有版权声明。
