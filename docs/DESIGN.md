# Med-Recallix 技术设计文档

> 关联需求文档：[REQUIREMENT.md](./REQUIREMENT.md)

## 1. 概述

### 1.1 文档目的

定义 Med-Recallix 系统的技术架构、数据模型、API 设计和模块划分，为后续任务拆解和编码实现提供依据。

### 1.2 系统概要

基于 EdgeOne Pages 的全栈 Web 应用，采用 Next.js App Router 构建移动端优先的 PWA，集成 SM-2 间隔重复算法和 AI 出题能力，为医考备考者提供智能记忆管理。

---

## 2. 技术选型

### 2.1 技术栈

| 层 | 技术 | 版本 |
|----|------|------|
| 框架 | Next.js (App Router) | 15.x |
| 语言 | TypeScript | 5.x |
| 运行时 | EdgeOne Edge Runtime | - |
| 样式 | Tailwind CSS | 4.x |
| UI 组件 | shadcn/ui | latest |
| 存储 | EdgeOne KV + IndexedDB (idb) | - |
| AI SDK | Vercel AI SDK (`ai`) | 5.x |
| 间隔重复 | supermemo | 2.x |
| 认证 | Web Crypto (PBKDF2) + jose (JWT) | - |
| PWA | Next.js native manifest + Service Worker | - |
| 包管理 | pnpm | 9.x |
| 部署 | EdgeOne Pages (Git 集成) | - |

### 2.2 决策记录 (ADR)

| # | 决策 | 备选方案 | 选择理由 |
|---|------|----------|----------|
| ADR-01 | shadcn/ui 作为 UI 组件库 | Ant Design Mobile, Material UI | 无运行时依赖、可定制、Tailwind 原生、tree-shaking 友好 |
| ADR-02 | Vercel AI SDK 对接 AI | 直接 fetch OpenAI API | 统一流式接口、多模型切换、Edge Runtime 兼容 |
| ADR-03 | Web Crypto PBKDF2 做密码哈希 | bcrypt, argon2 | Edge Runtime 无 Node.js API；PBKDF2 是 Web Crypto 标准 |
| ADR-04 | jose 库做 JWT | jsonwebtoken | jose 专为 Edge/Worker 设计，无 Node.js 依赖 |
| ADR-05 | 单命名空间 + Key 前缀分区 | 多命名空间 | KV 最多 10 命名空间，预留给未来扩展；前缀分区够用 |
| ADR-06 | "聚合文档" KV 模式 | 每条记录一个 Key | KV 无范围查询；聚合后一次 GET 拿到用户全部卡片/索引 |
| ADR-07 | supermemo 库 | @open-spaced-repetition/sm-2 | 331 stars、活跃维护、API 极简 |
| ADR-08 | IndexedDB 缓存大体量数据 | localStorage, Cache API | 容量大(数百MB)、支持结构化数据、异步 API |

---

## 3. 系统架构

