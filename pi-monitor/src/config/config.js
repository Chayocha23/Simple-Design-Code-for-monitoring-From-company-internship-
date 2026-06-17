// src/config/config.js
// รวมการตั้งค่าทั้งหมดไว้ที่นี่ที่เดียว
require("dotenv").config();

const config = {
  // ช่วงเวลาการตรวจสอบ (นาที)
  checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES || "5", 10), 
  // 10 แปลงเป็นเลขฐาน 10 (0-9)

  // รายชื่อหน้าจอ Pi ทั้งหมดในระบบ
  // key = ชื่อ display (ตรงกับชื่อคอลัมน์ใน Google Sheet)
  displays: {
    Dicut: {
      name: "Dicut",
      ssh: {
        host: process.env.PI_DICUT_HOST,
        username: process.env.PI_DICUT_USER,
        password: process.env.PI_DICUT_PASS,
      },
    },
    RollFold: {
      name: "RollFold",
      ssh: {
        host: process.env.PI_ROLLFOLD_HOST,
        username: process.env.PI_ROLLFOLD_USER,
        password: process.env.PI_ROLLFOLD_PASS,
      },
    },
    SheetFold: {
      name: "SheetFold",
      ssh: {
        host: process.env.PI_SHEETFOLD_HOST,
        username: process.env.PI_SHEETFOLD_USER,
        password: process.env.PI_SHEETFOLD_PASS,
      },
    },
    Tray: {
      name: "Tray",
      ssh: {
        host: process.env.PI_TRAY_HOST,
        username: process.env.PI_TRAY_USER,
        password: process.env.PI_TRAY_PASS,
      },
    },
  },

  // Google Sheets
  googleSheet: {
    sheetId: process.env.GOOGLE_SHEET_ID,
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    sheetName: process.env.SHEET_NAME || "StatusSheet",
  },

  // LINE Messaging API
  lineMessagingApi: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    userOrGroupId: process.env.LINE_USER_OR_GROUP_ID,
    apiUrl: "https://api.line.me/v2/bot/message/push",
  },

  // Email
  email: {
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587", 10),
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    to: process.env.EMAIL_TO,
  },

  // คำสั่ง SSH สำหรับ Auto-Recovery
  piStartupScript: process.env.PI_STARTUP_SCRIPT || "/home/pi/start_display.sh",
};

module.exports = config;
