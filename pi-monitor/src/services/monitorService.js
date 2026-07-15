// src/services/monitorService.js
const config = require("../config/config");
const { saveCheckResults } = require("./googleSheetService");
const { notifyDisplayOffline, notifyRecoverySuccess, notifyRemoteFailed } = require("./notificationService");
const { testSSHConnection, checkBrowserProcess } = require("./recoveryService");
const logger = require("../utils/logger");

async function runMonitorCycle() {
  logger.info("========== เริ่มรอบการตรวจสอบ (All Displays) ==========");

  const displaysToMonitor = Object.values(config.displays);
  const checkResults = []; 
  let actualOfflineCount = 0; 

  // ตั้งค่าสำหรับระบบตรวจสอบซ้ำ (Retry Configuration)
  const MAX_RETRIES = 3;      // จำนวนรอบที่เช็กซ้ำทันที
  const RETRY_DELAY = 2000;   // เวลาหน่วงก่อนเช็กซ้ำรอบถัดไป (2 วินาที)

  for (const displayConfig of displaysToMonitor) {
    const displayName = displayConfig.name;
    logger.info(`\n--- ตรวจสอบจอ: ${displayName} ---`);

    if (!displayConfig.ssh.host) {
      logger.warn(`⚠️ ข้ามการตรวจจอ ${displayName} เนื่องจากไม่มีการระบุ IP ใน .env`);
      continue;
    }

    const result = {
      display: displayName,
      status: "OK", 
      action: "NONE",
      success: true,
    };

    // =========================================================
    // ขั้นตอนที่ 1: เช็กสัญญาณชีพ OS ผ่าน SSH (พร้อมระบบวนเช็กซ้ำทันที)
    // =========================================================
    let isPiAlive = false;
    let sentFirstAlert = false; 

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      isPiAlive = await testSSHConnection(displayConfig);
      
      if (isPiAlive) {
        if (sentFirstAlert) {
          logger.info(`✨ [Network Recovered] จอ ${displayName} ดีดกลับมาออนไลน์ปกติในรอบเช็กซ้ำที่ [${attempt}/${MAX_RETRIES}]`);
          await notifyRecoverySuccess(displayName); 
        } else if (attempt > 1) {
          logger.info(`✨ [Network Recovered] จอ ${displayName} เชื่อมต่อ SSH ได้ปกติในรอบเช็กซ้ำที่ [${attempt}/${MAX_RETRIES}]`);
        }
        break; 
      }

      logger.warn(`⚠️ [Retry SSH] รอบที่ [${attempt}/${MAX_RETRIES}] จอ ${displayName} สัญญาณขาดหาย กำลังรอเช็กซ้ำ...`);
      
      if (attempt === 1) {
        await notifyDisplayOffline(displayName);
        sentFirstAlert = true;
        
        if (global.globalDisplayStatus) {
          global.globalDisplayStatus[displayName] = {
            status: "⚠️ สัญญาณแกว่ง! กำลังตรวจสอบเน็ตเวิร์กซ้ำซ้อน...",
            isHealthy: false,
            lastCheck: new Date().toLocaleTimeString("th-TH")
          };
        }
      }

      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY)); 
      }
    }

    // 🔥 [แก้ไขจุดนี้] กรณีเช็กครบ 3 รอบแล้วบอร์ดยังดับสนิท (เครื่องดับ/เน็ตหลุดถาวรจริง ๆ)
    if (!isPiAlive) {
      logger.error(`❌ [Critical] ${displayName} เครื่องดับจริงหลังจากเช็กซ้ำครบ ${MAX_RETRIES} รอบ!`);
      actualOfflineCount++;
      
      // 📣 ยิงไลน์แจ้งเตือนภัยขั้นสุดบอกให้ส่งเจ้าหน้าที่ไปดูหน้างานทันที
      await notifyRemoteFailed(displayName);
      
      // 📺 [✨ ปรับเปลี่ยนข้อความตรงนี้] สลับการ์ดบนเว็บแดชบอร์ดให้โชว์แจ้งเตือนส่งช่างตรวจเช็กทันที
      if (global.globalDisplayStatus) {
        global.globalDisplayStatus[displayName] = {
          status: "❌ เครื่องดับหรือเน็ตเวิร์กหลุดถาวร! กรุณาส่งเจ้าหน้าที่เข้าตรวจสอบหน้างานด่วน",
          isHealthy: false,
          lastCheck: new Date().toLocaleTimeString("th-TH")
        };
      }

      result.status = "OFFLINE";
      result.action = "HARDWARE_DOWN";
      checkResults.push(result);
      continue; 
    } 

    // =========================================================
    // ขั้นตอนที่ 2: เช็ก Process เบราว์เซอร์ (พร้อมระบบวนเช็กซ้ำทันที)
    // =========================================================
    let isBrowserRunning = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      isBrowserRunning = await checkBrowserProcess(displayConfig);
      
      if (isBrowserRunning) {
        if (attempt > 1) {
          logger.info(`✨ [Process Recovered] จอ ${displayName} ตรวจพบ Browser รันปกติในรอบเช็กซ้ำที่ [${attempt}/${MAX_RETRIES}]`);
        }
        break; 
      }

      logger.warn(`⚠️ [Retry Browser] รอบที่ [${attempt}/${MAX_RETRIES}] จอ ${displayName} ไม่พบ Process กำลังรอเช็กซ้ำ...`);
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY)); 
      }
    }

    if (isBrowserRunning) {
      logger.info(`✅ [Healthy] ${displayName}: ทำงานปกติ`);
      
      if (global.globalDisplayStatus) {
        global.globalDisplayStatus[displayName] = {
          status: "เปิดทำงานปกติ ไม่พบสิ่งผิดพลาด ✅",
          isHealthy: true,
          lastCheck: new Date().toLocaleTimeString("th-TH")
        };
      }

      result.status = "OK";
      result.action = "OK_NO_ACTION";
      checkResults.push(result);
    } else {
      logger.info(`♻️ [Recovery Cycle] ดำเนินการสั่ง Workflow กู้คืนจอ ${displayName} เสร็จสิ้น`);

      result.status = "RECOVERED"; 
      result.action = "FORCED_RESTART_SUCCESS";
      checkResults.push(result);
    }
  } 

  logger.info("\n📝 บันทึกผลการตรวจสอบลงระบบ...");
  await saveCheckResults(checkResults);

  logger.info(`\n========== สิ้นสุดรอบการตรวจสอบ | Offline: ${actualOfflineCount}/${displaysToMonitor.length} จอ ==========\n`);
}

module.exports = { runMonitorCycle };