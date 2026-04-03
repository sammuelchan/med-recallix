# 认证模块测试用例

> 模块路径：`src/modules/auth/`
> API：`/api/auth/register`, `/api/auth/login`, `/api/auth/me`
> 关联需求：US-007

---

## 注册

### TC-AUTH-001: 正常注册

**优先级**：P0
**关联**：US-007, T311
**前置条件**：
- 应用正常运行
- 数据库（KV）中不存在用户 `testuser`

**步骤**：
1. 访问 `/register` 页面
2. 输入用户名 `testuser`
3. 输入密码 `Test@1234`
4. 点击"注册"按钮

**预期结果**：
- 注册成功，自动跳转到 `/dashboard`
- 浏览器 Cookie 中存在 `med-recallix-token`（HttpOnly）
- KV 中存在 `user_testuser` 记录

**状态**：🔲 待测试

---

### TC-AUTH-002: 用户名已存在时注册失败

**优先级**：P0
**关联**：US-007, T311
**前置条件**：
- KV 中已存在用户 `testuser`

**步骤**：
1. 访问 `/register` 页面
2. 输入用户名 `testuser`
3. 输入密码 `Another@123`
4. 点击"注册"按钮

**预期结果**：
- 显示错误提示"用户名已存在"
- 停留在注册页面
- 不创建新用户

**状态**：✅ 通过

---

### TC-AUTH-003: 用户名格式校验

**优先级**：P1
**关联**：T301
**前置条件**：
- 应用正常运行

**步骤**：
1. 访问 `/register` 页面
2. 分别尝试以下用户名：
   - 空字符串
   - 单字符 `a`
   - 超长（>50字符）
   - 包含特殊字符 `user@#$`

**预期结果**：
- 空字符串 → 提示"用户名不能为空"
- 单字符 → 提示"用户名至少 2 个字符"
- 超长 → 提示"用户名不超过 50 个字符"
- 特殊字符 → 提示格式错误或拒绝注册

**状态**：🔲 待测试

---

### TC-AUTH-004: 密码强度校验

**优先级**：P1
**关联**：T301
**前置条件**：
- 应用正常运行

**步骤**：
1. 访问 `/register` 页面
2. 输入合法用户名
3. 分别尝试以下密码：
   - 空密码
   - `123`（过短）
   - `12345678`（纯数字）

**预期结果**：
- 空密码 → 提示"密码不能为空"
- 过短 → 提示"密码至少 6 个字符"
- 弱密码 → 根据实现决定是否拒绝

**状态**：🔲 待测试

---

## 登录

### TC-AUTH-010: 正常登录

**优先级**：P0
**关联**：US-007, T312
**前置条件**：
- 用户 `testuser` / `Test@1234` 已注册

**步骤**：
1. 访问 `/login` 页面
2. 输入用户名 `testuser`
3. 输入密码 `Test@1234`
4. 点击"登录"按钮

**预期结果**：
- 登录成功，跳转到 `/dashboard`
- Cookie 中包含有效 JWT token
- Dashboard 页面显示当前用户信息

**状态**：✅ 通过

---

### TC-AUTH-011: 密码错误时登录失败

**优先级**：P0
**关联**：US-007, T312
**前置条件**：
- 用户 `testuser` 已注册

**步骤**：
1. 访问 `/login` 页面
2. 输入用户名 `testuser`
3. 输入错误密码 `wrongpass`
4. 点击"登录"按钮

**预期结果**：
- 显示错误提示"用户名或密码错误"
- 不设置 Cookie
- 停留在登录页面

**状态**：✅ 通过

---

### TC-AUTH-012: 用户不存在时登录失败

**优先级**：P0
**关联**：US-007
**前置条件**：
- KV 中不存在用户 `nonexist`

**步骤**：
1. 访问 `/login` 页面
2. 输入用户名 `nonexist`
3. 输入任意密码
4. 点击"登录"按钮

**预期结果**：
- 显示错误提示"用户名或密码错误"（不泄露是否存在该用户）

**状态**：✅ 通过

---

## JWT / 会话

### TC-AUTH-020: 已登录用户访问保护页面

