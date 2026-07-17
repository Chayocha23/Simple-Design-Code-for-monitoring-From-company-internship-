# 🖥️ Pi-Monitoring System v2.0

> **Automated Screen Monitor & Recovery System (Wayland Architecture Ready)**
>
> ระบบมอนิเตอร์และกู้คืนหน้าจออัตโนมัติ สำหรับจอแสดงผลแผนการผลิตในไลน์ผลิต (Dicut, SheetFold, Tray และ RollFold)

---

## 📌 วัตถุประสงค์ของระบบ

เพื่อแก้ไขปัญหาหน้าจอ Monitor ดับเอง หรือ Browser Process เกิด Crash/Blackout ระหว่างวัน โดยทำหน้าที่เป็น **Self-Healing Runtime (ระบบกู้คืนอัตโนมัติ)** ตรวจจับสถานะ Browser Process ระดับ OS, ทำการ Port Cleanup, สั่ง Restart Backend Service ผ่าน `tmux` และดึงหน้าต่าง Browser กลับมาแสดงผลโหมด Full Screen ทันที พร้อมส่งรายงานผลการ Recovery หรือแจ้งเตือนสถานะเมื่อหน้าจอเกิดการ OFFLINE ไปยัง **LINE Official Account (@734vrboa)** แบบ Real-time

---

## 🏗️ สถาปัตยกรรมและการปรับปรุง (System Architecture)

1. **Process-Level Scanning (Wayland Support)**  
   เปลี่ยนมาใช้คำสั่ง `pgrep -f chromium` ตรวจสอบสถานะจากระดับ Operating System (OS) โดยตรง รองรับทั้ง X11 และ Wayland (แก้ปัญหาเครื่องมือเดิม เช่น `xdotool` ที่อ่านค่าไม่ได้บน Wayland)

2. **Healthy Log System**  
   หาก Browser ทำงานปกติ จะบันทึกข้อความ

   ```
   [Healthy] Browser Process Running Normally
   ```

   ลง Console (สีเขียว) โดยไม่ส่ง Notification ไปรบกวนใน LINE Group

3. **Dynamic Waiting Loop**  
   ใช้คำสั่ง `sudo fuser` วนลูปตรวจสอบ Backend Port ต่อเนื่องสูงสุด 25 วินาที เพื่อให้ Browser เปิดทันทีเมื่อ Port พร้อมทำงาน ลด Idle Waiting Time

---

## 📋 รายละเอียดเชิงเทคนิครายหน้าจอ

### 1. หน้าจอ Dicut (Wayland)

- **Backend & Frontend**
  - Port `3000`
  - URL `http://localhost:3000`

- **Recovery**
  - Cleanup Port `2010`
  - Cleanup Port `3000`
  - Kill Process (`Node`, `Bun`, `Chromium`)
  - สร้าง tmux Session ชื่อ `dicut_ser0`
  - รัน `start_dicut.sh`

- **Browser Recovery**
  - สร้าง tmux Session `dicut_browser`
  - รันภายใต้สิทธิ์ `sudo -u jiant`
  - กำหนด

    ```
    XDG_RUNTIME_DIR=/run/user/1000
    ```

  - เปิด Chromium แบบ App + Fullscreen

---

### 2. หน้าจอ SheetFold (Wayland)

- **Backend & Frontend**
  - Port `3000`
  - URL `http://localhost:3000`

- **Recovery**
  - ลบ tmux Session `sheetfold_servers`
  - Cleanup Port `3000`
  - สร้าง Session ใหม่
  - รัน

```bash
bash start-servers.sh
```

- **Browser Recovery**
  - รันภายใต้ `sudo -u jiant`
  - เปิด `chromium-browser`
  - App Mode + Fullscreen

---

### 3. หน้าจอ Tray (Wayland)

#### สถาปัตยกรรม Backend–Frontend
* **Local Backend:** Port `2010`
* **Frontend:** ดึงข้อมูลจากเซิร์ฟเวอร์กลาง (Central Production Server) ผ่าน Port `3000`
  * URL: `http://192.168.3.147:3000/print/TrayMachine`

#### Recovery (Safe Cleanup)
* ปิดและล้างเฉพาะ tmux Session `tray_servers`
* ทำ Port Cleanup เฉพาะ Port `2010/tcp` (หลีกเลี่ยงกระบวนการ Aggressive Cleanup เพื่อไม่ให้กระทบผู้ใช้งานส่วนอื่น)
* ตรวจสอบสถานะผ่าน **Specialized Health Check Loop** เพื่อวนลูปเช็ก Port `2010` จนกว่าจะพร้อมใช้งาน