### 3.1 部署架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      EdgeOne CDN 边缘节点                        │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────────┐  │
│  │  静态资源     │  │  Edge Functions   │  │   KV 存储          │  │
│  │  (Next.js    │  │  (API Routes)     │  │                   │  │
│  │   SSG/SSR)   │  │  - /api/auth/*    │  │  ┌─────────────┐  │  │
│  │              │  │  - /api/kp/*      │  │  │ med_config  │  │  │
│  │  HTML/CSS/JS │  │  - /api/cards/*   │  │  │ (AI keys)   │  │  │
│  │  PWA Assets  │  │  - /api/quiz/*    │  │  ├─────────────┤  │  │
│  │              │  │                   │  │  │ med_data    │  │  │
│  └──────┬───────┘  └────────┬──────────┘  │  │ (业务数据)  │  │  │
│         │                   │             │  └─────────────┘  │  │
│         │    fetch          │   KV API    │                   │  │
│         └───────────────────┼─────────────┘                   │  │
│                             │                                  │  │
│                             ▼                                  │  │
│                    ┌─────────────────┐                         │  │
│                    │  AI API (外部)   │                         │  │
│                    │  Kimi / OpenAI  │                         │  │
│                    └─────────────────┘                         │  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        用户浏览器 (PWA)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │  React SPA   │  │  Service     │  │  IndexedDB          │   │
│  │  (移动端优先) │  │  Worker      │  │  - 知识点内容缓存    │   │
│  │              │  │  (离线缓存)   │  │  - 对话历史(P1)     │   │
│  │              │  │              │  │  - 题目缓存         │   │
│  └──────────────┘  └──────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 模块划分

> **部署模型**：Next.js 全栈单体，一次构建部署到 EdgeOne Pages。
> 静态资源 → CDN 边缘节点分发，API Routes → Edge Functions 执行。同域名、零跨域。
>
> **目录设计原则**：
> - **src/ 隔离**：所有源码放 `src/` 下，与配置文件、文档、脚本分离
> - **Feature-based 分模块**：按业务功能（auth, knowledge, review, quiz, chat）垂直切分
> - **安全边界**：`infrastructure/` 和 `*.service.ts` 仅在 Edge Function 中执行，不打包到浏览器 JS，杜绝 API Key 等敏感数据泄露
> - **Barrel Exports**：每个模块 `index.ts` 统一导出，外部只通过入口引用
> - **运维友好**：独立模块可单独排查、替换、扩展，不影响其他模块

```
med-recallix/
│
├── src/                              # ======= 所有源码 =======
│   │
│   ├── app/                          # Next.js App Router (路由层)
│   │   ├── layout.tsx                # 根布局（字体、主题、元数据）
│   │   ├── manifest.ts               # PWA manifest
│   │   ├── page.tsx                  # 着陆页 → 未登录引导、已登录跳转
│   │   ├── not-found.tsx             # 全局 404 页面
│   │   ├── error.tsx                 # 全局错误边界
│   │   ├── loading.tsx               # 全局加载骨架屏
│   │   │
│   │   ├── (auth)/                   # 认证路由组（无 app shell）
│   │   │   ├── layout.tsx            # 认证页共享布局（居中卡片）
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   │
│   │   ├── (app)/                    # 应用主路由组（带底部导航）
│   │   │   ├── layout.tsx            # App Shell：顶部 Header + 底部 Tab
│   │   │   ├── dashboard/
│   │   │   │   ├── page.tsx          # 复习仪表盘（首页）
│   │   │   │   └── loading.tsx       # Dashboard 加载骨架
│   │   │   ├── review/
│   │   │   │   └── page.tsx          # 复习会话（翻卡 + 自评）
│   │   │   ├── knowledge/
│   │   │   │   ├── page.tsx          # 知识点列表
│   │   │   │   ├── new/page.tsx      # 新建知识点
│   │   │   │   └── [id]/page.tsx     # 知识点详情 / 编辑
│   │   │   ├── quiz/
│   │   │   │   └── page.tsx          # AI 出题 + 答题
│   │   │   ├── chat/                 # [P1] AI 对话
│   │   │   │   └── page.tsx
│   │   │   └── settings/
│   │   │       └── page.tsx          # 设置
│   │   │
│   │   └── api/                      # API Route Handlers (Edge Runtime)
│   │       ├── auth/
│   │       │   ├── login/route.ts
│   │       │   ├── register/route.ts
│   │       │   └── me/route.ts
│   │       ├── knowledge/
│   │       │   ├── route.ts          # GET 列表 / POST 创建
│   │       │   └── [id]/route.ts     # GET / PUT / DELETE
│   │       ├── cards/
│   │       │   ├── route.ts          # GET 待复习卡片
│   │       │   └── [id]/route.ts     # PUT 更新 SM-2 状态
│   │       ├── quiz/
│   │       │   └── generate/route.ts # POST 生成选择题（流式）
│   │       ├── chat/                 # [P1]
│   │       │   ├── route.ts          # POST 发消息 / GET 会话列表
│   │       │   └── [sessionId]/route.ts
│   │       └── config/
│   │           └── route.ts          # GET / PUT AI 配置
│   │
│   ├── modules/                      # ======= 业务模块（Feature Modules）=======
│   │   │                             # 每个模块独立封装：服务层 + 组件 + Hook + 类型
│   │   │
│   │   ├── auth/                     # ── 认证模块 ──
│   │   │   ├── index.ts              # Barrel export
│   │   │   ├── auth.service.ts       # 密码哈希、JWT 签发/验证、Cookie
│   │   │   ├── auth.schema.ts        # Zod 校验：LoginInput, RegisterInput
│   │   │   ├── auth.types.ts         # AuthUser, JWTPayload
│   │   │   ├── auth.constants.ts     # JWT 过期时间、Cookie 名等
│   │   │   ├── use-auth.ts           # React Hook：登录状态管理
│   │   │   └── components/
│   │   │       ├── login-form.tsx
│   │   │       └── register-form.tsx
│   │   │
│   │   ├── knowledge/                # ── 知识点模块 ──
│   │   │   ├── index.ts
│   │   │   ├── knowledge.service.ts  # CRUD 操作、索引管理、分类树维护
│   │   │   ├── knowledge.schema.ts   # Zod 校验：CreateKP, UpdateKP
│   │   │   ├── knowledge.types.ts    # KnowledgePoint, KPIndexItem, CategoryTree
│   │   │   ├── use-knowledge.ts      # React Hook：列表查询、缓存
│   │   │   └── components/
│   │   │       ├── knowledge-form.tsx
│   │   │       ├── knowledge-card.tsx
│   │   │       └── category-tree.tsx
│   │   │
│   │   ├── review/                   # ── 复习模块 ──
│   │   │   ├── index.ts
│   │   │   ├── review.service.ts     # SM-2 计算、卡片状态更新、Streak
│   │   │   ├── review.schema.ts      # Zod 校验：ReviewGrade
│   │   │   ├── review.types.ts       # Card, StreakData, DueSummary
│   │   │   ├── sm2.ts                # SM-2 算法封装（纯函数、零依赖）
│   │   │   ├── use-review.ts         # React Hook：复习会话状态机
│   │   │   └── components/
│   │   │       ├── review-card.tsx    # 翻转卡片
│   │   │       ├── rating-buttons.tsx # SM-2 评分按钮组
│   │   │       ├── due-summary.tsx    # 待复习概览卡片
│   │   │       └── streak-badge.tsx   # 连续学习天数
│   │   │
│   │   ├── quiz/                     # ── AI 出题模块 ──
│   │   │   ├── index.ts
│   │   │   ├── quiz.service.ts       # Prompt 构造、AI 调用、结果解析
│   │   │   ├── quiz.schema.ts        # Zod 校验：GenerateQuizInput
│   │   │   ├── quiz.types.ts         # QuizQuestion, QuizOption
│   │   │   ├── quiz.prompts.ts       # AI Prompt 模板（出题/解析）
│   │   │   ├── use-quiz.ts           # React Hook：出题 + 答题状态
│   │   │   └── components/
│   │   │       ├── quiz-question.tsx  # 选择题组件
│   │   │       └── quiz-result.tsx    # 答题结果
│   │   │
│   │   ├── chat/                     # ── [P1] AI 对话模块 ──
│   │   │   ├── index.ts
│   │   │   ├── chat.service.ts       # 会话管理、消息持久化
│   │   │   ├── chat.schema.ts        # Zod 校验：ChatInput
│   │   │   ├── chat.types.ts         # ChatMessage, ChatSession, ChatIndexItem
│   │   │   ├── use-chat.ts           # React Hook：流式接收 + 会话管理
│   │   │   └── components/
│   │   │       ├── chat-input.tsx
│   │   │       ├── message-bubble.tsx
│   │   │       └── message-list.tsx
│   │   │
│   │   └── agent/                    # ── [P1] Agent 记忆模块 ──
│   │       ├── index.ts
│   │       ├── soul.ts               # L1 SOUL — 核心身份（只读常量）
│   │       ├── rules.ts              # 行为规则（只读常量）
│   │       ├── profile.service.ts    # L2 PROFILE — 用户画像读写
│   │       ├── memory.service.ts     # L3 MEMORY — 长期记忆管理 + 召回
│   │       ├── episode.service.ts    # L4 EPISODIC — 每日情景记忆
│   │       ├── compaction.service.ts # 记忆压缩
│   │       ├── context-builder.ts    # L5 WORKING — 上下文窗口组装
│   │       └── agent.types.ts        # UserProfile, MemoryEntry, DailyEpisode
│   │
│   ├── shared/                       # ======= 共享基础设施 =======
│   │   │                             # 跨模块复用、无业务逻辑
│   │   │
│   │   ├── infrastructure/           # ── 基础设施层（服务端） ──
│   │   │   ├── kv/
│   │   │   │   ├── index.ts          # Barrel export
│   │   │   │   ├── kv.client.ts      # KV 读写泛型封装（生产）
│   │   │   │   ├── kv.mock.ts        # KV 本地 Mock（开发环境 Map 模拟）
│   │   │   │   └── kv.keys.ts        # 所有 KV Key 构建函数（集中管理命名）
│   │   │   ├── ai/
│   │   │   │   ├── index.ts
│   │   │   │   ├── ai.client.ts      # OpenAI 兼容客户端（Vercel AI SDK）
│   │   │   │   └── ai.config.ts      # AI 配置读取（从 KV）
│   │   │   └── cache/
│   │   │       ├── index.ts
│   │   │       └── idb.client.ts     # IndexedDB 封装（idb 库）
│   │   │
│   │   ├── components/               # ── 共享 UI 组件 ──
│   │   │   ├── ui/                   # shadcn/ui 原子组件
│   │   │   │   ├── button.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── toast.tsx
│   │   │   │   └── ...
│   │   │   └── layout/               # 布局组件
│   │   │       ├── bottom-nav.tsx     # 底部 Tab 导航
│   │   │       ├── header.tsx         # 页面标题栏
│   │   │       └── page-container.tsx # 页面容器（统一 padding/scroll）
│   │   │
│   │   ├── hooks/                    # ── 共享 Hooks ──
│   │   │   ├── use-local-cache.ts    # IndexedDB 缓存 Hook
│   │   │   └── use-media-query.ts    # 响应式断点检测
│   │   │
│   │   ├── lib/                      # ── 共享工具库（纯函数、零 React 依赖）──
│   │   │   ├── utils.ts              # nanoid 封装、日期格式化、cn() 类名合并
│   │   │   ├── errors.ts             # 统一错误类型（AppError, ApiError）
│   │   │   └── validators.ts         # 通用校验器（username 规则、密码强度）
│   │   │
│   │   └── types/                    # ── 共享类型定义 ──
│   │       ├── index.ts              # Barrel re-export
│   │       ├── api.ts                # API 通用类型：ApiResponse<T>, ApiError
│   │       └── env.d.ts              # 全局环境变量类型声明
│   │
│   └── middleware.ts                 # Next.js Middleware（JWT 认证拦截）
│
├── public/                           # ======= 静态资源 =======
│   ├── icons/
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   └── sw.js                        # Service Worker
│
├── docs/                             # ======= 项目文档 =======
│   ├── REQUIREMENT.md
│   ├── DESIGN.md
│   ├── TODO.md
│   ├── DEPLOYMENT.md
│   └── assets/
│
├── scripts/                          # ======= 运维脚本 =======
│   └── seed-kv.ts                    # KV 初始化种子数据脚本
│
├── PROGRESS.md                       # Spec Coding 进度
├── README.md                         # 项目介绍
├── CONTRIBUTING.md                   # 贡献指南
├── CHANGELOG.md                      # 变更日志
├── LICENSE                           # MIT 许可
├── .env.example                      # 环境变量模板
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── pnpm-lock.yaml
```

### 3.3 模块设计原则

#### Feature Module 规范

每个业务模块（`src/modules/*`）遵循统一结构：

```
modules/{feature}/
├── index.ts              # Barrel export（模块对外唯一入口）
├── {feature}.service.ts  # 业务逻辑（服务端，无 React 依赖）
├── {feature}.schema.ts   # Zod 输入校验 Schema
├── {feature}.types.ts    # 模块内类型定义
├── {feature}.prompts.ts  # AI Prompt 模板（仅 quiz/agent 模块有）
├── use-{feature}.ts      # React Hook（客户端状态管理）
└── components/           # 模块专属 UI 组件
    └── *.tsx
```

**规则**：
1. **模块间通过 `index.ts` 交互**，不直接引用内部文件
2. **service 文件无 React 依赖**，可在 API Route 和 Server Component 中使用
3. **schema 与 service 配对**，API Route 入口处校验，service 处理纯数据
4. **组件只放在 components/ 中**，Hook 放模块根目录

#### Shared 基础设施规范

```
shared/
├── infrastructure/    # 服务端基础设施（KV、AI、Cache）
├── components/        # 跨模块共享的 UI 组件
├── hooks/             # 跨模块共享的 React Hooks
├── lib/               # 纯函数工具库（零 React 依赖）
└── types/             # 全局类型声明
```

**规则**：
1. **infrastructure/ 仅 Edge Function 使用**（API Route 或 Server Component 中），不在 `'use client'` 组件导入，Next.js tree-shaking 保证不打包到浏览器
2. **components/ui/ 是 shadcn 组件**，业务组件不放这里
3. **lib/ 是纯函数**，不导入 React、不读取环境变量

### 3.4 导入路径别名

```json
// tsconfig.json paths
{
  "@/*": ["./src/*"],
  "@/modules/*": ["./src/modules/*"],
  "@/shared/*": ["./src/shared/*"]
}
```

**导入示例**：

```typescript
// API Route 中导入模块服务
import { KnowledgeService } from '@/modules/knowledge';
import { kvClient } from '@/shared/infrastructure/kv';

// 页面中导入模块组件和 Hook
import { useReview } from '@/modules/review';
import { ReviewCard, RatingButtons } from '@/modules/review';

// 任何地方导入共享 UI
import { Button, Card } from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';
```

### 3.5 层级依赖关系

```
┌──────────────────────────────────────────────────────────────┐
│  app/ (路由层)                                                │
│  职责：路由映射、页面组合、API 入口校验                         │
│  可依赖：modules/, shared/                                    │
├──────────────────────────────────────────────────────────────┤
│  modules/ (业务模块层)                                        │
│  职责：业务逻辑、模块专属组件/Hook、数据校验                    │
│  可依赖：shared/                                              │
│  禁止：模块间不可直接互相依赖（需通过 app/ 层编排）              │
├──────────────────────────────────────────────────────────────┤
│  shared/infrastructure/ (基础设施层 — 仅 Edge Function)       │
│  职责：KV 读写、AI 调用、缓存                                  │
│  可依赖：shared/lib/, shared/types/                           │
├──────────────────────────────────────────────────────────────┤
│  shared/components/ (共享 UI 层)                              │
│  职责：原子 UI 组件、布局组件                                   │
│  可依赖：shared/lib/, shared/hooks/                           │
├──────────────────────────────────────────────────────────────┤
│  shared/lib/ (工具函数层)                                     │
│  职责：纯函数、零依赖工具                                      │
│  可依赖：shared/types/                                        │
├──────────────────────────────────────────────────────────────┤
│  shared/types/ (类型层)                                       │
│  职责：全局类型声明                                            │
│  无依赖                                                       │
└──────────────────────────────────────────────────────────────┘
```

**核心规则**：
- ✅ 上层依赖下层，下层不依赖上层
- ✅ `modules/` 之间互不依赖（模块解耦）
- ✅ `shared/infrastructure/` 仅 Edge Function（API Route / Server Component）使用
- ✅ `shared/lib/` 无 React 依赖，可在任意环境运行
- ❌ 禁止 `shared/` 依赖 `modules/`
- ❌ 禁止 `modules/A` 直接 import `modules/B` 内部文件

### 3.6 API Route 薄层模式

API Route 文件保持 **极薄**，只做三件事：校验 → 调用 Service → 返回响应。

```typescript
// src/app/api/knowledge/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeService } from '@/modules/knowledge';
import { CreateKPSchema } from '@/modules/knowledge';
import { getUserId } from '@/modules/auth';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const userId = getUserId(req);                    // 1. 认证
  const body = CreateKPSchema.parse(await req.json()); // 2. 校验
  const result = await KnowledgeService.create(userId, body); // 3. 业务
  return NextResponse.json(result, { status: 201 }); // 4. 响应
}
```

**好处**：业务逻辑全在 Service 中，API Route 可随时替换为 `/functions/` 模式而不影响逻辑。

---

## 4. 数据设计

### 4.1 KV 命名空间规划

| 命名空间 | 绑定变量名 | 用途 | 预估大小 |
|----------|-----------|------|---------|
| `med_config` | `med_config` | 系统配置（AI Key、模型端点） | < 1KB |
| `med_data` | `med_data` | 全部业务数据（用户、知识点、卡片） | < 900MB |

**设计原则**：仅用 2 个命名空间，预留 8 个给未来扩展（如对话历史、统计等）。

### 4.2 KV Key 设计

采用 **前缀分区 + 聚合文档** 模式。KV 无范围查询，所以将同一用户的同类数据聚合到一个 Key 中，一次 GET 读取后在内存过滤。

#### med_config 命名空间

| Key | Value 类型 | 说明 |
|-----|-----------|------|
| `ai_api_key` | string | AI API Key（加密存储） |
| `ai_base_url` | string | AI 端点 URL，默认 `https://api.kimi.com/coding/v1` |
| `ai_model` | string | 模型名，默认 `kimi-for-coding` |

#### med_data 命名空间

| Key 模式 | Value 类型 | 说明 | 预估单条大小 |
|----------|-----------|------|-------------|
| `user_{username}` | JSON (User) | 用户档案 | ~500B |
| `kp_index_{userId}` | JSON (KPIndex[]) | 用户知识点索引（元数据，不含正文） | ~100B/条 × N |
| `kp_{userId}_{kpId}` | JSON (KnowledgePoint) | 单个知识点完整内容 | ~1-5KB |
| `deck_{userId}` | JSON (Record<cardId, Card>) | 用户全部 SM-2 卡片聚合 | ~200B/卡 × N |
| `cat_{userId}` | JSON (CategoryTree) | 用户分类树 | ~2KB |
| `streak_{userId}` | JSON (StreakData) | 连续学习天数记录 | ~200B |
| `profile_{userId}` | JSON (UserProfile) | [P1] 用户画像（考试目标、偏好、强弱项） | ~1KB |
| `memory_{userId}` | JSON (LongTermMemory) | [P1] 长期记忆（≤100 条 MemoryEntry） | ~20KB |
| `episode_{userId}_{YYYYMMDD}` | JSON (DailyEpisode) | [P1] 每日学习日志（保留 30 天） | ~500B |
| `chat_{userId}_{sessionId}` | JSON (ChatSession) | [P1] 单个对话会话（消息列表） | ~500B/消息 × N |
| `chat_idx_{userId}` | JSON (ChatIndex[]) | [P1] 对话会话索引（标题 + 时间） | ~100B/条 × N |

**容量估算（单用户）**：
- 500 知识点 × 3KB ≈ 1.5MB（分散存储）
- 索引 500 条 × 100B ≈ 50KB
- 卡片聚合 500 × 200B ≈ 100KB
- [P1] 用户画像 + 长期记忆 + 情景记忆 ≈ 35KB
- [P1] 对话历史 20 会话 × 50 消息 × 500B ≈ 500KB
- 其他 ≈ 5KB
- **合计 ≈ 2.2MB / 用户**
- **100 用户 ≈ 220MB**，远在 1GB 安全范围内
- 对话历史超出部分由 IndexedDB 本地承载，KV 仅存最近会话

### 4.3 数据模型定义

```typescript
// ===== 用户 =====
interface User {
  id: string;              // nanoid 生成
  username: string;
  passwordHash: string;    // PBKDF2 哈希
  salt: string;            // 随机盐值
  createdAt: string;       // ISO 8601
}

// ===== 知识点索引项 =====
interface KPIndexItem {
  id: string;              // nanoid
  title: string;           // 知识点标题
  categoryPath: string[];  // 如 ["内科", "心血管系统", "高血压"]
  tags: string[];          // 如 ["降压药", "靶器官损害"]
  cardId: string | null;   // 关联的 SM-2 卡片 ID
  createdAt: string;
  updatedAt: string;
}

// ===== 知识点完整内容 =====
interface KnowledgePoint {
  id: string;
  title: string;
  content: string;         // Markdown 正文
  categoryPath: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ===== SM-2 卡片 =====
interface Card {
  id: string;              // nanoid
  kpId: string;            // 关联知识点 ID
  interval: number;        // 复习间隔（天）
  repetition: number;      // 连续正确次数
  efactor: number;         // 容易度因子（初始 2.5）
  dueDate: string;         // 下次复习日期 ISO 8601
  lastReviewedAt: string;  // 上次复习时间
  createdAt: string;
}

// ===== 分类树 =====
interface CategoryNode {
  name: string;
  children: CategoryNode[];
}
type CategoryTree = CategoryNode[];

// ===== 学习连续天数 =====
interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;  // YYYY-MM-DD
}

// ===== AI 选择题 =====
interface QuizQuestion {
  id: string;
  stem: string;            // 题干
  options: QuizOption[];
  correctIndex: number;    // 正确选项索引
  explanation: string;     // 解析
  kpId: string;            // 来源知识点
}

interface QuizOption {
  label: string;           // A/B/C/D/E
  text: string;            // 选项内容
}

// ===== [P1] AI 对话 =====
interface ChatMessage {
  id: string;              // nanoid
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;       // ISO 8601
  kpRefs?: string[];       // 引用的知识点 ID（AI 回答时关联）
}

interface ChatSession {
  id: string;              // nanoid
  title: string;           // 对话标题（首条消息自动生成）
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

interface ChatIndexItem {
  id: string;              // session ID
  title: string;
  lastMessage: string;     // 最后一条消息摘要
  messageCount: number;
  updatedAt: string;
}

// ===== [P1] Agent 记忆系统 =====
interface UserProfile {
  nickname: string;
  examTarget: string;
  examDate?: string;
  preferredStudyTime: string;
  dailyGoal: number;
  difficultyPreference: 'easy' | 'medium' | 'hard';
  strongSubjects: string[];
  weakSubjects: string[];
  learningStyle: string;
  createdAt: string;
  updatedAt: string;
}

interface LongTermMemory {
  entries: MemoryEntry[];
  lastCompactedAt: string;
}

interface MemoryEntry {
  id: string;
  category: 'weakness' | 'strength' | 'preference'
           | 'milestone' | 'correction' | 'insight';
  content: string;
  importance: 'high' | 'medium' | 'low';
  createdAt: string;
  source: string;
}

interface DailyEpisode {
  date: string;
  studyMinutes: number;
  reviewedCount: number;
  quizCount: number;
  avgScore: number;
  newKnowledge: number;
  summary?: string;
  highlights: string[];
}
```

### 4.4 IndexedDB 本地缓存结构

| Store 名 | Key | Value | 用途 |
|----------|-----|-------|------|
| `kp_cache` | kpId | KnowledgePoint | 知识点正文离线缓存 |
| `quiz_cache` | quizId | QuizQuestion[] | 已做题目缓存 |
| `chat_cache` | sessionId | ChatSession | [P1] 对话历史本地缓存 |
| `pending_sync` | opId | PendingOp | 离线操作待同步队列 |

---

## 5. API 设计

所有 API Route Handler 使用 Edge Runtime：
```typescript
export const runtime = 'edge';
```

### 5.1 接口列表

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/auth/register` | 用户注册 | ✗ |
| POST | `/api/auth/login` | 用户登录 | ✗ |
| GET | `/api/auth/me` | 获取当前用户信息 | ✓ |
| GET | `/api/knowledge` | 获取知识点索引列表 | ✓ |
| POST | `/api/knowledge` | 创建知识点 | ✓ |
| GET | `/api/knowledge/[id]` | 获取知识点详情 | ✓ |
| PUT | `/api/knowledge/[id]` | 更新知识点 | ✓ |
| DELETE | `/api/knowledge/[id]` | 删除知识点 | ✓ |
| GET | `/api/cards` | 获取待复习卡片（含过滤） | ✓ |
| PUT | `/api/cards/[id]` | 复习后更新卡片 SM-2 状态 | ✓ |
| POST | `/api/quiz/generate` | AI 生成选择题（流式） | ✓ |
| POST | `/api/chat` | [P1] 发送对话消息（流式返回） | ✓ |
| GET | `/api/chat` | [P1] 获取对话会话列表 | ✓ |
| GET | `/api/chat/[sessionId]` | [P1] 获取单个会话历史 | ✓ |
| DELETE | `/api/chat/[sessionId]` | [P1] 删除对话会话 | ✓ |
| GET | `/api/config` | 获取 AI 配置（脱敏） | ✓ |
| PUT | `/api/config` | 更新 AI 配置 | ✓ |

### 5.2 接口详情

#### POST /api/auth/register

```typescript
// Request
{ username: string; password: string }

// Response 201
{ user: { id: string; username: string; createdAt: string } }

// Error 409
{ error: "username_taken" }
```

#### POST /api/auth/login

```typescript
// Request
{ username: string; password: string }

// Response 200  (Set-Cookie: token=<JWT>; HttpOnly; Secure; SameSite=Strict)
{ user: { id: string; username: string } }

// Error 401
{ error: "invalid_credentials" }
```

#### GET /api/cards?status=due|all

```typescript
// Response 200
{
  cards: Array<Card & { kpTitle: string }>;
  summary: {
    dueToday: number;
    overdue: number;
    total: number;
  }
}
```

#### PUT /api/cards/[id]

```typescript
// Request — 复习后自评
{ grade: 0 | 1 | 2 | 3 | 4 | 5 }

// Response 200 — 返回更新后的卡片
{ card: Card }
```

#### POST /api/quiz/generate

```typescript
// Request
{ kpId: string; count?: number /* 默认 3 */ }

