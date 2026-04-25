# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UIGen is an AI-powered React component generator with live preview. Users describe React components in natural language; Claude generates them in real-time into a virtual file system rendered in an iframe. It's a Next.js 15 full-stack application with optional user authentication.

## Commands

```bash
# Initial setup (install deps, generate Prisma client, run migrations)
npm run setup

# Development server (Turbopack, hot reload, port 3000)
npm run dev

# Run tests
npm run test

# Run a single test file
npm run test -- src/lib/__tests__/file-system.test.ts

# Lint
npm run lint

# Production build
npm run build

# Reset database
npm run db:reset

# Create a new Prisma migration
npx prisma migrate dev --name <migration_name>
```

## Environment

- `ANTHROPIC_API_KEY` — optional. Without it, the app uses a mock provider that returns static code.
- `JWT_SECRET` — defaults to a dev secret if unset.

## Architecture

### Data Flow

1. User sends a message via `ChatInterface` → POST `/api/chat`
2. The API route calls Claude (Haiku model) with a system prompt and the current virtual file system state
3. Claude responds with `streamText` and invokes tools (`str_replace_editor`, `file_manager`) to create/modify files
4. Tool calls update the `VirtualFileSystem` (in-memory, no disk writes) via `FileSystemContext`
5. `PreviewFrame` detects file changes, transforms JSX via Babel standalone, and rerenders the iframe using an import map

### Key Files

| File | Purpose |
|------|---------|
| `src/app/api/chat/route.ts` | Core AI endpoint — streams Claude responses, handles tool execution |
| `src/lib/file-system.ts` | `VirtualFileSystem` class — in-memory tree, no disk I/O |
| `src/lib/provider.ts` | Language model abstraction — Claude or mock (when no API key) |
| `src/lib/contexts/file-system-context.tsx` | React context for file system state; persists to DB when authenticated |
| `src/lib/contexts/chat-context.tsx` | Wraps Vercel AI SDK `useChat` hook |
| `src/lib/transform/jsx-transformer.ts` | JSX → JS transform + import map generation for iframe |
| `src/lib/prompts/generation.tsx` | System prompt that instructs Claude how to generate components |
| `src/lib/tools/str-replace.ts` | AI tool: file view/create/str_replace/insert operations |
| `src/lib/tools/file-manager.ts` | AI tool: rename/delete operations |
| `src/app/main-content.tsx` | Root UI — resizable panels (chat left, preview/editor right) |
| `src/components/preview/PreviewFrame.tsx` | Iframe renderer with Babel JSX transform |
| `src/components/editor/CodeEditor.tsx` | Monaco Editor integration |
| `src/actions/index.ts` | Server actions: signUp, signIn, signOut, getUser |
| `prisma/schema.prisma` | Data model: User, Project (messages + file system stored as JSON) |

### Virtual File System

All generated code lives in `VirtualFileSystem` — an in-memory tree. The AI tools read/write to it; changes are serialized to JSON and saved to the `Project.data` column. The entry point the preview looks for is `/App.jsx`, `/App.tsx`, `/index.jsx`, or `/index.tsx`. Import alias `@/` maps to the root `/`.

### Live Preview

`PreviewFrame` takes the virtual FS, finds the entry point, runs Babel standalone to transpile JSX, builds an ES module import map (React, React DOM, and all virtual files), and injects this into the iframe as a `<script type="module">`.

### Authentication

JWT sessions (7-day, HTTP-only cookie) with bcrypt password hashing. Anonymous users can generate components without signing in; projects are only persisted when authenticated. `AnonWorkTracker` warns users before losing unsaved work.

### Database

SQLite via Prisma. The `Project` model stores `messages` (chat history as JSON) and `data` (serialized virtual file system as JSON). Cascade delete removes projects when a user is deleted.

## Tech Stack

- **Framework:** Next.js 15, React 19, TypeScript
- **Styling:** Tailwind CSS v4, Shadcn UI (New York style, Lucide icons)
- **AI:** Claude Haiku via `@ai-sdk/anthropic` + Vercel AI SDK streaming + tool calling
- **Editor:** Monaco Editor
- **Database:** SQLite + Prisma ORM
- **Auth:** JWT + bcrypt
- **Testing:** Vitest + React Testing Library (jsdom)
- **Code Transform:** Babel standalone (in-browser JSX compilation)
