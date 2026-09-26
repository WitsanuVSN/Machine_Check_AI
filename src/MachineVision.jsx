import { useEffect, useRef, useState } from "react";

const isPending = (job) =>
  job?.status === "queued" || job?.status === "running";

function readSaved(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const error = new Error(
        typeof data?.detail === "string"
          ? data.detail
          : `Backend ตอบผิดพลาด (${response.status})`
      );
      error.status = response.status;
      throw error;
    }

    if (!data) throw new Error("Backend ไม่ได้ส่งข้อมูลกลับมา");
    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "ติดต่อ Backend หมดเวลา ลองตรวจสถานะอีกครั้ง"
      );
    }
    if (error.message === "Failed to fetch") {
      throw new Error("เชื่อมต่อ Backend ไม่ได้ ตรวจว่า Python รันอยู่");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("อ่านภาพไม่ได้ กรุณาเลือก PNG หรือ JPG"));
    };

    image.onload = () => {
      try {
        const scale = Math.min(
          1,
          1000 / Math.max(image.width, image.height)
        );

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext("2d");
        if (!context) throw new Error("เตรียมภาพไม่ได้");

        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        // รับไฟล์ PNG ได้ แปลงสำเนาเพื่อลดพื้นที่ localStorage
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };

    image.src = url;
  });
}

export default function MachineVision(props) {
  // เปลี่ยนเครื่องหรือจุดตรวจแล้วแยก state ให้ชัดเจน
  return (
    <VisionPanel
      key={JSON.stringify([props.machine, props.itemId])}
      {...props}
    />
  );
}