// Response — Streaming (text/event-stream)
// 流式返回 JSON，每道题一个 chunk
data: { question: QuizQuestion }
data: { question: QuizQuestion }
data: [DONE]
```

#### POST /api/chat — [P1]

```typescript
// Request
{
  sessionId?: string;     // 已有会话 ID，空则创建新会话
  message: string;        // 用户消息
  context?: {             // 可选：携带知识点上下文
    kpIds: string[];      // 引用的知识点 ID
  }
}

// Response — Streaming (text/event-stream)
// 流式返回 AI 回复，兼容 Vercel AI SDK useChat
data: { content: "你好主人..." }
data: { content: "关于高血压的..." }
data: [DONE]

// 流结束后，服务端自动将完整消息持久化到 KV
```

#### GET /api/chat — [P1]

```typescript
// Response 200 — 会话列表
{
  sessions: ChatIndexItem[];
}
```

#### GET /api/chat/[sessionId] — [P1]

```typescript
// Response 200 — 单个会话完整历史
{
  session: ChatSession;
}
```

---

## 6. 核心流程

### 6.1 复习流程（SM-2 调度）

```
用户打开应用
    │
    ▼
┌─────────────────┐
│  Dashboard      │ ◀── GET /api/cards?status=due
│  显示待复习数量  │     过滤 dueDate ≤ today
└───────┬─────────┘
        │ 点击"开始复习"
        ▼
