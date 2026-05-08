# Graph Report - .  (2026-05-08)

## Corpus Check
- 109 files · ~79,528 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 671 nodes · 948 edges · 63 communities (38 shown, 25 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Frontend UI Components|Frontend UI Components]]
- [[_COMMUNITY_Backend API Test Suite|Backend API Test Suite]]
- [[_COMMUNITY_Service Worker & OCR Providers|Service Worker & OCR Providers]]
- [[_COMMUNITY_AI Tools Framework|AI Tools Framework]]
- [[_COMMUNITY_Workbox Precache Strategy|Workbox Precache Strategy]]
- [[_COMMUNITY_Backend Config & DB Layer|Backend Config & DB Layer]]
- [[_COMMUNITY_Workbox Cache Management|Workbox Cache Management]]
- [[_COMMUNITY_Auth Middleware & Routes|Auth Middleware & Routes]]
- [[_COMMUNITY_OCR Controller|OCR Controller]]
- [[_COMMUNITY_Reports Route|Reports Route]]
- [[_COMMUNITY_Orders Route|Orders Route]]
- [[_COMMUNITY_D1 Database Helper|D1 Database Helper]]
- [[_COMMUNITY_Error Handler Middleware|Error Handler Middleware]]
- [[_COMMUNITY_Data Export Utility|Data Export Utility]]
- [[_COMMUNITY_OCR Repository|OCR Repository]]
- [[_COMMUNITY_Workbox Precache Controller|Workbox Precache Controller]]
- [[_COMMUNITY_Auth Route|Auth Route]]
- [[_COMMUNITY_Stores Route|Stores Route]]
- [[_COMMUNITY_Products Route|Products Route]]
- [[_COMMUNITY_S3 Storage Service|S3 Storage Service]]
- [[_COMMUNITY_Workbox Router|Workbox Router]]
- [[_COMMUNITY_Sales Route|Sales Route]]
- [[_COMMUNITY_Debtors Route|Debtors Route]]
- [[_COMMUNITY_Users Route|Users Route]]
- [[_COMMUNITY_PIN Auth & UI Screenshots|PIN Auth & UI Screenshots]]
- [[_COMMUNITY_Force Migration Utility|Force Migration Utility]]
- [[_COMMUNITY_Customers Route|Customers Route]]
- [[_COMMUNITY_MCP Server|MCP Server]]
- [[_COMMUNITY_Inventory Route|Inventory Route]]
- [[_COMMUNITY_Workbox Router Registration|Workbox Router Registration]]
- [[_COMMUNITY_PWA Icon Generator|PWA Icon Generator]]
- [[_COMMUNITY_PIN Hash Migration|PIN Hash Migration]]
- [[_COMMUNITY_Workbox Precache Registration|Workbox Precache Registration]]
- [[_COMMUNITY_Database Seeding|Database Seeding]]
- [[_COMMUNITY_OCR Migration|OCR Migration]]
- [[_COMMUNITY_Workbox Navigation Route|Workbox Navigation Route]]
- [[_COMMUNITY_PIN Test Utility|PIN Test Utility]]
- [[_COMMUNITY_SQLite Test Utility|SQLite Test Utility]]
- [[_COMMUNITY_Simulate Request Utility|Simulate Request Utility]]
- [[_COMMUNITY_Login Diagnostics|Login Diagnostics]]
- [[_COMMUNITY_Admin PIN Reset|Admin PIN Reset]]
- [[_COMMUNITY_Full Flow Test|Full Flow Test]]
- [[_COMMUNITY_Login API Test|Login API Test]]
- [[_COMMUNITY_Login Repro Test|Login Repro Test]]
- [[_COMMUNITY_Schema Check Utility|Schema Check Utility]]
- [[_COMMUNITY_DB Debug Utility|DB Debug Utility]]
- [[_COMMUNITY_Multistore Migration|Multistore Migration]]
- [[_COMMUNITY_Simulate Products Utility|Simulate Products Utility]]
- [[_COMMUNITY_Database Migration|Database Migration]]
- [[_COMMUNITY_DB Fix Utility|DB Fix Utility]]
- [[_COMMUNITY_DB Health Check|DB Health Check]]
- [[_COMMUNITY_Bcrypt Test|Bcrypt Test]]
- [[_COMMUNITY_Workbox Error Handler|Workbox Error Handler]]
- [[_COMMUNITY_Workbox Install Reporter|Workbox Install Reporter]]
- [[_COMMUNITY_Workbox Cache Key Plugin|Workbox Cache Key Plugin]]
- [[_COMMUNITY_Workbox Precache Route|Workbox Precache Route]]
- [[_COMMUNITY_Workbox Regex Route|Workbox Regex Route]]
- [[_COMMUNITY_Workbox Deferred Promise|Workbox Deferred Promise]]
- [[_COMMUNITY_HTML Entry Point|HTML Entry Point]]
- [[_COMMUNITY_Hermes Agent SSL Error|Hermes Agent SSL Error]]

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 17 edges
2. `authenticate()` - 15 edges
3. `StrategyHandler` - 14 edges
4. `POS Project Global GEMINI Context` - 14 edges
5. `AppError` - 13 edges
6. `PrecacheController` - 13 edges
7. `formatCurrency()` - 13 edges
8. `ocrService` - 12 edges
9. `Router` - 11 edges
10. `authorize()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `UI: POS terminal with success toast "เข้าสู่ระบบสำเร็จ"` --conceptually_related_to--> `POST /api/auth/pin-login (documented)`  [INFERRED]
  login-after.png → POS_Project/README.md
- `UI: PIN-pad login screen (4-digit pad, gradient bg)` --conceptually_related_to--> `POST /api/auth/pin-login (documented)`  [INFERRED]
  login-initial.png → POS_Project/README.md
- `POS Login Screen (PIN Code Entry UI)` --conceptually_related_to--> `PIN-based Authentication (BCrypt)`  [INFERRED]
  login-initial.png → POS_Project/backend/GEMINI.md
- `POS Settings - Add User Modal with PIN Code Input` --conceptually_related_to--> `PIN-based Authentication (BCrypt)`  [INFERRED]
  settings-pin-test.png → POS_Project/backend/GEMINI.md
- `POS Login Screen (PIN Code Entry UI)` --conceptually_related_to--> `React PWA Frontend`  [INFERRED]
  login-initial.png → POS_Project/README.md

## Hyperedges (group relationships)
- **PIN login flow (UI → API → DB)** — img_login_pin_pad, readme_pin_login_endpoint, img_login_after_toast, rationale_pin_4digit_invariant [INFERRED 0.85]
- **POS System Full Tech Stack** — backend_express_api, backend_sqlite_db, frontend_react_pwa, offline_indexeddb, backend_pin_auth [EXTRACTED 1.00]
- **Global Mandatory Skills for POS Project** — skill_obsidian_markdown, skill_gitnexus_impact_analysis, skill_tech_debt_tracker, skill_karpathy_guidelines, skill_tdd, skill_brainstorming [EXTRACTED 1.00]
- **Hierarchical GEMINI Instruction File Set** — gemini_pos_project_global_context, backend_gemini_implementation_context, plan_root_gemini_setup, plan_specialize_backend [EXTRACTED 1.00]
- **POS Application UI Screens** — image_login_initial, image_login_after, image_settings_pin_test [INFERRED 0.95]

## Communities (63 total, 25 thin omitted)

### Community 0 - "Frontend UI Components"
Cohesion: 0.05
Nodes (44): Layout(), navItems, ROLE_LABEL, AuthContext, AuthProvider(), useAuth(), CartContext, CartProvider() (+36 more)

### Community 1 - "Backend API Test Suite"
Cohesion: 0.05
Nodes (29): app, jwt, request, test(), app, http, jwt, app (+21 more)

### Community 2 - "Service Worker & OCR Providers"
Cohesion: 0.06
Nodes (19): exports, registry, require(), singleRequire(), specialDeps, BaseOcrProvider, BaseOcrProvider, GeminiOcrProvider (+11 more)

### Community 3 - "AI Tools Framework"
Cohesion: 0.07
Nodes (17): BaseTool, ToolResult, ImpactAnalysisTool, InventoryTool, registry, SalesTool, registry, ToolRegistry (+9 more)

### Community 4 - "Workbox Precache Strategy"
Cohesion: 0.13
Nodes (7): getFriendlyURL(), isInstance(), PrecacheStrategy, Strategy, StrategyHandler, toRequest(), waitUntil()

### Community 5 - "Backend Config & DB Layer"
Cohesion: 0.09
Nodes (33): dbHelper.js Core Database Helper, Express API Backend (Node.js), POS Backend Implementation Context, PIN-based Authentication (BCrypt), PostgreSQL Production Migration Target, SQLite Local Database (pos_system.db), Oracle Cloud Always Free ARM Ampere A1 Deployment Target, Research -> Strategy -> Execution Development Lifecycle (+25 more)

### Community 6 - "Workbox Cache Management"
Cohesion: 0.08
Nodes (23): additionalURLs, cacheMatchIgnoreParams(), _cacheNameDetails, cacheNames, cacheWillUpdate(), canConstructResponseFromBodyStream(), cleanURL, copyResponse() (+15 more)

### Community 7 - "Auth Middleware & Routes"
Cohesion: 0.14
Nodes (15): { AppError }, authenticate(), authorize(), db, jwt, { authenticate, authorize }, db, express (+7 more)

### Community 8 - "OCR Controller"
Cohesion: 0.11
Nodes (10): { AppError }, OcrController, OcrService, { authenticate }, express, multer, OcrController, router (+2 more)

### Community 9 - "Reports Route"
Cohesion: 0.12
Nodes (16): allDates, { AppError }, { authenticate, authorize }, costMap, currentYear, db, express, now (+8 more)

### Community 10 - "Orders Route"
Cohesion: 0.12
Nodes (16): { AppError }, { authenticate, authorize }, db, express, lastSeqStr, orderId, orderItems, paid (+8 more)

### Community 11 - "D1 Database Helper"
Cohesion: 0.17
Nodes (14): acquire(), axios, D1_MAX_CONCURRENT, D1_QUEUE_TIMEOUT_MS, D1_TIMEOUT_MS, d1HttpAgent, d1HttpsAgent, get() (+6 more)

### Community 12 - "Error Handler Middleware"
Cohesion: 0.14
Nodes (12): AppError, errorHandler(), fs, logFile, path, { AppError }, { authenticate }, db (+4 more)

### Community 13 - "Data Export Utility"
Cohesion: 0.15
Nodes (12): Database, db, dbPath, fs, newRow, outputPath, path, priorityOrder (+4 more)

### Community 14 - "OCR Repository"
Cohesion: 0.21
Nodes (3): db, OcrRepository, { v4: uuidv4 }

### Community 16 - "Auth Route"
Cohesion: 0.18
Nodes (10): { AppError }, { authenticate }, bcrypt, db, express, jwt, pinStr, router (+2 more)

### Community 17 - "Stores Route"
Cohesion: 0.2
Nodes (9): { AppError }, { authenticate, authorize }, db, express, id, orderIds, productIds, router (+1 more)

### Community 18 - "Products Route"
Cohesion: 0.2
Nodes (9): { AppError }, { authenticate, authorize }, db, express, id, num, params, router (+1 more)

### Community 19 - "S3 Storage Service"
Cohesion: 0.2
Nodes (5): { getSignedUrl }, { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand }, sharp, StorageService, { v4: uuidv4 }

### Community 20 - "Workbox Router"
Cohesion: 0.27
Nodes (5): hasMethod(), isOneOf(), isType(), normalizeHandler(), Route

### Community 21 - "Sales Route"
Cohesion: 0.22
Nodes (8): { AppError }, { authenticate, authorize }, countParams, db, express, params, router, { v4: uuidv4 }

### Community 22 - "Debtors Route"
Cohesion: 0.22
Nodes (8): { AppError }, { authenticate }, db, express, id, params, router, { v4: uuidv4 }

### Community 23 - "Users Route"
Cohesion: 0.22
Nodes (8): { AppError }, { authenticate, authorize }, bcrypt, db, express, id, router, { v4: uuidv4 }

### Community 24 - "PIN Auth & UI Screenshots"
Cohesion: 0.22
Nodes (9): UI: POS terminal with success toast "เข้าสู่ระบบสำเร็จ", UI: PIN-pad login screen (4-digit pad, gradient bg), UI: Add-User modal with 4-digit PIN field, Invariant: PINs are exactly 4 digits, Default credentials: admin / 0000, POST /api/auth/login (documented), POST /api/auth/pin-login (documented), POS System Overview (+1 more)

### Community 25 - "Force Migration Utility"
Cohesion: 0.29
Nodes (7): axios, Database, db, dbPath, migrate(), path, runD1Command()

### Community 26 - "Customers Route"
Cohesion: 0.25
Nodes (7): { authenticate }, db, express, id, params, router, { v4: uuidv4 }

### Community 27 - "MCP Server"
Cohesion: 0.29
Nodes (5): {
  CallToolRequestSchema,
  ListToolsRequestSchema,
}, { init: initDb }, registry, { Server }, { StdioServerTransport }

### Community 28 - "Inventory Route"
Cohesion: 0.29
Nodes (6): { authenticate, authorize }, db, express, params, router, { v4: uuidv4 }

### Community 30 - "PWA Icon Generator"
Cohesion: 0.33
Nodes (5): fs, icon192, icon512, iconsDir, path

### Community 31 - "PIN Hash Migration"
Cohesion: 0.47
Nodes (5): bcrypt, { init, all, run }, migrate(), all(), init()

### Community 32 - "Workbox Precache Registration"
Cohesion: 0.4
Nodes (6): addRoute(), createHandlerBoundToURL(), getOrCreatePrecacheController(), precache(), precacheAndRoute(), registerRoute()

### Community 33 - "Database Seeding"
Cohesion: 0.4
Nodes (3): bcrypt, db, { v4: uuidv4 }

### Community 34 - "OCR Migration"
Cohesion: 0.4
Nodes (3): db, fs, path

### Community 35 - "Workbox Navigation Route"
Cohesion: 0.4
Nodes (3): isArray(), isArrayOfClass(), NavigationRoute

### Community 37 - "SQLite Test Utility"
Cohesion: 0.5
Nodes (3): Database, db, row

## Knowledge Gaps
- **300 isolated node(s):** `fs`, `path`, `iconsDir`, `icon192`, `icon512` (+295 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ocrService` connect `Service Worker & OCR Providers` to `Frontend UI Components`?**
  _High betweenness centrality (0.158) - this node is a cross-community bridge._
- **What connects `fs`, `path`, `iconsDir` to the rest of the system?**
  _300 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Backend API Test Suite` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Service Worker & OCR Providers` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `AI Tools Framework` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Workbox Precache Strategy` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._