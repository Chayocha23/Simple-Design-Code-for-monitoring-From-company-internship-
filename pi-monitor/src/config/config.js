// src/config/config.js
const path = require('path');
const fs = require('fs');

// ดักจับ Path ถอยออกไปหาโฟลเดอร์ใหญ่นอกสุด (จุดที่คุณวางไฟล์ .env ไว้จริง)
const envPath = path.join(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require("dotenv").config(); // สำรองเผื่อกรณีรันในโฟลเดอร์ปกติ
}

const config = {
  // ช่วงเวลาการตรวจสอบ (นาที)
  checkIntervalMinutes: parseInt(process.env.CHECK_INTERVAL_MINUTES || "5", 10), 

  // รายชื่อหน้าจอ Pi ทั้งหมดในระบบ
  displays: {
    Dicut: {
      name: "Dicut",
      ssh: {
        host: process.env.PI_DICUT_HOST?.trim(),
        username: process.env.PI_DICUT_USER?.trim(),
        password: process.env.PI_DICUT_PASS?.trim(),
      },
    },
    RollFold: {
      name: "RollFold",
      ssh: {
        host: process.env.PI_ROLLFOLD_HOST?.trim(),
        username: process.env.PI_ROLLFOLD_USER?.trim(),
        password: process.env.PI_ROLLFOLD_PASS?.trim(),
      },
    },
    SheetFold: {
      name: "SheetFold",
      ssh: {
        host: process.env.PI_SHEETFOLD_HOST?.trim(),
        username: process.env.PI_SHEETFOLD_USER?.trim(),
        password: process.env.PI_SHEETFOLD_PASS?.trim(),
      },
    },
    Tray: {
      name: "Tray",
      ssh: {
        host: process.env.PI_TRAY_HOST?.trim(),
        username: process.env.PI_TRAY_USER?.trim(),
        password: process.env.PI_TRAY_PASS?.trim(),
      },
    },
  },

  // Google Sheets
  googleSheet: {
    sheetId: process.env.GOOGLE_SHEET_ID?.trim(),
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim(),
    private_key: process.env.GOOGLE_PRIVATE_KEY ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
    sheetName: process.env.SHEET_NAME || "StatusSheet",
  },

  // LINE Messaging API (🎯 ใส่ ?.trim() เพื่อล้างเศษเว้นวรรคจากไฟล์ .env ทั้งหมด)
  lineMessagingApi: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim(),
    userOrGroupId: process.env.LINE_USER_OR_GROUP_ID?.trim(),
    apiUrl: "https://api.line.me/v2/bot/message/push",
  },

  // Email
  email: {
    // 🎯 แก้ไขบั๊ก ReferenceError: หยิบค่าตรงจาก process.env ไม่เรียกซ้อนตัวแปร config อีกต่อไป
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port: parseInt(process.env.EMAIL_PORT || "587", 10),
    user: process.env.EMAIL_USER?.trim(),
    pass: process.env.EMAIL_PASS?.trim(),
    to: process.env.EMAIL_TO?.trim(),
  },

  piStartupScript: process.env.PI_STARTUP_SCRIPT || "/home/pi/start_display.sh",
};

module.exports = config;