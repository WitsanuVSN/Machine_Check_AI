import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Camera,
  Check,
  ChevronRight,
  ClipboardCheck,
  History,
  ImagePlus,
  Menu,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import MachineVision from "./MachineVision";
import InspectionList from "./components/InspectionList";
import InspectionDetail from "./components/InspectionDetail";
import "./InspectionPages.css";

import "./App.css";

const STORAGE_KEYS = {
  checklist: "machineGuard_checklist",
  draft: "machineGuard_draft",
  history: "machineGuard_history",
};

const DEFAULT_CHECKLIST = [
  {
    id: "clean",
    title: "สภาพความสะอาดของเครื่องจักร",
    category: "เครื่องจักร",
    description: "ตรวจโซ่ มู่เล่ สายพาน และเศษยางสะสม",
    required: true,
  },
  {
    id: "electric",
    title: "ระบบไฟฟ้าและตู้ควบคุม",
    category: "ระบบ",
    description: "ตรวจสายไฟ ฝาครอบ และไฟแสดงสถานะ",
    required: true,
  },
  {
    id: "pump",
    title: "PUMP และจุดรั่วซึม",
    category: "เครื่องจักร",
    description: "ตรวจเสียงผิดปกติ น้ำมัน และของเหลวรั่ว",
    required: true,
  },
  {
    id: "conveyor",
    title: "เครื่องจักรและสายพาน",
    category: "เครื่องจักร",
    description: "ตรวจแนวสายพาน รอยฉีก และวัสดุติดค้าง",
    required: true,
  },
  {
    id: "loader",
    title: "F/L และรถตัก",
    category: "ยานพาหนะ",
    description: "ตรวจความพร้อมใช้งานและความเสียหาย",
    required: false,
  },
  {
    id: "water",
    title: "ระบบน้ำและการถ่ายน้ำ",
    category: "ระบบ",
    description: "ตรวจวาล์ว ท่อ และทางระบายน้ำ",
    required: true,
  },
  {
    id: "lighting",
    title: "ระบบไฟและแสงสว่าง",
    category: "ความปลอดภัย",
    description: "ตรวจแสงสว่างและหลอดไฟในพื้นที่",
    required: true,
  },
  {
    id: "lime",
    title: "พื้นที่เตรียมปูนขาว",
    category: "พื้นที่",
    description: "ตรวจความสะอาด ถัง และฝาครอบจุดหมุน",
    required: true,
  },
  {
    id: "soil",
    title: "บ่อดินและตะแกรง",
    category: "พื้นที่",
    description: "ตรวจการอุดตันและความชำรุด",
    required: true,
  },
  {
    id: "area",
    title: "ความสะอาดพื้นที่โดยรอบ",
    category: "พื้นที่",
    description: "ตรวจทางเดินและสิ่งกีดขวาง",
    required: true,
  },
  {
    id: "contam",
    title: "การเก็บ CONTAM",
    category: "คุณภาพ",
    description: "ตรวจการแยกประเภทและจุดจัดเก็บ",
    required: true,
  },
  {
    id: "screen",
    title: "ตะแกรงคัด CONTAM",
    category: "คุณภาพ",
    description: "ตรวจความชำรุดและการอุดตัน",
    required: true,
  },
  {
    id: "mixer",
    title: "MIXER และการป้อนยาง",
    category: "การผลิต",
    description: "ตรวจการป้อนยางและการทำงานผิดปกติ",
    required: true,
  },
  {
    id: "rubber",
    title: "ความละเอียดของยาง",
    category: "คุณภาพ",
    description: "ตรวจขนาดยางตามเกณฑ์หน้างาน",
    required: true,
  },
  {
    id: "overflow",
    title: "ALARM OVER FLOW",
    category: "ระบบ",
    description: "ทดสอบระบบแจ้งเตือนว่าทำงานได้",
    required: true,
  },
  {
    id: "ppe",
    title: "การสวมใส่อุปกรณ์ PPE",
    category: "ความปลอดภัย",
    description: "ตรวจการสวม PPE ของพนักงาน",
    required: true,
  },
];


function loadStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function createInitialDraft() {
  return {
    machine: "AJ2",
    shift: "กะเช้า",
    inspector: "",
    handoverNote: "",
    results: {},
    updatedAt: new Date().toISOString(),
  };
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateString));
}

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/*
  ลดขนาดรูปก่อนเก็บลง localStorage
  เพื่อไม่ให้พื้นที่เต็มเร็วเกินไป
*/
function compressImage(file, maxWidth = 900, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = reject;

    reader.onload = () => {
      const image = new Image();

      image.onerror = reject;

      image.onload = () => {
        const scale = Math.min(1, maxWidth / image.width);
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("ไม่สามารถประมวลผลรูปภาพได้"));
          return;
        }

        context.drawImage(image, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", quality));
      };

      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}

/*
  ตรวจคุณภาพภาพจริงด้วย Canvas:
  - ความสว่าง
  - Contrast
  - รายละเอียด/ความคมชัดเบื้องต้น

  ไม่ได้สุ่มผลและไม่ใช่ข้อมูล mock
*/
function analyzeImage(imageSource) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onerror = reject;

    image.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 100;

      canvas.width = size;
      canvas.height = size;

      const context = canvas.getContext("2d", {
        willReadFrequently: true,
      });

      if (!context) {
        reject(new Error("ไม่สามารถวิเคราะห์ภาพได้"));
        return;
      }

      context.drawImage(image, 0, 0, size, size);

      const imageData = context.getImageData(0, 0, size, size);
      const pixels = imageData.data;
      const grayValues = new Float32Array(size * size);

      let sum = 0;
      let sumSquare = 0;
      let pixelIndex = 0;

      for (let index = 0; index < pixels.length; index += 4) {
        const gray =
          pixels[index] * 0.299 +
          pixels[index + 1] * 0.587 +
          pixels[index + 2] * 0.114;

        grayValues[pixelIndex] = gray;
        sum += gray;
        sumSquare += gray * gray;
        pixelIndex += 1;
      }

      const brightness = sum / pixelIndex;

      const contrast = Math.sqrt(
        Math.max(
          0,
          sumSquare / pixelIndex - brightness * brightness
        )
      );

      let edges = 0;

      for (let y = 1; y < size; y += 1) {
        for (let x = 1; x < size; x += 1) {
          const index = y * size + x;

          edges += Math.abs(
            grayValues[index] - grayValues[index - 1]
          );

          edges += Math.abs(
            grayValues[index] - grayValues[index - size]
          );
        }
      }

      const sharpness = edges / pixelIndex;

      let status = "good";
      let title = "ภาพพร้อมใช้งาน";
      let message = "คุณภาพภาพเพียงพอสำหรับใช้เป็นหลักฐาน";

      if (brightness < 55) {
        status = "bad";
        title = "ภาพมืดเกินไป";
        message = "กรุณาเปิดแฟลชหรือถ่ายในจุดที่มีแสงมากขึ้น";
      } else if (brightness > 225) {
        status = "warning";
        title = "ภาพสว่างเกินไป";
        message = "กรุณาหลีกเลี่ยงแสงสะท้อนและถ่ายภาพใหม่";
      } else if (sharpness < 12) {
        status = "warning";
        title = "ภาพอาจไม่ชัด";
        message = "กรุณาถือโทรศัพท์ให้นิ่งและถ่ายใกล้ขึ้น";
      }

      const score = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            50 +
            contrast * 0.55 +
            sharpness * 0.7 -
            Math.abs(brightness - 135) * 0.08
          )
        )
      );

      resolve({
        status,
        title,
        message,
        score,
        brightness: Math.round(brightness),
        contrast: Math.round(contrast),
        sharpness: Math.round(sharpness),
      });
    };

    image.src = imageSource;
  });
}

