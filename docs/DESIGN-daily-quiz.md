# 每日智能练习 (Daily Smart Quiz) 技术设计文档

## 1. 概述

### 1.1 文档目的

本文档定义「每日智能练习」功能的技术架构、数据模型、API 设计和核心流程，供编码阶段严格遵循。

### 1.2 相关需求

- 关联需求：[REQUIREMENT-daily-quiz.md](./REQUIREMENT-daily-quiz.md)
- 关联主设计：[DESIGN.md](./DESIGN.md)

---

## 2. 技术选型

### 2.1 技术栈（复用现有）

| 类别 | 选择 | 理由 |
|------|------|------|
| 框架 | Next.js 16 App Router | 现有项目框架 |
| 存储 | EdgeOne KV | 现有存储方案 |
| AI 出题 | Vercel AI SDK + Kimi API | 复用 QuizService 模式 |
| 定时 | 客户端惰性触发（无 Cron） | EdgeOne 无 Cron 支持 |
| UI | Tailwind + shadcn/ui | 现有 UI 体系 |
| Toast/Bubble | Sonner + 自定义 BubbleReminder | 新增冒泡组件 |
| 状态管理 | React useState + localStorage Timer | 轻量方案 |

### 2.2 决策记录 (ADR)

| # | 决策 | 备选 | 选择理由 |
|---|------|------|----------|
| ADR-1 | 惰性生成（首次访问触发） | 外部 Cron 预生成 | 无额外依赖；EdgeOne 不支持 Cron |
| ADR-2 | COW 分批生成（首批 20 + 异步 COW 补全至 50） | 一次性生成50题 | 首屏可用时间 < 15s；COW 保证答题稳定性 |
| ADR-3 | Timer 存 localStorage | 服务端推送 | 无 WebSocket；PWA 局限 |
| ADR-4 | 错题权重存 KV Index | 实时计算 | 避免每次读全量错题数据 |
| ADR-5 | 复用 QuizService.generate 内核 | 新写 AI 调用 | 避免重复代码，Prompt 微调即可 |

---

## 3. 系统架构

### 3.1 模块划分

```
src/modules/daily-quiz/
├── index.ts                     # barrel exports
├── daily-quiz.types.ts          # 类型定义
├── daily-quiz.schema.ts         # Zod 校验
├── daily-quiz.service.ts        # 核心业务逻辑（生成/保存/查询）
├── daily-quiz.prompts.ts        # AI Prompt（错题变形）
├── daily-quiz.weight.ts         # 错题权重算法
└── components/
    ├── BubbleReminder.tsx       # 冒泡提醒组件
    ├── DailyQuizCard.tsx        # Dashboard 入口卡片
    └── DailyQuizReport.tsx      # 答题报告组件
```

```
src/app/
├── (app)/
│   └── daily-quiz/
│       ├── page.tsx             # 每日练习答题页
│       ├── audit/
│       │   └── page.tsx         # 生成审计日志页
│       └── report/
│           └── page.tsx         # 答题报告页
├── api/
│   └── daily-quiz/
│       ├── route.ts             # GET: 获取今日题目 / POST: 触发生成
│       ├── submit/
│       │   └── route.ts         # POST: 提交单题答案
│       ├── complete/
│       │   └── route.ts         # POST: 完成答题，生成报告
│       ├── regenerate/
│       │   └── route.ts         # POST: 换一套题（清除重新生成）
│       └── audit/
│           └── route.ts         # GET: 获取生成审计日志
```

### 3.2 依赖关系

```mermaid
graph TD
    subgraph "Pages (Client)"
        DashboardPage --> DailyQuizCard
        DailyQuizPage --> BubbleReminder
        DailyQuizPage --> DailyQuizReport
        StatsPage --> DailyQuizStats
    end

    subgraph "API Routes (Server)"
        API_DailyQuiz["/api/daily-quiz"]
        API_Submit["/api/daily-quiz/submit"]
        API_Complete["/api/daily-quiz/complete"]
    end

    subgraph "Service Layer"
        DailyQuizService --> QuizService
        DailyQuizService --> WeightCalculator
        DailyQuizService --> WrongAnswerService
        DailyQuizService --> ReviewService
        DailyQuizService --> KnowledgeService
    end

    subgraph "Infrastructure"
        KV[(EdgeOne KV)]
        AI[AI API]
    end

    API_DailyQuiz --> DailyQuizService
    API_Submit --> DailyQuizService
    API_Complete --> DailyQuizService
    DailyQuizService --> KV
    DailyQuizService --> AI
```

