// src/services/recoveryService.js
// บริการกู้คืน Pi อัตโนมัติผ่าน SSH (Remote Restart + Script)
const { NodeSSH } = require("node-ssh");
const config = require("../config/config");
const logger = require("../utils/logger");

const USE_MOCK = true; // ← เปลี่ยนเป็น false เมื่อพร้อม Production

// ----------------------------------------------------------------
// ทดสอบการเชื่อมต่อ SSH (Remote Ping)
// ----------------------------------------------------------------

/**
 * ลองเชื่อมต่อ SSH ไปยัง Pi เพื่อเช็คว่าเข้าถึงได้หรือไม่
 * @param {string} displayName - ชื่อหน้าจอ (key ใน config.displays)
 * @returns {Promise<boolean>}
 */
async function testSSHConnection(displayName) {
  if (USE_MOCK) {
    // จำลอง: RollFold และ Tray เชื่อมต่อ SSH ไม่ได้ (Offline จริง)
    const mockFailList = ["Tray"];
    const success = !mockFailList.includes(displayName);
    logger.info(`[MOCK] testSSHConnection(${displayName}) → ${success ? "SUCCESS" : "FAILED"}`);
    return success;
  }

  const ssh = new NodeSSH();
  const sshConfig = config.displays[displayName]?.ssh;

  if (!sshConfig) {
    logger.error(`ไม่พบ SSH config สำหรับ display: ${displayName}`);
    return false;
  }

  try {
    await ssh.connect({ ...sshConfig, readyTimeout: 10000 });
    ssh.dispose();
    logger.info(`SSH เชื่อมต่อสำเร็จ: ${displayName} (${sshConfig.host})`);
    return true;
  } catch (err) {
    logger.warn(`SSH เชื่อมต่อล้มเหลว: ${displayName} → ${err.message}`);
    return false;
  }
}

// ----------------------------------------------------------------
// ส่งคำสั่ง Restart บังคับผ่าน SSH (Remote Auto-Restart)
// ----------------------------------------------------------------

/**
 * ส่งคำสั่ง Reboot ไปยัง Pi และรอให้ Pi กลับมา
 * แล้วรันสคริปต์เปิดหน้าจอ Queue อัตโนมัติ
 * @param {string} displayName
 * @returns {Promise<boolean>} - true ถ้า Pi กลับมาทำงานสำเร็จ
 */
async function remoteRestartPi(displayName) {
  if (USE_MOCK) {
    // จำลอง: RollFold กู้คืนได้, Tray กู้คืนไม่ได้
    const mockSuccessList = ["RollFold"];
    const success = mockSuccessList.includes(displayName);
    logger.info(`[MOCK] remoteRestartPi(${displayName}) → ${success ? "SUCCESS" : "FAILED"}`);
    return success;
  }

  const ssh = new NodeSSH();
  const sshConfig = config.displays[displayName]?.ssh;

  try {
    logger.info(`กำลัง SSH เข้า ${displayName} เพื่อ Restart...`);
    await ssh.connect({ ...sshConfig, readyTimeout: 10000 });

    // ส่งคำสั่ง Reboot (nohup ป้องกัน SSH ตัดกลางคัน)
    await ssh.execCommand("sudo reboot", {});
    ssh.dispose();

    logger.info(`ส่งคำสั่ง Reboot ไปยัง ${displayName} แล้ว รอ 60 วินาทีให้ Pi บูต...`);

    // รอให้ Pi บูตเสร็จ (~60 วินาที)
    await sleep(60000);

    // ลองเชื่อมต่อใหม่หลัง Reboot
    const isBack = await testSSHConnection(displayName);
    if (!isBack) {
      logger.warn(`${displayName} ยังไม่กลับมาหลัง Reboot`);
      return false;
    }

    // Pi กลับมาแล้ว → รันสคริปต์เปิดหน้าจอ Queue
    await ssh.connect({ ...sshConfig, readyTimeout: 15000 });
    const result = await ssh.execCommand(`bash ${config.piStartupScript}`);
    ssh.dispose();

    if (result.code === 0) {
      logger.info(`${displayName}: เปิดสคริปต์หน้าจอ Queue สำเร็จ`);
      return true;
    } else {
      logger.warn(`${displayName}: รันสคริปต์ไม่สำเร็จ → ${result.stderr}`);
      return false;
    }
  } catch (err) {
    logger.error(`remoteRestartPi(${displayName}) ผิดพลาด: ${err.message}`);
    ssh.dispose();
    return false;
  }
}

