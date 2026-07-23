---
name: fullstack-developer
description: >
  Builds modern TypeScript web applications end to end — React/Next.js frontends, Node API
  routes, and database access — with type-safe validation and sensible architecture. Activates
  when building a web app, API, frontend, or data model, or when React, Next.js, Express,
  REST/GraphQL, Prisma, PostgreSQL, or MongoDB are in scope. Owns web/full-stack work. Does not
  own pure-Python code, the test-first workflow, or language-agnostic service contracts.
license: MIT
metadata:
  author: awesome-llm-apps (adapted for this library)
  version: "1.1.0"
  last_updated: 2026-07-02
  category: coding
---

# Full-Stack Developer

## Overview

Delivers working TypeScript web features across frontend, API, and database with types and
validation at every boundary. Assumes the model already knows React/Node syntax — this skill
supplies the conventions, structure, and gotchas that make the result production-shaped.

**Freedom level: MEDIUM** — defaults below are recommended; adapt to the project's stack.

**Project binding.** Prefer the stack in `${ctx.tech_bindings}` (e.g. DB, cache, hosting) when
`.agents/project-context.yaml` defines it; otherwise use the defaults here.

## When to Activate

Activate when:
- Building a web app/feature, REST or GraphQL API, or React/Next.js UI.
- Designing data models or wiring a database/ORM into a web app.

**Do not activate** (adjacent skills own this):
- `python-expert` — owns non-web Python code quality.
- `typed-service-contracts` — owns the spec/handler + Result pattern for core logic.
- `tdd-red-green-refactor` — owns the failing-test-first loop.

## Default Stack (override per project)

Frontend: React + Next.js (App Router), TypeScript, Tailwind, React Query for server state.
Backend: Next.js API routes or Express/Fastify, Zod validation, JWT/OAuth auth.
Data: PostgreSQL + Prisma (type-safe ORM); Redis for cache/sessions. Deploy: Vercel or Docker + CI.

## Conventions

- **Validate at the boundary**: parse every request body/params with Zod before use; return
  structured errors with correct HTTP status codes.
- **Types across the wire**: share types between client and server; never `any` at API edges.
- **Server vs client state**: server data via React Query; local UI state via hooks/Zustand —
  don't cache server data in React state.
- **DB discipline**: parameterised queries only; index hot columns; avoid N+1 (use
  includes/joins); wrap related writes in a transaction.

## Output Template

When delivering a feature, provide: (1) file locations, (2) complete typed code, (3) required
dependencies, (4) env vars, (5) run/migrate steps. Example (Next.js API route with Zod):

```typescript
// app/api/posts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const CreatePost = z.object({ title: z.string().min(1).max(200), content: z.string().min(1), authorId: z.string() });

export async function POST(req: NextRequest) {
  const parsed = CreatePost.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", details: parsed.error.issues }, { status: 400 });
  const post = await db.post.create({ data: parsed.data, include: { author: true } });
  return NextResponse.json(post, { status: 201 });
}
```

## Guidelines

1. Every API input is schema-validated before use; errors return typed responses + correct status.
2. No `any` at client/server boundaries; share types.
3. Parameterised DB access; transactions for multi-write operations.
4. Handle loading and error states in every data-fetching component.

## Gotchas

1. **`use client` boundaries**: hooks/state/event handlers require a client component; forgetting
   `"use client"` throws at build. Keep server components for data fetching, push interactivity down.
2. **Zod `parse` vs `safeParse`**: `parse` throws; at API edges prefer `safeParse` and branch, so
   one bad request doesn't 500.
3. **Prisma connections in serverless**: instantiate a single `PrismaClient` (global singleton) —
   per-request clients exhaust the connection pool.
4. **Secrets in client bundles**: only `NEXT_PUBLIC_*` env vars reach the browser; never read
   private secrets in client components.
5. **N+1 via lazy relations**: fetch relations with `include`/`select`, not per-row queries.

## Integration

- `typed-service-contracts` — put fragile business logic behind parsed specs + Result types.
- `python-expert` — when part of the backend is Python.
- `tdd-red-green-refactor` — drive features test-first.

## References

- Best practices: https://agentskills.io/skill-creation/best-practices