### 3.3 层次约束

| 层 | 可访问 | 不可访问 |
|---|--------|----------|
| Page (client) | API routes (fetch) | KV, Service 直接调用 |
| API Route (server) | Service, KV | 其他 API Route |
| Service | KV, AI, 其他 Service | Page |

---

## 4. 数据设计

### 4.1 KV Keys 扩展

在 `kv.keys.ts` 中新增：

```typescript
export const kvKeys = {
  // ... existing keys ...
  dailyQuiz: (userId: string, date: string) => `dq_${userId}_${date}`,
  dailyQuizProgress: (userId: string, date: string) => `dqp_${userId}_${date}`,
  dailyQuizResult: (userId: string, date: string) => `dqr_${userId}_${date}`,
  errorWeight: (userId: string) => `ew_${userId}`,
  quizCache: (userId: string) => `qc_${userId}`,
};
```

### 4.2 数据模型

```typescript
// ========== 每日题目集 ==========
interface DailyQuizSet {
  id: string;
  userId: string;
  date: string; // "YYYY-MM-DD"
  status: "generating" | "partial" | "ready" | "in_progress" | "completed";
  questions: DailyQuizQuestion[];
  totalCount: number;
  readyCount: number;
  generatedAt: string; // ISO datetime
  completedAt?: string;
}

interface DailyQuizQuestion {
  id: string;
  stem: string;
  options: QuizOption[]; // 复用 quiz.types.ts 的 QuizOption
  answer: string; // "A"|"B"|"C"|"D"|"E"
  explanation: string;
  sourceKpId: string;
  sourceType: "error_review" | "weak_area" | "new_coverage";
}

// ========== 答题进度 ==========
interface DailyQuizProgress {
  userId: string;
  date: string;
  currentIndex: number; // 当前做到第几题（0-based）
  answers: Record<string, string>; // questionId → userAnswer
  correctCount: number;
  startedAt: string;
  lastAnsweredAt: string;
}

// ========== 答题结果/报告 ==========
interface DailyQuizResult {
  userId: string;
  date: string;
  totalQuestions: number;
  correctCount: number;
  accuracy: number; // 0-100
  duration: number; // 秒
  weakCategories: { category: string; errorCount: number }[];
  errorKpIds: string[]; // 答错的知识点 ID 列表
  comparedToYesterday?: number; // 正确率变化
  streak: number; // 连续练习天数
  completedAt: string;
}

// ========== 错题权重索引 ==========
interface ErrorWeightIndex {
  userId: string;
  updatedAt: string;
  items: ErrorWeightItem[];
}

interface ErrorWeightItem {
  kpId: string;
  kpTitle: string;
  category: string[];
  errorCount: number;
  lastErrorDate: string;
  consecutiveCorrect: number;
  graduated: boolean;
  weight: number; // 计算后权重
}

// ========== 题目缓存池 ==========
interface QuizCachePool {
  userId: string;
  updatedAt: string;
  questions: CachedQuestion[]; // 最多 500 题
}

interface CachedQuestion {
  id: string;
  stem: string;
  options: QuizOption[];
  answer: string;
  explanation: string;
  sourceKpId: string;
  cachedAt: string;
}
```

### 4.3 数据生命周期

| 数据 | KV Key | 写入时机 | 清理策略 |
|------|--------|----------|----------|
| DailyQuizSet | `dq_{userId}_{date}` | 首次访问当日 | >7 天自动清理（先提取错题摘要） |
| DailyQuizProgress | `dqp_{userId}_{date}` | 每答一题 | >7 天自动清理（先提取错题摘要） |
| DailyQuizResult | `dqr_{userId}_{date}` | 答完全部题目 | 永久保留（体积小，用于统计） |
| ErrorWeightIndex | `ew_{userId}` | 每次答错/答对时更新 | 持续更新，清理时聚合历史错题 |
| QuizCachePool | `qc_{userId}` | 每次生成后缓存 | 滚动保留最新 500 题 |

