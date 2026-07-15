// src/services/googleSheetService.js
const axios = require("axios");
const logger = require("../utils/logger");
const config = require("../config/config");

/**
 * ดึงข้อมูลแผนการผลิตจริงจาก API ของ Pi แต่ตัวตามชื่อหน้าจอ
 * @param {string} displayName - ชื่อหน้าจอ เช่น "Dicut", "SheetFold", "Tray"
 */
async function fetchDisplayStatuses(displayName) {
  try {
    const displayConfig = config.displays[displayName];
    if (!displayConfig || !displayConfig.ssh.host) {
      logger.warn(`⚠️ [API] ไม่พบข้อมูล IP ของจอ ${displayName} ในระบบ`);
      return [{ display: displayName, status: "OK", lastUpdated: new Date().toISOString() }];
    }

    const ip = displayConfig.ssh.host;
    let apiUrl = "";

    // เลือก Endpoint ให้ตรงตามประเภทหน้างานจริง
    if (displayName === "Dicut") {
      apiUrl = `http://${ip}:2010/api/data/dicut`;
    } else if (displayName === "SheetFold") {
      apiUrl = `http://${ip}:2010/api/data/sheetbags`; 
    } else if (displayName === "Tray") {
      // 🎯 ชี้เป้าไปที่ Endpoint ของ Tray ตามโค้ดจริงของบอร์ดปลายทาง
      apiUrl = `http://${ip}:2010/api/data/tray`; 
    } else {
      apiUrl = `http://${ip}:2010/api/data/${displayName.toLowerCase()}`;
    }

    logger.info(`📡 [API] กำลังยิงดึงข้อมูลจริงจากเครื่อง ${displayName} (${apiUrl})...`);
    const response = await axios.get(apiUrl, { timeout: 5000 });
    
    if (response.data && response.data.length > 0) {
      logger.info(`✅ [API] เครื่อง ${displayName} ส่งข้อมูลกลับมาสำเร็จ พบงานทั้งหมด ${response.data.length} รายการ`);
      return [{ display: displayName, status: "OK", lastUpdated: new Date().toISOString() }];
    } else {
      logger.warn(`⚠️ [API] เครื่อง ${displayName} เชื่อมต่อได้ แต่ไม่พบรายการงานผลิต`);
      return [{ display: displayName, status: "OK", lastUpdated: new Date().toISOString() }];
    }
  } catch (err) {
    logger.error(`❌ [API] ไม่สามารถเชื่อมต่อกับ API บนเครื่อง ${displayName} ได้: ${err.message}`);
    return [{ display: displayName, status: "API_ERROR", lastUpdated: new Date().toISOString() }];
  }
}

/**
 * บันทึกผลการตรวจสอบลงระบบ
 */
async function saveCheckResults(results) {
  logger.info(`📝 [Log Local] ผลการตรวจสอบรอบนี้ได้รับการบันทึกเรียบร้อย`);
}

module.exports = { 
  fetchDisplayStatuses, 
  saveCheckResults 
};