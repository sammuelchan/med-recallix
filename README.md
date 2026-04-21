<p align="center">
  <img src="docs/assets/logo-placeholder.png" alt="Med-Recallix Logo" width="120" />
</p>

<h1 align="center">Med-Recallix</h1>

<p align="center">
  <strong>医考记忆强化个人助手 — 基于遗忘曲线的智能复习系统</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#contributing">Contributing</a> •
  <a href="./docs/REQUIREMENT.md">Requirements</a> •
  <a href="./docs/DESIGN.md">Design Doc</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6.svg" />
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black.svg" />
  <img alt="EdgeOne" src="https://img.shields.io/badge/Deploy-EdgeOne%20Pages-00b4ff.svg" />
  <img alt="PWA" src="https://img.shields.io/badge/PWA-Installable-5a0fc8.svg" />
</p>

---

## Why Med-Recallix?

执业医师资格考试知识点体量庞大，备考者普遍面临 **"学了就忘"** 的困境。传统刷题 App 侧重题库堆砌，缺乏基于记忆科学的个性化复习调度。

Med-Recallix 通过 **SM-2 间隔重复算法**（基于 Ebbinghaus 遗忘曲线）智能安排复习节奏，搭配 **AI 学习伙伴**，帮助备考者高效记忆、科学复习、持续进步。

<p align="center">
  <em>📱 移动端优先 · 可安装到桌面 (PWA) · 边缘计算加速</em>
</p>

---

## Features

### MVP (v1.0)

| Feature | Description |
|---------|-------------|
| 🧠 **SM-2 间隔复习引擎** | 基于遗忘曲线自动调度复习时间，评分驱动间隔调整 |
| 📊 **复习仪表盘** | 一目了然今日待复习、逾期、已掌握数量 |
| 📚 **知识点管理** | 树状分类 (科目>系统>知识点) + 标签，支持 Markdown |
| 🤖 **AI 智能出题** | 根据知识点自动生成执业医师 A1/A2 型选择题 |
| ✍️ **做题 + 自评** | 答题、查看解析、自评记忆难度，驱动 SM-2 调度 |
| 🔐 **用户认证** | 用户名密码注册/登录，JWT 安全认证 |
| 🔔 **应用内提醒** | AI 伙伴语气督促复习，逾期知识点醒目提示 |
| 📱 **PWA 支持** | 可安装到手机桌面，离线缓存，standalone 模式 |

### Roadmap (v2.0)

