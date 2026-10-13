---
role: layout-tool-boundary
---

# 简历排版器开发边界

本仓库是公开的简历排版工具。仓库只负责 Markdown / JSON 解析、Schema 校验、A4 排版、版面诊断、浏览器内编辑以及 HTML / PDF 导出。

经用户授权增加本机 AI 候选适配层：通过 `npm run start:ai` 主动启用，连接 OpenAI / DeepSeek API 并返回待审核文本。事实审核仍由用户负责。三个公开 HTML 保持离线；数据范围、密钥生命周期与审核要求见 `docs/ai-mode.md`。本机开发不代表已经完成对外发布所需的独立隐私审核。

## 职责边界

上游系统或用户负责：

- 简历事实、经历选材与文字表达；
- 岗位匹配、内容审核与版本冻结；
- 是否采用浏览器内编辑结果；
- 使用提示词工作流时，模型选择、执行与结果审核由用户与其自己的 AI 完成。

本工具负责：

- 解析和校验版本化输入；
- 渲染 A4 页面并计算溢出高度；
- 返回换行、溢出与排版参数诊断；
- 生成按岗位 JD 优化的提示词文本：只做本地字符串拼接并写入剪贴板，不发起网络请求；
- 导出可独立打开的 HTML，并通过浏览器打印生成 PDF。

浏览器内的正文编辑属于当前排版草稿。工具默认不回写来源 Markdown；需要与其他系统集成时，由适配层接收候选修改或版面诊断。

## 隐私与发布规则

本仓库及 GitHub Pages 均按公开资产处理。

1. 源码、文档、测试、截图、fixture、提交记录和构建产物只能使用明确虚构的数据。
2. 真实简历、照片、联系方式、岗位材料、认证截图和导出文件不得进入仓库。
3. 用户文件只在浏览器本地读取；公开离线版不得新增远程上传、埋点或第三方运行时资源。用户授权的本机 AI 适配层仅在明确点击发送后向所选服务商发送文本，按 `docs/ai-mode.md` 实施；对外部署或推广前须完成独立审核。按 JD 优化的提示词工作流属于本地字符串拼接与剪贴板写入，不构成远程上传。
4. 浏览器草稿可以保存在当前设备的 `localStorage` / `IndexedDB`；文档必须准确说明本地存储行为。
5. 发布前必须从匿名 fixture 重新构建，并执行测试、构建一致性检查与敏感信息扫描。
6. 不得自动覆盖来源 Markdown。删除或重命名用户本地文件必须经过明确确认。

## 集成合同

推荐的上游输入：

```text
ResumeDocument { schema_version, content, assets[] }
LayoutProfile { profile_version, theme, typography, spacing }
```

推荐的下游输出：

```text
RenderArtifact { formatter_version, source_hash, html_ref, pdf_ref }
LayoutDiagnostics { page_count, overflow_mm, wrapped_items, attempted_settings }
```

上游拥有简历事实和来源文档；本工具拥有布局配置、渲染结果和版面诊断。

## 发布验收

- 匿名样例能够导入并通过 Schema 校验；
- 桌面 Chrome 中 A4 页面无越界、重叠和异常换行；
- 超长内容能返回明确溢出诊断；
- HTML 保存与 PDF 打印入口可用；
- 公开离线页面不发送用户简历数据；本机 AI 模式仅按用户操作发送已预览文本；
- `node scripts/check-release.mjs` 通过。