#### Browser Recovery
* ระบบจะเข้าสู่กระบวนการ **Dynamic Service Verification** เพื่อสแกนตรวจสอบความพร้อมของบริการพอร์ต 3000 อย่างต่อเนื่อง
* เมื่อระบบปลายทางพร้อมให้บริการ (Service Ready State) จะดำเนินการเปิด Chromium ผ่านสภาพแวดล้อมของผู้ใช้งานหน้าจอ (สิทธิ์ Wayland และ WayVNC)
* สั่งเปิดเบราว์เซอร์ในโหมด Application Mode (App Mode) และ Fullscreen Mode พร้อมเชื่อมต่อไปยังหน้าเว็บเป้าหมายโดยอัตโนมัติ:
  ```text
  [http://192.168.3.147:3000/print/NewFoldMachine](http://192.168.3.147:3000/print/NewFoldMachine)

---

### 4. หน้าจอ RollFold (Wayland)

#### สถาปัตยกรรม Backend–Frontend
* **Frontend Endpoint:** เชื่อมต่อไปยังเซิร์ฟเวอร์กลางเพื่อแสดงผลตารางการผลิตของเครื่องพับถุงกระดาษ (Roll Fold Machine)
  * URL: `http://192.168.3.147:3000/print/NewFoldMachine`

#### Recovery (Desktop Executable Recovery)
* เครื่อง RollFold ไม่ได้เริ่มทำงานผ่าน Shell Script (`.sh`) แต่เปิดผ่าน Desktop Executable Script บน Desktop
* ระบบจะทำการควบคุมผ่าน tmux Session ชื่อ `rollfold_servers`
* สั่งข้ามหน้าต่าง Execute Confirmation Dialog ของ OS โดยรันคำสั่งโดยตรงผ่าน Command Line:
  ```bash
  cd /home/jiant/Desktop
  ./Monitor
  ```