// ----------------------------------------------------------------
// ตรวจสอบว่า Pi กลับมาทำงานหลัง Auto-Restart แล้วหรือยัง
// (ใช้หลังจาก Pi ส่งคำสั่ง Restart ตัวเอง)
// ----------------------------------------------------------------

/**
 * เช็คว่า Pi กลับมา Online หลังจาก Self-Restart หรือยัง
 * @param {string} displayName
 * @param {number} maxRetries     - จำนวนครั้งที่จะลองตรวจซ้ำ
 * @param {number} retryIntervalMs - ระยะเวลาระหว่างการลองแต่ละครั้ง (ms)
 * @returns {Promise<boolean>}
 */
async function waitForPiToReturn(displayName, maxRetries = 5, retryIntervalMs = 15000) {
  if (USE_MOCK) {
    logger.info(`[MOCK] waitForPiToReturn(${displayName}) → true`);
    return true;
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    logger.info(`ตรวจสอบ ${displayName} กลับมาหรือยัง... (ครั้งที่ ${attempt}/${maxRetries})`);
    const isBack = await testSSHConnection(displayName);
    if (isBack) {
      logger.info(`${displayName} กลับมาทำงานปกติแล้ว!`);
      return true;
    }
    if (attempt < maxRetries) await sleep(retryIntervalMs);
  }

  logger.warn(`${displayName} ยังไม่กลับมาหลังจากรอ ${maxRetries} ครั้ง`);
  return false;
}

// ----------------------------------------------------------------
// บังคับรีสตาร์ทผ่านเครือข่าย/ฮาร์ดแวร์ภายนอก (เมื่อ SSH เชื่อมต่อล้มเหลว)
// ----------------------------------------------------------------

/**
 * ส่งคำสั่งพิเศษ (เช่น ยิง API ไปที่ Smart Plug หรือคำสั่ง Network ด่านแรก) 
 * เพื่อบังคับตัดไฟ/รีสตาร์ทบอร์ด Pi จากภายนอก ในกรณีที่บอร์ดค้างจน SSH ไม่ติด
 * @param {string} displayName 
 * @returns {Promise<boolean>} - true ถ้าส่งคำสั่งบังคับรีสตาร์ทสำเร็จ
 */
async function forceNetworkRestartPi(displayName) {
  if (USE_MOCK) {
    // จำลองสถานะ: ให้หน้าจอที่เกิดปัญหา สามารถส่งคำสั่งบังคับรีสตาร์ทสำเร็จ
    logger.info(`[MOCK] forceNetworkRestartPi(${displayName}) → ส่งคำสั่งบังคับรีสตาร์ทสำเร็จ (ฝั่งขวา Flowchart)`);
    return true;
  }

  try {
    logger.info(`กำลังส่งคำสั่งพิเศษเพื่อบังคับรีสตาร์ท ${displayName} จากภายนอกระบบ...`);
    
    // TODO: ในอนาคตเมื่อลงระบบจริงตรงนี้จะใส่คำสั่งยิงไปที่ปลั๊กไฟอัจฉริยะ หรือสคริปต์ Network ด่านแรก
    // ตัวอย่าง: await axios.post(config.smartPlugApi, { device: displayName, action: "reboot" });
    
    return true; 
  } catch (err) {
    logger.error(`forceNetworkRestartPi(${displayName}) ล้มเหลว: ${err.message}`);
    return false;
  }
}

// ----------------------------------------------------------------
// Helper
// ----------------------------------------------------------------
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { 
  testSSHConnection, 
  remoteRestartPi, 
  waitForPiToReturn, 
  forceNetworkRestartPi 
};