**清理策略详述**：
- 触发时机：用户每日首次访问 `getTodayQuiz()` 时 fire-and-forget 执行
- 扫描范围：第 8 天 ~ 第 30 天（覆盖用户长时间不打开的情况）
- 清理内容：仅删除 QuizSet 和 Progress（大体积），保留 Result（小体积）
- 无需预提取摘要：错题信息在 submitAnswer 时已实时写入 ErrorWeightIndex（永久保留），清理时直接删除即可

### 4.4 存储预估

| 数据类型 | 单条大小 | 频率 | 7天累计 |
|----------|----------|------|---------|
| DailyQuizSet (50题) | ~50KB | 1/天 | ~350KB |
| DailyQuizProgress | ~5KB | 频繁更新 | 覆盖写 |
| DailyQuizResult | ~2KB | 1/天 | ~14KB |
| ErrorWeightIndex | ~10KB | 每次答题 | 覆盖写 |
| QuizCachePool | ~50KB | 渐增 | 上限 50KB |

单用户每日新增约 **57KB**，7 天约 **400KB**。

---

## 5. API 设计

### 5.1 接口列表

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/daily-quiz` | 获取今日题目集状态和题目 |
| POST | `/api/daily-quiz` | 触发生成今日题目（如果未生成） |
| POST | `/api/daily-quiz/submit` | 提交单题答案 |
| POST | `/api/daily-quiz/complete` | 完成答题，生成报告 |
| POST | `/api/daily-quiz/regenerate` | 换一套题（清除当日进度并重新生成） |
| GET | `/api/daily-quiz/audit` | 获取生成审计日志 |

### 5.2 接口详情

#### GET /api/daily-quiz

获取当日题目集状态。

**Request:** 无 body，cookie 认证

**Response:**
```typescript
// 成功
{
  success: true,
  data: {
    status: "generating" | "partial" | "ready" | "in_progress" | "completed";
    quiz: DailyQuizSet | null;
    progress: DailyQuizProgress | null;
    result: DailyQuizResult | null; // status=completed 时返回
  }
}
```

#### POST /api/daily-quiz

触发生成今日题目（幂等：已存在则返回现有）。

**Request:** 无 body

**Response:**
```typescript
{
  success: true,
  data: {
    status: "generating" | "partial" | "ready";
    quiz: DailyQuizSet;
  }
}
```

**逻辑：**
1. 检查 `dq_{userId}_{today}` 是否存在
2. 存在且 status ≠ "generating" → 直接返回
3. 不存在 → 同步生成首批 20 题（FIRST_BATCH）→ 写入 KV（status: "partial"）→ fire-and-forget 触发 continueGeneration
4. continueGeneration 使用 **Copy-on-Write**: 读取快照 → 副本上追加新题 → 原子写回 KV
5. 前端通过 3s 轮询 GET 发现 readyCount 增加时追加题目（append-only，不替换已有题目）

#### POST /api/daily-quiz/submit

提交单题答案。

**Request:**
```typescript
{
  questionId: string;
  answer: string; // "A"|"B"|"C"|"D"|"E"
}
```

**Response:**
```typescript
{
  success: true,
  data: {
    isCorrect: boolean;
    correctAnswer: string;
    explanation: string;
    progress: { currentIndex: number; correctCount: number; total: number };
  }
}
```

**逻辑：**
1. 读取 DailyQuizSet 获取正确答案
2. 判断对错
3. 更新 DailyQuizProgress
4. 如果答错 → 更新 ErrorWeightIndex
5. 如果答对 → 检查是否为之前的错题知识点，更新 consecutiveCorrect

#### POST /api/daily-quiz/complete

完成答题，生成报告。

**Request:** 无 body

**Response:**
```typescript
{
  success: true,
  data: DailyQuizResult
}
```

**逻辑：**
1. 读取 Progress + QuizSet
2. 计算正确率、用时、弱项分类
3. 获取昨日 Result 计算对比
4. 更新 DailyQuizSet status → "completed"
5. 写入 DailyQuizResult
6. 更新 EpisodeService.trackQuizScore（联动学习统计）
7. 将答错题目加入 QuizCachePool（供降级使用）

---

## 6. 核心流程

### 6.1 每日题目生成流程

```mermaid
sequenceDiagram
    participant User
    participant Page as DailyQuizPage
    participant API as /api/daily-quiz
    participant Service as DailyQuizService
    participant KV as EdgeOne KV
    participant AI as AI API

    User->>Page: 访问每日练习页
    Page->>API: GET /api/daily-quiz
    API->>Service: getTodayQuiz(userId)
    Service->>KV: kvGet(dailyQuiz(userId, today))
    
    alt 已有题目
        KV-->>Service: DailyQuizSet
        Service-->>API: { status, quiz, progress }
        API-->>Page: 展示题目
    else 无题目
        KV-->>Service: null
        Service-->>API: { status: null }
        API-->>Page: 需要生成
        Page->>API: POST /api/daily-quiz
        API->>Service: generateDailyQuiz(userId)
        Service->>Service: selectKnowledgePoints() [3层优先级]
        Service->>AI: generateText(prompt, 首批20题)
        AI-->>Service: 20 questions (校验后入库)
        Service->>KV: kvPut(dailyQuiz, {status:"partial", 20题})
        Service-->>API: { status: "partial", quiz }
        API-->>Page: 展示前20题，可开始答题
        
        Note over Service,KV: COW 异步续生 (fire-and-forget)
        Service->>KV: 读取快照 [COW: copy]
        Service->>AI: generateText(prompt, 续批30题)
        AI-->>Service: 30 questions
        Service->>Service: snapshot.push(new) [COW: modify copy]
        Service->>KV: kvPut(完整50题) [COW: atomic write]

        Note over Page,API: 前端 3s 轮询 (append-only)
        Page->>API: GET /api/daily-quiz (轮询)
        API-->>Page: readyCount 增加 → 追加题目(不替换)
        Page->>Page: lockedRef 保证当前题不变
    end
