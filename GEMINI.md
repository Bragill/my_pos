# 🛒 POS Project - Global Context

## 🌟 Global Mandates & Active Skills
Always behave as if the following skills are activated:
- `obsidian-markdown`: For high-quality documentation in our vault.
- `gitnexus-impact-analysis`: Mandatory before any structural change.
- `tech-debt-tracker`: To monitor and remediate legacy patterns.
- `karpathy-guidelines`: Ensures surgical, minimalist code changes.
- `ponytail`: Lazy senior developer mode. Minimal code, YAGNI, shortest working diff.
- `test-driven-development`: Mandatory for all new features and bug fixes.
- `brainstorming`: Required for all non-trivial feature requests.

## 🛠️ MCP Tooling Protocol
Use these tools to gather information and validate logic:
- **Internal (`pos-ai-bridge`)**:
    - `check_inventory`: Stock lookups and low-stock alerts.
    - `get_sales_insights`: Revenue reports and top product analytics.
    - `analyze_impact`: Use before changing product prices or quantities.
- **General**:
    - `sqlite`: Raw data verification (Local: `POS_Project/backend/pos_system.db`).
    - `tree-sitter`: Architectural mapping and symbol lookups.

## 🏗️ Project-Wide Standards
- **Development Lifecycle**: Follow Research -> Strategy -> Execution.
- **Documentation**: Use `docs/superpowers/` for all specs and plans.
- **Deployment**: Targeted at Oracle Cloud Always Free (ARM Ampere A1).

## 📁 Workspace Structure
- `POS_Project/backend`: Express API running on Cloudflare Workers & Cloudflare D1.
- `POS_Project/frontend`: React PWA & UI (Vite dev server on port 5174).

## ☁️ Cloudflare Workers Backend Mandate (STRICT)
- **Primary Runtime (100% Cloudflare Workers)**: The production backend runs 100% on **Cloudflare Workers** (`https://pos-backend.bragill2012.workers.dev`) with **Cloudflare D1** (`fee1af59-5f26-48d2-8068-bf997f7da322`) and **R2** storage.
- **NO LOCAL BACKEND EXECUTION**:
  - **NEVER** run local backend commands (e.g., `npm run dev` in backend, `node src/server.js`, `nodemon`, or local processes on port 3000/3001/8787).
  - The local machine runs **ONLY** the Frontend Vite server (port 5174), which proxies all `/api` calls straight to the Cloudflare Worker.
- **Fallback & Recovery Protocol**:
  - Running a local backend process is **STRICTLY PROHIBITED** except when Cloudflare Workers is completely down, broken, or unreachable.
  - Once the Cloudflare Worker issue is resolved or restored:
    1. Re-deploy to Cloudflare Workers immediately: `cd POS_Project/backend && npx wrangler deploy`
    2. Immediately kill/terminate any local backend processes (port 3000/3001) to keep the local machine clean.

## 🐴 Ponytail Mode (Lazy Senior Dev)
Before writing any code, stop at the first rung that holds:
1. **YAGNI**: Does this need to be built at all?
2. **Reuse**: Does it already exist in this codebase? Reuse the helper/util.
3. **Stdlib**: Does the standard library/native platform already do this?
4. **Existing Deps**: Does an installed dependency solve it?
5. **One-liner**: Can this be one line?
6. **Minimum Code**: Write the minimum code that works. Deletion over addition. Shortest working diff wins.

