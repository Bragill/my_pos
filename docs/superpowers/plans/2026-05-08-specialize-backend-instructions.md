# Specialize Backend Instructions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the backend-specific `GEMINI.md` to avoid duplication and focus on backend-specific technical details.

**Architecture:** Update the existing documentation file to follow a specialized backend context template, removing global mandates that are now centralized.

**Tech Stack:** Markdown

---

### Task 1: Specialize Backend Instructions

**Files:**
- Modify: `D:\Project\POS\POS_Project\backend\GEMINI.md`

- [ ] **Step 1: Replace duplicated global content with specialized backend details**

Update the file to focus strictly on backend implementation details.

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

- [ ] **Step 3: Commit changes**

```bash
git add POS_Project/backend/GEMINI.md
git commit -m "docs: specialize backend GEMINI.md instructions"
```
