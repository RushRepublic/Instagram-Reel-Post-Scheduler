import { useState, useMemo } from "react";
import { calendarApi } from "../api/calendarApi";
import { useApiData } from "../hooks/useApiData";
import { useModal } from "../context/ModalContext";
import ContentRow from "../components/ContentRow";
import EmptyState from "../components/EmptyState";
import { LoadingState, ErrorState } from "../components/ApiState";
import { adaptContent } from "../utils/adaptContent";
import { formatDate, formatTime } from "../utils/format";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAY_LABELS = ["SUN","MON","TUE","WED","THU","FRI","SAT"];

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

export default function Calendar() {
  const { openModal, closeModal } = useModal();
  const [current, setCurrent] = useState(() => new Date());
  const [viewMode, setViewMode] = useState("MONTH");

  const cells = useMemo(() => buildCells(current, viewMode), [current, viewMode]);
  const rangeStart = viewMode === "LIST" ? null : toISODate(cells[0].date);
  const rangeEnd = viewMode === "LIST" ? null : toISODate(cells[cells.length - 1].date);

  const { data, loading, error, refresh } = useApiData(
    () => calendarApi.get({ startDate: rangeStart, endDate: rangeEnd }),
    [rangeStart, rangeEnd]
  );

  const items = useMemo(() => (data || []).map(adaptContent), [data]);

  const viewItem = (item) => {
    openModal(
      <>
        <button className="modal-close" onClick={closeModal}>
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <div className={`tag ${item.type === "POST" ? "tag-post" : "tag-reel"}`} style={{ marginBottom: 14, display: "inline-block" }}>{item.type}</div>
        <h3>{item.account}</h3>
        <p>{item.caption || "(no caption)"}</p>
        <div className="modal-detail-row"><span className="label">Status</span><span className="value">{item.status}</span></div>
        <div className="modal-detail-row"><span className="label">Date</span><span className="value">{formatDate(item.scheduledDate)}</span></div>
        <div className="modal-detail-row"><span className="label">Time</span><span className="value">{formatTime(item.scheduledTime)}</span></div>
        <div className="modal-actions">
          <button className="btn btn-primary btn-block" onClick={closeModal}>Close</button>
        </div>
      </>
    );
  };

  const goPrev = () => {
    const next = new Date(current);
    if (viewMode === "WEEK") next.setDate(next.getDate() - 7);
    else next.setMonth(next.getMonth() - 1);
    setCurrent(next);
  };
  const goNext = () => {
    const next = new Date(current);
    if (viewMode === "WEEK") next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    setCurrent(next);
  };

  const listItems = useMemo(
    () => [...items].sort((a, b) => (a.scheduledDate + a.scheduledTime).localeCompare(b.scheduledDate + b.scheduledTime)),
    [items]
  );

  return (
    <>
      <div className="view-header">
        <div>
          <h2>Content Calendar</h2>
          <div className="view-subtitle">All scheduled and published content at a glance.</div>
        </div>
        <div className="view-switch">
          <button className={viewMode === "MONTH" ? "active" : ""} onClick={() => setViewMode("MONTH")}>Month</button>
          <button className={viewMode === "WEEK" ? "active" : ""} onClick={() => setViewMode("WEEK")}>Week</button>
          <button className={viewMode === "LIST" ? "active" : ""} onClick={() => setViewMode("LIST")}>List</button>
        </div>
      </div>

      {viewMode !== "LIST" && (
        <div className="calendar-controls">
          <div className="calendar-nav">
            <button className="calendar-nav-btn" onClick={goPrev}><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg></button>
            <div className="calendar-month-label">{MONTH_NAMES[current.getMonth()]} {current.getFullYear()}</div>
            <button className="calendar-nav-btn" onClick={goNext}><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg></button>
          </div>
        </div>
      )}

      {loading ? (
        <LoadingState label="Loading calendar..." />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : viewMode === "LIST" ? (
        listItems.length ? (
          <div className="calendar-list">
            {listItems.map((item) => (
              <ContentRow key={item.id} item={item} actions={<button className="btn btn-ghost btn-sm" onClick={() => viewItem(item)}>View</button>} />
            ))}
          </div>
        ) : (
          <EmptyState title="No content" desc="Nothing scheduled or published yet." />
        )
      ) : (
        <div className="calendar-grid">
          {WEEKDAY_LABELS.map((w) => <div key={w} className="calendar-weekday">{w}</div>)}
          {cells.map((cell, i) => {
            const iso = toISODate(cell.date);
            const dayItems = items.filter((c) => c.scheduledDate === iso);
            return (
              <div key={i} className={`calendar-cell ${cell.outside ? "outside" : ""}`}>
                <div className="calendar-date-num">{cell.date.getDate()}</div>
                {dayItems.map((item) => (
                  <div key={item.id} className="calendar-item" onClick={() => viewItem(item)}>
                    <strong>{formatTime(item.scheduledTime)} · {item.type}</strong>{item.account}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function buildCells(current, viewMode) {
  const year = current.getFullYear();
  const month = current.getMonth();

  if (viewMode === "WEEK") {
    const today = new Date();
    const refDate = today.getMonth() === month && today.getFullYear() === year ? today : new Date(year, month, 1);
    const weekStart = new Date(refDate);
    weekStart.setDate(refDate.getDate() - refDate.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return { date: d, outside: d.getMonth() !== month };
    });
  }

  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const result = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    result.push({ date: new Date(year, month - 1, prevMonthDays - i), outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    result.push({ date: new Date(year, month, d), outside: false });
  }
  while (result.length % 7 !== 0) {
    const last = result[result.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    result.push({ date: next, outside: true });
  }
  return result;
}
