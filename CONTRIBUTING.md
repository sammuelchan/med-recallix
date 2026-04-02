# Contributing to Med-Recallix

Thank you for your interest in contributing to Med-Recallix! This document provides guidelines and information for contributors.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How to Contribute

### Reporting Bugs

1. Check existing [Issues](https://github.com/your-username/med-recallix/issues) to avoid duplicates
2. Create a new issue using the **Bug Report** template
3. Include:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Screenshots (if applicable)
   - Device/browser information

### Suggesting Features

1. Check existing issues and the [Roadmap](#roadmap)
2. Create a new issue using the **Feature Request** template
3. Describe the use case and expected behavior

### Submitting Code

#### Setup

```bash
# Fork and clone
git clone https://github.com/your-username/med-recallix.git
cd med-recallix

# Install dependencies
pnpm install

# Create a branch
git checkout -b feature/your-feature-name
```

#### Development

```bash
# Start dev server
pnpm dev

# Run linter
pnpm lint

# Type check
pnpm type-check
```

#### Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style (formatting, no logic change) |
| `refactor` | Code refactoring |
| `test` | Adding or updating tests |
| `chore` | Build process, dependencies, tooling |

**Examples:**

```
feat(quiz): add A2 question type support
fix(sm2): correct interval calculation for grade 0
docs(readme): update deployment instructions
refactor(kv): extract key builder utility
```

#### Pull Request Process

1. Update documentation if needed
2. Ensure `pnpm lint` and `pnpm type-check` pass
3. Write a clear PR description explaining:
   - What changes were made
   - Why the changes were needed
   - How to test the changes
4. Reference related issues (e.g., `Closes #123`)

## Architecture Guidelines

### Directory Structure

All source code lives under `src/`. The codebase is organized into three layers:

| Layer | Path | Responsibility |
|-------|------|---------------|
| **Routing** | `src/app/` | Route mapping, page composition, API entry validation |
| **Modules** | `src/modules/` | Feature-specific business logic, components, hooks |
| **Shared** | `src/shared/` | Cross-cutting infrastructure, UI primitives, utilities |

### Feature Module Convention

Each module in `src/modules/{feature}/` follows:

```
{feature}/
├── index.ts              # Barrel export (sole entry point)
├── {feature}.service.ts  # Business logic (server-side, no React)
├── {feature}.schema.ts   # Zod input validation
├── {feature}.types.ts    # Module-specific types
├── use-{feature}.ts      # React Hook (client state)
└── components/           # Module-specific UI components
```

### Dependency Rules

- ✅ `app/` → `modules/`, `shared/`
- ✅ `modules/` → `shared/`
- ❌ `modules/A` → `modules/B` (modules never import each other)
- ❌ `shared/` → `modules/`
- ❌ `shared/infrastructure/` in client components (server-only)

### Code Style

- TypeScript strict mode
- Functional components with hooks
- Server Components by default, `'use client'` only when needed
- All API routes use Edge Runtime (`export const runtime = 'edge'`)
- API routes stay **thin**: validate → call service → return response
- KV operations go through `shared/infrastructure/kv/`
- Import via path aliases: `@/modules/*`, `@/shared/*`

### Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Feature module files | `{feature}.{role}.ts` | `review.service.ts`, `quiz.schema.ts` |
| Component files | kebab-case | `review-card.tsx`, `rating-buttons.tsx` |
| React components | PascalCase | `ReviewCard` |
| Service classes | PascalCase + `Service` | `KnowledgeService` |
| Functions | camelCase | `buildContext` |
| Constants | UPPER_SNAKE_CASE | `AGENT_SOUL` |
| Types/Interfaces | PascalCase | `KnowledgePoint` |
| KV key builders | camelCase function | `kvKeys.knowledgeIndex(userId)` |
| Hooks | `use-{name}.ts` | `use-review.ts` |

## Project Documentation

| Document | Purpose |
|----------|---------|
| [REQUIREMENT.md](./docs/REQUIREMENT.md) | What to build |
| [DESIGN.md](./docs/DESIGN.md) | How to build it |
| [TODO.md](./docs/TODO.md) | Task breakdown |
| [DEPLOYMENT.md](./docs/DEPLOYMENT.md) | How to deploy |

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
