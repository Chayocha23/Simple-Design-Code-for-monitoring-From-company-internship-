// src/services/googleSheetService.js
// บริการดึงและอัปเดตข้อมูลสถานะจาก Google Sheet
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
const config = require("../config/config");
const logger = require("../utils/logger");

// ============================================================
// MOCK MODE: ใช้ระหว่างพัฒนา / ทดสอบ ก่อนเชื่อม Sheet จริง
// เปลี่ยน USE_MOCK = false เมื่อพร้อม Production
// ============================================================
const USE_MOCK = true;

const MOCK_DATA = [
  { display: "Dicut",     status: "OK",      lastUpdated: new Date().toISOString() },
  { display: "RollFold",  status: "OFFLINE",  lastUpdated: new Date().toISOString() },
  { display: "SheetFold", status: "OK",      lastUpdated: new Date().toISOString() },
  { display: "Tray",      status: "OFFLINE",  lastUpdated: new Date().toISOString() },
];

/**
 * ดึงข้อมูลสถานะหน้าจอทุกจอจาก Google Sheet
 * @returns {Promise<Array<{display: string, status: string, lastUpdated: string}>>}
 */
async function fetchDisplayStatuses() {
  if (USE_MOCK) {
    logger.info("[MOCK] fetchDisplayStatuses() → คืนข้อมูลจำลอง");
    return MOCK_DATA;
  }

  // --- Production Code ---
  try {
    const serviceAccountAuth = new JWT({
      email: config.googleSheet.serviceAccountEmail,
      key: config.googleSheet.privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const doc = new GoogleSpreadsheet(config.googleSheet.sheetId, serviceAccountAuth);
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle[config.googleSheet.sheetName];
    if (!sheet) throw new Error(`ไม่พบ Sheet ชื่อ "${config.googleSheet.sheetName}"`);

    const rows = await sheet.getRows();

    // คาดว่า Sheet มีคอลัมน์: display | status | lastUpdated
    return rows.map((row) => ({
      display: row.get("display"),
      status: row.get("status"),       // "OK" หรือ "OFFLINE"
      lastUpdated: row.get("lastUpdated"),
    }));
  } catch (err) {
    logger.error(`fetchDisplayStatuses() เกิดข้อผิดพลาด: ${err.message}`);
    throw err; // โยนต่อให้ caller จัดการ
  }
}

/**
 * บันทึกผลการตรวจสอบลง Google Sheet (Log ปกติ)
 * @param {Array<object>} results - ผลการตรวจสอบทุกจอ
 */
async function saveCheckResults(results) {
  if (USE_MOCK) {
    logger.info("[MOCK] saveCheckResults() → จำลองบันทึก Log ลง Sheet");
    logger.info(`[MOCK] ข้อมูลที่จะบันทึก: ${JSON.stringify(results, null, 2)}`);
    return;
  }

  // --- Production Code ---
  try {
    const serviceAccountAuth = new JWT({
      email: config.googleSheet.serviceAccountEmail,
      key: config.googleSheet.privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const doc = new GoogleSpreadsheet(config.googleSheet.sheetId, serviceAccountAuth);
    await doc.loadInfo();

    // บันทึกลง Sheet แยกสำหรับ Log (ชื่อ "CheckLog")
    const logSheet = doc.sheetsByTitle["CheckLog"];
    if (!logSheet) {
      logger.warn('ไม่พบ Sheet "CheckLog" — ข้ามการบันทึก');
      return;
    }

    for (const result of results) {
      await logSheet.addRow({
        timestamp: new Date().toISOString(),
        display: result.display,
        status: result.status,
        action: result.action || "-",
        success: result.success ? "YES" : "NO",
      });
    }

    logger.info("บันทึกผลการตรวจสอบลง Google Sheet สำเร็จ");
  } catch (err) {
    logger.error(`saveCheckResults() เกิดข้อผิดพลาด: ${err.message}`);
  }
}

module.exports = { fetchDisplayStatuses, saveCheckResults };
