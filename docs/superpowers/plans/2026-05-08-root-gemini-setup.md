# Root GEMINI.md Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a unified root `GEMINI.md` file to centralize project-wide standards, active skills, and MCP protocols, and specialize the existing backend instructions.

**Architecture:** A hierarchical instruction set where the root file defines global mandates, while subdirectories (like `backend/`) contain specific technical overrides.

**Tech Stack:** Markdown (GitHub Flavored)

---

### Task 1: Create Root GEMINI.md

**Files:**
- Create: `D:\Project\POS\GEMINI.md`

- [ ] **Step 1: Write the root GEMINI.md content**
Create the file with the following content:
```markdown
# 🛒 POS Project - Global Context

## 🌟 Global Mandates & Active Skills
Always behave as if the following skills are activated:
- `obsidian-markdown`: For high-quality documentation in our vault.
- `gitnexus-impact-analysis`: Mandatory before any structural change.
- `tech-debt-tracker`: To monitor and remediate legacy patterns.
- `karpathy-guidelines`: Ensures surgical, minimalist code changes.
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
- `POS_Project/backend`: Express API & Business Logic.
- `POS_Project/frontend`: React PWA & UI.
```

- [ ] **Step 2: Verify file creation**
Run: `ls D:\Project\POS\GEMINI.md`
Expected: File exists.

---

### Task 2: Specialize Backend Instructions

**Files:**
- Modify: `D:\Project\POS\POS_Project\backend\GEMINI.md`

- [ ] **Step 1: Replace duplicated global content with specialized backend details**
Update the file to focus strictly on backend implementation details:
```markdown
# 🚀 POS Backend - Implementation Context

## 🏗️ Technical Stack
- **Runtime**: Node.js (Express)
- **Database**: SQLite (Local) -> PostgreSQL (Production Migration Target)
- **Auth**: PIN-based (BCrypt)
- **Core Helper**: `src/database/dbHelper.js`

## 🧩 Backend Protocol
- **AI Integration**: Internal tools live in `src/ai_tools`.
- **Validation**: Ensure `test_api.js` or equivalent passes after changes.
- **Standards**: Follow the modular route/controller/service pattern.

## 🔗 Global Reference
Refer to the root `GEMINI.md` for active skills, global mandates, and MCP protocol.
```

- [ ] **Step 2: Verify backend instruction update**
Run: `cat D:\Project\POS\POS_Project\backend\GEMINI.md`
Expected: Content matches the specialized version above.
