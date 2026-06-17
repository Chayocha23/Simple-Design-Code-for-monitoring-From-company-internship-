# Pi Monitor — ระบบตรวจสอบและแจ้งเตือนสถานะหน้าจอ Raspberry Pi

ระบบ Backend (Node.js) ที่ตรวจสอบสถานะหน้าจอ 4 จอบน Raspberry Pi  
และกู้คืนอัตโนมัติผ่าน SSH เมื่อตรวจพบความผิดปกติ

---

## โครงสร้างโปรเจกต์

```
pi-monitor/
├── src/
│   ├── index.js                    ← จุดเริ่มต้น + Cron Scheduler
│   ├── config/
│   │   └── config.js               ← การตั้งค่าทั้งหมด (อ่านจาก .env)
│   ├── services/
│   │   ├── monitorService.js       ← Logic หลักตาม Flowchart
│   │   ├── googleSheetService.js   ← ดึง/บันทึกข้อมูลจาก Google Sheet
│   │   ├── notificationService.js  ← ส่ง LINE Messaging API + Email
│   │   └── recoveryService.js      ← SSH Auto-Recovery
│   └── utils/
│       └── logger.js               ← ระบบ Log ไฟล์รายวัน
├── logs/                           ← ไฟล์ Log (auto-generated)
├── .env.example                    ← Template ค่า Environment
├── .env                            ← ค่าจริง (ห้าม commit!)
├── .gitignore
└── package.json
```

---

## วิธีติดตั้งและรัน (GitHub Codespaces / Local)

### 1. ติดตั้ง dependencies
```bash
npm install
```

### 2. ตั้งค่า Environment Variables
```bash
cp .env.example .env
# แก้ไขค่าใน .env ให้ตรงกับระบบจริง
```

### 3. รันในโหมด Mock (พัฒนา/ทดสอบ — ไม่กระทบระบบจริง)
```bash
npm run dev
# หรือ
npm start
```
> Mock Mode เปิดอยู่โดย default (`USE_MOCK = true` ในทุก Service)  
> ระบบจะจำลองว่าจอ RollFold และ Tray มีสถานะ OFFLINE

### 4. เปิดใช้งานจริง (Production)
เปลี่ยน `USE_MOCK = false` ในไฟล์:
- `src/services/googleSheetService.js`
- `src/services/notificationService.js`
- `src/services/recoveryService.js`

---

## npm Packages ที่ใช้

| Package | วัตถุประสงค์ |
|---|---|
| `google-spreadsheet` | อ่าน/เขียน Google Sheet ผ่าน Google API |
| `google-auth-library` | Authentication ด้วย Service Account |
| `node-cron` | ตั้งเวลาให้ระบบรันซ้ำทุก X นาที |
| `node-ssh` | SSH เข้า Raspberry Pi เพื่อ Auto-Recovery |
| `axios` | HTTP Client สำหรับเรียก LINE Messaging API |
| `nodemailer` | ส่ง Email แจ้งเตือนผ่าน SMTP |
| `dotenv` | โหลด Environment Variables จาก .env |
| `winston` | ระบบ Logging แบบ Structured |
| `winston-daily-rotate-file` | หมุนไฟล์ Log รายวัน |
| `nodemon` (dev) | Auto-restart server เมื่อแก้ไขโค้ด |

---

## Google Sheet Format ที่ต้องการ

### Sheet: `StatusSheet` (ข้อมูลสถานะปัจจุบัน)
| display | status | lastUpdated |
|---|---|---|
| Dicut | OK | 2024-01-01T08:00:00Z |
| RollFold | OFFLINE | 2024-01-01T08:00:00Z |
| SheetFold | OK | 2024-01-01T08:00:00Z |
| Tray | OFFLINE | 2024-01-01T08:00:00Z |

### Sheet: `CheckLog` (บันทึกผลการตรวจสอบ)
| timestamp | display | status | action | success |
|---|---|---|---|---|

---

## ขั้นตอนถัดไป (Next Steps)

- [ ] สร้าง Google Service Account และดาวน์โหลด credentials
- [ ] แชร์ Google Sheet ให้ Service Account อ่าน/เขียนได้
- [ ] สร้าง LINE Channel Access Token และระบุ LINE User/Group ID สำหรับส่งข้อความ
- [ ] ตั้งค่า Gmail App Password สำหรับ nodemailer
- [ ] ทดสอบ SSH เข้า Pi แต่ละตัว
- [ ] เปลี่ยน `USE_MOCK = false` ทีละ Service และทดสอบ
