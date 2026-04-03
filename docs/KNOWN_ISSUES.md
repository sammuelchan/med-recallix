# Med-Recallix 已知问题 & 技术债

> 记录于 2026-04-02 代码审查后，按优先级排列。  
> 均为非阻塞性问题，功能可正常运行，可在后续迭代中逐步处理。

## 状态说明

- 🔴 高优先 — 生产环境可能导致数据不一致
- 🟡 中优先 — 有改进空间，当前不影响核心功能
- 🟢 低优先 — 增强型改进、最佳实践对齐

---

## 🔴 高优先

### 1. KV 读-改-写竞态条件

**影响范围：** `review.service.ts`, `chat.service.ts`, `memory.service.ts`, `episode.service.ts`

**问题：** 多处采用 `kvGet → 内存修改 → kvPut` 模式，并发请求可能导致后写覆盖前写，丢失更新。典型场景：
- 快速连续复习两张卡片 → 第二次写入可能覆盖第一次
- `addMessage` 与 `maybeCompactSession` 并发 → 消息丢失
- `trackReview` / `trackStudyMinutes` 并发 → Episode 计数不准

**建议方案：**
- 方案 A: 引入乐观锁（version 字段 + 冲突重试）
- 方案 B: 按 userId 做写操作串行化队列
- 方案 C: 如 EdgeOne KV 支持原子操作，使用原生 CAS

**评估：** 单用户低并发场景下概率极低，多标签页同时操作时可能触发。

---

### 2. JWT Secret 双源不一致风险

**影响范围：** `middleware.ts`, `src/shared/infrastructure/config.ts`

**问题：** Middleware（Edge Runtime）使用 `process.env.JWT_SECRET`（同步），Auth 服务使用 `env → KV → 默认值` 优先链（异步）。若 env 未设置且 KV 中存在不同值，登录签发的 token 与 middleware 验证使用不同 secret，导致用户被 401。

**建议方案：**
- 统一为只从 env 获取（build 时注入），middleware 和 auth 服务用同一来源
- 或在生产环境缺少 `JWT_SECRET` 时 fail-fast 拒绝启动

---

### 3. 注册 API 未使用 RegisterSchema

**影响范围：** `api/auth/register/route.ts`

**问题：** 服务端使用 `LoginSchema` 解析注册请求，`RegisterSchema` 中的 `confirmPassword` + `refine` 校验仅在前端执行，服务端未强制验证密码确认。

**修复：** 替换为 `RegisterSchema.parse(body)`。

---

## 🟡 中优先

### 4. Cookie 缺少 Secure 标记

**影响范围：** `auth.service.ts`

**问题：** `Set-Cookie` 未设置 `Secure` 标记。HTTPS 环境下 cookie 仍可通过 HTTP 发送。

**修复：** 生产环境追加 `Secure` 标记。

---

### 5. 密码比较未使用 timing-safe 方式

**影响范围：** `auth.service.ts`

**问题：** 密码 hash 使用 `===` 比较。虽然对随机 hash 实际利用难度极高，但使用 `crypto.subtle.timingSafeEqual` 可消除理论风险。

---

### 6. 系统提示词无总长度限制

**影响范围：** `context-builder.ts`

**问题：** Profile、memories、episode、summary 拼接后的 systemPrompt 无全局长度上限。极端情况（大量 memory + 长 summary）可能挤占模型上下文窗口。

**建议：** 对 systemPrompt 总长设上限（如 4000 字），各 block 分配预算后截断。

---

### 7. 单条用户消息无长度上限

**影响范围：** `context-builder.ts`

**问题：** `RECENT_WINDOW` 限制了消息条数（20 条），但单条超长消息（如粘贴整篇论文）可能打爆上下文。

**建议：** 在 `buildAgentContext` 中对每条 message.content 做截断（如 2000 字）。

---

### 8. Quiz AI 输出无 Schema 验证

**影响范围：** `quiz.service.ts`

**问题：** AI 返回的 JSON 做了 `JSON.parse` 但未用 Zod 验证结构。缺字段、错类型的 question 对象会导致前端渲染异常。

**建议：** 增加 Zod schema 验证 + 过滤无效条目。

---

### 9. knowledge.service 索引同步缺陷

**影响范围：** `knowledge.service.ts`

**问题：** `update` 方法中若索引已与 KP 不同步（`findIndex === -1`），KP 文档会被更新但索引不会刷新。

**建议：** 索引找不到时执行 upsert 而非跳过。

---

### 10. DueSummary.completed 始终为 0

**影响范围：** `review.service.ts`

**问题：** `getDueSummary` 返回的 `completed` 字段硬编码为 0，从未更新。

**建议：** 实现完成跟踪（今日已复习的已到期卡片数），或移除该字段。

---

## 🟢 低优先

### 11. Next.js 16 Middleware 废弃警告

**问题：** Next.js 16 建议将 `middleware.ts` 迁移为 `proxy` 模式。当前功能不受影响。

**参考：** https://nextjs.org/docs/messages/middleware-to-proxy

---

### 12. Turbopack NFT 追踪警告

**问题：** `kv.local.ts` 中动态 `import("node:fs")` 导致 Turbopack 追踪整个项目目录。已加 `turbopackIgnore` 注释但内部 `_path.join` 调用仍触发。

**建议：** 将 fs 路径操作封装到独立的 `getStorageDir` 中，用 `turbopackIgnore` 包裹整个函数调用。

---

### 13. UI 可访问性改进

**涉及文件：** `bottom-nav.tsx`, `review/page.tsx`, `knowledge/[id]/page.tsx`, `quiz/page.tsx`

- Bottom nav 链接缺少 `aria-current="page"`
- 复习翻转卡片是 `div` 而非 `button`，键盘不可操作
- 知识点详情页编辑/删除按钮缺少 `aria-label`
- Quiz 选项缺少 `aria-pressed` 状态

---

### 14. 流式渲染高频 setState

**影响范围：** `use-chat.ts`

**问题：** SSE 流每收到一个 chunk 就 `setMessages`，长回复时渲染开销较大。

**建议：** 用 `requestAnimationFrame` 或定时批量更新（如每 50ms 刷新一次）。

---

### 15. hexToBuffer 缺少输入验证

**影响范围：** `auth.service.ts`

**问题：** `hexToBuffer` 未校验偶数长度和合法 hex 字符。异常存储数据可能产生 `NaN` 字节。

---

## 变更日志

| 日期 | 操作 |
|------|------|
| 2026-04-02 | 初始创建，来自代码审查 |
