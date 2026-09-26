# 1. ติดตั้ง Python, Ollama และ Node.js
winget install -e --id Python.Python.3.13
winget install -e --id Ollama.Ollama
winget install -e --id OpenJS.NodeJS.LTS

# ตรวจสอบ version
py -3.13 --version
ollama --version
node -v
npm -v

# 2. โหลดโมเดล AI เปิดแอป Ollama จาก Start ก่อน แล้วรัน
ollama pull gemma3:4b
ollama list

# 3. ติดตั้งแพ็กเกจ Python
cd /d C:\project_ai\machine-check-ai\backend_python

# สร้าง .venv เฉพาะเครื่องใหม่ที่ยังไม่มี:
py -3.13 -m venv .venv

# เปิดใช้งานและติดตั้งแพ็กเกจ:
.venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install fastapi uvicorn python-multipart Pillow httpx "pydantic>=2,<3" ollama

# ถ้าจะใช้ไฟล์ vision.py รุ่น OpenCV เดิมด้วย ให้เพิ่ม:
python -m pip install opencv-python numpy scikit-image

# 4. ติดตั้งแพ็กเกจหน้าเว็บ
cd /d C:\project_ai\machine-check-ai
npm install
npm run dev

# 5. รันหลังบ้าน — เปิดค้างไว้
# 1
cd /d C:\project_ai\machine-check-ai\backend_python
# 2
.venv\Scripts\activate //checkin in (vene or unicorn)
# 3
python -m uvicorn main:app --host 127.0.0.1 --port 8002