**优先级**：P0
**关联**：T314, middleware
**前置条件**：
- 用户已登录，Cookie 中有有效 JWT

**步骤**：
1. 直接访问 `/dashboard`

**预期结果**：
- 正常显示 Dashboard 页面
- 请求 header 中包含 `x-user-id`

**状态**：🔲 待测试

---

### TC-AUTH-021: 未登录用户访问保护页面被重定向

**优先级**：P0
**关联**：T314, middleware
**前置条件**：
- 浏览器无 Cookie 或 Cookie 已过期

**步骤**：
1. 直接访问 `/dashboard`

**预期结果**：
- 重定向到 `/login?from=/dashboard`
- 登录后跳转回 `/dashboard`

**状态**：🔲 待测试

---

### TC-AUTH-022: 已登录用户访问登录页面被重定向

**优先级**：P1
**关联**：T314
**前置条件**：
- 用户已登录

**步骤**：
1. 直接访问 `/login`

**预期结果**：
- 重定向到 `/dashboard`

**状态**：🔲 待测试

---

### TC-AUTH-023: Token 过期后自动重定向

**优先级**：P1
**关联**：US-007
**前置条件**：
- 用户有一个已过期的 JWT（>7天）

**步骤**：
1. 使用过期 Token 访问 `/dashboard`

**预期结果**：
- 重定向到 `/login`
- 清除旧 Cookie

**状态**：🔲 待测试

---

## API 层

### TC-AUTH-030: POST /api/auth/register 成功

**优先级**：P0
**关联**：T311
**前置条件**：
- 用户 `apiuser` 不存在

**步骤**：
1. 发送 `POST /api/auth/register`，body: `{"username":"apiuser","password":"Pass@123"}`

**预期结果**：
- 返回 201，body 包含 `{ user: { id, username, createdAt } }`
- 响应 header 包含 `Set-Cookie: med-recallix-token=...`

**状态**：✅ 通过

---

### TC-AUTH-031: POST /api/auth/login 成功

**优先级**：P0
**关联**：T312
**前置条件**：
- 用户 `apiuser` / `Pass@123` 已注册

**步骤**：
1. 发送 `POST /api/auth/login`，body: `{"username":"apiuser","password":"Pass@123"}`

**预期结果**：
- 返回 200，body 包含 `{ user: { id, username, createdAt } }`
- 响应 header 包含 `Set-Cookie`

**状态**：✅ 通过

---

### TC-AUTH-032: GET /api/auth/me 返回当前用户

**优先级**：P0
**关联**：T313
**前置条件**：
- 携带有效 Cookie

**步骤**：
1. 发送 `GET /api/auth/me`（带 Cookie）

**预期结果**：
- 返回 200，body 包含 `{ id, username, createdAt }`

**状态**：✅ 通过

---

### TC-AUTH-033: GET /api/auth/me 无 Cookie 返回 401

**优先级**：P0
**关联**：T313
**前置条件**：
- 无 Cookie

**步骤**：
1. 发送 `GET /api/auth/me`（不带 Cookie）

**预期结果**：
- 返回 401

**状态**：✅ 通过

---

## 边界与安全

### TC-AUTH-040: PBKDF2 哈希不可逆

**优先级**：P0
**关联**：T301
**前置条件**：
- 已注册用户

**步骤**：
1. 从 KV 读取 `user_testuser` 的 `passwordHash` 和 `salt`
2. 验证 `passwordHash` 不等于原始密码明文
3. 使用相同密码 + salt 重新哈希

**预期结果**：
- `passwordHash` 是 hex 编码的哈希值
- 重新哈希结果一致（确定性）
- 原始密码无法从 hash + salt 反推

**状态**：🔲 待测试

---

### TC-AUTH-041: 并发注册同名用户

**优先级**：P2
**关联**：T311
**前置条件**：
- 用户 `raceuser` 不存在

**步骤**：
1. 同时发送两个 `POST /api/auth/register`，body 均为 `{"username":"raceuser","password":"Pass@123"}`

**预期结果**：
- 一个成功（201），一个失败（409 Conflict）
- KV 中只有一条 `user_raceuser` 记录

**状态**：🔲 待测试