function App() {
  const [page, setPage] = useState("inspection");
  const [mobileMenu, setMobileMenu] = useState(false);

  const [checklist, setChecklist] = useState(() =>
    loadStorage(STORAGE_KEYS.checklist, DEFAULT_CHECKLIST)
  );

  const [draft, setDraft] = useState(() =>
    loadStorage(STORAGE_KEYS.draft, createInitialDraft())
  );

  const [history, setHistory] = useState(() =>
    loadStorage(STORAGE_KEYS.history, [])
  );

  const [activeItemId, setActiveItemId] = useState(
    checklist[0]?.id || null
  );

  const [newItem, setNewItem] = useState({
    title: "",
    category: "เครื่องจักร",
    description: "",
    required: true,
  });

  const [search, setSearch] = useState("");
  const fileInputRef = useRef(null);

  function openInspectionItem(itemId) {
    setActiveItemId(itemId);
    setPage("inspection-detail");
    setMobileMenu(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function backToInspectionList() {
    setPage("inspection");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.checklist,
      JSON.stringify(checklist)
    );
  }, [checklist]);

  useEffect(() => {
    const nextDraft = {
      ...draft,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(
      STORAGE_KEYS.draft,
      JSON.stringify(nextDraft)
    );
  }, [draft]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.history,
      JSON.stringify(history)
    );
  }, [history]);

  useEffect(() => {
    if (
      checklist.length > 0 &&
      !checklist.some((item) => item.id === activeItemId)
    ) {
      setActiveItemId(checklist[0].id);
    }
  }, [checklist, activeItemId]);

  const activeItem = checklist.find(
    (item) => item.id === activeItemId
  );

  const activeResult =
    draft.results[activeItemId] || {
      status: "pending",
      note: "",
      image: "",
      analysis: null,
    };

  const completedCount = Object.values(draft.results).filter(
    (result) =>
      result.status === "pass" || result.status === "fail"
  ).length;

  const passedCount = Object.values(draft.results).filter(
    (result) => result.status === "pass"
  ).length;

  const failedCount = Object.values(draft.results).filter(
    (result) => result.status === "fail"
  ).length;

  const progress = checklist.length
    ? Math.round((completedCount / checklist.length) * 100)
    : 0;

  const requiredItems = checklist.filter((item) => item.required);

  const requiredCompleted = requiredItems.every((item) => {
    const status = draft.results[item.id]?.status;

    return status === "pass" || status === "fail";
  });

  const filteredChecklist = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return checklist;
    }

    return checklist.filter((item) => {
      return (
        item.title.toLowerCase().includes(keyword) ||
        item.category.toLowerCase().includes(keyword) ||
        item.description.toLowerCase().includes(keyword)
      );
    });
  }, [checklist, search]);

  function updateDraft(field, value) {
    if (field === "machine" && value !== draft.machine) {
      const hasInspectionData =
        Object.keys(draft.results).length > 0 ||
        draft.handoverNote.trim() !== "";

      if (
        hasInspectionData &&
        !window.confirm(
          "เปลี่ยนเครื่องจักรจะล้างผลตรวจและบันทึกส่งกะที่ยังไม่ส่งมอบ ยืนยันหรือไม่?"
        )
      ) {
        return;
      }

      setDraft((current) => ({
        ...current,
        machine: value,
        results: {},
        handoverNote: "",
      }));

      return;
    }

    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateResult(itemId, data) {
    setDraft((current) => ({
      ...current,
      results: {
        ...current.results,
        [itemId]: {
          status: "pending",
          note: "",
          image: "",
          analysis: null,
          ...current.results[itemId],
          ...data,
        },
      },
    }));
  }

  async function handleImage(file) {
    if (!file || !activeItemId) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      alert("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }

    try {
      const compressedImage = await compressImage(file);
      const analysis = await analyzeImage(compressedImage);

      updateResult(activeItemId, {
        image: compressedImage,
        analysis,
      });
    } catch (error) {
      console.error(error);
      alert("ไม่สามารถอ่านรูปภาพได้");
    }
  }

  function goToNextItem() {
    if (!activeItemId) {
      return;
    }

    const currentIndex = checklist.findIndex(
      (item) => item.id === activeItemId
    );

    const nextItem = checklist[currentIndex + 1];

    if (nextItem) {
      setActiveItemId(nextItem.id);
    }
  }

  function saveInspection() {
    if (!draft.inspector.trim()) {
      alert("กรุณากรอกชื่อผู้ตรวจ");
      return;
    }

    if (!requiredCompleted) {
      const incomplete = requiredItems.filter((item) => {
        const status = draft.results[item.id]?.status;

        return status !== "pass" && status !== "fail";
      });

      alert(
        `ยังตรวจไม่ครบ ${incomplete.length} รายการที่บังคับ`
      );

      return;
    }

    const inspection = {
      id: createId(),
      machine: draft.machine,
      shift: draft.shift,
      inspector: draft.inspector.trim(),
      handoverNote: draft.handoverNote.trim(),
      results: draft.results,
      checklistSnapshot: checklist,
      passedCount,
      failedCount,
      totalCount: checklist.length,
      createdAt: new Date().toISOString(),
    };

    setHistory((current) => [inspection, ...current]);

    const nextDraft = {
      ...createInitialDraft(),
      machine: draft.machine,
      shift: draft.shift,
      inspector: draft.inspector,
    };

    setDraft(nextDraft);
    localStorage.setItem(
      STORAGE_KEYS.draft,
      JSON.stringify(nextDraft)
    );

    setActiveItemId(checklist[0]?.id || null);

    alert("บันทึกและส่งมอบกะเรียบร้อย");
  }

  function addChecklistItem(event) {
    event.preventDefault();

    if (!newItem.title.trim()) {
      alert("กรุณากรอกชื่อหัวข้อตรวจ");
      return;
    }

    const item = {
      id: createId(),
      title: newItem.title.trim(),
      category: newItem.category.trim() || "อื่น ๆ",
      description:
        newItem.description.trim() ||
        "ตรวจสอบตามมาตรฐานหน้างาน",
      required: newItem.required,
    };

    setChecklist((current) => [...current, item]);

    setNewItem({
      title: "",
      category: "เครื่องจักร",
      description: "",
      required: true,
    });
  }

  function deleteChecklistItem(itemId) {
    const item = checklist.find((row) => row.id === itemId);

    if (!item) {
      return;
    }

    const confirmed = window.confirm(
      `ต้องการลบรายการ "${item.title}" ใช่หรือไม่`
    );

    if (!confirmed) {
      return;
    }

    setChecklist((current) =>
      current.filter((row) => row.id !== itemId)
    );

    setDraft((current) => {
      const nextResults = { ...current.results };
      delete nextResults[itemId];

      return {
        ...current,
        results: nextResults,
      };
    });
  }

  function deleteHistoryItem(inspectionId) {
    const confirmed = window.confirm(
      "ต้องการลบประวัติรายการนี้ใช่หรือไม่"
    );

    if (!confirmed) {
      return;
    }

    setHistory((current) =>
      current.filter((item) => item.id !== inspectionId)
    );
  }

  function resetDraft() {
    const confirmed = window.confirm(
      "ต้องการล้างข้อมูลที่กำลังตรวจทั้งหมดใช่หรือไม่"
    );

    if (!confirmed) {
      return;
    }

    const nextDraft = {
      ...createInitialDraft(),
      machine: draft.machine,
      shift: draft.shift,
      inspector: draft.inspector,
    };

    setDraft(nextDraft);
    setActiveItemId(checklist[0]?.id || null);
  }

  function changePage(nextPage) {
    setPage(nextPage);
    setMobileMenu(false);
  }

  return (
    <div className="app">
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="logo">
          <div className="logo-icon">
            <Wrench size={22} />
          </div>

          <div>
            <strong>MachineGuard</strong>
            <small>AI Shift Inspection</small>
          </div>
        </div>

        <nav>
          <button
            className={
              page === "inspection" || page === "inspection-detail"
                ? "active"
                : ""
            }
            onClick={() => changePage("inspection")}
          >
            <ClipboardCheck />
            ตรวจรับ–ส่งกะ
          </button>

          <button
            className={page === "history" ? "active" : ""}
            onClick={() => changePage("history")}
          >
            <BarChart3 />
            ประวัติการตรวจ
          </button>

          <button
            className={page === "manage" ? "active" : ""}
            onClick={() => changePage("manage")}
          >
            <Settings2 />
            จัดการรายการตรวจ
          </button>
        </nav>

        <div className="storage-status">
          <span className="status-dot" />

          <div>
            <strong>บันทึกในเครื่อง</strong>
            <small>ใช้ localStorage</small>
          </div>
        </div>
      </aside>

      {mobileMenu && (
        <button
          className="overlay"
          aria-label="ปิดเมนู"
          onClick={() => setMobileMenu(false)}
        />
      )}

      <main className="main">
        <header className="topbar">
          <button
            className="menu-button"
            onClick={() => setMobileMenu(true)}
          >
            <Menu />
          </button>

          <div>
            <small>VON BUNDIT CO., LTD.</small>

            <h1>
              {page === "inspection" &&
                "ตรวจเช็คเครื่องจักรและการต่อกะ"}

              {page === "inspection-detail" && "รายละเอียดการตรวจ"}

              {page === "history" && "ประวัติการตรวจ"}

              {page === "manage" && "จัดการรายการตรวจ"}
            </h1>
          </div>
        </header>

        {page === "inspection" && (
          <section className="page">
            <div className="shift-form card">
              <label>
                เครื่องจักร

                <select
                  value={draft.machine}
                  onChange={(event) =>
                    updateDraft("machine", event.target.value)
                  }
                >
                  <option value="AJ2">AJ2</option>
                  <option value="Mixer">Mixer</option>
                </select>
              </label>

              <label>
                กะ

                <select
                  value={draft.shift}
                  onChange={(event) =>
                    updateDraft("shift", event.target.value)
                  }
                >
                  <option value="กะเช้า">กะเช้า</option>
                  <option value="กะบ่าย">กะบ่าย</option>
                  <option value="กะดึก">กะดึก</option>
                </select>
              </label>

              <label>
                ผู้ตรวจ

                <input
                  value={draft.inspector}
                  placeholder="ชื่อผู้ตรวจ"
                  onChange={(event) =>
                    updateDraft("inspector", event.target.value)
                  }
                />
              </label>
            </div>

            <div className="progress-card">
              <div className="progress-header">
                <span>ความคืบหน้า</span>
                <strong>
                  {completedCount}/{checklist.length} รายการ
                </strong>
              </div>

              <div className="progress-track">
                <div
                  className="progress-value"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="progress-summary">
                <span className="pass-text">
                  <Check />
                  ผ่าน {passedCount}
                </span>

                <span className="fail-text">
                  <X />
                  ไม่ผ่าน {failedCount}
                </span>

                <span>
                  รอตรวจ {checklist.length - completedCount}
                </span>
              </div>
            </div>

            <InspectionList
              checklist={checklist}
              results={draft.results}
              onOpen={openInspectionItem}
            />

            <section className="handover card">
              <label>
                บันทึกการส่งมอบกะ

                <textarea
                  value={draft.handoverNote}
                  placeholder="รายละเอียดที่ต้องแจ้งให้กะถัดไปรับทราบ"
                  onChange={(event) =>
                    updateDraft(
                      "handoverNote",
                      event.target.value
                    )
                  }
                />
              </label>

              <div className="handover-actions">
                <button
                  className="secondary-button"
                  onClick={resetDraft}
                >
                  ล้างแบบฟอร์ม
                </button>

                <button
                  className="submit-button"
                  onClick={saveInspection}
                >
                  <ShieldCheck />
                  ยืนยันส่งมอบกะ
                </button>
              </div>
            </section>
          </section>
        )}

        {page === "inspection-detail" && (
          activeItem ? (
            <InspectionDetail
              item={activeItem}
              result={activeResult}
              machine={draft.machine}
              shift={draft.shift}
              index={checklist.findIndex(
                (item) => item.id === activeItemId
              )}
              total={checklist.length}
              onChange={(data) => updateResult(activeItem.id, data)}
              onBack={backToInspectionList}
              onPrevious={() => {
                const index = checklist.findIndex(
                  (item) => item.id === activeItemId
                );

                if (index > 0) {
                  setActiveItemId(checklist[index - 1].id);
                }
              }}
              onNext={goToNextItem}
            />
          ) : (
            <section className="page">
              <div className="card empty-state">
                <p>ไม่พบรายการตรวจนี้</p>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={backToInspectionList}
                >
                  กลับรายการตรวจ
                </button>
              </div>
            </section>
          )
        )}

        {page === "history" && (
          <section className="page">
            <div className="history-summary">
              <div className="summary-card">
                <span>จำนวนการตรวจทั้งหมด</span>
                <strong>{history.length}</strong>
              </div>

              <div className="summary-card">
                <span>จำนวนข้อไม่ผ่านสะสม</span>
                <strong className="fail-text">
                  {history.reduce(
                    (total, item) =>
                      total + item.failedCount,
                    0
                  )}
                </strong>
              </div>

              <div className="summary-card">
                <span>การตรวจล่าสุด</span>

                <strong className="summary-date">
                  {history.length
                    ? formatDate(history[0].createdAt)
                    : "-"}
                </strong>
              </div>
            </div>

            <section className="history-card card">
              <div className="card-heading">
                <div>
                  <h2>ประวัติการตรวจ</h2>
                  <p>
                    ข้อมูลที่บันทึกไว้ในอุปกรณ์นี้
                  </p>
                </div>

                <History />
              </div>

              {history.length === 0 && (
                <div className="empty-state large">
                  <History />
                  <strong>ยังไม่มีประวัติการตรวจ</strong>
                  <span>
                    เมื่อส่งมอบกะ ข้อมูลจะแสดงที่นี่
                  </span>
                </div>
              )}

              {history.map((inspection) => (
                <article
                  className="history-row"
                  key={inspection.id}
                >
                  <div
                    className={`history-status ${inspection.failedCount > 0
                      ? "warning"
                      : "success"
                      }`}
                  >
                    {inspection.failedCount > 0 ? (
                      <AlertTriangle />
                    ) : (
                      <Check />
                    )}
                  </div>

                  <div className="history-info">
                    <strong>
                      {inspection.machine} ·{" "}
                      {inspection.shift}
                    </strong>

                    <span>
                      ผู้ตรวจ: {inspection.inspector}
                    </span>

                    <small>
                      {formatDate(inspection.createdAt)}
                    </small>
                  </div>

                  <div className="history-result">
                    <span className="pass-text">
                      ผ่าน {inspection.passedCount}
                    </span>

                    <span className="fail-text">
                      ไม่ผ่าน {inspection.failedCount}
                    </span>
                  </div>

                  <button
                    className="icon-button danger"
                    onClick={() =>
                      deleteHistoryItem(inspection.id)
                    }
                    aria-label="ลบประวัติ"
                  >
                    <Trash2 />
                  </button>
                </article>
              ))}
            </section>
          </section>
        )}

        {page === "manage" && (
          <section className="page">
            <form
              className="add-form card"
              onSubmit={addChecklistItem}
            >
              <div className="card-heading no-border">
                <div>
                  <h2>เพิ่มหัวข้อตรวจ</h2>
                  <p>
                    รายการจะถูกบันทึกในอุปกรณ์นี้
                  </p>
                </div>

                <Plus />
              </div>

              <div className="form-grid">
                <label>
                  ชื่อหัวข้อตรวจ

                  <input
                    value={newItem.title}
                    placeholder="เช่น ตรวจเสียงมอเตอร์"
                    onChange={(event) =>
                      setNewItem((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>

                <label>
                  หมวดหมู่

                  <input
                    value={newItem.category}
                    placeholder="เครื่องจักร"
                    onChange={(event) =>
                      setNewItem((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="full-width">
                  รายละเอียดหรือเกณฑ์ตรวจ

                  <textarea
                    value={newItem.description}
                    placeholder="อธิบายสิ่งที่ต้องตรวจสอบ"
                    onChange={(event) =>
                      setNewItem((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newItem.required}
                    onChange={(event) =>
                      setNewItem((current) => ({
                        ...current,
                        required: event.target.checked,
                      }))
                    }
                  />

                  บังคับตรวจหัวข้อนี้
                </label>

                <button
                  type="submit"
                  className="primary-button add-button"
                >
                  <Plus />
                  เพิ่มรายการ
                </button>
              </div>
            </form>

            <section className="manage-list card">
              <div className="card-heading">
                <div>
                  <h2>รายการตรวจทั้งหมด</h2>
                  <p>{checklist.length} รายการ</p>
                </div>

                <input
                  className="search-input"
                  value={search}
                  placeholder="ค้นหารายการ"
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                />
              </div>

              {filteredChecklist.map((item, index) => (
                <article
                  className="manage-row"
                  key={item.id}
                >
                  <span className="manage-number">
                    {index + 1}
                  </span>

                  <div>
                    <strong>{item.title}</strong>

                    <span>
                      {item.category} · {item.description}
                    </span>
                  </div>

                  {item.required && (
                    <span className="required-badge">
                      บังคับ
                    </span>
                  )}

                  <button
                    className="icon-button danger"
                    onClick={() =>
                      deleteChecklistItem(item.id)
                    }
                    aria-label={`ลบ ${item.title}`}
                  >
                    <Trash2 />
                  </button>
                </article>
              ))}

              {filteredChecklist.length === 0 && (
                <div className="empty-state">
                  ไม่พบรายการตรวจ
                </div>
              )}
            </section>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;