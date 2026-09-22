import { useEffect, useRef } from "react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";

import MachineVision from "../MachineVision";

export default function InspectionDetail({
  item,
  result,
  machine,
  shift,
  index,
  total,
  onChange,
  onBack,
  onPrevious,
  onNext,
}) {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [item.id]);

  return (
    <section className="page inspection-detail-page">
      <div className="inspection-page-navigation">
        <button
          type="button"
          className="secondary-button"
          onClick={onBack}
        >
          <ArrowLeft size={18} />
          กลับรายการตรวจ
        </button>

        <span>
          ข้อ {index + 1} / {total}
        </span>
      </div>

      <section className="inspection-detail card">
        <div className="detail-heading">
          <div>
            <span className="category">{item.category}</span>

            <h2 ref={headingRef} tabIndex={-1}>
              {item.title}
            </h2>

            <p>{item.description}</p>

            <p className="inspection-machine-info">
              เครื่อง {machine} · {shift}
            </p>
          </div>

          {item.required && (
            <span className="required">ต้องตรวจ</span>
          )}
        </div>

        <div className="result-buttons">
          <button
            type="button"
            className={
              result.status === "pass" ? "pass selected" : "pass"
            }
            aria-pressed={result.status === "pass"}
            onClick={() => onChange({ status: "pass" })}
          >
            <Check />
            <span>
              <strong>ผ่าน</strong>
              <small>สภาพปกติ</small>
            </span>
          </button>

          <button
            type="button"
            className={
              result.status === "fail" ? "fail selected" : "fail"
            }
            aria-pressed={result.status === "fail"}
            onClick={() => onChange({ status: "fail" })}
          >
            <X />
            <span>
              <strong>ไม่ผ่าน</strong>
              <small>พบความผิดปกติ</small>
            </span>
          </button>
        </div>

        <MachineVision
          key={`${machine}:${item.id}`}
          machine={machine}
          itemId={item.id}
          initialImage={result.image || ""}
          onImage={(image) =>
            onChange({
              image,
              analysis: null,
              status: "pending",
            })
          }
          onAnalysis={(analysis) =>
            onChange({
              analysis,
              status: "pending",
            })
          }
        />

        <label className="inspection-note">
          หมายเหตุของจุดตรวจ
          <textarea
            rows={4}
            value={result.note || ""}
            placeholder="ระบุสิ่งที่พบหรือเรื่องที่ต้องติดตาม"
            onChange={(event) =>
              onChange({ note: event.target.value })
            }
          />
        </label>

        <p className="inspection-save-hint">
          ข้อมูลเก็บในร่างเดิมเมื่อเปลี่ยนข้อ
          หลังนำผล AI มาใช้ ให้ตรวจทานและเลือกผ่าน/ไม่ผ่านอีกครั้ง
        </p>

        <div className="inspection-detail-footer">
          <button
            type="button"
            className="secondary-button"
            disabled={index === 0}
            onClick={onPrevious}
          >
            <ChevronLeft size={18} />
            ข้อก่อนหน้า
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={index === total - 1 ? onBack : onNext}
          >
            {index === total - 1 ? "กลับรายการตรวจ" : "ข้อต่อไป"}
            <ChevronRight size={18} />
          </button>
        </div>
      </section>
    </section>
  );
}