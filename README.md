# AIRP Ledger Memory

一个面向 SillyTavern 长篇 1 对 1 AIRP 的事实型长期记忆扩展。它把历史保存为不可变事实账本，使用独立的便宜模型提取，并在生成前以固定预算召回少量相关证据。

## 当前版本

- 独立 SillyTavern Connection Profile，不使用当前 AIRP 主模型或主预设。
- 每轮一次严格 JSON 提取；格式不合法时不写入。
- 每条事实保留来源楼层、原文引用和消息快照哈希。
- 状态变化追加为“旧状态 → 新状态”，不覆盖旧记录。
- 人物成长至少需要多个不同来源楼层的证据。
- 本地中文 n-gram/词项混合召回、去重、限额注入，不需要额外召回 API。
- 查看、搜索、人工修订、软删除、锁定、来源审计和 JSON 导出。

## 安装

将本仓库安装到 SillyTavern 的第三方扩展目录，目录名保持为 `airp-ledger-memory`：

```text
SillyTavern/public/scripts/extensions/third-party/airp-ledger-memory
```

也可以把仓库推送到 GitHub 后，在 SillyTavern 的“扩展 → 安装扩展”中粘贴仓库 URL。

最低目标版本为 SillyTavern 1.18.x。安装后重新加载页面。

## 配置

1. 在 SillyTavern Connection Manager 中新建一个只用于记忆的连接，填写独立 Provider、Base URL、Key 和 Model。
2. 在 AIRP Ledger Memory 面板选择该 Connection Profile。
3. 点击“测试专用 API”。
4. 保持 JSON/结构化输出能力良好的便宜模型；建议温度为 0。

插件只保存 Connection Profile ID。API Key 继续由 SillyTavern 的 secret/连接机制保管。

## 每轮调用

- AIRP 主回复：原有 1 次调用，不由本插件产生。
- 记忆提取：每个已确认回合最多 1 次调用。
- 检索、过滤、成长聚合和提示词构建：纯代码，0 次调用。

角色回复在下一条用户消息发出时才被视为确认，这可避免把被丢弃的 swipe 写成历史。提取与主生成并行运行，因此新记忆通常从下一轮开始参与远期召回；刚发生的内容仍在 SillyTavern 近期聊天上下文中。

## 数据原则

- 模型只能追加候选事实，不能修改旧记录。
- 锁定事实不会被自动替换或删除。
- 人工编辑创建新修订，旧版保留在账本中。
- 删除默认是软删除。
- 底层消息快照始终保留，可从管理页或导出 JSON 审计。

## 已知限制

- 第一版只针对 1 对 1 RP；尚未实现群聊中的角色知识边界。
- 当前检索为本地词项检索，尚未接远程或本地向量模型。
- IndexedDB 数据属于当前浏览器配置；请定期导出 JSON。
- 不同提供商对严格 JSON Schema 的支持不同。即使提供商忽略 schema，插件仍会在本地执行严格形状与原文引用校验。

## 开发验证

```text
npm test
npm run check
```