#### Browser Recovery
* ระบบจะเข้าสู่กระบวนการ **Dynamic Service Verification** เพื่อสแกนตรวจสอบความพร้อมของบริการพอร์ต 3000 อย่างต่อเนื่อง
* เมื่อระบบปลายทางพร้อมให้บริการ (Service Ready State) จะดำเนินการเปิด Chromium ผ่านสภาพแวดล้อมของผู้ใช้งานหน้าจอ (สิทธิ์ Wayland และ WayVNC)
* สั่งเปิดเบราว์เซอร์ในโหมด Application Mode (App Mode) และ Fullscreen Mode พร้อมเชื่อมต่อไปยังหน้าเว็บเป้าหมายโดยอัตโนมัติ:
  ```text
  [http://192.168.3.147:3000/print/NewFoldMachine](http://192.168.3.147:3000/print/NewFoldMachine)


---

# 🚀 คู่มือการบริหารจัดการระบบด้วย PM2

คู่มือนี้รวบรวมคำสั่งสำหรับควบคุม ตรวจสอบ และดูแลระบบที่ทำงานอยู่บน PM2

---

## 1. คำสั่งเริ่มต้นระบบครั้งแรก (First-Time Deployment)

ใช้ในกรณีที่มีการรีเซ็ตเครื่องคอมพิวเตอร์หลักใหม่ หรือต้องการฝังโค้ดมอนิเตอร์และระบบ Web App เข้าไปทำงานอยู่เบื้องหลังระบบปฏิบัติการ (Background Process) เป็นครั้งแรก:

### ติดตั้งระบบ PM2 ลงคอมพิวเตอร์หลัก (ทำครั้งแรกครั้งเดียว):
```bash
npm install pm2 -g
```

### สั่งเริ่มต้นระบบมอนิเตอร์และสร้างเซิร์ฟเวอร์ Web App (พอร์ต 4000):

```bash
pm2 start app.js --name "pi-monitor-app"
```

> **หมายเหตุ**
>
> เปลี่ยน `app.js` ให้เป็นไฟล์หลักของโปรเจกต์ เช่น
>
> - `server.js`
> - `index.js`

---

## 📊 2. คำสั่งตรวจสอบสถานะ (Monitoring & Logging)

### ตรวจสอบสถานะทั้งหมด

```bash
pm2 status
```

### ดู Log แบบ Real-time

```bash
pm2 logs pi-monitor-app
```

> กด **Ctrl + C** เพื่อออกจากหน้าจอ Log โดยระบบยังทำงานต่อ

### ดู Log ย้อนหลัง 100 บรรทัด

```bash
pm2 logs pi-monitor-app --lines 100
```

---

## 🔄 3. คำสั่งอัปเดตระบบ (System Maintenance)

### Restart

```bash
pm2 restart pi-monitor-app
```

### Reload (Zero-Downtime)

```bash
pm2 reload pi-monitor-app
```

> แนะนำให้ใช้ `reload` หากเป็นการแก้ไขโค้ดทั่วไป เพราะระบบจะไม่หยุดให้บริการ

---

## 🛑 4. คำสั่งหยุดและลบระบบ

### หยุดระบบ

```bash
pm2 stop pi-monitor-app
```

### เปิดระบบใหม่

```bash
pm2 start pi-monitor-app
```

### ลบออกจาก PM2

```bash
pm2 delete pi-monitor-app
```

---

## 🌐 เงื่อนไขและสถาปัตยกรรมการเปิดใช้งานระบบ (System Availability)

ระบบมอนิเตอร์และแดชบอร์ดเวอร์ชันนี้รันในรูปแบบ **Centralized Management (ระบบจัดการส่วนกลาง)** โดยเปลี่ยนคอมพิวเตอร์หลักให้ทำหน้าที่เป็น Local Server ประจำโรงงาน ซึ่งมีข้อกำหนดในการเปิดใช้งานดังนี้:

1. **การเปิดเครื่องและเชื่อมต่อระบบ:** คอมพิวเตอร์หลัก (IP: `172.16.0.213`) จะต้องเปิดใช้งาน (Power On) และเชื่อมต่อเครือข่ายของโรงงานตลอดเวลาที่มีการเดินไลน์ผลิต หากเซิร์ฟเวอร์ดับ ระบบกู้คืนหลังบ้านและหน้าเว็บแดชบอร์ดทั้งหมดจะไม่สามารถเข้าถึงได้
2. **การทำงานเบื้องหลัง:** ตัวโปรแกรมจะถูกรันและควบคุมอยู่เบื้องหลังผ่าน PM2 ในรูปแบบ Background Service เจ้าหน้าที่ไม่จำเป็นต้องเปิดโปรแกรม VS Code หรือหน้าต่าง Terminal ค้างไว้
3. **การกู้คืนระบบยามฉุกเฉิน (Windows Manual Auto-Restart Solution):** เนื่องจาก Security Policy ของระบบปฏิบัติการอาจบล็อกคำสั่งสคริปต์ระบบฝังลึก ผู้พัฒนาจึงจัดทำแนวทางการชุบชีวิตระบบถาวรเมื่อคอมพิวเตอร์เกิดดับไว้ดังนี้:
   * เปิด Command Prompt บนเครื่อง Server แล้วบันทึกโปรเซสปัจจุบันลงความจำถาวร:
     ```bash
     pm2 save
     ```
   * สร้างสคริปต์สั้นสำหรับกดรันชุบชีวิตโปรเซสผ่านหน้าจอ Desktop:
     ```bash
     echo pm2 resurrect > %USERPROFILE%\Desktop\start_monitor.bat
     ```
   * **แนวทางปฏิบัติหน้างาน:** เมื่อเครื่องเซิร์ฟเวอร์หลักเกิดดับหรือปิดเปิดใหม่ ให้เจ้าหน้าที่ทำการดับเบิ้ลคลิกไฟล์ `start_monitor.bat` บนหน้าจอ Desktop เพียงทีเดียว ระบบจะดึงโปรเซส `pi-monitor-app` ให้ตื่นขึ้นมาออนไลน์พร้อมเปิดพอร์ตแดชบอร์ดสแตนด์บายทันที

## 🌐 5. การเข้าใช้งาน Dashboard

### URL

```text
http://172.16.0.213:4000
```

### เงื่อนไข

- ต้องอยู่ในเครือข่าย LAN หรือ Wi-Fi เดียวกัน
- เปิดได้จาก
  - คอมพิวเตอร์
  - โทรศัพท์มือถือ
  - แท็บเล็ต
- ไม่สามารถเข้าจากอินเทอร์เน็ตภายนอก (4G / 5G)

---

## 💬 6. LINE Bot Integration

ระบบบอทแจ้งเตือนจะทำหน้าที่ส่งข้อมูล Log และสถานะการกู้คืนระบบ (Self-Healing Status) เข้าสู่หน้าจอแชตส่วนบุคคลทันทีเมื่อตรวจพบกรณีฉุกเฉินหรือหน้าจอในไลน์ผลิตเกิดการ OFFLINE

### ช่องทางการเพิ่มเพื่อน (Friend Registration)
* **การค้นหาผ่านไอดี (LINE Bot ID Search):** ค้นหาผ่านเมนูไอดีในแอปพลิเคชัน LINE ด้วยคำว่า `@734vrboa` *(ต้องใส่เครื่องหมาย `@` นำหน้าเสมอ)*
* **การสแกนรหัส (QR Code Scanning):** ช่างเทคนิคและผู้ดูแลระบบสามารถใช้สมาร์ทโฟนสแกนรูปภาพ QR Code ประจำระบบเพื่อทำการกดเพิ่มเพื่อนเข้าระบบบอทแจ้งเตือนได้ทันที

---

# 🛠️ Maintenance CLI

คำสั่งสำหรับช่างเทคนิคเมื่อรีโมทผ่าน RealVNC

## เปิด Monitoring

```bash
npm start
```

---

## ตรวจสอบ tmux

### Dicut

```bash
tmux attach -t dicut_ser0
```

### SheetFold

```bash
tmux attach -t sheetfold_servers
```

### Tray

```bash
tmux attach -t tray_servers
```

### RollFold

```bash
tmux attach -t rollfold_servers
```

> **ออกจาก tmux**
>
> กด
>
> **Ctrl + B**
>
> แล้วกด
>
> **D**
>
> (Detach)

---

## ตรวจสอบ Process

### Chromium Process

pgrep -f chromium
```

