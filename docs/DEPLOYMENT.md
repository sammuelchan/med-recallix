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

### Step 2: 环境变量

构建时 `edgeone.json` 会自动执行 `cp .env.example .env`，将 `.env.example` 中的 `JWT_SECRET` 注入到环境变量中。

> **为什么 JWT_SECRET 在 .env.example 而不是 KV？**
> Middleware 运行在 Edge Runtime，需要**同步**读取 `process.env.JWT_SECRET` 来验证 JWT 签名。
> EdgeOne 通过 Git 部署无法手动修改 `.env` 文件，所以将 JWT_SECRET 直接写在 `.env.example` 中随代码一起部署。
> 如需更换密钥，修改 `.env.example` 中的值后重新推送即可。

### Step 3: 配置 KV 存储

> **AI API Key 等敏感运行时配置**通过 KV 存储管理，不放在 `.env` 文件中。

#### 2.1 开通 KV 服务

1. 在 EdgeOne Pages 控制台顶部导航点击 **KV 存储**
2. 点击 **立即申请** 开通 KV 服务
3. 等待审批通过（通常即时生效）

#### 2.2 创建命名空间

本项目需要两个 KV 命名空间。**命名空间名称**是在控制台中的标识，可以随意取名。

> 💡 **概念说明**：EdgeOne KV 有两个"名字"——
> - **命名空间名称**：在控制台创建时填写的名字，用于人类识别和管理，取什么名字都行
> - **绑定变量名**：把命名空间绑定到项目时填写的名字，是代码中 `globalThis.XXX` 读取的变量名，**必须与代码一致**

| 命名空间名称（控制台显示） | 绑定变量名（代码使用） | 用途 | 需要初始化？ |
|--------------------------|---------------------|------|------------|
| `med_config`（建议） | `MED_CONFIG`（**必须**） | 系统配置（API Key、JWT Secret） | ✅ 需要手动添加 2 条记录 |
| `med_data`（建议） | `MED_DATA`（**必须**） | 业务数据（用户、知识点、卡片） | ❌ 程序自动管理 |

操作步骤：
1. 进入 KV 存储页面
2. 点击 **创建命名空间**
3. 输入命名空间名称 `med_config`（或你喜欢的名字）→ 确认创建
4. 重复创建第二个命名空间 `med_data`

#### 2.3 绑定命名空间到项目

1. 进入项目详情 → 左侧菜单 **KV 存储**
2. 点击 **绑定命名空间**
3. 选择第一个命名空间（`med_config`），**变量名必须填 `MED_CONFIG`**
4. 再次点击 **绑定命名空间**，选择第二个命名空间（`med_data`），**变量名必须填 `MED_DATA`**
5. **重新部署项目**（绑定后需要重新部署才能生效）

> ⚠️ **变量名 `MED_CONFIG` 和 `MED_DATA` 是写在代码里的**，大小写敏感，不能改。
> 命名空间名称则随意，叫 `my-config` 也行，只要绑定变量名对就行。

```
┌──────────────────────────────────────────────────────┐
│  EdgeOne 控制台 → KV 存储 → 创建命名空间              │
│                                                      │
│  命名空间名称: med_config   ← 随意取，人类看的         │
│                                                      │
│  EdgeOne 控制台 → 项目 → KV 存储 → 绑定命名空间        │
│                                                      │
│  命名空间:  med_config                                │
│  变量名:    MED_CONFIG      ← 必须大写，代码读这个     │
│                                                      │
│  代码中: globalThis.MED_CONFIG.get("ai_config")       │
└──────────────────────────────────────────────────────┘
```

#### 2.4 初始化 med_config 命名空间（手动添加 2 条记录）

进入 `med_config` 命名空间 → **记录管理** 页面 → 点击 **新建记录**：

##### 记录 1（必填）：AI 模型配置

| 字段 | 值 |
|------|-----|
| Key | `ai_config` |
| Value | 见下方 JSON |

```json
{
  "apiKey": "sk-your-moonshot-api-key",
  "baseURL": "https://api.moonshot.cn/v1",
  "model": "moonshot-v1-auto"
}
```

> **支持的 API 提供商**（任选其一，只要兼容 OpenAI 格式）：
> - Moonshot: `https://api.moonshot.cn/v1` + `moonshot-v1-auto`
> - DeepSeek: `https://api.deepseek.com/v1` + `deepseek-chat`
> - OpenAI: `https://api.openai.com/v1` + `gpt-4o`
> - 其他 OpenAI 兼容 API

##### 记录 2（可选）：注册邀请码

| 字段 | 值 |
|------|-----|
| Key | `invite_code` |
| Value | `"your-invite-code"` |

不添加则开放注册。

#### 2.5 med_data 命名空间（无需初始化）

`med_data` 命名空间存储所有业务数据，**不需要手动添加任何记录**。以下数据会在用户使用过程中由程序自动创建和管理：

| 自动生成的 Key | 触发时机 | 示例 |
|---------------|---------|------|
| `user_{username}` | 用户注册时 | `user_alice` |
| `kp_index_{userId}` | 创建第一个知识点时 | `kp_index_abc123` |
| `kp_{userId}_{kpId}` | 创建知识点时 | `kp_abc123_kp001` |
| `deck_{userId}` | 第一次复习时 | `deck_abc123` |
| `streak_{userId}` | 完成复习时 | `streak_abc123` |

