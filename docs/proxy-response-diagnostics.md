# 空响应、失败流和用量缺失修复

此版本修复 HTTP 200 被误记为成功、Responses 失败/未完成事件漏解析，以及为截断流伪造 `response.completed` 的问题。

## 上线顺序

1. 在目标数据库备份完成后，使用该版本的代码执行 `npm run db:migrate`。
2. 确认迁移成功，再重启代理服务；前端更新后刷新页面。

本次新增的迁移为 `recent_requests` 增加可空的 `response_diagnostics JSONB` 字段，旧请求保留 NULL，不重算旧账单。`db:migrate` 会执行项目的完整迁移脚本，运行前需核对目标环境并备份。未完成迁移不能直接启用新版请求记录代码。本地回归测试不连接生产数据库，也不调用付费上游。

## 如何定位新请求

- 请求 ID：客户端响应头 `X-Proxy-Request-Id`，近期请求状态栏悬停也可查看。
- 用相同请求 ID 搜索日志中的 `Upstream response outcome`，查看实际 `sourceModelId`、`upstreamModel` 和 `upstreamStatus`。
- `responseStatus`：`completed`（完成）、`failed`（失败）、`incomplete`（明确未完成）、`truncated`（断流/缺少结束事件）、`empty`（没有有效输出）。
- `terminalEvent`、`lastEvent`、`errorCode` 和 `errorMessage` 用于区分上游明确失败与流提前结束。
- `headerLatencyMs` 是收到响应头的耗时；`totalLatencyMs` 和近期请求耗时包括读取响应体的全过程。
- `usageStatus=missing` 表示上游没有报告可用用量，Token 显示“—”，不再与上游明确报告的 0 混淆。成功且用量缺失时，近期请求费用也显示“—”；内部结算沿用原来的 0，不估算或补收。

用户页状态栏只显示“成功”或“失败”，悬停仅提供请求 ID。“用量缺失”“未完成”和内部错误详情保留在管理员后台及诊断日志中。

失败请求保留已报告的 Token 用量，但沿用不扣费规则，并释放订阅请求额度。工具调用和拒答也是有效输出。已经向客户端透传的流不会切换上游或静默重试。

这次修复能消除假成功并增强定位，不能证明或保证解决上游/网络产生原始失败的原因；仍需用上线后的请求 ID 和诊断日志确认。
