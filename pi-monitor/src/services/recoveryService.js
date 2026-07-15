// src/services/recoveryService.js
const { NodeSSH } = require("node-ssh");
const logger = require("../utils/logger");
const { notifyDisplayOffline, notifyRecoverySuccess, notifyRemoteFailed } = require("./notificationService");

/**
 * 1. ตรวจสอบสัญญาณชีพเครื่อง Pi ตาม Config ที่ส่งเข้ามา
 */
async function testSSHConnection(displayConfig) {
  const ssh = new NodeSSH();
  const { host, username, password } = displayConfig.ssh;
  const displayName = displayConfig.name;

  if (!host || !username) {
    logger.error(`❌ [Config Error] ไม่พบ IP หรือ USER ของจอ ${displayName}`);
    return false;
  }

  try {
    await ssh.connect({ host, username, password, readyTimeout: 7000 });
    ssh.dispose();
    logger.info(`🔌 [SSH] สัญญาณชีพเครื่อง ${displayName} (${host}) เชื่อมต่อสำเร็จ (OS: ONLINE)`);
    return true;
  } catch (err) {
    logger.warn(`❌ [SSH] เครื่อง ${displayName} (${host}) ไม่ตอบสนอง: ${err.message}`);
    return false;
  }
}

/**
 * 2. ตรวจสอบ Browser และกู้คืนระบบแยกตามเครื่อง (จัดเวลาแบบ Dynamic Loop รองรับ Wayland ทั้ง Dicut และ SheetFold)
 */