```

### 6.2 冒泡提醒流程（客户端）

```mermaid
sequenceDiagram
    participant User
    participant App as App Shell
    participant LS as localStorage
    participant Timer as setInterval

    User->>App: 打开任意页面
    App->>LS: 读取 dq_reminder_{date}
    
    alt 今日已做题 或 已弹满6次
        LS-->>App: { dismissed: true } 或 { count >= 6 }
        Note over App: 不弹窗
    else 需要提醒
        LS-->>App: { count: N, lastShown: T }
        App->>App: 检查距上次 ≥ 10min 且非夜间
        alt 满足条件
            App->>User: 展示 BubbleReminder
            App->>LS: count + 1, lastShown = now
        end
        App->>Timer: 启动 10min 定时检查
    end

    User->>App: 点击"开始做题"
    App->>LS: { dismissed: true }
    Timer->>Timer: 停止
    App->>App: router.push("/daily-quiz")
```

### 6.3 错题权重更新流程

```mermaid
sequenceDiagram
    participant Submit as POST /submit
    participant Service as DailyQuizService
    participant Weight as WeightCalculator
    participant KV as KV

    Submit->>Service: submitAnswer(userId, qId, answer)
    Service->>KV: get DailyQuizSet (验证答案)
    
    alt 答错
        Service->>KV: get ErrorWeightIndex
        Service->>Weight: incrementError(kpId)
        Weight->>Weight: errorCount++, consecutiveCorrect=0, graduated=false
        Weight->>Weight: recalcWeight()
        Service->>KV: put ErrorWeightIndex
    else 答对 且 kpId 在错题索引中
        Service->>KV: get ErrorWeightIndex
        Service->>Weight: incrementCorrect(kpId)
        Weight->>Weight: consecutiveCorrect++
        alt consecutiveCorrect >= 2
            Weight->>Weight: graduated = true, weight *= 0.3
        end
        Service->>KV: put ErrorWeightIndex
    end
```

---

## 7. 冒泡提醒组件设计

### 7.1 BubbleReminder 组件

```typescript
// Props
interface BubbleReminderProps {
  onStartQuiz: () => void;
}

