// src/index.js
// จุดเริ่มต้นของระบบ — ตั้งเวลาให้ runMonitorCycle() ทำงานทุก X นาที
const path = require('path');
const fs = require('fs');
const express = require('express'); // ➕ แทรกเพิ่ม: ดึงโมดูลทำระบบ Web App
const app = express();              // ➕ แทรกเพิ่ม: ประกาศใช้งาน Express
const PORT = 4000;                  // ➕ แทรกเพิ่ม: ล็อกพอร์ต 4000 สำหรับเปิดดูหน้าเว็บ HTML

const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config({ path: path.join(__dirname, '../.env') }); // สำรอง
}
const cron = require("node-cron");
const config = require("./config/config");
const logger = require("./utils/logger");
const { runMonitorCycle } = require("./services/monitorService");

// ─────────────────────────────────────────────────────────
// ➕ แทรกเพิ่ม: ประกาศตัวแปรส่วนกลาง (Global Variable) สำหรับแชร์สถานะให้หน้าเว็บ
// ─────────────────────────────────────────────────────────
global.globalDisplayStatus = {
  "Dicut": { status: "กำลังสแตนด์บาย...", isHealthy: true, lastCheck: "-" },
  "SheetFold": { status: "กำลังสแตนด์บาย...", isHealthy: true, lastCheck: "-" },
  "Tray": { status: "กำลังสแตนด์บาย...", isHealthy: true, lastCheck: "-" },
  "RollFold": { status: "กำลังสแตนด์บาย...", isHealthy: true, lastCheck: "-" }
};

// 🌐 ➕ แทรกเพิ่ม: สร้าง API Route เพื่อส่งค่า JSON ออกไปแสดงผลบนหน้าเว็บ
app.get('/api/status', (req, res) => {
  res.json(global.globalDisplayStatus);
});

// 📂 ➕ แทรกเพิ่ม: กำหนด Route หลักเพื่อสั่งโหลดหน้าเว็บ HTML แดชบอร์ด
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// 🚀 ➕ แทรกเพิ่ม: สั่งรันเว็บเซิร์ฟเวอร์มอนิเตอร์ส่วนกลาง
app.listen(PORT, () => {
  logger.info(`🌐 [Web Dashboard] หน้าเว็บมอนิเตอร์สแตนด์บายแล้วที่ http://localhost:${PORT}`);
});

// ─────────────────────────────────────────────────────────
// โค้ดเดิมคงไว้ทั้งหมด — แปลง config.checkIntervalMinutes → cron expression
// ─────────────────────────────────────────────────────────
logger.info("🚀 Pi Monitor เริ่มทำงาน");
const { sendLineMessage } = require("./services/notificationService");

logger.info(`⏱  ตรวจสอบทุก ${config.checkIntervalMinutes} นาที`);
logger.info(`📺 จำนวนหน้าจอที่ดูแล: ${Object.keys(config.displays).length} จอ`);
logger.info(`   → ${Object.keys(config.displays).join(", ")}`);

// ─────────────────────────────────────────────────────────
// รันทันทีครั้งแรกเมื่อ Start ระบบ (ไม่ต้องรอ cron รอบแรก)
// ─────────────────────────────────────────────────────────
(async () => {
  try {
    await runMonitorCycle();
  } catch (err) {
    logger.error(`❌ runMonitorCycle() ครั้งแรก เกิดข้อผิดพลาด: ${err.message}`);
  }
})();

// ─────────────────────────────────────────────────────────
// ตั้ง Cron Job ให้รันซ้ำทุก X นาที
// ─────────────────────────────────────────────────────────
cron.schedule(`*/${config.checkIntervalMinutes} * * * *`, async () => {
  try {
    await runMonitorCycle();
  } catch (err) {
    logger.error(`❌ runMonitorCycle() cron เกิดข้อผิดพลาด: ${err.message}`);
  }
});

// ─────────────────────────────────────────────────────────
// จัดการ Signal หยุด Process อย่างสะอาด (Graceful Shutdown)
// ─────────────────────────────────────────────────────────
process.on("SIGINT", () => {
  logger.info("🛑 ได้รับ SIGINT — ปิดระบบ Pi Monitor อย่างสะอาด");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("🛑 ได้รับ SIGTERM — ปิดระบบ Pi Monitor อย่างสะอาด");
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  logger.error(`💥 Uncaught Exception: ${err.message}`);
  logger.error(err.stack);
});

process.on("unhandledRejection", (reason) => {
  logger.error(`💥 Unhandled Promise Rejection: ${reason}`);
});