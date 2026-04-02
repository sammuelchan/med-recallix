# Med-Recallix 部署指南

> 本文档详细说明如何将 Med-Recallix 部署到腾讯云 EdgeOne Pages 平台。

## 部署架构

```
                    ┌─────────────────────────────────────┐
                    │        EdgeOne Pages Platform        │
                    │                                     │
  Git Push ────────▶│  ┌───────────┐                      │
  (GitHub/Gitee)    │  │ Build     │  pnpm build          │
                    │  │ Pipeline  │  → .next/             │
                    │  └─────┬─────┘                      │
                    │        │ deploy                      │
                    │        ▼                             │
                    │  ┌───────────────────────────────┐  │
                    │  │     Global Edge Network       │  │
                    │  │                               │  │
                    │  │  ┌─────────┐  ┌───────────┐  │  │
                    │  │  │ Static  │  │ Edge      │  │  │
                    │  │  │ CDN     │  │ Functions │  │  │
                    │  │  │         │  │           │  │  │
                    │  │  │ HTML    │  │ API       │  │  │
                    │  │  │ JS/CSS  │  │ Routes    │──┼──┼──▶ AI API
                    │  │  │ Images  │  │           │  │  │   (Kimi/OpenAI)
                    │  │  └─────────┘  └─────┬─────┘  │  │
                    │  │                     │        │  │
                    │  │              ┌──────▼──────┐ │  │
                    │  │              │ KV Storage  │ │  │
                    │  │              │             │ │  │
                    │  │              │ med_config  │ │  │
                    │  │              │ med_data    │ │  │
                    │  │              └─────────────┘ │  │
                    │  └───────────────────────────────┘  │
                    └─────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────┐
  │  用户终端 (Mobile / Desktop)                          │
  │                                                      │
  │  ┌────────────┐  ┌──────────┐  ┌─────────────────┐  │
  │  │ PWA App    │  │ Service  │  │ IndexedDB       │  │
  │  │ (React)    │  │ Worker   │  │ (Offline Cache) │  │
  │  └────────────┘  └──────────┘  └─────────────────┘  │
  └──────────────────────────────────────────────────────┘
```

## 前置条件

