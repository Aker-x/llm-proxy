# 订阅额度计费技术设计

## 1. 设计目标

本设计在保留现有余额 Token 计费的前提下，增加按订阅周期和外部模型计次的额度系统。

目标：

- 普通请求继续使用现有余额 Token 计费链路。
- 有效订阅且模型有剩余额度时，按请求次数消费，不扣余额。
- 订阅额度耗尽后，按配置回退到余额 Token 计费或拒绝请求。
- 订阅周期从生效日起固定 30 天。
- 支持多实例并发、上游重试、流式响应、服务重启和幂等结算。

## 2. 现有能力复用

以下能力继续复用：

- `subscription_plans`：订阅套餐和价格。
- `subscription_orders`：订阅订单和人工审核。
- `users.subscription_*`：用户当前订阅状态。
- `external_models`：对外模型目录。
- `external_model_targets`：外部模型到底层 provider/model 的路由。
- `request-accounting-service`：余额请求的预扣与结算。
- `recent_requests`、`stats_events`：请求记录和统计。

现有 `daily_request_limit`、`subscription_quota_counters` 和 `subscription_quota_reservations` 继续表示每日额度，不改写为周期额度，避免破坏现有功能。

## 3. 总体架构

```text
HTTP 请求
   |
认证并识别用户
   |
解析 external model
   |
SubscriptionService.resolveUsageAccess
   |
   +-- 有效订阅 + 周期额度足够
   |       |
   |       +-- 周期额度预占 1 次
   |       +-- accountingMode = subscription
   |
   +-- 无额度 / 无订阅
           |
           +-- allow_balance_fallback = true -> 余额 Token 计费
           +-- allow_balance_fallback = false -> 402 拒绝
   |
转发 provider 请求
   |
   +-- 成功：确认订阅次数 / 结算余额
   +-- 失败：释放订阅预占 / 退回余额预扣
```

## 4. 数据库设计

### 4.1 订阅周期表

新增 `subscription_periods`：