┌─────────────────┐
│  Review Session │ ◀── 逐张展示卡片
│  展示知识点标题  │
│  用户回忆内容    │
└───────┬─────────┘
        │ 点击"显示答案"
        ▼
┌─────────────────┐
│  显示知识点正文  │ ◀── GET /api/knowledge/[id] or IndexedDB cache
│  用户自评难度    │
└───────┬─────────┘
        │ 选择评分 (0-5)
        ▼
┌─────────────────┐
│  SM-2 计算      │ ◀── supermemo(card, grade)
│  更新卡片状态    │ ──▶ PUT /api/cards/[id] { grade }
│  显示下次复习日  │
└───────┬─────────┘
        │
        ▼
   还有卡片？──是──▶ 下一张
        │
        否
        ▼
┌─────────────────┐
│  复习完成总结    │
│  更新 streak    │
└─────────────────┘
```

### 6.2 AI 出题流程

```
用户选择知识点
    │
    ▼
┌────────────────────┐
│  POST /api/quiz/   │
│  generate          │
│  { kpId, count:3 } │
└───────┬────────────┘
        │
        ▼
┌────────────────────┐     ┌──────────────────┐
│  API Route:        │────▶│  KV 读取         │
│  1. 获取知识点正文  │     │  med_data:       │
│  2. 获取 AI 配置    │     │  kp_{uid}_{kpId} │
│  3. 构造 Prompt    │     │  med_config:     │
│  4. 调用 AI API    │     │  ai_api_key 等   │
└───────┬────────────┘     └──────────────────┘
        │
        ▼