| 条件 | 说明 |
|------|------|
| EdgeOne 账号 | [注册](https://edgeone.ai/) 腾讯云 EdgeOne 账号 |
| Git 仓库 | GitHub 或 Gitee 上的项目仓库 |
| AI API Key | Kimi 或其他 OpenAI 兼容模型的 API Key |
| Node.js 18+ | 本地开发使用 |

## 部署步骤

### Step 1: 创建 EdgeOne Pages 项目

1. 登录 [EdgeOne Pages 控制台](https://edgeone.ai/pages)
2. 点击 **创建项目** → **导入 Git 仓库**
3. 授权 GitHub/Gitee，选择 `med-recallix` 仓库
4. 构建设置：

| 设置 | 值 |
|------|-----|
| 框架 | Next.js |
| 构建命令 | `pnpm build` |
| 输出目录 | `.next` |
| Node 版本 | 18 |
| 安装命令 | `pnpm install` |

5. 点击 **部署**

### Step 2: 配置 KV 存储

#### 2.1 开通 KV 服务

1. 在控制台顶部导航点击 **KV 存储**
2. 点击 **立即申请** 开通 KV 服务
3. 等待审批通过

#### 2.2 创建命名空间

| 命名空间名称 | 绑定变量名 | 用途 |
|-------------|-----------|------|
| `med_config` | `med_config` | 系统配置（AI API Key 等） |
| `med_data` | `med_data` | 业务数据（用户、知识点、卡片） |

操作步骤：
1. 进入 KV 存储页面
2. 点击 **创建命名空间**
3. 输入命名空间名称 `med_config` → 确认创建
4. 重复创建 `med_data`

#### 2.3 绑定命名空间到项目

1. 进入项目详情 → 左侧菜单 **KV 存储**
2. 点击 **绑定命名空间**
3. 选择命名空间 `med_config`，变量名填 `med_config`
4. 重复绑定 `med_data`

#### 2.4 初始化 AI 配置

在 `med_config` 命名空间中创建以下记录：

| Key | Value | 说明 |
|-----|-------|------|
| `ai_api_key` | `your-api-key-here` | AI 模型 API Key |
| `ai_base_url` | `https://api.kimi.com/coding/v1` | API 端点 |
| `ai_model` | `kimi-for-coding` | 模型名称 |
| `jwt_secret` | `your-random-secret-32chars` | JWT 签名密钥 |

### Step 3: 验证部署

1. 访问分配的域名（如 `med-recallix.edgeone.app`）
2. 注册一个测试账号
3. 创建一个知识点
4. 尝试 AI 出题
5. 完成一轮复习
6. 在手机浏览器中"添加到主屏幕"测试 PWA

### Step 4: 自定义域名（可选）

1. 进入项目 → **域名管理**
2. 点击 **添加域名**
3. 按指引配置 DNS CNAME 记录
4. 启用免费 HTTPS 证书

## 本地开发

### 环境配置

```bash
# 复制环境变量模板
cp .env.example .env.local
```

`.env.local` 文件内容：

```env
# AI Configuration (local development)
AI_API_KEY=sk-your-local-dev-key
AI_BASE_URL=https://api.kimi.com/coding/v1
AI_MODEL=kimi-for-coding

# JWT Secret (local development)
JWT_SECRET=local-dev-secret-change-in-production
```

### 开发命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 (localhost:3000) |
| `pnpm build` | 构建生产版本 |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | 代码规范检查 |
| `pnpm type-check` | TypeScript 类型检查 |

### KV 本地模拟

开发环境下，KV 存储自动使用内存 Map 模拟，无需连接远程 KV 服务。所有数据在重启后丢失。

如需同步线上数据进行调试：

```bash
# 安装 EdgeOne CLI
npm install -g edgeone

# 同步 KV 数据到本地
edgeone kv pull
```

## 存储容量规划

### KV 容量估算

| 数据类型 | 单用户占用 | 100 用户 |
|---------|-----------|---------|
| 用户信息 | ~500B | ~50KB |
| 知识点（500个） | ~1.5MB | ~150MB |
| 知识点索引 | ~50KB | ~5MB |
| SM-2 卡片聚合 | ~100KB | ~10MB |
| 用户画像 + 记忆 | ~21KB | ~2.1MB |
| 情景记忆（30天） | ~15KB | ~1.5MB |
| 对话历史 | ~500KB | ~50MB |
| **合计** | **~2.2MB** | **~220MB** |

**免费额度**：1GB → 可支持约 **400+ 用户**。

### 扩容方案

当接近 1GB 上限时：
1. 清理超过 90 天的情景记忆
2. 压缩对话历史（自动 Compaction）
3. 将大体量知识点内容迁移到 IndexedDB（仅客户端缓存）
4. 升级 KV 付费套餐

## CI/CD

### 自动部署

EdgeOne Pages 默认开启 Git 集成自动部署：

| 事件 | 行为 |
|------|------|
| Push to `main` | 自动构建并部署到生产环境 |
| Pull Request | 生成预览部署 URL |

### GitHub Actions（可选）

```yaml
# .github/workflows/deploy.yml
name: Deploy to EdgeOne Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 18
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm build
      - run: pnpm lint
```

## 监控与排障

### 可观测性

EdgeOne Pages 提供内置的可观测性：

1. **指标分析**：请求量、响应时间、错误率
2. **日志分析**：Edge Function 运行日志

访问路径：项目详情 → 可观测性

### 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| API 返回 500 | KV 命名空间未绑定 | 检查 KV 绑定配置 |
| AI 出题失败 | API Key 无效或额度用完 | 在 KV 中更新 `ai_api_key` |
| 页面白屏 | 构建失败 | 查看构建日志，检查 Node 版本 |
| PWA 无法安装 | 缺少 HTTPS | 确保使用 HTTPS 域名 |
| KV 读写超时 | 区域网络问题 | EdgeOne 自动重试，稍后再试 |