你只需要创建命名空间并绑定变量名 `MED_DATA`，其他交给程序。

#### 2.5 配置分工说明

```
┌──────────────┬──────────────────────────┬──────────────────────────┐
│  配置项       │  来源                     │  原因                    │
├──────────────┼──────────────────────────┼──────────────────────────┤
│  JWT_SECRET  │  .env.example → .env      │  Middleware 同步读取      │
│  AI API Key  │  KV med_config:ai_config  │  运行时安全，不进代码仓库  │
│  AI Base URL │  KV med_config:ai_config  │  同上                    │
│  AI Model    │  KV med_config:ai_config  │  同上                    │
└──────────────┴──────────────────────────┴──────────────────────────┘
```

| 配置项 | 生产来源 | 本地 Fallback | 默认值 |
|--------|---------|--------------|--------|
| JWT Secret | `.env.example` → `process.env.JWT_SECRET` | `.env.local` | 已内置 |
| AI API Key | KV `ai_config.apiKey` | 设置页面 / `KIMI_API_KEY` 环境变量 | 空 |
| AI Base URL | KV `ai_config.baseURL` | 设置页面 / `AI_BASE_URL` | `https://api.moonshot.cn/v1` |
| AI Model | KV `ai_config.model` | 设置页面 / `AI_MODEL` | `moonshot-v1-auto` |

### Step 4: 验证部署

1. 访问分配的域名（如 `med-recallix.edgeone.app`）
2. 注册一个测试账号
3. 创建一个知识点
4. 尝试 AI 出题
5. 完成一轮复习
6. 在手机浏览器中"添加到主屏幕"测试 PWA

### Step 5: 自定义域名（可选）

1. 进入项目 → **域名管理**
2. 点击 **添加域名**
3. 按指引配置 DNS CNAME 记录
4. 启用免费 HTTPS 证书

## 本地开发

### 环境配置

```bash
# 1. 复制环境变量模板
cp .env.example .env.local

# 2. 编辑 .env.local 填入你的配置
```

`.env.local` 推荐内容：

```env
# JWT 密钥（本地开发可用默认值）
JWT_SECRET=local-dev-secret-change-in-production

# AI 模型配置（可选方式一：通过环境变量）
KIMI_API_KEY=sk-your-moonshot-api-key
AI_BASE_URL=https://api.moonshot.cn/v1
AI_MODEL=moonshot-v1-auto

# 本地 KV 存储目录（可选，默认 ~/.med-recallix/）
# MED_RECALLIX_HOME=C:\Users\你的用户名\.med-recallix
```

### 本地 KV 文件存储

在本地开发时，由于没有 EdgeOne KV 绑定，系统会自动使用 **本地文件** 代替 KV 存储。

数据存放在 `~/.med-recallix/kv/` 目录下，结构如下：

```
~/.med-recallix/
└── kv/
    ├── med_config/          # 对应 EdgeOne KV 的 MED_CONFIG 命名空间
    │   ├── ai_config.json   # AI 模型配置
    │   └── app_secrets.json # JWT 密钥等
    └── med_data/            # 对应 EdgeOne KV 的 MED_DATA 命名空间
        ├── user_alice.json  # 用户数据
        ├── deck_xxx.json    # 复习卡组
        └── ...              # 其他业务数据
```

#### 方式一：通过设置页面配置（推荐）

1. 启动开发服务器 `pnpm dev`
2. 注册并登录
3. 进入 **设置** 页面
4. 填入 Kimi API Key、Base URL 和模型名
5. 保存 → 配置会写入 `~/.med-recallix/kv/med_config/ai_config.json`

#### 方式二：手动创建配置文件

```bash
# 创建配置目录
mkdir -p ~/.med-recallix/kv/med_config

# 写入 AI 配置
echo '{"apiKey":"sk-your-key","baseURL":"https://api.moonshot.cn/v1","model":"moonshot-v1-auto"}' > ~/.med-recallix/kv/med_config/ai_config.json

# 写入 JWT 密钥（可选，也可用 .env.local 中的 JWT_SECRET）
echo '{"jwtSecret":"your-local-jwt-secret"}' > ~/.med-recallix/kv/med_config/app_secrets.json
```

#### 方式三：通过 .env.local 环境变量

直接在 `.env.local` 中设置 `KIMI_API_KEY` 等环境变量，系统会在 KV 中找不到配置时自动回退到环境变量。

> **注意**：本地文件中的数据在服务器重启后 **不会丢失**，方便持续开发调试。

### 开发命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 (localhost:3000) |
| `pnpm build` | 构建生产版本 |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | 代码规范检查 |
| `pnpm type-check` | TypeScript 类型检查 |

### 清除本地数据

```bash
# 清除所有本地 KV 数据
rm -rf ~/.med-recallix/kv/

# 仅清除业务数据，保留配置
rm -rf ~/.med-recallix/kv/med_data/
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
| API 返回 500 | KV 命名空间未绑定 | 检查 KV 绑定变量名 `MED_CONFIG` / `MED_DATA` |
| AI 出题失败 | API Key 无效或额度用完 | 在 KV `med_config` 命名空间更新 `ai_config` 记录 |
| 页面白屏 | 构建失败 | 查看构建日志，检查 Node 版本 |
| PWA 无法安装 | 缺少 HTTPS | 确保使用 HTTPS 域名 |
| KV 读写超时 | 区域网络问题 | EdgeOne 自动重试，稍后再试 |