| Feature | Description |
|---------|-------------|
| 💬 **AI 对话伙伴** | 学习伙伴对话、答疑解惑、流式输出 |
| 🧩 **Agent 记忆系统** | 五层记忆架构 (SOUL/PROFILE/MEMORY/EPISODIC/WORKING) |
| 📈 **学习统计** | 学习进度、记忆保持率、每日复习量图表 |
| 🔍 **知识点回溯** | 按时间线查看每次复习的评分和间隔变化 |

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org/) (App Router) |
| Language | [TypeScript](https://www.typescriptlang.org/) 5.x |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) |
| AI | [Vercel AI SDK](https://sdk.vercel.ai/) + [Kimi-for-coding](https://kimi.com/) (OpenAI compatible) |
| Spaced Repetition | [supermemo](https://github.com/VienDinhCom/supermemo) (SM-2 algorithm) |
| Auth | Web Crypto (PBKDF2) + [jose](https://github.com/panva/jose) (JWT) |
| Storage | EdgeOne KV (server) + IndexedDB (client cache) |
| Deployment | [Tencent EdgeOne Pages](https://pages.edgeone.ai/) |

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  EdgeOne CDN Edge Nodes                      │
│                                                             │
│  ┌────────────┐   ┌─────────────────┐   ┌───────────────┐  │
│  │ Static     │   │ Edge Functions   │   │ KV Storage    │  │
│  │ Assets     │   │ (API Routes)    │   │               │  │
│  │            │   │                 │   │ med_config    │  │
│  │ SSR/SSG   │   │ /api/auth/*     │   │ med_data      │  │
│  │ HTML/JS   │   │ /api/knowledge/*│   │               │  │
│  │ PWA       │   │ /api/cards/*    │   │ Users         │  │
│  │            │   │ /api/quiz/*     │   │ Knowledge     │  │
│  │            │   │ /api/chat/*     │   │ Cards/Deck    │  │
│  └────────────┘   └───────┬─────────┘   │ Memory        │  │
│                           │             └───────────────┘  │
│                           │ fetch                          │
│                           ▼                                │
│                   ┌───────────────┐                        │
│                   │ AI API        │                        │
│                   │ (Kimi/OpenAI) │                        │
│                   └───────────────┘                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    User Browser (PWA)                        │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ React    │  │ Service      │  │ IndexedDB             │ │
│  │ Mobile   │  │ Worker       │  │ (Offline Cache)       │ │
│  │ First UI │  │ (Cache)      │  │                       │ │
│  └──────────┘  └──────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

> For detailed architecture design, see [DESIGN.md](./docs/DESIGN.md).

### Agent Memory Architecture (v2.0)

```
Layer 1: SOUL        — Core identity & persona (read-only, hardcoded)
Layer 2: PROFILE     — User profile & preferences (KV persisted)
Layer 3: MEMORY      — Long-term facts & observations (KV persisted)
Layer 4: EPISODIC    — Daily learning logs (KV + auto-archive)
Layer 5: WORKING     — Context window assembly (ephemeral)
```

> Inspired by [CoPaw](https://github.com/agentscope-ai/CoPaw) memory architecture.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18.x
- [pnpm](https://pnpm.io/) >= 9.x
- An AI API key ([Kimi](https://kimi.com/) or any OpenAI-compatible provider)

### Local Development

```bash
# Clone the repository
git clone https://github.com/your-username/med-recallix.git
cd med-recallix

# Install dependencies
pnpm install

# Set up environment (AI API key placeholder for local dev)
cp .env.example .env.local

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AI_API_KEY` | AI model API key (local dev placeholder) | `sk-placeholder` |
| `AI_BASE_URL` | OpenAI-compatible API endpoint | `https://api.kimi.com/coding/v1` |
| `AI_MODEL` | Model name | `kimi-for-coding` |
| `JWT_SECRET` | JWT signing secret (auto-generated if not set) | random |

> **Production**: AI API keys are stored securely in EdgeOne KV storage, not in environment variables.

---

## Deployment

### Deploy to EdgeOne Pages

Med-Recallix is designed for deployment on [Tencent EdgeOne Pages](https://pages.edgeone.ai/).

#### Option 1: Git Integration (Recommended)

1. Fork this repository
2. Sign in to [EdgeOne Pages Console](https://edgeone.ai/pages)
3. Click **Create Project** → **Import Git Repository**
4. Select the forked repo
5. Build settings will auto-detect:
   - Build Command: `pnpm build`
   - Output Directory: `.next`
6. Click **Deploy**

#### Option 2: EdgeOne CLI

```bash
# Install EdgeOne CLI
npm install -g edgeone

# Deploy
edgeone deploy
```

### Post-Deployment Setup

After deploying, configure KV storage for production:

1. **Create KV Namespaces** in the EdgeOne console:
   - `med_config` — AI keys and system configuration
   - `med_data` — All business data (users, knowledge, cards)

2. **Bind Namespaces** to your project:
   - Variable `med_config` → namespace `med_config`
   - Variable `med_data` → namespace `med_data`

3. **Set AI API Key** in KV:
   - Navigate to `med_config` namespace → Create Record
   - Key: `ai_api_key`, Value: your API key
   - Key: `ai_base_url`, Value: `https://api.kimi.com/coding/v1`
   - Key: `ai_model`, Value: `kimi-for-coding`

> For detailed deployment architecture, see [Deployment Guide](./docs/DEPLOYMENT.md).

---

## Project Structure

```
med-recallix/
├── src/                              # All source code
│   ├── app/                          # Next.js App Router (routing layer)
│   │   ├── (auth)/                   # Auth pages (login, register)
│   │   ├── (app)/                    # Main app pages (with tab nav)
│   │   └── api/                      # API Route Handlers (Edge Runtime)
│   │
│   ├── modules/                      # Feature Modules (vertical slices)
│   │   ├── auth/                     # Authentication module
│   │   ├── knowledge/                # Knowledge point management
│   │   ├── review/                   # SM-2 spaced repetition engine
│   │   ├── quiz/                     # AI quiz generation
│   │   ├── chat/                     # [P1] AI dialogue
│   │   └── agent/                    # [P1] Agent memory system
│   │
│   ├── shared/                       # Shared infrastructure
│   │   ├── infrastructure/           # Server-side: KV, AI client, cache
│   │   ├── components/               # Shared UI (shadcn/ui + layout)
│   │   ├── hooks/                    # Shared React hooks
│   │   ├── lib/                      # Pure utility functions
│   │   └── types/                    # Global type definitions
│   │
│   └── middleware.ts                 # JWT auth middleware
│
├── public/                           # Static assets & PWA icons
├── scripts/                          # Ops scripts (KV seed, etc.)
└── docs/                             # Project documentation
```

> Each feature module (`src/modules/*`) is self-contained with its own service, schema, types, hooks, and components. Modules communicate through the routing layer, never directly importing each other's internals. See [DESIGN.md §3.2](./docs/DESIGN.md) for the full directory specification.

---

## Documentation

| Document | Description |
|----------|-------------|
| [系统技术架构](./docs/assets/architecture.html) | Architecture overview — layers, data flow, tech decisions |
| [功能模块详解](./docs/assets/modules.html) | Module deep dive — 6 modules, 14 APIs, relationships |
| [技术原理深度解析](./docs/assets/tech-deep-dive.html) | Tech deep dive — SM-2, AI agent memory, KV, security |
| [部署验收指南](./docs/html/deploy-acceptance.html) | Deploy acceptance — EdgeOne setup, 7 user journeys |
| [REQUIREMENT.md](./docs/REQUIREMENT.md) | Requirements specification — user stories, scope, edge cases |
| [DESIGN.md](./docs/DESIGN.md) | Technical design — architecture, data model, API, agent memory |
| [TODO.md](./docs/TODO.md) | Task breakdown — 90 atomic tasks with dependencies |
| [DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Deployment guide — EdgeOne Pages setup, KV configuration |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Contribution guidelines |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |

---

## Contributing

Contributions are welcome! Please read the [Contributing Guide](./CONTRIBUTING.md) before submitting a Pull Request.

### Development Workflow

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Commit Convention

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat:     New feature
fix:      Bug fix
docs:     Documentation only
style:    Code style (formatting, no logic change)
refactor: Code refactoring
test:     Adding or updating tests
chore:    Build process, dependencies, tooling
```

---

## License

Distributed under the MIT License. See [LICENSE](./LICENSE) for more information.

---

## Acknowledgements

- [SuperMemo 2 Algorithm](https://super-memory.com/english/ol/sm2.htm) — Spaced repetition foundation
- [CoPaw](https://github.com/agentscope-ai/CoPaw) — Agent memory architecture inspiration
- [EdgeOne Pages](https://pages.edgeone.ai/) — Edge computing deployment platform
- [shadcn/ui](https://ui.shadcn.com/) — Accessible UI components
- [Vercel AI SDK](https://sdk.vercel.ai/) — AI integration framework

---

<p align="center">
  Built with ❤️ for medical exam takers
</p>
