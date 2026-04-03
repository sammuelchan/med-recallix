# PWA 与部署测试用例

> 相关文件：`public/sw.js`, `src/app/manifest.ts`, `edgeone.json`
> 关联需求：PWA 安装 + 离线能力

---

## PWA 安装

### TC-PWA-001: 浏览器显示安装提示

**优先级**：P0
**关联**：T801
**前置条件**：
- HTTPS 环境（线上或 localhost）
- Chrome / Edge 浏览器

**步骤**：
1. 访问应用首页
2. 观察地址栏或浏览器菜单

**预期结果**：
- 地址栏出现"安装应用"图标
- 或三点菜单中出现"安装 Med-Recallix"

**状态**：🔲 待测试

---

### TC-PWA-002: 安装到主屏幕

**优先级**：P0
**关联**：T801
**前置条件**：
- 手机浏览器（Chrome Android / Safari iOS）

**步骤**：
1. 访问应用
2. 点击"添加到主屏幕"
3. 从主屏幕打开应用

**预期结果**：
- 图标出现在主屏幕
- 以 standalone 模式打开（无浏览器地址栏）
- 应用名称为"Med-Recallix"

**状态**：🔲 待测试

---

### TC-PWA-003: manifest.webmanifest 可访问

**优先级**：P0
**关联**：T105
**前置条件**：
- 应用正常运行

**步骤**：
1. 访问 `/manifest.webmanifest`

**预期结果**：
- 返回 200
- JSON 格式正确
- 包含 `name`, `short_name`, `start_url`, `display`, `icons`
- `display` 为 `standalone`

**状态**：✅ 通过

---

## Service Worker

### TC-PWA-010: Service Worker 注册成功

**优先级**：P0
**关联**：T802
**前置条件**：
- 应用正常运行

**步骤**：
1. 打开浏览器 DevTools → Application → Service Workers

**预期结果**：
- Service Worker `sw.js` 状态为 "activated and is running"
- Scope 为应用根路径

**状态**：🔲 待测试

---

### TC-PWA-011: 静态资源缓存

**优先级**：P1
**关联**：T801
**前置条件**：
- 页面加载完成
- Service Worker 已激活

**步骤**：
1. 打开 DevTools → Application → Cache Storage

**预期结果**：
- 存在 `med-recallix-v1` 缓存
- 包含首页 HTML 和 manifest

**状态**：🔲 待测试

---

### TC-PWA-012: 离线访问已缓存页面

**优先级**：P1
**关联**：T801
**前置条件**：
- 已在线访问过 Dashboard

**步骤**：
1. 在 DevTools → Network 中勾选"Offline"
2. 刷新页面

**预期结果**：
- 页面正常加载（从缓存）
- 需要网络的功能（如 API 调用）显示离线状态提示

**状态**：🔲 待测试

---

### TC-PWA-013: API 请求不被 Service Worker 缓存

**优先级**：P0
**关联**：T801
**前置条件**：
- Service Worker 已激活

**步骤**：
1. 发送 API 请求（如 GET /api/auth/me）

**预期结果**：
- API 请求直接到服务器，不走缓存
- Service Worker 不拦截 `/api/` 路径的请求

**状态**：🔲 待测试

---

## EdgeOne 部署

### TC-PWA-020: edgeone.json 配置正确

**优先级**：P0
**关联**：T804
**前置条件**：
- 项目根目录有 `edgeone.json`

**步骤**：
1. 检查 `edgeone.json` 内容

**预期结果**：
- `name` 为 `med-recallix`
- `build.command` 包含 `pnpm install && pnpm build`
- `build.output` 为 `.next`

**状态**：✅ 通过

---

### TC-PWA-021: 构建成功

**优先级**：P0
**关联**：T805
**前置条件**：
- 所有依赖已安装

**步骤**：
1. 执行 `pnpm build`

**预期结果**：
- 构建成功，无报错
- 所有路由正确列出
- 输出包含 Static 和 Dynamic 路由

**状态**：✅ 通过

---

### TC-PWA-022: 线上端到端验收

**优先级**：P0
**关联**：T806
**前置条件**：
- 项目已部署到 EdgeOne
- KV 命名空间已绑定

**步骤**：
1. 访问线上 URL
2. 注册新用户
3. 创建一个知识点
4. 生成 AI 题目
5. 完成一轮复习
6. 在手机上安装 PWA

**预期结果**：
- 全流程无报错
- 数据持久化（刷新后数据不丢失）
- PWA 安装后可正常使用

**状态**：🚫 跳过（需线上环境）

---

## 移动端适配

### TC-PWA-030: 移动端布局正确

**优先级**：P0
**关联**：T401
**前置条件**：
- 手机或浏览器模拟器（375×667）

**步骤**：
1. 访问 Dashboard、知识点列表、复习、出题页面

**预期结果**：
- 底部导航栏固定可见
- 内容区不被遮挡
- 无水平滚动条
- 按钮和文字大小合理

**状态**：🔲 待测试

---

### TC-PWA-031: 安全区域适配（iPhone 刘海屏）

**优先级**：P2
**关联**：layout.tsx
**前置条件**：
- iPhone 或模拟器

**步骤**：
1. 以 PWA 模式打开应用

**预期结果**：
- 顶部状态栏不遮挡内容
- 底部安全区域有适当 padding

**状态**：🔲 待测试