### Port 3000

```bash
sudo fuser 3000/tcp
```

### Port 2010

```bash
sudo fuser 2010/tcp
```

## 🐳 คู่มือการบริหารจัดการระบบด้วย Docker (Containerization)

> ระบบนี้ได้รับการยกระดับสถาปัตยกรรมให้อยู่ในรูปแบบ Docker Container เพื่อให้สามารถนำไปใช้งานบนคอมพิวเตอร์เครื่องใหม่ได้ทันที โดยไม่จำเป็นต้องติดตั้ง Node.js หรือ PM2 ที่เครื่องปลายทาง

---

### 📌 สิ่งที่ต้องติดตั้งก่อนเริ่มใช้งาน (Prerequisites)

- ติดตั้ง **Docker Desktop** (Windows/macOS)
- หรือ **Docker Engine** (Linux)

ตรวจสอบการติดตั้ง

```bash
docker --version
```

---

## 🛠️ 1. สร้าง Docker Image

เปิด Terminal ภายในโฟลเดอร์โปรเจกต์

```bash
docker build -t pi-monitor-app .
```

---

## ▶️ 2. เริ่มต้นระบบ

```bash
docker run -d \
  --name pi-monitor-service \
  -p 4000:4000 \
  --restart unless-stopped \
  pi-monitor-app
```

> **หมายเหตุ**
>
> `--restart unless-stopped`
>
> เมื่อเครื่องเปิดใหม่ Docker จะเริ่ม Container ให้อัตโนมัติ ยกเว้นผู้ดูแลระบบเป็นผู้สั่ง Stop เอง

---

## 📊 3. ตรวจสอบสถานะระบบ

### ดู Container ที่กำลังทำงาน

```bash
docker ps
```

### ดู Container ทั้งหมด

```bash
docker ps -a
```

### ดู Log แบบ Real-time

```bash
docker logs -f pi-monitor-service
```

> กด **Ctrl + C** เพื่อออกจากหน้าจอ Log โดย Container จะยังคงทำงานต่อ

---

## 🔄 4. คำสั่งบริหารจัดการระบบ

### รีสตาร์ทระบบ

```bash
docker restart pi-monitor-service
```

### หยุดระบบ

```bash
docker stop pi-monitor-service
```

### เปิดระบบอีกครั้ง

```bash
docker start pi-monitor-service
```

### ลบ Container

```bash
docker rm -f pi-monitor-service
```

### ลบ Docker Image

```bash
docker rmi pi-monitor-app
```

---

## 🌐 5. เข้าใช้งาน Dashboard

เมื่อ Container มีสถานะ **Up** แล้ว

เปิด

```text
http://172.16.0.213:4000
```

---

### เงื่อนไข

- ต้องอยู่ในเครือข่าย LAN หรือ Wi-Fi เดียวกัน
- รองรับ
  - คอมพิวเตอร์
  - โทรศัพท์มือถือ
  - แท็บเล็ต
- ไม่สามารถเข้าผ่านอินเทอร์เน็ตภายนอกได้

---

## 💡 Workflow การอัปเดตโปรแกรม

เมื่อมีการแก้ไข Source Code

### 1. หยุดและลบ Container เดิม

```bash
docker rm -f pi-monitor-service
```

### 2. Build Image ใหม่

```bash
docker build -t pi-monitor-app .
```

### 3. เปิดระบบใหม่

```bash
docker run -d \
  --name pi-monitor-service \
  -p 4000:4000 \
  --restart unless-stopped \
  pi-monitor-app
```

---

## ✅ Deployment เสร็จสมบูรณ์

หลังจากดำเนินการครบทุกขั้นตอน ระบบ Pi-Monitor จะทำงานอยู่ภายใน Docker Container และพร้อมใช้งานทันที โดย Docker จะเป็นผู้ดูแล Process แทน PM2 ทำให้ไม่จำเป็นต้องติดตั้ง Node.js หรือ PM2 บนเครื่องปลายทางอีกต่อไป