```sql
CREATE TABLE subscription_periods (
    id UUID PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
    starts_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

推荐状态：

- `pending`：等待生效。
- `active`：当前有效周期。
- `expired`：已过期。
- `cancelled`：被管理员取消。

`users.subscription_started_at` 和 `users.subscription_expires_at` 继续作为快速读取字段；周期表作为权威历史记录。

### 4.2 套餐模型额度快照

新增 `subscription_plan_model_quotas`：

```sql
CREATE TABLE subscription_plan_model_quotas (
    plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    external_model_name TEXT NOT NULL REFERENCES external_models(name) ON DELETE CASCADE,
    period_request_limit INTEGER NOT NULL DEFAULT 0,
    allow_balance_fallback BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (plan_id, external_model_name)
);
```

`period_request_limit = 0` 表示不限量。是否允许不限量由管理端权限和产品策略控制。

周期生效时，必须把套餐额度复制到周期快照表，避免管理员修改套餐后影响已经生效的用户：

```sql
CREATE TABLE subscription_period_model_quotas (
    period_id UUID NOT NULL REFERENCES subscription_periods(id) ON DELETE CASCADE,
    external_model_name TEXT NOT NULL,
    period_request_limit INTEGER NOT NULL DEFAULT 0,
    allow_balance_fallback BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (period_id, external_model_name)
);
```

### 4.3 周期使用计数

新增 `subscription_period_usage`：

```sql
CREATE TABLE subscription_period_usage (
    period_id UUID NOT NULL REFERENCES subscription_periods(id) ON DELETE CASCADE,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    external_model_name TEXT NOT NULL,
    used_count INTEGER NOT NULL DEFAULT 0,
    inflight_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (period_id, external_model_name)
);
```

有效额度计算：

```text
remaining = period_request_limit - used_count - inflight_count
```

无限量模型不需要阻止预占，但仍应记录使用次数。

### 4.4 周期请求预占

新增 `subscription_period_reservations`：

```sql
CREATE TABLE subscription_period_reservations (
    request_id UUID PRIMARY KEY,
    period_id UUID NOT NULL REFERENCES subscription_periods(id) ON DELETE CASCADE,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    external_model_name TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
```

状态：

- `reserved`：已预占，等待上游结果。
- `consumed`：请求成功，已消耗。
- `released`：请求失败，额度已释放。
- `expired`：超时清理释放。

## 5. 核心事务

### 5.1 预占一次额度

`reservePeriodUsage` 必须在一个数据库事务中执行：

1. 根据 `period_id` 和 `external_model_name` 锁定使用计数行。
2. 校验周期仍为 `active` 且当前时间小于 `expires_at`。
3. 校验 `used_count + inflight_count < period_request_limit`；不限量时跳过上限校验。
4. `inflight_count = inflight_count + 1`。
5. 插入 `subscription_period_reservations`，使用 `request_id` 做幂等约束。
6. 提交事务。

预占失败时返回：

- `subscription_expired`
- `model_not_in_plan`
- `quota_exhausted`
- `already_reserved`

### 5.2 完成或释放预占

`completePeriodUsageReservation` 也必须是事务：

成功：

```text
inflight_count - 1
used_count + 1
reservation.status = consumed
```

失败：

```text
inflight_count - 1
reservation.status = released
```

已处于 `consumed` 或 `released` 的 reservation 再次提交时直接返回原结果，不重复变更计数。

## 6. 服务层设计

### 6.1 SubscriptionRepository

新增方法：

```text
createPeriod({ username, planId, startsAt, expiresAt })
getActivePeriod(username)
createPeriodQuotaSnapshot({ periodId, planId })
listPeriodUsage(periodId)
reservePeriodUsage(payload)
completePeriodUsageReservation(payload)
releaseStalePeriodReservations(payload)
```

现有每日额度方法继续保留，避免对已有调用方产生破坏性改动。

### 6.2 SubscriptionService

`resolveUsageAccess` 的新逻辑：

1. 查找用户当前有效订阅周期。
2. 根据外部模型名读取周期额度快照。
3. 尝试原子预占 1 次。
4. 预占成功返回：

```js
{
  mode: 'subscription',
  periodId,
  externalModelName,
  quotaReservation,
  appliedLimit,
}
```

5. 额度耗尽时根据 `allow_balance_fallback` 返回 `balance` 或 `blocked`。

### 6.3 ProxyService

现有 `accountingMode` 继续使用：

- `subscription`：记录统计，不进行余额结算；完成订阅预占。
- `balance`：走现有 `RequestAccountingService.settle`。

外部模型内部 fallback 时：

- 失败尝试先释放当前订阅预占；
- 最终成功的外部请求重新持有一个 reservation；
- 同一用户请求最多消耗一次订阅额度。

如果未来可以在请求开始时确定完整 fallback 链，也可以使用同一个 reservation 跨底层模型重试，减少释放再预占，但不是第一阶段必需项。

## 7. 订阅订单与周期生成

### 7.1 首次订阅

管理员审核通过订单时，在同一事务中：

1. 将订单改为 `paid` 或现有成功状态。
2. 创建 `subscription_periods`，`starts_at = 当前时间`，`expires_at = starts_at + 30 天`。
3. 复制套餐模型额度到 `subscription_period_model_quotas`。
4. 初始化 `subscription_period_usage`。
5. 更新 `users.subscription_*` 快速字段。

### 7.2 提前续费

如果用户当前周期仍有效：

```text
starts_at = 当前周期 expires_at
expires_at = starts_at + 30 天
```

如果当前周期已过期：

```text
starts_at = 当前时间
expires_at = starts_at + 30 天
```

续费审批必须使用订单 ID 的唯一性和事务锁保证幂等。

### 7.3 套餐变更

已经生效的周期不受套餐后续修改影响。升级或降级应生成新的周期快照，不直接修改当前周期额度。

## 8. API 设计

### 管理端

保留已有计划和订阅接口，增加或扩展字段：

```text
GET  /api/admin/subscription/plans
POST /api/admin/subscription/plans
PUT  /api/admin/subscription/plans/:id
GET  /api/admin/subscription/plans/:id/quotas
PUT  /api/admin/subscription/plans/:id/quotas
GET  /api/admin/subscription/users/:username/usage
```

套餐额度请求示例：

```json
{
  "planId": "pro-100",
  "monthlyPriceCny": 100,
  "periodDays": 30,
  "quotas": [
    { "externalModelName": "5.6luna", "periodRequestLimit": 200, "allowBalanceFallback": true },
    { "externalModelName": "5.6terra", "periodRequestLimit": 80, "allowBalanceFallback": true },
    { "externalModelName": "5.6sol", "periodRequestLimit": 70, "allowBalanceFallback": true },
    { "externalModelName": "5.6", "periodRequestLimit": 30, "allowBalanceFallback": true }
  ]
}
```

### 用户端

```text
GET  /api/subscription/overview
GET  /api/subscription/plans
POST /api/subscription/orders
GET  /api/subscription/orders/:id
```

`/api/subscription/overview` 应返回当前周期、剩余天数、每个模型的总量、已用量、预占量和剩余量。

## 9. 前端设计

### 管理端

在现有订阅管理区域中增加：

- 周期类型显示为“生效后 30 天”；
- 每个计划的模型额度编辑表格；
- 余额回退开关；
- 当前用户周期用量查询；
- 已用、进行中、剩余三项数据。

现有每日额度区域保留并明确标注“每日额度”，避免与“订阅周期额度”混淆。

### 用户端

增加订阅额度卡片：

```text
当前套餐：Pro
周期：2026-06-15 10:00 至 2026-07-15 10:00

5.6luna   37 / 200   剩余 163
5.6terra  12 / 80    剩余 68
5.6sol    20 / 70    剩余 50
5.6        4 / 30     剩余 26
```

## 10. 记录和统计

订阅请求依然写入 `recent_requests` 和 `stats_events`：

- `accounting_mode = 'subscription'`；
- `subscription_plan_id` 记录套餐；
- 新增或复用字段记录 `subscription_period_id`；
- Token 用量继续保存，用于成本分析；
- `total_cost` 可以保存内部估算成本，但不用于扣除用户余额；
- 余额请求继续使用 `accounting_mode = 'balance'`。

建议在统计查询中同时展示：

- 用户实际支付方式；
- 订阅次数消耗；
- 内部 Token 成本估算；
- 余额实际扣款。

## 11. 过期预占清理

后台定期任务或每次订阅访问时执行轻量清理：

1. 找出状态为 `reserved` 且创建时间超过 6 小时的记录。
2. 锁定 reservation 和 usage 行。
3. 减少 `inflight_count`。
4. 将 reservation 标记为 `expired`。

清理操作必须幂等，不能影响已经 `consumed` 或 `released` 的记录。

## 12. 迁移策略

1. 新增周期、周期额度快照、周期使用和 reservation 表。
2. 不修改现有每日额度表的字段含义。
3. 为已有 active 订阅生成一个周期记录：
   - 起始时间使用现有 `subscription_started_at`；
   - 到期时间使用现有 `subscription_expires_at`；
   - 套餐额度从当前计划配置复制。
4. 无法确定历史已用次数时，不回算旧请求；迁移后从 0 开始，并在管理员页面标注迁移时间。
5. 新订单审核流程改为创建周期快照。
6. 开启新流程前完成数据库备份和回滚验证。

## 13. 测试设计

### 单元测试

- 周期起止时间计算。
- 提前续费顺延 30 天。
- 过期订阅拒绝预占。
- 单模型额度扣减。
- 不同模型额度互不影响。
- 余额回退开关。
- reservation 重复完成幂等。

### 并发测试

- 剩余 1 次时并发发送 2 个请求，只有 1 个成功预占。
- 剩余 N 次时并发请求不超过 N。
- 一个请求失败释放后，后续请求可以重新使用该次数。

### 代理链路测试

- 普通用户继续按 Token 扣费。
- 订阅用户有额度时不扣余额。
- 订阅用户额度耗尽后按配置回退或拒绝。
- provider fallback 不重复消耗次数。
- 普通响应和流式响应都能正确结算。
- 上游失败和客户端中断符合计费规则。

### 接口和 UI 测试

- 管理员可以保存套餐模型额度。
- 用户可以看到周期和逐模型剩余次数。
- 非管理员不能修改套餐和额度。
- API 不泄漏 provider API Key、auth 文件和内部凭据。

## 14. 发布步骤

1. 在开发数据库执行迁移。
2. 执行单元、并发和接口测试。
3. 创建测试套餐并验证 30 天周期。
4. 验证余额用户原有 Token 计费不变。
5. 发布应用代码。
6. 执行生产迁移并备份数据库。
7. 创建或迁移现有订阅周期。
8. 观察额度预占、释放、余额回退和错误日志。
9. 确认稳定后再开放新的订阅套餐。

## 15. 回滚策略

- 应用回滚到旧版本时，新增表保留，不删除数据。
- 旧版本继续使用旧的每日额度和余额 Token 计费。
- 新周期额度数据不会覆盖旧余额数据。
- 迁移脚本不得删除现有订阅、余额、请求和统计数据。
- 回滚前保留数据库快照、应用镜像和迁移版本号。