// 内部状态管理（localStorage keys）
const STORAGE_KEY = "dq_reminder";
interface ReminderState {
  date: string;       // YYYY-MM-DD
  count: number;      // 已弹出次数
  lastShown: number;  // 上次弹出时间戳
  dismissed: boolean; // 今日是否已永久关闭
}
```

### 7.2 渲染规则

| 条件 | 行为 |
|------|------|
| dismissed = true | 不渲染 |
| count >= 6 | 不渲染 |
| 当前时间 22:00-07:00 | 不渲染 |
| 距上次弹出 < 10min | 不渲染 |
| 以上都不满足 | 渲染冒泡 |

### 7.3 UI 规格

- **位置**: `fixed bottom-20 left-1/2 -translate-x-1/2` (高于底部导航)
- **动画**: `animate-slide-up` + `animate-bounce-gentle` (Tailwind custom)
- **内容**: AI 伙伴头像(24px) + 文案 + "做题" Button + "×" 关闭
- **z-index**: 40 (低于 Dialog 的 50，高于底部导航)
- **文案**: 从文案池按 count 取对应文案

### 7.4 挂载位置

在 `src/app/(app)/layout.tsx` 中全局挂载 `<BubbleReminder />`，由组件内部判断是否显示。

---

## 8. 前端页面设计

### 8.1 路由规划

| 路由 | 页面 | 说明 |
|------|------|------|
| `/daily-quiz` | DailyQuizPage | 答题主页面 |
| `/daily-quiz/report` | DailyQuizReportPage | 答题完成报告 |

### 8.2 DailyQuizPage 状态机

```
初始 → [fetch GET /api/daily-quiz]
  │
  ├── status=null → 触发生成 → loading (骨架屏)
  ├── status=generating → loading (骨架屏 + 倒计时)
  ├── status=partial → 展示已有题目(≥20)，可开始答 + 后台轮询追加
  ├── status=ready → 展示全部题目(50题或降级后的最终数量)
  ├── status=in_progress → 从 progress.currentIndex 恢复(displayIndex同步)
  └── status=completed → redirect to /daily-quiz/report

答题中状态转换:
  展示第 N 题 → 用户选答案 → isAnsweringRef=true → submit → 显示反馈
    → 点"下一题" → lockedRef=null → displayIndex++ → 展示第 N+1 题
    → 若 N+1 >= readyCount 且 status=partial → 显示等待 UI + 轮询
    → 若 N+1 >= total 或 (N+1 >= readyCount 且 status=ready) → 完成
```

### 8.3 答题页组件结构

```
DailyQuizPage
├── Header (title="今日练习", left=返回, right=进度 "15/50")
├── Timer (计时器，右上角)
├── QuestionCard
│   ├── QuestionStem
│   └── OptionList (5个选项)
├── ProgressBar (底部进度条)
└── NavButtons (上一题 / 下一题)
```

### 8.4 Dashboard 集成

在 `/dashboard` 中现有 StatCard 网格后增加 `<DailyQuizCard />`：

```
DailyQuizCard (条件渲染)
├── 状态1: "今日练习已就绪 - 50道题等你挑战" + CTA
├── 状态2: "今日练习进行中 - 已完成 30/50" + 继续
├── 状态3: "今日练习已完成 ✓ - 正确率 78%" 
└── 状态4: "正在准备今日练习..." (生成中)
```

---

## 9. 错题权重算法实现

### 9.1 权重计算

```typescript
function calculateWeight(item: ErrorWeightItem): number {
  if (item.graduated) return item.errorCount * 0.3;

  const daysSinceError = daysBetween(item.lastErrorDate, today());
  const timeDecay = 1 / (1 + daysSinceError * 0.1);
  const importanceMultiplier = getImportanceMultiplier(item.kpId);

  return item.errorCount * timeDecay * importanceMultiplier;
}

