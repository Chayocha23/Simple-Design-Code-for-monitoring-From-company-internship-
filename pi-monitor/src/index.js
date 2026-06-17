// src/index.js
// จุดเริ่มต้นของระบบ — ตั้งเวลาให้ runMonitorCycle() ทำงานทุก X นาที
const cron = require("node-cron");
const config = require("./config/config");
const logger = require("./utils/logger");
const { runMonitorCycle } = require("./services/monitorService");

// ─────────────────────────────────────────────────────────
// แปลง config.checkIntervalMinutes → cron expression
// เช่น 5 นาที → "*/5 * * * *" กําหนดและเปลี่ยนแปลงเวลาในไฟล์ .env.example
// ─────────────────────────────────────────────────────────
const cronExpression = `*/${config.checkIntervalMinutes} * * * *`;

logger.info("🚀 Pi Monitor เริ่มทำงาน");
logger.info(`⏱  ตรวจสอบทุก ${config.checkIntervalMinutes} นาที (cron: "${cronExpression}")`);
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
cron.schedule(cronExpression, async () => {
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
  // ไม่ exit เพื่อให้ระบบยังทำงานต่อได้
});

process.on("unhandledRejection", (reason) => {
  logger.error(`💥 Unhandled Promise Rejection: ${reason}`);
});
