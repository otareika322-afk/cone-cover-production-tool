import { useState, useEffect, useCallback } from "react";
import { gasGet, gasPost } from "./api";

// ============================================================
// 日付ユーティリティ
// ============================================================
function parseLocalDate(str) {
  if (!str) return null;
  if (str instanceof Date) return str;
  const [y, m, d] = String(str).split("-").map(Number);
  if (!y || !m || !d) return new Date(str);
  return new Date(y, m - 1, d);
}
function toDateInputValue(d) {
  if (!d) return "";
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function fmtShort(d) {
  if (!d) return "";
  const dt = new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const BLADE_STATUS_COLOR = {
  "正常": { bg: "#e8f5e9", fg: "#1b5e20" },
  "交換目安": { bg: "#fff3e0", fg: "#e65100" },
  "要確認": { bg: "#ffebee", fg: "#c62828" },
};

function formatBoxInfo(master) {
  if (!master) return { box: "-", endBox: "-" };
  const box = master.boxQty ? `${master.boxQty}入り` : "-";
  const endBox = (master.endBoxes && master.endBoxes.length)
    ? master.endBoxes.map(eb => `${eb.qty}入り×${eb.count}箱`).join("、")
    : "なし";
  return { box, endBox };
}

export default function TabletView() {
  const [workers, setWorkers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [masters, setMasters] = useState([]);
  const [glueNotes, setGlueNotes] = useState([]);
  const [blades, setBlades] = useState([]);
  const [dailyLogs, setDailyLogs] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [ws, scheds, bl, logs, ms, gn] = await Promise.all([
        gasGet("workers"), gasGet("schedules"), gasGet("blades"),
        gasGet("dailyLogs"), gasGet("masters"), gasGet("glueNotes"),
      ]);
      setWorkers(ws || []);
      setSelectedWorkerId(prev => prev ?? (ws && ws[0] ? ws[0].id : null));
      setSchedules((scheds || []).map(s => ({ ...s, dates: (s.dates || []).map(d => parseLocalDate(d)) })));
      setBlades(bl || []);
      setDailyLogs(logs || []);
      setMasters(ms || []);
      setGlueNotes(gn || []);
    } catch (e) {
      setErr("読み込みに失敗しました: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const todayKey = toDateInputValue(new Date());
  const selectedWorker = workers.find(w => w.id === selectedWorkerId);
  const completedIds = new Set(dailyLogs.filter(l => l.status === "完了").map(l => l.scheduleId));

  const visibleTasks = schedules.filter(s => {
    if (s.status !== "生産中") return false;
    if (selectedWorker && s.worker !== selectedWorker.name) return false;
    if (completedIds.has(s.id)) return false;
    const start = s.dates[2], end = s.dates[3];
    if (!start || !end) return false;
    const startKey = toDateInputValue(start), endKey = toDateInputValue(end);
    return startKey <= todayKey && todayKey >= startKey && endKey >= todayKey;
  });

  const todaysLogs = dailyLogs.filter(l => l.date === todayKey && l.status !== "完了").sort((a, b) => b.id - a.id);
  const blade = blades[0] || null;
  const bladeColor = blade ? (BLADE_STATUS_COLOR[blade.status] || BLADE_STATUS_COLOR["正常"]) : null;

  function flash(text) { setMsg(text); setTimeout(() => setMsg(""), 2500); }

  function usedLotsFor(scheduleId) {
    const set = new Set();
    dailyLogs.filter(l => l.scheduleId === scheduleId && l.lot).forEach(l => set.add(l.lot));
    return [...set];
  }

  function summaryForTask(s) {
    const box = {};
    s.positions.forEach(p => (box[p] = { remain: null, ng: 0 }));
    dailyLogs.filter(l => l.scheduleId === s.id).forEach(l => {
      if (box[l.pos]) { box[l.pos].remain = l.remain; box[l.pos].ng += l.ng; }
    });
    return box;
  }

  function openForm(s) {
    setOpenTaskId(s.id);
    setForm({ lot: "", start: nowTime(), end: "", qty: "", ng: "", ngNote: "", remain: "", pos: s.positions[0] });
  }
  function closeForm() { setOpenTaskId(null); }

  async function saveEntry(s) {
    const qty = parseInt(form.qty, 10) || 0;
    const ng = parseInt(form.ng, 10) || 0;
    const remain = form.remain === "" ? null : parseInt(form.remain, 10);
    const end = form.end || nowTime();
    if (!form.lot) { flash("ロットNo.を入力してください"); return; }
    if (!qty && !ng) { flash("加工個数または不良数を入力してください"); return; }

    setBusy(true); setErr("");
    try {
      await gasPost("addDailyLog", {
        id: Date.now(), date: todayKey, scheduleId: s.id,
        worker: selectedWorker ? selectedWorker.name : "", partNo: s.partNo,
        lot: form.lot, start: form.start, end, qty, ng, ngNote: form.ngNote || "",
        remain, pos: form.pos, status: "完了", bladeId: blade ? blade.id : null,
      });
      setOpenTaskId(null);
      flash("✅ 完了報告を記録しました");
      await loadAll();
    } catch (e) {
      setErr("記録に失敗しました: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function completeOrder(s) {
    const lots = usedLotsFor(s.id).length;
    if (!window.confirm(`「${s.partNo}」を完了として、管理者にメールを送信します。よろしいですか？\n(入力済みロット: ${lots}/${s.rNeeded}本)`)) return;
    setBusy(true); setErr("");
    try {
      await gasPost("completeCutting", { scheduleId: s.id, worker: selectedWorker ? selectedWorker.name : "" });
      flash("✅ 完了メールを送信しました(管理者宛)");
      await loadAll();
    } catch (e) {
      setErr("送信に失敗しました: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function reportIssue() {
    if (!blade) return;
    setBusy(true); setErr("");
    try {
      await gasPost("reportBladeIssue", { bladeId: blade.id });
      flash("刃の交換申告を送信しました");
      await loadAll();
    } catch (e) {
      setErr("送信に失敗しました: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doReplaceBlade() {
    if (!blade) return;
    if (!window.confirm("刃を交換済みとして記録します。よろしいですか？")) return;
    setBusy(true); setErr("");
    try {
      await gasPost("replaceBlade", { bladeId: blade.id });
      flash("✅ 刃の交換を記録しました");
      await loadAll();
    } catch (e) {
      setErr("記録に失敗しました: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  const wrap = { minHeight: "100vh", background: "#f5f6fa", fontFamily: "sans-serif", paddingBottom: 40 };
  const header = { background: "#1a237e", color: "#fff", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, position: "sticky", top: 0, zIndex: 5 };
  const layout = { display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, maxWidth: 1180, margin: "0 auto", padding: "16px 20px 60px", alignItems: "start" };
  const card = { background: "#fff", borderRadius: 10, padding: 16, boxShadow: "0 1px 4px #0002", marginBottom: 14 };
  const bigBtn = (bg, color = "#fff") => ({ padding: "12px 18px", background: bg, color, border: "none", borderRadius: 10, fontSize: 15, fontWeight: "bold", cursor: "pointer" });
  const input = { width: "100%", fontSize: 15, padding: "9px 11px", border: "1px solid #ccc", borderRadius: 8 };
  const fieldLabel = { display: "block", fontSize: 12, color: "#666", fontWeight: "bold", marginBottom: 4 };

  if (loading) return <div style={{ ...wrap, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>読み込み中...</div>;

  return (
    <div style={wrap}>
      <div style={header}>
        <div>
          <div style={{ fontSize: 19, fontWeight: "bold" }}>📋 本日の作業</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{todayKey}</div>
        </div>
        {workers.length > 1 ? (
          <select value={selectedWorkerId || ""} onChange={e => setSelectedWorkerId(Number(e.target.value))}
            style={{ fontSize: 16, padding: "8px 14px", borderRadius: 8, border: "none" }}>
            {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        ) : (
          <div style={{ fontSize: 17, fontWeight: "bold" }}>👤 {selectedWorker?.name || ""}</div>
        )}
      </div>

      {(msg || err) && (
        <div style={{ margin: "10px 20px 0", padding: "10px 14px", borderRadius: 8, fontSize: 14, background: err ? "#ffebee" : "#e8f5e9", color: err ? "#c62828" : "#1b5e20" }}>
          {err || msg}
        </div>
      )}

      <div style={layout}>
        <div>
          <div style={{ fontSize: 15, fontWeight: "bold", color: "#1a237e", marginBottom: 10 }}>
            カット/貼合せ 対象案件（{visibleTasks.length}件）
          </div>
          {visibleTasks.length === 0 && (
            <div style={{ ...card, textAlign: "center", color: "#888" }}>本日カット対象の案件はありません</div>
          )}
          {visibleTasks.map(s => {
            const master = masters.find(m => m.id === s.partNo || m.displayId === s.partNo);
            const { box, endBox } = formatBoxInfo(master);
            const glue = glueNotes.find(g => g.partNo === s.partNo);
            const sum = summaryForTask(s);
            const lots = usedLotsFor(s.id);
            const total = s.rNeeded || 0;
            const pct = total ? Math.min(100, (lots.length / total) * 100) : 0;
            const isOpen = openTaskId === s.id;

            return (
              <div key={s.id} style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 17, fontWeight: "bold", color: "#1a237e" }}>{s.partNo}</div>
                  <div style={{ fontSize: 13, color: "#888" }}>色: {s.color}　位置: {s.positions.join(" ")}　出荷数: {s.qty}</div>
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#666", marginTop: 4 }}>
                  <div>材料入荷日：<b style={{ color: "#222" }}>{fmtShort(s.dates[2])}</b></div>
                  <div>カット締切：<b style={{ color: "#222" }}>{fmtShort(s.dates[3])}</b></div>
                  <div>箱入り数：{box}</div>
                  <div>端数箱：{endBox}</div>
                  <div>のりしろ：{glue ? glue.note : "-"}</div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(90px, 1fr))`, gap: 6, marginTop: 8 }}>
                  {s.positions.map(p => (
                    <div key={p} style={{ background: "#f5f6fa", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                      <div style={{ fontSize: 11, color: "#666" }}>{p} 未加工/不良</div>
                      <div style={{ fontSize: 16, fontWeight: "bold" }}>{sum[p].remain ?? "-"} / {sum[p].ng}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                  <div style={{ fontSize: 13, color: "#666" }}>ロット進捗</div>
                  <div style={{ fontWeight: "bold" }}>{lots.length} / {total}本　(残り目安 {Math.max(0, total - lots.length)}本)</div>
                </div>
                <div style={{ background: "#e0e0e0", borderRadius: 8, height: 9, margin: "6px 0 4px", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: lots.length >= total ? "#1b5e20" : "#1a237e" }} />
                </div>
                {lots.length > 0 && <div style={{ fontSize: 12, color: "#666" }}>入力済みロット: {lots.join("、")}</div>}

                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {isOpen
                    ? <button onClick={closeForm} style={{ ...bigBtn("transparent", "#1a237e"), border: "2px solid #1a237e" }}>閉じる</button>
                    : <button onClick={() => openForm(s)} style={bigBtn("#1a237e")}>＋ 作業を記録する</button>}
                  <button onClick={() => completeOrder(s)} disabled={busy} style={bigBtn("#1b5e20")}>✅ この注文を完了にする</button>
                </div>

                {isOpen && (
                  <div style={{ borderTop: "1px solid #ddd", marginTop: 14, paddingTop: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={fieldLabel}>ロットNo.(この注文の現品票と連携)</label>
                        <input style={input} list={`lots-${s.id}`} value={form.lot || ""} placeholder="例：N08PW4880"
                          onChange={e => setForm(f => ({ ...f, lot: e.target.value }))} />
                        <datalist id={`lots-${s.id}`}>
                          {lots.map(l => <option key={l} value={l} />)}
                        </datalist>
                      </div>
                      <div>
                        <label style={fieldLabel}>加工した位置</label>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {s.positions.map(p => (
                            <button key={p} type="button" onClick={() => setForm(f => ({ ...f, pos: p }))}
                              style={{ padding: "7px 14px", borderRadius: 20, border: "2px solid " + (form.pos === p ? "#1a237e" : "#ddd"),
                                background: form.pos === p ? "#1a237e" : "#f5f6fa", color: form.pos === p ? "#fff" : "#222", fontWeight: "bold", cursor: "pointer" }}>
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      <div><label style={fieldLabel}>開始時刻</label><input type="time" style={input} value={form.start || ""} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} /></div>
                      <div><label style={fieldLabel}>終了時刻</label><input type="time" style={input} value={form.end || ""} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} /></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      <div><label style={fieldLabel}>加工個数</label><input type="number" inputMode="numeric" style={input} value={form.qty || ""} placeholder="0" onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} /></div>
                      <div><label style={fieldLabel}>未加工(残数・現物カウント)</label><input type="number" inputMode="numeric" style={input} value={form.remain || ""} placeholder="0" onChange={e => setForm(f => ({ ...f, remain: e.target.value }))} /></div>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={fieldLabel}>不良数・不良内容</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input type="number" inputMode="numeric" style={{ ...input, width: 70, flex: "none" }} value={form.ng || ""} placeholder="0" onChange={e => setForm(f => ({ ...f, ng: e.target.value }))} />
                        <input type="text" style={{ ...input, flex: 1 }} value={form.ngNote || ""} placeholder="不良内容(例：色ムラ、紙粉混入 など)" onChange={e => setForm(f => ({ ...f, ngNote: e.target.value }))} />
                      </div>
                    </div>
                    <button onClick={() => saveEntry(s)} disabled={busy} style={{ ...bigBtn("#1a237e"), width: "100%" }}>この内容で完了報告</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div>
          {blade && (
            <div style={{ ...card, border: `2px solid ${bladeColor.fg}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 16, fontWeight: "bold", color: "#1a237e" }}>🔪 {blade.name}</div>
                <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: "bold", background: bladeColor.bg, color: bladeColor.fg }}>{blade.status}</span>
              </div>
              <div style={{ fontSize: 14, color: "#555" }}>累計 <b>{blade.count}</b> / 交換目安 {blade.threshold}枚</div>
              <div style={{ background: "#eee", borderRadius: 8, height: 9, margin: "6px 0 10px", overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, (blade.count / (blade.threshold || 1)) * 100)}%`, height: "100%", background: bladeColor.fg }} />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={reportIssue} disabled={busy} style={bigBtn("#ef6c00")}>⚠️ 要確認</button>
                <button onClick={doReplaceBlade} disabled={busy} style={bigBtn("#1b5e20")}>✅ 交換完了</button>
              </div>
            </div>
          )}

          {todaysLogs.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 15, fontWeight: "bold", color: "#1a237e", marginBottom: 10 }}>本日の報告履歴</div>
              {todaysLogs.map(l => (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #eee", fontSize: 12, gap: 8 }}>
                  <span>{l.start}-{l.end}　{l.partNo}　Lot:{l.lot}　位置{l.pos}{l.ngNote ? `　不良内容:${l.ngNote}` : ""}</span>
                  <span style={{ fontWeight: "bold", whiteSpace: "nowrap" }}>加工{l.qty}／不良{l.ng}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
