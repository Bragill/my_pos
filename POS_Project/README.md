# 🛒 POS ระบบขายหน้าร้าน

ระบบ POS (Point of Sale) ที่ทันสมัย รองรับภาษาไทย 100% พัฒนาเป็น Progressive Web App (PWA)

## ✨ ฟีเจอร์หลัก

- **หน้าขาย (POS Terminal)** - ค้นหา/สแกนบาร์โค้ด, ตะกร้าสินค้า, ชำระเงิน (เงินสด/บัตร/QR PromptPay)
- **ระบบสมาชิก (CRM)** - สะสมแต้ม, ประวัติการซื้อ, ส่วนลดสมาชิก
- **จัดการสต๊อก** - รับเข้า/เบิกออก/ปรับปรุง, แจ้งเตือนสินค้าใกล้หมด
- **รายงาน & แดชบอร์ด** - ยอดขายรายวัน/เดือน, สินค้าขายดี, ประสิทธิภาพแคชเชียร์
- **กะการทำงาน** - เปิด/ปิดกะ, สรุปยอดเงินสด
- **PWA + ออฟไลน์** - ติดตั้งลงหน้าจอหลัก, ขายต่อได้แม้ไม่มีเน็ต
- **RBAC** - Admin, Manager, Cashier พร้อม PIN Code Login
- **VAT 7%** - คำนวณภาษีอัตโนมัติ, รองรับใบกำกับภาษี

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| Offline | IndexedDB + Service Worker |
| PWA | vite-plugin-pwa |

## 🚀 เริ่มต้นใช้งาน

### 1. ตั้งค่าฐานข้อมูล PostgreSQL

```sql
CREATE DATABASE pos_system;
```

### 2. Backend

```bash
cd backend
cp .env.example .env    # แก้ไข DB credentials
npm install
npm run db:migrate      # สร้างตาราง
npm run db:seed         # ข้อมูลเริ่มต้น
npm run dev             # รันที่ port 3000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev             # รันที่ port 5173
```

### 4. เข้าสู่ระบบ

- **Username:** admin
- **Password:** admin1234
- **PIN:** 0000

## 📁 โครงสร้างโปรเจค

```
├── backend/
│   ├── src/
│   │   ├── database/       # Schema, Migration, Seed
│   │   ├── middleware/      # Auth, Error Handler
│   │   ├── routes/          # API Routes
│   │   └── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # Layout, Shared Components
│   │   ├── contexts/        # Auth, Cart State
│   │   ├── pages/           # Login, POS, Dashboard, etc.
│   │   ├── services/        # API, IndexedDB, Sync
│   │   └── utils/           # Format helpers
│   ├── index.html
│   └── package.json
```

## 🎨 UI/UX Guidelines

- **Split Layout**: ซ้าย 70% สินค้า / ขวา 30% ตะกร้า
- **Touch-friendly**: ปุ่มขั้นต่ำ 44x44px
- **Keyboard Shortcuts**: F2 = ค้นหา, F9 = ชำระเงิน, Esc = ยกเลิก
- **Font**: Prompt (Thai-optimized)
- **สีปุ่ม**: เขียว = ชำระเงิน, แดง = ยกเลิก

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | เข้าสู่ระบบ |
| POST | `/api/auth/pin-login` | เข้าด้วย PIN |
| GET | `/api/products` | รายการสินค้า |
| GET | `/api/products/barcode/:code` | ค้นหาจากบาร์โค้ด |
| POST | `/api/orders` | สร้างออเดอร์ |
| GET | `/api/orders/parked` | บิลที่พัก |
| POST | `/api/orders/:id/refund` | คืนเงิน |
| GET/POST | `/api/inventory` | จัดการสต๊อก |
| GET | `/api/reports/dashboard` | แดชบอร์ด |
| GET | `/api/reports/daily-sales` | ยอดขายรายวัน |
| GET | `/api/reports/top-products` | สินค้าขายดี |
| POST | `/api/shifts/open` | เปิดกะ |
| POST | `/api/shifts/close` | ปิดกะ |