function VisionPanel({
  machine,
  itemId,
  initialImage = "",
  onImage,
  onAnalysis,
}) {
  const storageKey =
    "machineGuard_ollama_" + JSON.stringify([machine, itemId]);

  const [photo, setPhoto] = useState(initialImage);
  const [job, setJob] = useState(() =>
    initialImage ? readSaved(storageKey) : null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [now, setNow] = useState(Date.now());

  const mounted = useRef(false);
  const actionLock = useRef(false);
  const photoRef = useRef(initialImage);
  const version = useRef(0);

  const pending = isPending(job);
  const result = job?.status === "done" ? job.result : null;

  function remember(nextJob) {
    setJob(nextJob);

    try {
      if (nextJob) {
        localStorage.setItem(storageKey, JSON.stringify(nextJob));
      } else {
        localStorage.removeItem(storageKey);
      }
      setStorageWarning("");
    } catch {
      setStorageWarning(
        "พื้นที่จัดเก็บเบราว์เซอร์ไม่พอ งานยังอยู่บน Backend " +
        "แต่การกลับมาดูงานอาจไม่ถูกจดจำ"
      );
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // รองรับการล้างแบบฟอร์มหรือเปลี่ยนภาพจาก App
  useEffect(() => {
    if (initialImage !== photoRef.current) {
      version.current += 1;
      photoRef.current = initialImage;
      setPhoto(initialImage);
      remember(null);
      setMessage("");
      setError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialImage]);

  useEffect(() => {
    if (!pending) return;

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  // สลับไปข้ออื่นแล้ว Backend ยังทำงานต่อ
  // เมื่อกลับมาข้อนี้จะติดตามงานเดิมต่อจาก localStorage
  useEffect(() => {
    if (!job?.id || !pending) return;

    let stopped = false;
    let timer;
    const id = job.id;

    async function poll() {
      try {
        const data = await api(`/api/jobs/${encodeURIComponent(id)}`);

        if (stopped) return;

        if (data.machine !== machine || data.item_id !== itemId) {
          throw new Error("งาน AI ไม่ตรงกับจุดตรวจนี้");
        }

        remember(data);
        setError("");

        if (isPending(data)) {
          timer = setTimeout(poll, 3000);
        }
      } catch (err) {
        if (stopped) return;

        if (err.status === 404) {
          remember({
            ...job,
            status: "failed",
            error: err.message,
          });
          return;
        }

        setError(`${err.message} — จะลองตรวจสถานะอีกครั้ง`);
        timer = setTimeout(poll, 5000);
      }
    }

    poll();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, pending, machine, itemId]);

  async function selectPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || actionLock.current || pending) return;

    actionLock.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    const currentVersion = version.current;

    try {
      const image = await resizeImage(file);

      if (
        !mounted.current ||
        currentVersion !== version.current
      ) return;

      photoRef.current = image;
      setPhoto(image);
      remember(null);
      onImage(image);
    } catch (err) {
      if (mounted.current) setError(err.message);
    } finally {
      actionLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function sendImage(path, replace = false) {
    const blob = await (await fetch(photo)).blob();
    const form = new FormData();

    form.append("machine", machine);
    form.append("item_id", itemId);
    form.append("image", blob, "inspection.jpg");

    if (path === "/api/reference") {
      form.append("replace", String(replace));
    }

    return api(path, {
      method: "POST",
      body: form,
    });
  }

  async function runAction(action) {
    if (!photo || actionLock.current || pending) return;

    if (
      action === "reference" &&
      !window.confirm(
        `ใช้ภาพนี้เป็นภาพมาตรฐานของ ${machine} / ${itemId}?`
      )
    ) return;

    actionLock.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    const currentVersion = version.current;
    const stillCurrent = () =>
      mounted.current && currentVersion === version.current;

    try {
      if (action === "reference") {
        try {
          await sendImage("/api/reference");
        } catch (err) {
          if (err.status !== 409 || !stillCurrent()) throw err;

          if (!window.confirm("มีภาพมาตรฐานแล้ว ต้องการแทนที่หรือไม่?")) {
            return;
          }

          await sendImage("/api/reference", true);
        }

        if (!stillCurrent()) return;

        remember(null);
        onAnalysis(null);
        setMessage(
          "บันทึกมาตรฐานแล้ว เลือกภาพปัจจุบันเพื่อเริ่มวิเคราะห์"
        );
      } else {
        const data = await sendImage("/api/inspect");

        if (!stillCurrent()) return;

        remember(data);
        onAnalysis(null);
        setMessage(
          "ส่งงานแล้ว ไปตรวจข้ออื่นต่อได้ และกลับมาดูผลที่ข้อนี้"
        );
      }
    } catch (err) {
      if (stillCurrent()) setError(err.message);
    } finally {
      actionLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function applyResult() {
    if (!result) return;

    try {
      onAnalysis({
        ...result,
        jobId: job.id,
      });
      setMessage(
        "ส่งผล AI เข้าแบบฟอร์มแล้ว ตรวจทานและเลือกผ่าน/ไม่ผ่านด้วยตนเอง"
      );
      setError("");
    } catch {
      setError(
        "บันทึกผลเข้าแบบฟอร์มไม่สำเร็จ ตรวจพื้นที่ localStorage"
      );
    }
  }

  const elapsed = job
    ? Math.max(0, Math.floor(now / 1000 - job.created_at))
    : 0;

  const duration =
    `${Math.floor(elapsed / 60)} นาที ${elapsed % 60} วินาที`;

  return (
    <section className="vision-panel">
      <h3>AI ตรวจภาพ · {machine}</h3>

      <fieldset disabled={busy || pending}>
        <label className="vision-upload">
          {photo ? "ถ่ายใหม่ / เลือกภาพใหม่" : "ถ่ายภาพ / เลือกภาพ"}

          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            capture="environment"
            onChange={selectPhoto}
          />
        </label>

        {photo && (
          <div
            className={`scan-preview ${pending ? "is-scanning" : ""}`}
            aria-busy={pending}
          >
            <img
              className="vision-image"
              src={photo}
              alt="ภาพปัจจุบันของจุดตรวจ"
            />

            {pending && (
              <div className="scan-overlay" aria-hidden="true">
                <div className="scan-line" />
                <div className="scan-label">
                  {job.status === "queued"
                    ? "อยู่ในคิว AI"
                    : "AI กำลังวิเคราะห์"}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="vision-buttons">
          <button
            type="button"
            className="secondary-button"
            disabled={!photo}
            onClick={() => runAction("reference")}
          >
            ตั้งเป็นภาพมาตรฐาน
          </button>

          <button
            type="button"
            className="primary-button"
            disabled={!photo}
            onClick={() => runAction("inspect")}
          >
            {job?.status === "failed"
              ? "ลองวิเคราะห์ใหม่"
              : "วิเคราะห์ด้วย AI"}
          </button>
        </div>
      </fieldset>

      {pending && (
        <div className="vision-job">
          <strong>
            {job.status === "queued"
              ? "รอคิวประมวลผล"
              : "กำลังรอประมวลผลจาก AI"}
          </strong>

          <p>เวลาตั้งแต่ส่งงาน: {duration}</p>
          <p>ไปทำเช็คลิสต์ข้ออื่นได้ แล้วกลับมาดูผลที่ข้อนี้</p>
        </div>
      )}

      <div aria-live="polite">
        {busy && <p>กำลังเตรียมหรือส่งภาพ…</p>}
        {message && <p className="vision-message">{message}</p>}
        {error && <p className="vision-error">{error}</p>}
        {storageWarning && (
          <p className="vision-error">{storageWarning}</p>
        )}

        {job?.status === "failed" && (
          <p className="vision-error">
            {job.error || "วิเคราะห์ไม่สำเร็จ กรุณาลองใหม่"}
          </p>
        )}
      </div>

      {result && (
        <div className={`vision-result ${result.status}`}>
          <strong>{result.condition_label}</strong>
          <p>{result.message}</p>

          {result.findings?.map((finding, index) => (
            <div className="vision-finding" key={index}>
              <strong>
                {index + 1}. {finding.location}
              </strong>
              <p>พบ: {finding.observation}</p>
              <p>ควรตรวจต่อ: {finding.recommendation}</p>
            </div>
          ))}

          <p>
            <strong>ข้อจำกัด: </strong>
            {result.limitations}
          </p>

          <small>{result.engine}</small>

          <p>AI เป็นข้อมูลประกอบ ผู้ตรวจเป็นคนเลือกผ่าน/ไม่ผ่าน</p>

          <button
            type="button"
            className="primary-button"
            onClick={applyResult}
          >
            นำผล AI ใส่แบบฟอร์ม
          </button>
        </div>
      )}
    </section>
  );
}