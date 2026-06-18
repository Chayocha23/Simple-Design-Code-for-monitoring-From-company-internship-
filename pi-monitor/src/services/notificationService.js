// src/services/notificationService.js
// บริการส่งแจ้งเตือนผ่าน LINE Messaging API และ Email
const axios = require("axios");
const nodemailer = require("nodemailer");
const config = require("../config/config");
const logger = require("../utils/logger");

const USE_MOCK = false; // ← เปลี่ยนเป็น false เมื่อพร้อม Production

// ----------------------------------------------------------------
// LINE Messaging API
// ----------------------------------------------------------------

/**
 * ส่งข้อความแจ้งเตือนผ่าน LINE Messaging API
 * @param {string} message - ข้อความที่ต้องการส่ง
 */
async function sendLineMessage(message) {
  if (USE_MOCK) {
    logger.info(`[MOCK] LINE MESSAGE → "${message}"`);
    return { success: true };
  }

  try {
    const { channelAccessToken, userOrGroupId, apiUrl } = config.lineMessagingApi;

    await axios.post(
      apiUrl,
      {
        to: userOrGroupId,
        messages: [
          {
            type: "text",
            text: message,
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${channelAccessToken}`,
        },
      }
    );

    logger.info(`ส่ง LINE Messaging API สำเร็จ: "${message}"`);
    return { success: true };
  } catch (err) {
    logger.error(`sendLineMessage() เกิดข้อผิดพลาด: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ----------------------------------------------------------------
// Email
// ----------------------------------------------------------------

/**
 * ส่ง Email แจ้งเตือน
 * @param {string} subject - หัวข้อ Email
 * @param {string} body    - เนื้อหา Email (HTML หรือ text)
 */
async function sendEmail(subject, body) {
  if (USE_MOCK) {
    logger.info(`[MOCK] EMAIL → Subject: "${subject}" | Body: "${body}"`);
    return { success: true };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: false,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
    });

    await transporter.sendMail({
      from: `"Pi Monitor" <${config.email.user}>`,
      to: config.email.to,
      subject,
      html: body,
    });

    logger.info(`ส่ง Email สำเร็จ: "${subject}"`);
    return { success: true };
  } catch (err) {
    logger.error(`sendEmail() เกิดข้อผิดพลาด: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ----------------------------------------------------------------
// ฟังก์ชันรวม: ส่งทั้ง LINE + Email พร้อมกัน
// ----------------------------------------------------------------

/**
 * แจ้งเตือนว่าหน้าจอ Offline
 * @param {string} displayName - ชื่อหน้าจอ
 */
async function notifyDisplayOffline(displayName) {
  const message = `\n🔴 [Pi Monitor] แจ้งเตือน!\nหน้าจอ "${displayName}" มีสถานะ OFFLINE\nเวลา: ${new Date().toLocaleString("th-TH")}\nระบบกำลังพยายามกู้คืนอัตโนมัติ...`;
  const emailSubject = `[Pi Monitor] หน้าจอ ${displayName} Offline`;

  await Promise.all([
    sendLineMessage(message),
    //sendEmail(emailSubject, `<pre>${message}</pre>`),
  ]);
}

/**
 * แจ้งเตือนว่ากู้คืนสำเร็จ (Remote Restart สำเร็จ)
 * @param {string} displayName
 */
async function notifyRecoverySuccess(displayName) {
  const message = `\n✅ [Pi Monitor] กู้คืนสำเร็จ!\nหน้าจอ "${displayName}" กลับมาทำงานปกติแล้ว\nเวลา: ${new Date().toLocaleString("th-TH")}`;
  await sendLineMessage(message);
}

/**
 * แจ้งเตือนว่าเชื่อมต่อ Remote ไม่สำเร็จ (ต้องการให้เจ้าหน้าที่เข้าตรวจสอบ)
 * @param {string} displayName
 */
async function notifyRemoteFailed(displayName) {
  const message = `\n❌ [Pi Monitor] เชื่อมต่อ Remote ไม่สำเร็จ!\nหน้าจอ "${displayName}" ยังไม่กลับมาทำงาน\n⚠️ กรุณาให้เจ้าหน้าที่เข้าตรวจสอบโดยตรง\nเวลา: ${new Date().toLocaleString("th-TH")}`;
  const emailSubject = `[Pi Monitor] ❌ ต้องการความช่วยเหลือ: ${displayName}`;

  await Promise.all([
    sendLineMessage(message),
    //sendEmail(emailSubject, `<pre>${message}</pre>`),
  ]);
}

/**
 * แจ้งเตือนว่า Pi Restart + เปิดหน้าจอสำเร็จ (Self-Restart)
 * @param {string} displayName
 */
async function notifyPiSelfRestartSuccess(displayName) {
  const message = `\n✅ [Pi Monitor] Pi Restart สำเร็จ!\nหน้าจอ "${displayName}" รีสตาร์ทตัวเองและเปิดหน้าจอ Queue สำเร็จ\nเวลา: ${new Date().toLocaleString("th-TH")}`;
  await sendLineMessage(message);
}

/**
 * แจ้งเตือนว่า Pi ยังมีปัญหาหลัง Restart (Remote ไม่สำเร็จ)
 * @param {string} displayName
 */
async function notifyPiStillHasIssue(displayName) {
  const message = `\n⚠️ [Pi Monitor] หน้าจอยังมีปัญหาหลัง Restart\nหน้าจอ "${displayName}" ยังคงไม่ปกติ\n⚠️ กรุณาให้เจ้าหน้าที่เข้าตรวจสอบโดยตรง\nเวลา: ${new Date().toLocaleString("th-TH")}`;
  await Promise.all([
    sendLineMessage(message),
    //sendEmail(`[Pi Monitor] ⚠️ ต้องตรวจสอบด่วน: ${displayName}`, `<pre>${message}</pre>`),
  ]);
}

module.exports = {
  sendLineMessage,
  sendEmail,
  notifyDisplayOffline,
  notifyRecoverySuccess,
  notifyRemoteFailed,
  notifyPiSelfRestartSuccess,
  notifyPiStillHasIssue,
};