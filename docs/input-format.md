# 输入格式

## Markdown

Frontmatter 只接受单行 `key: value`，不支持完整 YAML。文件必须以 `---` 开头并用独立的 `---` 结束 Frontmatter。

必填：`schema_version`（1 或 2）、`resume_name`、`name`、`phone`、`email`。`headline`、`location`、`website`、`portfolio`、`github`、`photo` 为选填。

```markdown
---
schema_version: 2
resume_name: 示例用户-产品经理（虚构）
name: 示例用户
headline: 产品经理
phone: 1xx-xxxx-xxxx
email: example@example.com
---

## education

### 晨星大学
role: 信息管理｜本科
date: 2022.09-2026.06

- 主修产品设计

## experience

### 星河科技
role: 产品实习生
date: 2025.04-2025.08

- 完成**核心流程**验收

## skills

- 产品：需求分析
```

`education`、`experience` 每个 `###` 条目必须有名称、`role` 与 `date`。`projects` 缺少 `role` / `date` 会产生警告。`skills` 直接放一级 `-` 列表，不使用 `###`。

支持中文别名：教育经历 / 教育背景、实习经历 / 工作经历、项目经历、技能 / 技能特长。其他二级标题视为自定义板块，可混合正文、一级列表与条目。行内支持 `**加粗**`、`*斜体*`、`***加粗斜体***` 及 `[名称](https://example.com)`。

这不是通用 Markdown 编辑器；避免表格、引用、图片、嵌套列表及复杂扩展语法。未识别的内容不保证保留，导入后应对照原文检查。

## JSON

根字段需要 `schemaVersion`（数值 1 或 2）、`resumeName`、`profile` 对象和 `sections` 数组。`profile` 中 `name`、`headline`、`phone`、`email` 必须为非空字符串。

```json
{
  "schemaVersion": 2,
  "resumeName": "示例用户-产品经理（虚构）",
  "profile": {
    "name": "示例用户",
    "headline": "产品经理",
    "phone": "1xx-xxxx-xxxx",
    "email": "example@example.com"
  },
  "sections": [
    {
      "type": "skills",
      "entries": [{ "name": "", "bullets": ["产品：需求分析"] }]
    }
  ]
}
```

预置 `type` 为 `education`、`experience`、`projects`、`skills`，条目规则与 Markdown 类似。`bullets` 必须为字符串数组。自定义板块使用 `type: "custom"`、`title` 和 `blocks`，内容块为 `text`（`content` 字符串）、`list`（`items` 字符串数组）或 `entry`（`name` 等条目字段）。

## 保存与照片

保存统一输出 Schema v2。Markdown 使用 `resume_formatter_state`、JSON 使用 `formatterState` 保存版式、顺序关联信息、逐行符号与局部格式；删除元数据会恢复默认排版。

Markdown 可选 `photo: profile.png` 由“打开文件夹”授权读取同目录图片。手动上传的图片数据不会嵌入 Markdown / JSON，JSON 保存也不携带 `photo` 引用。请单独保留照片，最终投递 PDF 会包含当前页面照片。

所有公开示例与测试数据均为虚构，私人输入请放在仓库外或 `private/` 中。