function getImportanceMultiplier(kpId: string): number {
  // 基于 SM-2 card 的 efactor
  const card = getCardByKpId(kpId);
  if (!card) return 1;
  if (card.efactor < 1.5) return 2;
  if (card.efactor < 2.0) return 1.5;
  if (card.efactor > 2.5) return 0.5;
  return 1;
}
```

### 9.2 题目选择算法

```typescript
async function selectKnowledgePoints(userId: string): Promise<{
  errorReview: string[];  // 20 题的知识点
  weakArea: string[];     // 15 题的知识点
  newCoverage: string[];  // 15 题的知识点
}> {
  const [weights, cards, kpIndex] = await Promise.all([
    getErrorWeights(userId),
    getCardIndex(userId),
    getKnowledgeIndex(userId),
  ]);

  // 错题强化区: 按 weight 降序取 top-N (非毕业)
  const errorKps = weights.items
    .filter(w => !w.graduated && w.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10) // 最多 10 个知识点，每个出 2 题
    .map(w => w.kpId);

  // 薄弱知识区: efactor < 2.0 且 repetition >= 1
  const weakKps = cards
    .filter(c => c.efactor < 2.0 && c.repetition >= 1)
    .filter(c => !errorKps.includes(c.kpId))
    .sort((a, b) => a.efactor - b.efactor)
    .slice(0, 8) // 最多 8 个知识点
    .map(c => c.kpId);

  // 新知识区: 从未出现在 cards 中 或 repetition=0
  const coveredKpIds = new Set(cards.map(c => c.kpId));
  const newKps = kpIndex
    .filter(kp => !coveredKpIds.has(kp.id))
    .slice(0, 8)
    .map(kp => kp.id);

  return { errorReview: errorKps, weakArea: weakKps, newCoverage: newKps };
}
```

### 9.3 LRU 淘汰机制

ErrorWeightIndex 上限为 **100 条**，超出时按以下优先级淘汰：

| 优先级 | 淘汰对象 | 理由 |
|--------|----------|------|
| 1（最先淘汰） | `graduated = true` 的条目 | 已掌握，不再需要强化 |
| 2 | 最旧 + 最低权重的条目 | `score = weight × (1/daysSinceLastError)` 最低者 |

**合并更新**：相同知识点的错题不会产生新条目，而是累加 `errorCount` 并刷新 `lastErrorDate`。

### 9.4 出题比例与降级

| 区域 | 目标题数 | 知识点不足时 |
|------|----------|-------------|
| 错题强化 | 20 | 不足的分配给薄弱区 |
| 薄弱知识 | 15 | 不足的分配给新知识区 |
| 新知识 | 15 | 不足的从所有知识点随机抽取 |

---

## 10. AI Prompt 设计

### 10.1 标准出题 Prompt

复用现有 `quiz.prompts.ts` 的 `buildQuizPrompt`，参数微调：
- `count`: 按批次（10 / 20 / 20）
- `knowledgePoints`: 按区域筛选的知识点内容

### 10.2 错题变形 Prompt（新增）

```typescript
function buildErrorReviewPrompt(kpContent: string, previousQuestion: string): string {
  return `你是一位医学教育专家。基于以下知识点，请生成一道与之前题目不同角度的 A1 型选择题。

知识点内容：
${kpContent}

之前的题目（请换一个考查角度）：
${previousQuestion}

要求：
1. 从不同角度考查同一知识点（如之前考病因，这次考临床表现）
2. 5个选项(A-E)，只有一个正确答案
3. 干扰选项具有迷惑性但可区分
4. 提供简洁的解析说明

输出 JSON 格式：
{"stem":"题干","options":[{"label":"A","text":"选项A"},...],  "answer":"正确选项字母","explanation":"解析"}`;
}
```

---

## 11. 非功能设计

### 11.1 性能

| 场景 | 目标 | 方案 |
|------|------|------|
| 首批题目生成 | < 15s | 同步生成 20 题即返回，用户可立即开始 |
| 续批题目生成 | 30s (后台) | COW 异步补全，用户无感知 |
| 提交答案 | < 500ms | KV 读写 + 内存计算 |
| 题目切换 | 0ms 无延迟 | lockedQuestionRef 保证题目不跳动 |
| 冒泡弹出 | < 100ms | 纯客户端 localStorage |
| 轮询间隔 | 3s | 答题中暂停轮询 (isAnsweringRef) |

### 11.2 可靠性

| 故障场景 | 降级方案 |
|----------|----------|
| AI 生成失败 | 从 QuizCachePool 抽取历史题目 |
| AI 部分失败 | 展示已生成的题目，答完后自动结束 |
| AI 返回格式异常 | 严格校验 (answer ∈ options)，丢弃无效题 |
| KV 写入失败 | 客户端 localStorage 暂存，下次同步 |
| 进度丢失 | 每题提交时写入，最多丢失 1 题进度 |
| 续生成期间答题 | COW 保证读者看到稳定快照 |

### 11.3 答题稳定性架构 (防跳题)

采用三层防护保证答题过程中题目卡片不会发生跳动：

```
┌─────────────────────────────────────────────────────┐
│ 第 1 层: displayIndex 分离                           │
│  - displayIndex: 仅用户点"下一题"才递增              │
│  - currentIndex: 服务端 progress (提交答案后更新)    │
│  → 提交答案不会改变展示的题目                        │
├─────────────────────────────────────────────────────┤
│ 第 2 层: lockedQuestionRef                          │
│  - 题目展示后锁定在 ref 中                          │
│  - state.questions 数组变化不影响正在展示的题         │
│  → 轮询追加新题不影响当前展示                        │
├─────────────────────────────────────────────────────┤
│ 第 3 层: isAnsweringRef + 轮询暂停                  │
│  - 用户选择答案后标记 isAnswering=true               │
│  - 轮询检测到标记则跳过本轮请求                      │
│  → 答题过程中完全无外部干扰                          │
└─────────────────────────────────────────────────────┘
```

### 11.4 COW (Copy-on-Write) 生成策略

```
后台续生成期间:
  1. COPY:  snapshot = [...currentQuestions]   (读取不加锁)
  2. WRITE: snapshot.push(...newBatch)         (修改副本)
  3. SWAP:  kvPut(quizSet with snapshot)       (原子替换)

