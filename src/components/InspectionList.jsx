import { Check, ChevronRight, X } from "lucide-react";

export default function InspectionList({
  checklist,
  results,
  onOpen,
}) {
  return (
    <section className="checklist card inspection-list-page">
      <div className="card-heading">
        <div>
          <h2>รายการตรวจ</h2>
          <p>กดรายการเพื่อเปิดหน้าตรวจ</p>
        </div>

        <span className="badge">
          {checklist.length} รายการ
        </span>
      </div>

      <div className="checklist-items">
        {checklist.map((item, index) => {
          const status = results[item.id]?.status || "pending";

          return (
            <button
              type="button"
              key={item.id}
              className="checklist-row"
              onClick={() => onOpen(item.id)}
            >
              <span className={`check-number ${status}`}>
                {status === "pass" ? (
                  <Check />
                ) : status === "fail" ? (
                  <X />
                ) : (
                  index + 1
                )}
              </span>

              <span className="check-text">
                <strong>{item.title}</strong>
                <small>
                  {item.category}
                  {item.required ? " · บังคับตรวจ" : ""}
                </small>
              </span>

              <span className={`inspection-status ${status}`}>
                {status === "pass"
                  ? "ผ่าน"
                  : status === "fail"
                    ? "ไม่ผ่าน"
                    : "รอตรวจ"}
              </span>

              <ChevronRight size={20} />
            </button>
          );
        })}

        {checklist.length === 0 && (
          <div className="empty-state">
            ยังไม่มีรายการตรวจ เพิ่มได้ที่เมนูจัดการรายการตรวจ
          </div>
        )}
      </div>
    </section>
  );
}