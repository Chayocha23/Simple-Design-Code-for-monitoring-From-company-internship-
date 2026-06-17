// src/utils/logger.js
// ระบบบันทึก Log การทำงานของระบบ
const { createLogger, format, transports } = require("winston");
require("winston-daily-rotate-file");

const { combine, timestamp, printf, colorize, errors } = format;

// รูปแบบข้อความ Log
const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `[${timestamp}] ${level}: ${stack || message}`;
});

const logger = createLogger({
  level: "info",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    // แสดงผลบน Console (มีสี)
    new transports.Console({
      format: combine(colorize(), timestamp({ format: "HH:mm:ss" }), logFormat),
    }),

    // บันทึก Log รายวัน (เก็บไว้ 14 วัน)
    new transports.DailyRotateFile({
      filename: "logs/monitor-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "14d",
      level: "info",
    }),

    // บันทึกเฉพาะ Error ไว้แยกต่างหาก
    new transports.DailyRotateFile({
      filename: "logs/error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "30d",
      level: "error",
    }),
  ],
});

module.exports = logger;