读者(答题用户):
  - 轮询发现 readyCount 增大时，仅 append 新题到本地数组
  - 不替换已有题目引用 → 不触发 lockedRef 重新锁定
```

### 11.3 安全

- 所有 API 路由需 `getUserId(req)` 认证
- 题目答案在 submit 时才返回（不提前暴露）
- 错误权重只属于当前用户（userId 隔离）

---

## 12. 风险与约束

| 风险 | 影响 | 概率 | 缓解 |
|------|------|------|------|
| AI 生成慢 (>30s) | 用户等待体验差 | 中 | 分批 + 缓存池降级 |
| KV 存储增长 | 接近 1GB 限额 | 低 | 7天自动过期 + 用户少 |
| 知识点太少 | 无法凑满 50 题 | 中 | 动态调整题数，最少 10 题 |
| 前端 Timer 不准 | 冒泡间隔偏差 | 低 | 基于时间戳比较而非 setTimeout |

---

## 13. 与现有模块的集成点

| 模块 | 集成方式 |
|------|----------|
| `quiz` | 复用 `QuizService.generate` 的 AI 调用模式和 Prompt 构建 |
| `exam/wrong-answers` | 读取 `WrongAnswerService.getIndex` 获取已有错题 |
| `review` | 读取 `ReviewService.getCardIndex` 获取 efactor/repetition |
| `knowledge` | 读取 `KnowledgeService.getIndex/get` 获取知识点内容 |
| `agent/episode` | `EpisodeService.trackQuizScore` 记录每日得分 |
| Dashboard | 新增 `DailyQuizCard` 组件嵌入 |
| Stats | 新增每日练习统计板块 |
| Layout | 全局挂载 `BubbleReminder` |

---

## 14. 附录

### 14.1 文案池常量

```typescript
export const REMINDER_MESSAGES = [
  "主人，今天的50道题已经准备好啦~ 趁热做吧！",
  "主人，要不先做10道？只需5分钟~",
  "今天的题目里有你上次的易错点哦，来挑战一下？",
  "坚持每天练习的人，通过率提升30%呢！加油~",
  "最后一次提醒啦~ 主人今天要做练习吗？",
  "好的主人，今天不打扰了。明天继续加油！",
] as const;

export const STREAK_MESSAGE = (n: number) =>
  `主人已经连续练习${n}天了！今天也来保持记录吧~`;

export const IMPROVEMENT_MESSAGE = (pct: number) =>
  `昨天正确率${pct}%，今天一定能更好！冲~`;
