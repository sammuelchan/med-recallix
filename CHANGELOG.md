# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Daily Quiz**: 修复答题跳题 bug — 提交答案后 currentIndex 提前推进导致题目切换
- **Daily Quiz**: 轮询替换 questions 数组导致正在答的题目发生变化

### Added
- **Daily Quiz**: 换一套题功能 (`/api/daily-quiz/regenerate`)，支持对不满意的题目重新生成
- **Daily Quiz**: AI 生成题目严格校验 — answer 必须匹配 options，丢弃无效题

### Changed
- **Daily Quiz**: 生成策略从"先 10 后补"升级为"首批 20 + COW 异步补全至 50"
- **Daily Quiz**: 前端采用三层防护架构 (displayIndex 分离 + lockedRef + isAnsweringRef)
- **Daily Quiz**: 轮询改为 append-only（不替换已有题目），并在答题期间暂停
- **Daily Quiz**: Timer 仅在题目加载完成后启动，避免无效重渲染
- **Daily Quiz**: 更新 DESIGN 文档，补充 COW 架构图和防跳题机制说明

### Performance
- 轮询增加 cancelled flag 防止组件卸载后 stale setState
- 题目总量从 20 提升至 50，支持更长的练习会话

---

- Project documentation: REQUIREMENT.md, DESIGN.md, TODO.md, DEPLOYMENT.md
- README with architecture overview, quick start, and deployment guide
- CONTRIBUTING.md with code style and commit conventions
- Agent memory architecture design (SOUL/PROFILE/MEMORY/EPISODIC/WORKING)
- SM-2 spaced repetition engine design
- AI quiz generation design (A1/A2 type questions)
- PWA support design
- EdgeOne Pages deployment architecture

### Planning Phase
- Requirements analysis completed (2026-04-02)
- Architecture design completed (2026-04-02)
- Task breakdown completed: 90 atomic tasks across 10 phases (2026-04-02)
