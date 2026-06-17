// src/services/monitorService.js
// =========================================================
// หัวใจหลักของระบบ: Logic การทำงานตาม Flowchart ทั้งหมด
// =========================================================
const { fetchDisplayStatuses, saveCheckResults } = require("./googleSheetService");
const {
  notifyDisplayOffline,
  notifyRecoverySuccess,
  notifyRemoteFailed,
  notifyPiSelfRestartSuccess,
  notifyPiStillHasIssue,
} = require("./notificationService");
const {
  testSSHConnection,
  remoteRestartPi,
  waitForPiToReturn,
  forceNetworkRestartPi
} = require("./recoveryService");
const logger = require("../utils/logger");

// =========================================================
// ฟังก์ชันหลัก: เรียกทุก X นาทีจาก index.js (via node-cron)
// =========================================================
async function runMonitorCycle() {
  logger.info("========== เริ่มรอบการตรวจสอบ ==========");

  // ─────────────────────────────────────────────
  // STEP 1: ดึงข้อมูลสถานะจาก Google Sheet
  // (ตาม Flowchart: "ดึงข้อมูลสถานะของจอจาก Google Sheet ได้มั้ย?")
  // ─────────────────────────────────────────────
  let displayStatuses;
  try {
    displayStatuses = await fetchDisplayStatuses();
    logger.info(`ดึงข้อมูลสำเร็จ: ${displayStatuses.length} จอ`);
  } catch (err) {
    // ─────────────────────────────────────────────
    // STEP 1 FAIL: เชื่อม Google Sheet ไม่ได้ → Backend มีปัญหา
    // (ตาม Flowchart: "No → Fix Backend ให้เชื่อมต่อและดึงข้อมูลได้")
    // ─────────────────────────────────────────────
    logger.error(`❌ ดึงข้อมูลจาก Google Sheet ไม่ได้: ${err.message}`);
    logger.error("🔧 Backend มีปัญหา — กรุณาตรวจสอบ Service Account / Network / Sheet ID");
    // หยุด Cycle นี้ รอรอบถัดไป
    return;
  }

  // ─────────────────────────────────────────────
  // STEP 2: วิเคราะห์สถานะของแต่ละจอ
  // (ตาม Flowchart: "อ่านข้อมูลและวิเคราะห์สถานะของแต่ละจอ")
  // ─────────────────────────────────────────────
  const checkResults = []; // เก็บผลรวมสำหรับบันทึก Log ลง Sheet ตอนท้าย

  for (const display of displayStatuses) {
    logger.info(`\n--- ตรวจสอบจอ: ${display.display} (status: ${display.status}) ---`);

    const result = {
      display: display.display,
      status: display.status,
      action: "NONE",
      success: true,
    };

    // ─────────────────────────────────────────────
    // STEP 3: สถานะหน้าจอปกติหรือไม่?
    // (ตาม Flowchart: "สถานะหน้าจอปกติหรือไม่?")
    // ─────────────────────────────────────────────
    if (display.status === "OK") {
      // ✅ ปกติ → บันทึก Log แล้วข้ามไปจอถัดไป
      logger.info(`✅ ${display.display}: สถานะปกติ`);
      result.action = "OK_NO_ACTION";
      checkResults.push(result);
      continue; // ← ไปจอถัดไปเลย
    }

    // ─────────────────────────────────────────────
    // STEP 4: ส่งแจ้งเตือนทันที (LINE / Email)
    // (ตาม Flowchart: "ส่งข้อความแจ้งเตือนทันที! (LINE Messaging API / Email)")
    // ─────────────────────────────────────────────
    logger.warn(`🔴 ${display.display}: สถานะ OFFLINE — กำลังส่งแจ้งเตือน...`);
    await notifyDisplayOffline(display.display);
    result.action = "NOTIFIED";

    // ─────────────────────────────────────────────
    // STEP 5: ลองเชื่อมต่อ SSH ไปที่ Pi (Remote)
    // (ตาม Flowchart: "ลองเชื่อมต่อ (Remote) ไปยังบอร์ด Raspberry Pi ของจอนั้นได้หรือไม่?")
    // ─────────────────────────────────────────────
    logger.info(`🔌 กำลังลอง SSH ไปยัง ${display.display}...`);
    const canConnectSSH = await testSSHConnection(display.display);

    if (canConnectSSH) {
      // ─────────────────────────────────────────────
      // STEP 5A: SSH เชื่อมได้ → ส่ง Pi รีสตาร์ทตัวเอง
      // (ตาม Flowchart: "เชื่อมต่อสำเร็จ → ส่ง Pi รีสตาร์ทตัวเอง")
      // ─────────────────────────────────────────────
      logger.info(`🔄 SSH สำเร็จ — ส่งคำสั่งให้ ${display.display} รีสตาร์ทตัวเอง...`);
      result.action = "SSH_SELF_RESTART";

      // รอให้ Pi กลับมาหลัง Self-Restart
      const piCameBack = await waitForPiToReturn(display.display);

      if (piCameBack) {
        // ─────────────────────────────────────────────
        // STEP 5A-SUCCESS: Pi กลับมาปกติหลัง Self-Restart
        // (ตาม Flowchart: "ตรวจสอบว่าหน้าจอ กลับมาเปิดปกติแล้วใช่ไหม? → Yes")
        // "ส่ง Line แจ้ง: ระบบรีสตาร์ทเครื่องและเปิดหน้าจอสำเร็จ"
        // ─────────────────────────────────────────────
        logger.info(`✅ ${display.display}: กลับมาทำงานหลัง Self-Restart สำเร็จ`);
        await notifyPiSelfRestartSuccess(display.display);
        result.success = true;
        result.action = "SELF_RESTART_SUCCESS";
      } else {
        // ─────────────────────────────────────────────
        // STEP 5A-FAIL: Pi ยังมีปัญหาหลัง Self-Restart
        // (ตาม Flowchart: "No → ส่ง Line แจ้ง: หน้าจอยังมีปัญหา/Remote ไม่สำเร็จ")
        // → เจ้าหน้าที่เข้าตรวจสอบเอง
        // ─────────────────────────────────────────────
        logger.warn(`⚠️ ${display.display}: ยังมีปัญหาหลัง Self-Restart — แจ้งเจ้าหน้าที่`);
        await notifyPiStillHasIssue(display.display);
        result.success = false;
        result.action = "SELF_RESTART_FAILED_MANUAL_REQUIRED";
      }
    } else {
      // ─────────────────────────────────────────────
      // STEP 5B: SSH เชื่อมไม่ได้ → ระบบส่งคำสั่งบังคับ Restart อัตโนมัติจากภายนอก
      // (ตาม Flowchart ล่าสุด: "เชื่อมต่อล้มเหลว → ระบบส่งคำสั่งบังคับรีสตาร์ทเครื่องอัตโนมัติ")
      // ─────────────────────────────────────────────
      logger.warn(`⚡ SSH ล้มเหลว — ระบบส่งคำสั่งบังคับ Restart ${display.display} จากภายนอก...`);
      result.action = "FORCED_REMOTE_RESTART";

      // 💡 เปลี่ยนมาใช้ฟังก์ชันบังคับรีสตาร์ทผ่านเครือข่าย/ฮาร์ดแวร์ภายนอกแทน เพราะ SSH พังอยู่
      const restartSuccess = await forceNetworkRestartPi(display.display);

      // 💡 ตรวจสอบซ้ำหลังจากส่งคำสั่ง (Double-Check) โดยใช้ลูปวนตรวจซ้ำที่ Claude เตรียมไว้ให้
      logger.info(`⏳ รอตรวจเช็คว่า ${display.display} จะกลับมาออนไลน์หลังจากบังคับรีสตาร์ทหรือไม่...`);
      const piIsBack = restartSuccess && (await waitForPiToReturn(display.display));

      if (piIsBack) {
        // ─────────────────────────────────────────────
        // STEP 5B-SUCCESS: กู้คืนสำเร็จ
        // (ตาม Flowchart: "ตรวจสอบว่าเครื่องกลับมาทำงานได้หรือไม่? → Yes")
        // "แจ้งเตือนกู้คืนการเชื่อมต่อ Remote สำเร็จ"
        // ─────────────────────────────────────────────
        logger.info(`✅ ${display.display}: กู้คืนด้วยคำสั่งบังคับ Restart ภายนอกสำเร็จ!`);
        await notifyRecoverySuccess(display.display);
        result.success = true;
        result.action = "FORCED_RESTART_SUCCESS";
      } else {
        // ─────────────────────────────────────────────
        // STEP 5B-FAIL: กู้คืนไม่ได้ → แจ้งเจ้าหน้าที่
        // (ตาม Flowchart: "No → ส่ง Line แจ้ง: เชื่อมต่อ Remote ไม่สำเร็จ")
        // → เจ้าหน้าที่เข้าตรวจสอบเอง
        // ─────────────────────────────────────────────
        logger.error(`❌ ${display.display}: บังคับรีสตาร์ทแล้วก็ยังไม่กลับมา — ต้องการความช่วยเหลือจากเจ้าหน้าที่`);
        await notifyRemoteFailed(display.display);
        result.success = false;
        result.action = "FORCED_RESTART_FAILED_MANUAL_REQUIRED";
      }
    }

    checkResults.push(result);
  } // ← end for loop ทุกจอ

  // ─────────────────────────────────────────────
  // STEP 6: บันทึก Log การทำงานปกติ + เก็บผลตรวจสอบลง Google Sheet
  // (ตาม Flowchart: "บันทึก Log การทำงานปกติ" + "เก็บผลการตรวจสอบลง Google Sheet")
  // ─────────────────────────────────────────────
  logger.info("\n📝 บันทึกผลการตรวจสอบลง Google Sheet...");
  await saveCheckResults(checkResults);

  // สรุปผลรอบนี้
  const offlineCount = checkResults.filter((r) => r.status !== "OK").length;
  logger.info(`\n========== สิ้นสุดรอบการตรวจสอบ | Offline: ${offlineCount}/${checkResults.length} จอ ==========\n`);
}

module.exports = { runMonitorCycle };