┌────────────────────┐
│  AI Model 调用     │ Prompt: "根据以下医学知识点，
│  (流式响应)         │  生成{count}道A1型选择题..."
└───────┬────────────┘
        │ stream
        ▼
┌────────────────────┐
│  前端逐题渲染      │
│  用户答题          │
│  显示解析          │
└────────────────────┘
```

### 6.3 认证流程

```
注册流程:
  1. 前端 POST /api/auth/register { username, password }
  2. 检查 username 是否存在 → KV GET user_{username}
  3. 生成 salt → crypto.getRandomValues()
  4. PBKDF2 哈希 password + salt
  5. 创建 User 写入 KV: user_{username}
  6. 签发 JWT → Set-Cookie (HttpOnly)
  7. 返回用户信息

登录流程:
  1. 前端 POST /api/auth/login { username, password }
  2. KV GET user_{username}
  3. PBKDF2 验证 password + salt
  4. 签发 JWT → Set-Cookie (HttpOnly)
  5. 返回用户信息

请求认证:
  1. Next.js Middleware 拦截 /api/* 和 /(app)/*
  2. 读取 Cookie 中的 JWT
  3. jose 验证签名和过期时间
  4. 解析 userId 注入请求 header
  5. API Route 从 header 获取 userId
```

### 6.4 AI 对话解答流程 [P1]

```
┌────────────────────────────────────────────────────────────────┐
│  用户进入对话页面                                                │
│    │                                                           │
│    ├─ 新对话 ──▶ 不传 sessionId                                 │
│    └─ 历史对话 ──▶ GET /api/chat/[sessionId] 加载历史消息        │
│                                                                │
│  用户输入消息（可选择关联知识点作为上下文）                        │
│    │                                                           │
│    ▼                                                           │
│  POST /api/chat { message, sessionId?, context? }              │
│    │                                                           │
│    ▼                                                           │
│  ┌──────────────────────────────────────────────────┐          │
│  │ API Route 处理:                                   │          │
│  │ 1. 若有 context.kpIds → KV 读取知识点正文          │          │
│  │ 2. KV 读取 AI 配置 (api_key, model, endpoint)     │          │
│  │ 3. 构造 System Prompt（学习伙伴人格 + 知识上下文）  │          │
│  │ 4. 加载会话历史消息作为对话上下文                    │          │
│  │ 5. 调用 AI API（Vercel AI SDK streamText）        │          │
│  │ 6. 流式返回给前端                                  │          │
│  │ 7. 流结束后异步持久化消息到 KV                      │          │
│  └──────────────────────────────────────────────────┘          │
│    │                                                           │
│    ▼ stream                                                    │
│  ┌──────────────────────────────────────────────────┐          │
│  │ 前端渲染:                                         │          │
│  │ - useChat hook 接收流式数据                        │          │
│  │ - 消息气泡逐字显示（打字机效果）                    │          │
│  │ - 完成后同步到 IndexedDB 本地缓存                  │          │
│  │ - 自动滚动到最新消息                               │          │
│  └──────────────────────────────────────────────────┘          │
└────────────────────────────────────────────────────────────────┘
```

**详见 6.5 Agent 记忆架构设计。**

### 6.5 Agent 记忆与角色架构 [P1]

> 参考 [CoPaw](https://github.com/agentscope-ai/CoPaw) 的 SOUL/PROFILE/MEMORY/Compaction 架构，
> 适配到 EdgeOne KV 无文件系统的边缘计算环境。

#### 6.5.1 记忆层级总览

```
┌─────────────────────────────────────────────────────────────────┐
│                   Med-Recallix Agent 记忆架构                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────┐              │
│  │  Layer 1: SOUL（灵魂 — 核心身份）              │  只读        │
│  │  定义：人格、价值观、行为准则                    │  硬编码       │
│  │  CoPaw 对应：SOUL.md                          │              │
│  │  存储：代码常量 (lib/agent-soul.ts)            │              │
│  └───────────────────────────────────────────────┘              │
│                          │ 注入 system prompt                    │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────┐              │
│  │  Layer 2: PROFILE（档案 — 用户画像）           │  读写        │
│  │  定义：用户姓名/称呼、考试目标、学习偏好         │  KV 持久化   │
│  │  CoPaw 对应：PROFILE.md                       │              │
│  │  存储：KV key `profile_{userId}`              │              │
│  └───────────────────────────────────────────────┘              │
│                          │ 个性化上下文                          │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────┐              │
│  │  Layer 3: MEMORY（长期记忆 — 持久事实）         │  读写        │
│  │  定义：薄弱学科、掌握规律、学习里程碑、偏好      │  KV 持久化   │
│  │  CoPaw 对应：MEMORY.md                        │              │
│  │  存储：KV key `memory_{userId}`               │              │
│  └───────────────────────────────────────────────┘              │
│                          │ 语义召回                              │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────┐              │
│  │  Layer 4: EPISODIC（情景记忆 — 每日日志）       │  读写        │
│  │  定义：每日学习记录（复习了什么、得分、时长）     │  KV + IDB    │
│  │  CoPaw 对应：memory/YYYY-MM-DD.md             │              │
│  │  存储：KV key `episode_{userId}_{YYYYMMDD}`   │              │
│  └───────────────────────────────────────────────┘              │
│                          │ 上下文窗口填充                        │
│                          ▼                                      │
│  ┌───────────────────────────────────────────────┐              │
│  │  Layer 5: WORKING（工作记忆 — 对话上下文）      │  瞬时        │
│  │  定义：当前对话消息 + 召回的记忆片段             │  仅存于请求   │
│  │  CoPaw 对应：Context Window                    │              │
│  │  存储：API 请求内存中组装，不持久化              │              │
│  └───────────────────────────────────────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.5.2 Layer 1: SOUL — 核心身份定义

硬编码在 `lib/agent-soul.ts` 中，**只读不可修改**，定义 AI 伙伴的核心人格。

```typescript
// lib/agent-soul.ts
export const AGENT_SOUL = `
## 身份
你是 Med-Recallix（瑞卡利斯），一位专业的医学学习伙伴。

## 核心价值观
- 真诚帮助：主人的学习进步是最高优先级
- 严谨准确：医学知识不可有误，不确定时明确标注
- 温暖陪伴：既是严师也是好友，懂得鼓励和共情

## 行为准则
1. 称用户为"主人"
2. 语气温暖但专业，偶尔幽默但不轻浮
3. 主动提醒待复习内容，但不唠叨
4. 发现主人薄弱点时记录到长期记忆
5. 遇到不确定的医学问题，坦诚告知，不编造
6. 用简洁分点格式回答，便于手机阅读
7. 关键术语加粗，辅以临床口诀帮助记忆

## 沟通风格
- 主人答对时：热情鼓励 + 知识拓展
- 主人答错时：温和纠正 + 记忆技巧
- 主人疲惫时：共情理解 + 建议休息
- 主人久未学习时：温柔催促 + 降低难度
`;
```

#### 6.5.3 Layer 2: PROFILE — 用户画像

首次交互时通过引导式对话生成，后续由 Agent 自动维护。

```typescript
interface UserProfile {
  // 基础信息
  nickname: string;          // 主人希望被叫的名字
  examTarget: string;        // 考试目标，如 "2026年执业医师资格考试"
  examDate?: string;         // 考试日期（倒计时用）

  // 学习偏好
  preferredStudyTime: string;  // 如 "晚上 20:00-23:00"
  dailyGoal: number;          // 每日目标复习知识点数
  difficultyPreference: 'easy' | 'medium' | 'hard'; // 出题难度偏好

  // Agent 观察记录（自动更新）
  strongSubjects: string[];   // 强项学科，如 ["内科", "儿科"]
  weakSubjects: string[];     // 弱项学科，如 ["外科", "妇产科"]
  learningStyle: string;      // 如 "偏好口诀记忆" "喜欢对比记忆"

  // 元数据
  createdAt: string;
  updatedAt: string;
}
```

**KV Key**: `profile_{userId}`
**首次引导流程（类 CoPaw BOOTSTRAP）**：

```
Agent 首次见到用户时：
  1. "你好！我是瑞卡利斯（Med-Recallix），你的医考学习伙伴！"
  2. "我该怎么称呼你呢？"
  3. "你在准备哪个考试？预计什么时候考？"
  4. "你每天大概能学习多长时间？"
  5. 根据回答 → 写入 profile_{userId}
  6. 引导完成后进入正常对话模式
```

#### 6.5.4 Layer 3: MEMORY — 长期记忆

存储持久性事实，由 Agent 在对话过程中自主判断何时写入。

```typescript
interface LongTermMemory {
  // 结构化记忆（Agent 自主维护）
  entries: MemoryEntry[];
  lastCompactedAt: string;
}

interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;           // 记忆内容
  importance: 'high' | 'medium' | 'low';
  createdAt: string;
  source: string;            // 来源，如 "对话中主人提到" "复习表现分析"
}

type MemoryCategory =
  | 'weakness'       // 薄弱知识点，如 "主人总是混淆一型和二型糖尿病的鉴别"
  | 'strength'       // 已掌握领域，如 "心电图读图已经很熟练"
  | 'preference'     // 学习偏好，如 "主人喜欢用表格对比记忆"
  | 'milestone'      // 里程碑，如 "内科知识点已全部过完第一轮"
  | 'correction'     // 纠错记录，如 "曾经以为 XX 药用于 YY，已纠正"
  | 'insight';       // Agent 观察，如 "主人周末学习效率明显高于工作日"
```

**KV Key**: `memory_{userId}`
**写入时机**（Agent 自主判断）：

| 触发场景 | 写入内容示例 | 分类 |
|---------|------------|------|
| 复习评分连续 ≤ 2 | "主人在药理学-降压药分类上连续 3 次低分" | weakness |
| 复习评分连续 ≥ 4 | "心血管系统知识点已稳定掌握" | strength |
| 对话中明确表述 | "主人说喜欢用口诀记忆" | preference |
| 完成阶段性目标 | "内科系统全部完成首轮学习" | milestone |
| 纠正错误认知 | "主人曾混淆 A 和 B 的用法，已在对话中纠正" | correction |
| Agent 统计分析 | "主人工作日平均复习 10 分钟，周末 40 分钟" | insight |

**容量控制**：
- 单用户长期记忆上限 100 条 MemoryEntry
- 超出时 Agent 自动执行 Compaction：合并同类记忆、删除过时条目
- Compaction 由 API 层检查触发，不依赖外部定时任务

#### 6.5.5 Layer 4: EPISODIC — 每日情景记忆

按天记录学习活动，自动生成。

```typescript
interface DailyEpisode {
  date: string;              // YYYY-MM-DD
  studyMinutes: number;      // 今日学习时长
  reviewedCount: number;     // 复习知识点数
  quizCount: number;         // 做题数
  avgScore: number;          // 平均自评分
  newKnowledge: number;      // 新增知识点数
  summary?: string;          // AI 自动生成的当日学习总结
  highlights: string[];      // 当日亮点，如 ["首次全对药理学出题"]
}
```

**KV Key**: `episode_{userId}_{YYYYMMDD}`
**更新时机**：每次复习、出题、新增知识点操作后，API 层自动累加统计。
**保留策略**：KV 保留最近 30 天，更早的自动压缩到长期记忆中的 insight/milestone 条目。

#### 6.5.6 Layer 5: WORKING — 工作记忆（上下文窗口组装）

每次 AI API 请求时在服务端动态组装，不持久化。

```
┌──────────────────────────────────────────────────────────────┐
│                  上下文窗口组装优先级                           │
│  (从高到低填充，超出 token 预算时从低优先级截断)               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Priority 1: SOUL (核心身份)                     ~500 tokens │
│  → 固定注入，永不截断                                        │
│                                                              │
│  Priority 2: PROFILE (用户画像)                  ~300 tokens │
│  → 固定注入，永不截断                                        │
│                                                              │
│  Priority 3: 知识点上下文 (当前引用)            ~2000 tokens │
│  → 用户选择的关联知识点正文                                   │
│                                                              │
│  Priority 4: 今日情景记忆 (Daily Episode)        ~200 tokens │
│  → 今日学习统计摘要                                          │
│                                                              │
│  Priority 5: 相关长期记忆 (Recalled Memory)      ~500 tokens │
│  → 根据用户消息关键词匹配相关 MemoryEntry                     │
│                                                              │
│  Priority 6: 对话历史 (Chat History)        ~4000+ tokens │
│  → 最近 N 条消息（从新到旧填充）                              │
│                                                              │
│  ─────── token 预算线 (约 8K, 预留 4K 给输出) ──────────     │
│                                                              │
│  Priority 7: 更早对话历史                   溢出则截断        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**上下文组装伪代码**：

```typescript
function buildContext(userId: string, userMessage: string, sessionId?: string) {
  const maxInputTokens = 8000; // 预留 4K 给输出
  let budget = maxInputTokens;
  const messages = [];

  // P1: SOUL（永不截断）
  messages.push({ role: 'system', content: AGENT_SOUL });
  budget -= estimateTokens(AGENT_SOUL);

  // P2: PROFILE
  const profile = await kv.get(`profile_${userId}`);
  if (profile) {
    const profilePrompt = renderProfile(profile);
    messages.push({ role: 'system', content: profilePrompt });
    budget -= estimateTokens(profilePrompt);
  }

  // P3: 知识点上下文
  // (如果用户选择了关联知识点)

  // P4: 今日情景
  const today = dayjs().format('YYYY-MM-DD');
  const episode = await kv.get(`episode_${userId}_${today}`);
  if (episode) {
    const episodePrompt = `今日学习情况：已复习${episode.reviewedCount}个知识点，` +
      `平均分${episode.avgScore}，学习${episode.studyMinutes}分钟。`;
    messages.push({ role: 'system', content: episodePrompt });
    budget -= estimateTokens(episodePrompt);
  }

  // P5: 相关长期记忆（关键词匹配）
  const memory = await kv.get(`memory_${userId}`);
  if (memory) {
    const relevant = recallRelevantMemories(memory.entries, userMessage, 5);
    if (relevant.length > 0) {
      const memoryPrompt = '关于主人的学习记录：\n' +
        relevant.map(m => `- ${m.content}`).join('\n');
      messages.push({ role: 'system', content: memoryPrompt });
      budget -= estimateTokens(memoryPrompt);
    }
  }

  // P6: 对话历史（从新到旧，直到预算用完）
  if (sessionId) {
    const session = await kv.get(`chat_${userId}_${sessionId}`);
    const recentMessages = session.messages.slice(-20);
    for (const msg of recentMessages.reverse()) {
      const tokens = estimateTokens(msg.content);
      if (budget - tokens < 0) break;
      messages.unshift({ role: msg.role, content: msg.content });
      budget -= tokens;
    }
  }

  // 最后追加用户当前消息
  messages.push({ role: 'user', content: userMessage });

  return messages;
}
```

#### 6.5.7 记忆召回策略

由于 EdgeOne KV 不支持向量搜索，采用**轻量级关键词匹配**替代 CoPaw 的 Vector + BM25 混合搜索：

```typescript
function recallRelevantMemories(
  entries: MemoryEntry[],
  query: string,
  topK: number
): MemoryEntry[] {
  // 1. 提取查询关键词（去停用词）
  const keywords = extractKeywords(query);

  // 2. 对每条记忆计算匹配分
  const scored = entries.map(entry => {
    const hitCount = keywords.filter(kw =>
      entry.content.includes(kw)
    ).length;
    const importanceBonus =
      entry.importance === 'high' ? 0.3 :
      entry.importance === 'medium' ? 0.1 : 0;
    const score = (hitCount / keywords.length) + importanceBonus;
    return { entry, score };
  });

  // 3. 按分数排序，返回 top-K
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => s.entry);
}
```

**未来升级路径**：当用户量增长或记忆条目增多时，可引入 EdgeOne Edge AI 的 embedding 能力做向量语义搜索。

#### 6.5.8 Compaction（记忆压缩）

参考 CoPaw 的 Compaction 机制，当上下文或记忆过长时自动压缩：

| 触发场景 | 压缩行为 |
|---------|---------|
| 对话消息 > 200 条 | 旧消息压缩为摘要，保留最近 20 条原文 |
| 长期记忆 > 100 条 | 合并同类条目、删除过时条目、生成综合性总结 |
| 每日情景 > 30 天 | 自动提取月度学习报告写入长期记忆，删除原始日志 |

**对话压缩 Prompt**：

```
请将以下对话压缩为简洁的学习摘要，保留：
1. 讨论了哪些医学知识点
2. 主人在哪些知识上有困惑或犯错
3. 做出的学习决策或约定
4. 主人的情绪状态和学习动力

对话内容：
{messages}
```

#### 6.5.9 记忆数据 KV Key 汇总

| Key 模式 | Layer | 说明 | 大小 |
|---------|-------|------|------|
| `profile_{userId}` | L2 PROFILE | 用户画像 | ~1KB |
| `memory_{userId}` | L3 MEMORY | 长期记忆（≤100 条） | ~20KB |
| `episode_{userId}_{YYYYMMDD}` | L4 EPISODIC | 每日学习日志 | ~500B |
| `chat_{userId}_{sessionId}` | L5→持久化 | 对话会话消息 | ~500B/消息 × N |
| `chat_idx_{userId}` | 索引 | 对话会话列表 | ~100B/条 × N |

**更新后的容量估算（单用户）**：
- 知识点 500 × 3KB ≈ 1.5MB
- 卡片聚合 ≈ 100KB
- 用户画像 ≈ 1KB
- 长期记忆 ≈ 20KB
- 情景记忆 30 天 × 500B ≈ 15KB
- 对话历史 20 会话 × 50 消息 × 500B ≈ 500KB
- **合计 ≈ 2.2MB / 用户**

#### 6.5.10 Agent 行为规则（对应 CoPaw AGENTS.md）

硬编码在 `lib/agent-rules.ts` 中，作为 system prompt 的一部分注入：

```
## 记忆管理规则

### 写入长期记忆的时机
- 当发现主人反复在某个知识点上犯错时 → category: weakness
- 当主人明确表达偏好时 → category: preference
- 当主人完成一个重要学习里程碑时 → category: milestone
- 不要把所有对话都记住，只记关键信息

### 记忆使用规则
- 回答问题时先回忆相关长期记忆
- 如果记得主人之前在这个知识点上犯过错，提醒注意
- 如果记得主人的学习偏好，按偏好风格组织回答

### 安全边界
- 不记录密码、身份证等隐私信息
- 不评判主人的学习能力
- 对不确定的医学知识标注 [需核实]

### 复习催促规则
- 若今日有待复习 ≥ 5 个且未开始 → 温和提醒一次
- 若连续 3 天未学习 → 关切询问情况
- 若连续 7 天未学习 → 降低期望，从简单知识点重新开始
```

**存储策略（对话历史）**：
- KV 存储：会话元数据索引 `chat_idx_{userId}` + 每个会话独立存储 `chat_{userId}_{sessionId}`
- IndexedDB：对话内容本地全量缓存，减少 KV 读取次数
- 单会话消息上限 200 条，超出自动 Compaction
- 会话列表上限 50 个，超出自动归档最旧的

---

## 7. 前端设计

### 7.1 页面结构（移动端优先）

```
┌─────────────────────────┐
│  Header (页面标题)       │  固定顶部
├─────────────────────────┤
│                         │
│                         │
│    Page Content         │  可滚动区域
│    (各页面内容)          │
│                         │
│                         │
├─────────────────────────┤
│  ┌───┬───┬───┬───┬───┐ │
│  │ 🏠│ 📖│ ✏️ │ 💬│ ⚙️ │ │  固定底部 Tab 导航
│  │复习│知识│出题│对话│设置│ │
│  └───┴───┴───┴───┴───┘ │
└─────────────────────────┘
```

### 7.2 页面路由与对应功能

| Tab | 路由 | 功能 | 优先级 |
|-----|------|------|--------|
| 复习 | `/dashboard` | 今日复习概览 → 进入复习会话 | MVP |
| 知识 | `/knowledge` | 知识点列表/分类浏览/搜索 → 详情/编辑/新建 | MVP |
| 出题 | `/quiz` | 选择知识点 → AI 生成题目 → 答题 | MVP |
| 对话 | `/chat` | AI 学习伙伴对话、答疑、知识点关联 | P1 |
| 设置 | `/settings` | 个人信息、AI 模型配置 | MVP |

### 7.3 UI 设计原则

- **移动端优先**：默认 375px 宽度设计，断点向上适配
- **单手操作**：关键按钮在屏幕下半部分
- **卡片式布局**：知识点、复习卡片均采用卡片组件
- **色彩体系**：以蓝/靛蓝为主色（专业、安静），绿色正反馈/红色提醒
- **动效克制**：仅翻转卡片和页面切换使用动效

---

## 8. PWA 设计

### 8.1 Manifest 配置

```typescript
// app/manifest.ts
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Med-Recallix',
    short_name: 'Recallix',
    description: '医考记忆强化个人助手',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#4F46E5',  // Indigo-600
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
```

### 8.2 Service Worker 策略

| 资源类型 | 缓存策略 | 说明 |
|---------|---------|------|
| 静态资源 (JS/CSS/图片) | Cache First | 构建产物带 hash，长期缓存 |
| HTML 页面 | Network First | 优先获取最新，离线回退缓存 |
| API 请求 | Network Only | 数据必须实时，不缓存 |
| 知识点内容 | StaleWhileRevalidate | 先展示缓存，后台更新 |

---

## 9. 安全设计

### 9.1 认证安全

| 措施 | 实现 |
|------|------|
| 密码哈希 | PBKDF2-SHA256, 100K 迭代, 16B 随机盐 |
| JWT 签名 | HS256, 密钥存 KV `med_config` |
| Token 传输 | HttpOnly + Secure + SameSite=Strict Cookie |
| Token 过期 | 7 天有效期，每次活跃请求刷新 |

### 9.2 API 安全

| 措施 | 实现 |
|------|------|
| AI Key 保护 | 存 KV 服务端，前端永远不可见 |
| 数据隔离 | API 层强制校验 userId，KV Key 含 userId 前缀 |
| 输入校验 | zod schema 校验所有 API 输入 |
| CORS | 仅允许同源请求 |

---

## 10. 风险与约束

### 10.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| KV 在 Next.js Route Handler 中不可用 | 所有 API 需重写为 /functions/ | 优先验证 Route Handler 能否访问 KV；备选方案：使用 /functions/ 目录 |
| KV 最终一致性导致数据不一致 | 多端同时操作可能丢失更新 | MVP 阶段接受 last-write-wins；未来加乐观锁 |
| Kimi API 不稳定或限流 | AI 出题不可用 | 支持配置切换到其他 OpenAI 兼容模型 |
| 1GB KV 容量上限 | 用户增长受限 | 精简数据设计；大内容存 IndexedDB；超限提示 |
| Edge Runtime 不支持部分 Node.js API | 部分库不可用 | 技术选型已确认所有库兼容 Edge Runtime |

### 10.2 技术验证优先项（Spike）

在正式开发前需验证：

1. **Next.js Route Handler 能否在 EdgeOne 上访问 KV 绑定变量** → 写一个最小 API route 测试
2. **PBKDF2 在 EdgeOne Edge Runtime 中的性能** → 测试 100K 迭代耗时
3. **Vercel AI SDK 连接 Kimi API 的兼容性** → 测试流式输出

---

## 11. 附录

### 11.1 AI Prompt 模板（出题）

```
你是一位资深的医学考试命题专家。请根据以下知识点内容，生成 {count} 道执业医师考试 A1 型选择题。

知识点标题：{title}
知识点内容：
{content}

要求：
1. 每题包含题干和 A-E 五个选项
2. 只有一个正确答案
3. 干扰选项应具有一定迷惑性但不含争议
4. 每题附上简要解析，说明正确答案的理由和常见错误
5. 难度适中，符合执业医师考试水平

输出严格 JSON 格式（无多余文字）：
[
  {
    "stem": "题干文本",
    "options": [
      {"label": "A", "text": "选项A"},
      {"label": "B", "text": "选项B"},
      {"label": "C", "text": "选项C"},
      {"label": "D", "text": "选项D"},
      {"label": "E", "text": "选项E"}
    ],
    "correctIndex": 0,
    "explanation": "解析文本"
  }
]
```

### 11.2 SM-2 算法参数

| 参数 | 初始值 | 说明 |
|------|--------|------|
| interval | 0 | 初始间隔 0 天 |
| repetition | 0 | 初始连续正确次数 0 |
| efactor | 2.5 | 初始容易度因子 |
| grade ≥ 3 | - | 视为"记住了"，拉长间隔 |
| grade < 3 | - | 视为"忘了"，重置间隔 |

### 11.3 自评引导语

| 分数 | 标签 | AI 伙伴提示语 |
|------|------|-------------|
| 5 | 完美 | "太棒了主人！这个知识点你已经完全掌握了！" |
| 4 | 犹豫后正确 | "不错哦主人，虽然想了一下但还是答对了～" |
| 3 | 艰难正确 | "答对了但感觉有点吃力对吧？我会帮你加强复习的！" |
| 2 | 错误(觉得简单) | "没关系主人，这个知识点我们多练几次就好！" |
| 1 | 错误(有印象) | "有印象就是好的开始！下次一定能记住的！" |
| 0 | 完全不记得 | "别灰心主人！从头来过，我陪你一起！" |

### 11.4 Agent 记忆架构参考

| 参考来源 | 概念 | Med-Recallix 适配 |
|---------|------|-------------------|
| [CoPaw](https://github.com/agentscope-ai/CoPaw) SOUL.md | 核心身份定义 | `lib/agent/soul.ts` 硬编码 |
| CoPaw PROFILE.md | 用户画像 | KV `profile_{userId}` |
| CoPaw MEMORY.md | 长期记忆 | KV `memory_{userId}` |
| CoPaw memory/YYYY-MM-DD.md | 每日日志 | KV `episode_{userId}_{YYYYMMDD}` |
| CoPaw Compaction | 上下文压缩 | `lib/agent/compaction.ts` |
| CoPaw AGENTS.md | 行为规则 | `lib/agent/rules.ts` 硬编码 |
| CoPaw BOOTSTRAP.md | 首次引导 | 聊天页首次访问检测 profile 是否存在 |
| [OpenClaw](https://github.com/openclaw/openclaw) | 记忆架构灵感 | 层级式记忆 + 压缩 |
| [AgeMem (arXiv:2601.01885)](https://arxiv.org/abs/2601.01885) | 统一长短期记忆 | Agent 自主决定记忆写入 |

> 详见 6.5 节完整设计。

### 11.5 依赖清单

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "supermemo": "^2.0.0",
    "ai": "^5.0.0",
    "jose": "^5.0.0",
    "nanoid": "^5.0.0",
    "zod": "^3.23.0",
    "idb": "^8.0.0",
    "tailwindcss": "^4.0.0",
    "lucide-react": "latest",
    "dayjs": "^1.11.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
```
