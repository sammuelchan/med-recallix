# 设置与配置模块测试用例

> 模块路径：`src/shared/infrastructure/ai/`, `src/shared/infrastructure/config.ts`
> API：`/api/config` (GET/PUT)
> 页面：`/settings`

---

## AI 配置

### TC-CFG-001: 查看当前 AI 配置

**优先级**：P0
**关联**：T741
**前置条件**：
- 用户已登录

**步骤**：
1. 进入 `/settings` 页面

**预期结果**：
- 显示当前 AI 配置：API Key（脱敏）、Base URL、Model
- API Key 显示为 `sk-****xxxx`（仅显示后四位）

**状态**：🔲 待测试

---

### TC-CFG-002: 更新 AI API Key

**优先级**：P0
**关联**：T741
**前置条件**：
- 用户已登录

**步骤**：
1. 进入 `/settings` 页面
2. 输入新的 API Key: `sk-new-key-123`
3. 点击"保存"

**预期结果**：
- 保存成功，显示成功提示
- KV 中 `ai_config` 的 `apiKey` 已更新
- API Key 显示更新后的脱敏值

**状态**：🔲 待测试

---

### TC-CFG-003: 更新 AI Base URL 和 Model

**优先级**：P1
**关联**：T741
**前置条件**：
- 用户已登录

**步骤**：
1. 修改 Base URL 为 `https://api.openai.com/v1`
2. 修改 Model 为 `gpt-4o`
3. 保存

**预期结果**：
- 保存成功
- 后续 AI 出题使用新的端点和模型

**状态**：🔲 待测试

---

### TC-CFG-004: 空 API Key 时的提示

**优先级**：P1
**关联**：T741
**前置条件**：
- KV 中无 `ai_config` 或 apiKey 为空

**步骤**：
1. 进入 `/settings` 页面

**预期结果**：
- 显示警告"API Key 未配置"
- 在出题页面也显示相应提示

**状态**：🔲 待测试

---

## 配置优先级链

### TC-CFG-010: KV 配置优先于环境变量

**优先级**：P0
**关联**：ai.config.ts
**前置条件**：
- KV 中 `ai_config.apiKey` = `kv-key`
- `.env.local` 中 `KIMI_API_KEY` = `env-key`

**步骤**：
1. 调用 `getAIConfig()`

**预期结果**：
- 返回 `apiKey: "kv-key"`（KV 优先）

**状态**：🔲 待测试

---

### TC-CFG-011: KV 无配置时回退到环境变量

**优先级**：P0
**关联**：ai.config.ts
**前置条件**：
- KV 中无 `ai_config`
- `.env.local` 中 `KIMI_API_KEY` = `env-key`

**步骤**：
1. 调用 `getAIConfig()`

**预期结果**：
- 返回 `apiKey: "env-key"`

**状态**：🔲 待测试

---

### TC-CFG-012: 全部无配置时使用默认值

**优先级**：P1
**关联**：ai.config.ts
**前置条件**：
- KV 无 `ai_config`
- 无相关环境变量

**步骤**：
1. 调用 `getAIConfig()`

**预期结果**：
- `apiKey: ""`
- `baseURL: "https://api.kimi.com/coding/v1"`
- `model: "kimi-for-coding"`

**状态**：🔲 待测试

---

## JWT Secret 配置

### TC-CFG-020: JWT Secret 从 KV 读取

**优先级**：P0
**关联**：config.ts
**前置条件**：
- KV `app_secrets.jwtSecret` = `kv-jwt-secret`
- `.env.local` 无 `JWT_SECRET`

**步骤**：
1. 调用 `getJwtSecret()`

**预期结果**：
- 使用 `kv-jwt-secret` 进行签名

**状态**：🔲 待测试

---

### TC-CFG-021: JWT Secret 从环境变量读取

**优先级**：P0
**关联**：config.ts
**前置条件**：
- `.env.local` 中 `JWT_SECRET` = `env-jwt-secret`
- KV 无 `app_secrets`

**步骤**：
1. 调用 `getJwtSecret()`

**预期结果**：
- 使用 `env-jwt-secret` 进行签名

**状态**：🔲 待测试

---

## 本地文件存储

### TC-CFG-030: 本地开发自动创建 KV 文件

**优先级**：P0
**关联**：kv.local.ts
**前置条件**：
- 本地开发环境
- `~/.med-recallix/kv/` 目录不存在

**步骤**：
1. 启动 `pnpm dev`
2. 注册一个用户

**预期结果**：
- 自动创建 `~/.med-recallix/kv/med_data/` 目录
- 生成 `user_xxx.json` 文件
- 文件内容为合法 JSON

**状态**：✅ 通过

---

### TC-CFG-031: 本地 KV 文件重启后不丢失

**优先级**：P0
**关联**：kv.local.ts
**前置条件**：
- 已通过设置页面保存了 AI 配置

**步骤**：
1. 停止 `pnpm dev`
2. 重新启动 `pnpm dev`
3. 进入 `/settings` 页面

**预期结果**：
- AI 配置与重启前一致
- 文件 `~/.med-recallix/kv/med_config/ai_config.json` 存在且内容正确

**状态**：✅ 通过

---

### TC-CFG-032: 手动创建配置文件后生效

**优先级**：P1
**关联**：kv.local.ts
**前置条件**：
- 应用未启动

**步骤**：
1. 手动创建 `~/.med-recallix/kv/med_config/ai_config.json`:
   ```json
   {"apiKey":"manual-key","baseURL":"https://api.kimi.com/coding/v1","model":"kimi-for-coding"}
   ```
2. 启动 `pnpm dev`
3. 进入 `/settings` 页面

**预期结果**：
- 显示 `manual-key` 的脱敏值
- AI 出题使用 `manual-key`

**状态**：🔲 待测试

---

## API 层

### TC-CFG-040: GET /api/config 返回当前配置

**优先级**：P0
**关联**：T741
**前置条件**：
- 有效 Cookie

**步骤**：
1. 发送 `GET /api/config`

**预期结果**：
- 返回 200
- body 包含 `{ apiKey: "sk-****xxxx", baseURL, model }`
- API Key 脱敏处理

**状态**：✅ 通过

---

### TC-CFG-041: PUT /api/config 更新配置

**优先级**：P0
**关联**：T741
**前置条件**：
- 有效 Cookie

**步骤**：
1. 发送 `PUT /api/config`，body: `{"apiKey":"sk-new","model":"gpt-4o"}`

**预期结果**：
- 返回 200
- KV 已更新

**状态**：✅ 通过