```

### 14.2 Tailwind 动画扩展

```css
/* tailwind.config 中新增 */
@keyframes slide-up {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes bounce-gentle {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}
```

---

## 15. 用户旅程文案记录

### 15.1 答题页面各状态文案

| 状态 | 页面元素 | 文案 |
|------|---------|------|
| 生成中 | spinner | "AI 正在为你准备题目..." |
| 生成中 | 副标题 | "预计 10-15 秒" |
| 等待更多题目 | spinner | "已完成 {N} 题，正在准备更多题目..." |
| 等待更多题目 | 副标题 | "已生成 {ready}/{total} 题，请稍候" |
| 暂无题目 | 提示 | "暂无题目" + "返回" 链接 |
| 选中未提交 | 按钮 | "确认提交" |
| 提交中 | 按钮 | spinner + "提交中..." |
| 答对 | 反馈面板 | "✓ 回答正确！" |
| 答错 | 反馈面板 | "✗ 回答错误" |
| 反馈来源标签 | badge | "来源: 知识点QA" / "来源: AI生成" / "来源: 题库" |
| 问题反馈 | 按钮 | "报告问题" |
| 反馈已发 | 提示 | "已收到反馈，感谢！" |
| 下一题 | 按钮 | "下一题" |
| 最后一题 | 按钮 | "查看报告" |
| 生成报告中 | 按钮 | spinner + "正在生成报告..." |
| 完成失败 | 错误提示 | "提交失败，请重试" |
| 完成失败 | 重试按钮 | "重试提交" |

### 15.2 倒计时状态文案

| 状态 | 颜色 | 格式 | 示例 |
|------|------|------|------|
| 正常 (>5min) | 灰色 | MM:SS | 73:28 |
| 即将超时 (≤5min) | 橙色加粗 | MM:SS | 04:12 |
| 已超时 | 红色加粗 | -MM:SS | -02:30 |
| 超时横幅 | 红色背景 | 文字 | "考试时间已到，你仍可继续作答，但超时部分不计入模拟成绩" |

### 15.3 换题确认弹窗

| 元素 | 文案 |
|------|------|
| 标题 | "确认换一套题？" |
| 说明 | "当前答题进度将清零，系统会重新为你生成一套新题目。" |
| 取消按钮 | "取消" |
| 确认按钮 | "确认换题" |

### 15.4 报告页面文案

| 元素 | 文案 |
|------|------|
| Hero | "🎉 今日练习完成！" |
| 正确率 | "{N}%" / "正确率" |
| 用时 | "{M}分{S}秒" / "用时" |
| 答对 | "{N}" / "答对" |
| 答错 | "{N}" / "答错" |
| 总题数 | "{N}" / "总题数" |
| 连续天数 | "连续 {N} 天" |
| 比昨天 | "比昨天 +{N}%" / "比昨天 {N}%" |
| 薄弱科目 | "{科目名}" / "{N} 题错" |
| 返回 | "返回首页" |
| 统计 | "查看统计" |

### 15.5 完整用户旅程流

```
┌─────────────┐
│  Dashboard   │ ← DailyQuizCard 入口
│  "开始今日练习" │
└──────┬──────┘
       ▼
┌──────────────┐
│   生成题目    │ ← POST /api/daily-quiz
│  "AI 准备中..." │ ← 首批 20 题 ~10-15s
└──────┬───────┘
       ▼
┌──────────────────────────────────────┐
│   答题循环 (1/50 → 50/50)            │
│                                       │
│  ① 展示题干 + ABCDE 选项             │
│  ② 选择 → 蓝色高亮 (可换选)          │
│  ③ 「确认提交」→ 核对答案              │
│  ④ 绿色/红色反馈 + 解析               │
│  ⑤ 「下一题」→ 进入下一题             │
│                                       │
│  右上角: 倒计时 75:00 → 00:00 → -XX:XX │
│  底部: 进度条 (N/50)                   │
│                                       │
│  [超时横幅] "考试时间已到..."           │
│  [等待画面] "正在准备更多题目..."       │
└──────┬───────────────────────────────┘
       ▼ (第50题答完)
┌──────────────┐
│  「查看报告」  │ ← POST /api/daily-quiz/complete
│  "正在生成报告..." │
└──────┬───────┘
       ▼
┌──────────────┐
│   答题报告    │ ← 正确率、用时、薄弱科目
│  "🎉 今日练习完成！"│
│  "返回首页" "查看统计" │
└──────────────┘
```