async function checkBrowserProcess(displayConfig) {
  const ssh = new NodeSSH();
  const { host, username, password } = displayConfig.ssh;
  const displayName = displayConfig.name;

  try {
    await ssh.connect({ host, username, password, readyTimeout: 7000 });

    // 🔍 2. เช็ก Process เบราว์เซอร์ว่าเปิดอยู่ไหม (แยกกรณีตามประเภทหน้าจอ)
    // 🔍 เช็ก Process เบราว์เซอร์ว่าเปิดอยู่ไหม (อัปเดตรองรับ Tray และ RollFold เพิ่มเติม)
    let isBrowserRunning = false;

    if (displayName === "Dicut" || displayName === "SheetFold" || displayName === "Tray" || displayName === "RollFold") {
      // ✨ เพิ่ม RollFold เข้ามาเช็กโปรเซสชื่อ chromium ตรงๆ ผ่านระบบ OS ไม่โดนบล็อก
      const checkChromium = await ssh.execCommand("pgrep -f chromium");
      isBrowserRunning = checkChromium.stdout && checkChromium.stdout.trim() !== "";
    } else {
      const checkChromium = await ssh.execCommand("DISPLAY=:0 xdotool search --class chromium");
      isBrowserRunning = checkChromium.stdout && checkChromium.stdout.trim() !== "";
    }

    if (isBrowserRunning) {
      logger.info(`✅ [Healthy] เบราว์เซอร์ของ ${displayName} เปิดทำงานปกติ ไม่พบสิ่งผิดพลาด`);
      
      // ➕ ส่งสถานะปกติไฟเขียวเข้าสู่ระบบ Web Dashboard ทันที
      if (global.globalDisplayStatus) {
        global.globalDisplayStatus[displayName] = {
          status: "เปิดทำงานปกติ ไม่พบสิ่งผิดพลาด ✅",
          isHealthy: true,
          lastCheck: new Date().toLocaleTimeString("th-TH")
        };
      }

      ssh.dispose();
      return true;
    } else {
      logger.warn(`⚠️ [PROCESS OFFLINE] จอ ${displayName} ดับ! เริ่มกระบวนการกู้คืน...`);

      // แจ้งเตือนภัย LINE ครั้งแรก
      await notifyDisplayOffline(displayName);

      // ➕ สลับการ์ดหน้าเว็บเป็น "ไฟสีแดงกะพริบ 🔴" เพื่อรายงานว่าตรวจเจอจอดับและกำลังเริ่มล้างระบบ
      if (global.globalDisplayStatus) {
        global.globalDisplayStatus[displayName] = {
          status: "⚠️ จอดับ! [1/4] กำลังเคลียร์โปรเซสตกค้าง...",
          isHealthy: false,
          lastCheck: new Date().toLocaleTimeString("th-TH")
        };
      }

      // 🧹 Step 1: เคลียร์โปรเซสเก่าที่ตกค้างออกก่อนตามความเหมาะสมรายจอ
      logger.info(`🧹 [Recovery 1/4] กำลังเคลียร์โปรเซสตกค้างบนเครื่อง ${displayName}...`);
      if (displayName === "Dicut") {
        await ssh.execCommand("tmux kill-session -t dicut_ser0 2>/dev/null || tmux kill-server 2>/dev/null || true");
        await ssh.execCommand("sudo fuser -k -n tcp 2010 2>/dev/null || true");
        await ssh.execCommand("sudo fuser -k -n tcp 3000 2>/dev/null || true");
        await ssh.execCommand("sudo fuser -k 2010/tcp 3000/tcp 2>/dev/null || true");
        await ssh.execCommand("sudo kill -9 $(sudo lsof -t -i:2010) 2>/dev/null || true");
        await ssh.execCommand("sudo kill -9 $(sudo lsof -t -i:3000) 2>/dev/null || true");
        await ssh.execCommand("pkill -9 -f nodemon || pkill -f nodemon || true");
        await ssh.execCommand("pkill -9 -f bun || pkill -f bun || true");
        await ssh.execCommand("pkill -f chromium || true");
      } else if (displayName === "SheetFold") {
        await ssh.execCommand("tmux kill-session -t sheetfold_servers 2>/dev/null || true");
        await ssh.execCommand("sudo fuser -k 2010/tcp 3000/tcp 2>/dev/null || true");
        await ssh.execCommand("pkill -f chromium || true");

      } else if (displayName === "Tray") {
        await ssh.execCommand("tmux kill-session -t tray_servers 2>/dev/null || true");
        await ssh.execCommand("sudo fuser -k 2010/tcp 2>/dev/null || true");
        await ssh.execCommand("pkill -f chromium || true");

      } else if (displayName === "RollFold") {
        await ssh.execCommand("tmux kill-session -t rollfold_servers 2>/dev/null || true");
        await ssh.execCommand("sudo fuser -k 3000/tcp 2>/dev/null || true");
        await ssh.execCommand("pkill -f chromium || true");

      } else {
        await ssh.execCommand("pkill -f node && pkill -f bun && tmux kill-server && sudo fuser -k 2010/tcp && sudo fuser -k 3000/tcp");
      }

      // หน่วงเวลา 3 วินาที ให้ OS คลายพอร์ตเรียบร้อยจริง ๆ ก่อนเริ่มขั้นตอนถัดไป
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 🚀 Step 2 & 3: สั่งรันระบบเซิร์ฟเวอร์หลังบ้านและกำหนดเป้าหมาย URL รายจอ
      logger.info(`🔄 [Recovery 2/4] สั่งรันระบบเซิร์ฟเวอร์หลังบ้านเครื่อง ${displayName}...`);

      // ➕ ส่งสถานะกำลังเปิดระบบหลังบ้านขึ้นหน้าเว็บ แดชบอร์ด
      if (global.globalDisplayStatus) {
        global.globalDisplayStatus[displayName].status = "🔄 [2/4] กำลังเปิดเซิร์ฟเวอร์หลังบ้าน...";
      }

      let targetUrl = "http://localhost:3000"; // Default พอร์ตหน้าเว็บหลัก

      if (displayName === "Dicut") {
        logger.info(`📥 [Dicut] กำลังเปิดระบบและสั่งรันสคริปต์หลักผ่านสิทธิ์จำลองแมนวล tmux send-keys...`);
        await ssh.execCommand("tmux new-session -d -s dicut_ser0");
        await new Promise(resolve => setTimeout(resolve, 500));
        await ssh.execCommand("tmux send-keys -t dicut_ser0 'cd /home/jiant/Desktop && DISPLAY=:0 bash start_dicut.sh' Enter");
        targetUrl = "http://localhost:3000";

      } else if (displayName === "SheetFold") {
        logger.info(`📥 [SheetFold] เริ่มรันตัว Server ผ่านสคริปต์ start-servers.sh ใน tmux...`);
        await ssh.execCommand("tmux new-session -d -s sheetfold_servers 'cd /home/jiant/Desktop && DISPLAY=:0 bash start-servers.sh'");
        targetUrl = "http://localhost:3000";

      } else if (displayName === "Tray") {
        logger.info(`📥 [Tray] เรียกเปิดสคริปต์รัน Express ผ่าน tmux แยกเบื้องหลัง...`);
        await ssh.execCommand("tmux new-session -d -s tray_servers 'cd /home/jiant/Desktop && DISPLAY=:0 bash start_express.sh'");
        targetUrl = "http://192.168.3.147:3000/print/TrayMachine";

      } else if (displayName === "RollFold") {
        logger.info(`📥 [RollFold] สั่งเปิดเซิร์ฟเวอร์ผ่าน tmux เบื้องหลังด้วยไฟล์สคริปต์ Monitor หน้า Desktop...`);
        await ssh.execCommand("tmux new-session -d -s rollfold_servers 'cd /home/jiant/Desktop && DISPLAY=:0 ./Monitor'");
        targetUrl = "http://192.168.3.147:3000/print/NewFoldMachine";

      } else {
        await ssh.execCommand("DISPLAY=:0 nohup bash /home/jiant/Desktop/start_dicut.sh > /dev/null 2>&1 &");
        await new Promise(resolve => setTimeout(resolve, 7000));
      }

      // 🔄 วนลูปตรวจสอบความพร้อมของพอร์ต 3000 แบบ Dynamic (เหลือเฉพาะ Dicut และ SheetFold)
      if (displayName === "Dicut" || displayName === "SheetFold" || displayName === "RollFold") {
        logger.info(`⏳ [${displayName}] กำลังดักรอให้พอร์ต 3000 ตื่นและพร้อมทำงานจริง (สูงสุด 25 วินาที)...`);
        let isPort3000Live = false;
        for (let i = 0; i < 25; i++) {
          
          // ➕ อัปเดตเวลานับถอยหลังการรอ Compile พอร์ต 3000 ให้โชว์บนหน้าเว็บวินาทิต่อวินาที
          if (global.globalDisplayStatus) {
            global.globalDisplayStatus[displayName].status = `⏳ [3/4] กำลังรอพอร์ต 3000 บิ้วด์ระบบ (${i}/25 วินาที)...`;
          }

          const check3000 = await ssh.execCommand("sudo fuser 3000/tcp");
          if (check3000.stdout && check3000.stdout.trim() !== "") {
            isPort3000Live = true;
            logger.info(`🎉 [${displayName}] พอร์ต 3000 พร้อมใช้งานแล้ว! (ใช้เวลาบิ้วด์ไป ${i} วินาที)`);
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (!isPort3000Live) {
          logger.warn(`⚠️ [${displayName}] คำเตือน: พอร์ต 3000 ยังไม่ตอบสนอง แต่จะลองสั่งเปิดเบราว์เซอร์ล่วงหน้า`);
        }
      }

      // 🔄 วนลูปตรวจสอบความพร้อมของพอร์ต 2010 สำหรับเครื่อง Tray โดยเฉพาะ
      if (displayName === "Tray") {
        logger.info(`⏳ [Tray] กำลังดักรอให้หลังบ้านพอร์ต 2010 ตื่นและพร้อมทำงานจริง (สูงสุด 25 วินาที)...`);
        let isPort2010Live = false;
        for (let i = 0; i < 25; i++) {
          
          // ➕ อัปเดตเวลานับถอยหลังการรอของเครื่อง Tray ลงหน้าจอเว็บแอปแบบสดๆ
          if (global.globalDisplayStatus) {
            global.globalDisplayStatus[displayName].status = `⏳ [3/4] กำลังรอหลังบ้านพอร์ต 2010 (${i}/25 วินาที)...`;
          }

          const check2010 = await ssh.execCommand("sudo fuser 2010/tcp");
          if (check2010.stdout && check2010.stdout.trim() !== "") {
            isPort2010Live = true;
            logger.info(`🎉 [Tray] ระบบหลังบ้านพอร์ต 2010 พร้อมใช้งานแล้ว! (ใช้เวลาตื่น ${i} วินาที)`);
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (!isPort2010Live) {
          logger.warn(`⚠️ [Tray] คำเตือน: พอร์ต 2010 ยังไม่ตอบสนอง แต่จะลองสั่งเปิดเบราว์เซอร์ล่วงหน้า`);
        }
      }

      // 📺 Step 4: บังคับเปิดเว็บเบราว์เซอร์อัตโนมัติ
      logger.info(`🚀 [Recovery 4/4] บังคับให้หน้าจอ VNC เปิดบราวเซอร์ของ ${displayName} ไปที่ URL: ${targetUrl}...`);

      // ➕ ส่งผลลัพธ์ว่าระบบกำลังดีดเปิดโปรแกรมเบราว์เซอร์ของจอนั้นๆ
      if (global.globalDisplayStatus) {
        global.globalDisplayStatus[displayName].status = "📺 [4/4] กำลังดีดเปิดหน้าต่างเบราว์เซอร์เต็มจอ...";
      }

      if (displayName === "SheetFold") {
        logger.info(`📺 [SheetFold] กำลังใช้คำสั่งเปิดแบบแอปพลิเคชันเต็มจอไร้ขอบ (Fullscreen Mode)...`);
        await ssh.execCommand("rm -rf /home/jiant/.config/chromium/Singleton*");
        await ssh.execCommand("pkill -f chromium || true");
        await new Promise(resolve => setTimeout(resolve, 1000));

        const runSheetFoldBrowser =
          `sudo -u jiant env DISPLAY=:0 XAUTHORITY=/home/jiant/.Xauthority XDG_RUNTIME_DIR=/run/user/1000 chromium-browser --app="${targetUrl}" ` +
          `--start-fullscreen --no-first-run --disable-infobars --disable-session-crashed-bubble > /dev/null 2>&1 &`;
        await ssh.execCommand(runSheetFoldBrowser);
        logger.info(`✨ [SheetFold] สั่งเปิดหน้าต่างเบราว์เซอร์เสร็จสิ้น`);

      } else if (displayName === "Tray") {
        logger.info(`📺 [Tray] เริ่มกระบวนการกู้คืนระบบแสดงผลพอร์ต 2010 (Wayland Mode)...`);
        await ssh.execCommand("rm -rf /home/jiant/.config/chromium/Singleton*");
        await ssh.execCommand("pkill -f chromium || true");
        await new Promise(resolve => setTimeout(resolve, 1000));

        const runTrayBrowser =
          `sudo -u jiant env DISPLAY=:0 XAUTHORITY=/home/jiant/.Xauthority XDG_RUNTIME_DIR=/run/user/1000 chromium --app="${targetUrl}" ` +
          `--start-fullscreen --no-first-run --disable-infobars --disable-session-crashed-bubble > /dev/null 2>&1 &`;

        await ssh.execCommand(runTrayBrowser);
        logger.info(`✨ [Tray] สั่งเปิดหน้าต่างเบราว์เซอร์เสร็จสิ้น`);

      } else if (displayName === "RollFold") {
        logger.info(`📺 [RollFold] เริ่มกระบวนการกู้คืนระบบแสดงผลพอร์ต 3000 (Wayland Mode)...`);
        await ssh.execCommand("rm -rf /home/jiant/.config/chromium/Singleton*");
        await ssh.execCommand("pkill -f chromium || true");
        await new Promise(resolve => setTimeout(resolve, 1000));

        const runRollFoldBrowser =
          `sudo -u jiant env DISPLAY=:0 XAUTHORITY=/home/jiant/.Xauthority XDG_RUNTIME_DIR=/run/user/1000 chromium --app="${targetUrl}" ` +
          `--start-fullscreen --no-first-run --disable-infobars --disable-session-crashed-bubble > /dev/null 2>&1 &`;

        await ssh.execCommand(runRollFoldBrowser);
        logger.info(`✨ [RollFold] สั่งเปิดหน้าต่างเบราว์เซอร์เสร็จสิ้น`);

      } else if (displayName === "Dicut") {
        logger.info(`📺 [Dicut] เริ่มกระบวนการกู้คืนระบบแสดงผลพอร์ต 3000 (Wayland Mode)...`);
        await ssh.execCommand("rm -rf /home/jiant/.config/chromium/Singleton*");
        await ssh.execCommand("pkill -f chromium || true");
        await new Promise(resolve => setTimeout(resolve, 1000));

        await ssh.execCommand("tmux kill-session -t dicut_browser 2>/dev/null || true");
        await new Promise(resolve => setTimeout(resolve, 500));

        const runBrowserInTmux =
          `sudo -u jiant env DISPLAY=:0 XAUTHORITY=/home/jiant/.Xauthority XDG_RUNTIME_DIR=/run/user/1000 tmux new-session -d -s dicut_browser ` +
          `'chromium --app="${targetUrl}" --start-fullscreen --no-first-run ` +
          `--disable-infobars --disable-session-crashed-bubble --disable-features=Translate'`;

        await ssh.execCommand(runBrowserInTmux);
        await new Promise(resolve => setTimeout(resolve, 5000));
        logger.info(`✨ [Dicut] สั่งเปิดหน้าต่างเบราว์เซอร์เสร็จสิ้น`);

      } else {
        await ssh.execCommand(`DISPLAY=:0 xdg-open ${targetUrl} > /dev/null 2>&1 &`);

        logger.info("⏳ [Real-time Monitor] กำลังรอหน้าต่างเบราว์เซอร์เพื่อกด F11...");
        for (let attempt = 1; attempt <= 20; attempt++) {
          const checkVisibleWindow = await ssh.execCommand("DISPLAY=:0 xdotool search --class chromium");
          if (checkVisibleWindow.stdout && checkVisibleWindow.stdout.trim() !== "") {
            logger.info(`🎯 เจอหน้าต่างแล้ว! กำลังกด F11 เต็มจอให้ ${displayName}...`);
            await ssh.execCommand("DISPLAY=:0 xdotool search --class chromium windowactivate key F11");
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // ปล่อยให้นิ่ง 5 วินาทีเพื่อให้เบราว์เซอร์โหลดหน้าเว็บเสร็จสมบูรณ์
      logger.info("⏳ [Real-time Monitor] หน้าต่างเปิดทำงานเรียบร้อย รอนิ่ง 5 วินาที...");
      await new Promise(resolve => setTimeout(resolve, 5000));

      // 🔍 ตรวจสอบความชัวร์ครั้งสุดท้าย: เช็กพอร์ตว่ารันติดจริงไหม
      const checkPort2010 = await ssh.execCommand("sudo fuser 2010/tcp");
      const checkPort3000 = await ssh.execCommand("sudo fuser 3000/tcp");

      const isPortActive = (checkPort2010.stdout && checkPort2010.stdout.trim() !== "") ||
        (checkPort3000.stdout && checkPort3000.stdout.trim() !== "");

      if (isPortActive) {
        logger.info(`✅ [Success] ระบบเครื่อง ${displayName} ทำงานติดเรียบร้อย!`);
        await notifyRecoverySuccess(displayName);

        // ➕ กู้คืนสำเร็จ ส่งไฟเขียวกลับหน้า Dashboard ทันที
        if (global.globalDisplayStatus) {
          global.globalDisplayStatus[displayName] = {
            status: "กู้คืนระบบอัตโนมัติสำเร็จ หน้าจอทำงานปกติแล้ว 🎉",
            isHealthy: true,
            lastCheck: new Date().toLocaleTimeString("th-TH")
          };
        }

        ssh.dispose();
        return true;
      } else {
        logger.error(`❌ [Failed] พอร์ตระบบของเครื่อง ${displayName} ไม่ทำงาน สคริปต์เปิดไม่สำเร็จ`);
        await notifyRemoteFailed(displayName);

        // ➕ แจ้งเตือนบนหน้า Dashboard ค้างสถานะกล่องไฟแดง พร้อมรายงานผลขัดข้อง
        if (global.globalDisplayStatus) {
          global.globalDisplayStatus[displayName] = {
            status: "❌ กู้คืนล้มเหลว! พอร์ตระบบไม่ทำงาน กรุณาให้เจ้าหน้าที่ตรวจสอบ",
            isHealthy: false,
            lastCheck: new Date().toLocaleTimeString("th-TH")
          };
        }

        ssh.dispose();
        return false;
      }
    }
  } catch (err) {
    logger.error(`❌ checkBrowserProcess(${displayName}) เกิดข้อผิดพลาด: ${err.message}`);
    return false;
  }
}

module.exports = { testSSHConnection, checkBrowserProcess };