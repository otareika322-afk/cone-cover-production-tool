import { useState, useEffect, useCallback, Fragment } from "react";

// ============================================================
// GAS API
// ============================================================
const GAS_URL = "https://script.google.com/macros/s/AKfycbzpCyqWlsaU_2LaO6DckKYoLq4WolHUHvxsCmzW3uHvyzpU2wF6pRae65WihjNEuOcI/exec";

async function gasGet(type) {
  const res = await fetch(`${GAS_URL}?type=${type}`);
  const json = await res.json();
  if (json.status !== "ok") throw new Error(json.message);
  return json.data;
}
async function gasPost(action, payload) {
  const res = await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action, payload }) });
  const json = await res.json();
  if (json.status !== "ok") throw new Error(json.message);
  return json;
}

// ============================================================
// 定数
// ============================================================
const PROCESSES = ["材料引取り（工場持込）","トムソン抜き（BP）","工場引取り・受入","カット/貼合せ","検品・梱包","出荷"];
const DOW_LABELS = ["日","月","火","水","木","金","土"];
// 色はスケジュール単位で循環。赤は警告専用なので使わない
const SCHED_COLORS = ["#1565c0","#2e7d32","#00838f","#3949ab","#558b2f","#00695c","#0277bd","#43a047"];
const STATUS_COLORS = { "生産中":"#e3f2fd","完了":"#e8f5e9","保留":"#fff9c4" };
const STATUS_TEXT   = { "生産中":"#1565c0","完了":"#1b5e20","保留":"#f57f17" };

// 祝日はGASから動的に読み込む（起動時にsetHolidaysで上書き）
let HOLIDAYS = new Set([
  "2025-01-01","2025-01-13","2025-02-11","2025-02-23","2025-02-24","2025-03-20","2025-04-29","2025-05-03","2025-05-04","2025-05-05","2025-05-06","2025-07-21","2025-08-11","2025-09-15","2025-09-23","2025-10-13","2025-11-03","2025-11-23","2025-11-24",
  "2026-01-01","2026-01-12","2026-02-11","2026-02-23","2026-03-20","2026-04-29","2026-05-03","2026-05-04","2026-05-05","2026-05-06","2026-07-20","2026-08-11","2026-09-21","2026-09-22","2026-09-23","2026-10-12","2026-11-03","2026-11-23",
  "2027-01-01","2027-01-11","2027-02-11","2027-02-23","2027-03-22","2027-04-29","2027-05-03","2027-05-04","2027-05-05","2027-07-19","2027-08-11","2027-09-20","2027-09-23","2027-10-11","2027-11-03","2027-11-23",
]);

const FALLBACK_MASTERS = [
  {id:"YTX220101",displayId:"YTX220101",color:"黄",positions:["②","④"],qty:null,shots:210,boxQty:null,endBoxes:[],manageStock:true,minPerSheet:0.190},
  {id:"YTX210601-1",displayId:"YTX210601-1",color:"黄",positions:["①","③","⑤"],qty:2300,shots:180,boxQty:125,endBoxes:[{qty:100,count:6},{qty:75,count:1}],manageStock:true,minPerSheet:0.181},
  {id:"YTX210601-1(在庫有)",displayId:"YTX210601-1",color:"黄",positions:["①","③","⑤"],qty:2300,shots:180,boxQty:125,endBoxes:[{qty:100,count:8}],manageStock:false,minPerSheet:0.181},
  {id:"YTX220602",displayId:"YTX220602",color:"白",positions:["②","④"],qty:2200,shots:321,boxQty:240,endBoxes:[{qty:130,count:4}],manageStock:true,minPerSheet:0.190},
  {id:"YTX220602(在庫有)",displayId:"YTX220602",color:"白",positions:["②","④"],qty:2200,shots:321,boxQty:240,endBoxes:[{qty:130,count:5},{qty:110,count:1}],manageStock:false,minPerSheet:0.190},
  {id:"YTX230201",displayId:"YTX230201",color:"白",positions:["②","④"],qty:null,shots:237,boxQty:null,endBoxes:[],manageStock:true,minPerSheet:0.190},
  {id:"YTX230402-3",displayId:"YTX230402-3",color:"白",positions:["②","④"],qty:2100,shots:300,boxQty:300,endBoxes:[],manageStock:true,minPerSheet:0.190},
  {id:"YTX230703",displayId:"YTX230703",color:"白",positions:["④"],qty:1260,shots:210,boxQty:420,endBoxes:[],manageStock:true,minPerSheet:0.190},
  {id:"YTX240201",displayId:"YTX240201",color:"黄",positions:["①","③","⑤"],qty:2230,shots:249,boxQty:248,endBoxes:[],manageStock:true,minPerSheet:0.181},
  {id:"YTX240926",displayId:"YTX240926",color:"白",positions:["②","④","⑥"],qty:1809,shots:201,boxQty:150,endBoxes:[{qty:100,count:5}],manageStock:true,minPerSheet:0.190},
];
const FALLBACK_WORKERS = [
  {id:1,name:"佐藤",workDays:[1,2,3,4],startTime:"10:00",endTime:"15:00",breakMin:50,workMin:250},
];
const FALLBACK_INVENTORY = [
  {id:1,date:"2026/06/09",partNo:"YTX220602",type:"入庫",entries:[{pos:"②",qty:572},{pos:"④",qty:234}],note:""},
  {id:2,date:"2026/06/09",partNo:"YTX210601-1",type:"入庫",entries:[{pos:"①",qty:280},{pos:"③",qty:240},{pos:"⑤",qty:144}],note:""},
  {id:3,date:"2026/06/09",partNo:"YTX230402-3",type:"入庫",entries:[{pos:"②",qty:8},{pos:"④",qty:3}],note:""},
];

// ============================================================
// 日付ユーティリティ
// ============================================================
function toKey(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function isHoliday(d) { return HOLIDAYS.has(toKey(d)); }
function isStdWorkday(d) { const dow=d.getDay(); return dow!==0&&dow!==6&&!isHoliday(d); }
function addStdDays(dateIn, days) {
  const d=new Date(dateIn.getFullYear(),dateIn.getMonth(),dateIn.getDate());
  if(days===0) return d;
  let added=0;
  while(added<days){d.setDate(d.getDate()+1);if(isStdWorkday(d))added++;}
  return d;
}
function addWorkerDays(dateIn, days, worker) {
  const d=new Date(dateIn.getFullYear(),dateIn.getMonth(),dateIn.getDate());
  if(days===0) return d;
  let added=0;
  while(added<days){d.setDate(d.getDate()+1);if(worker.workDays.includes(d.getDay())&&!isHoliday(d))added++;}
  return d;
}
function nextWorkerDay(dateIn, worker) {
  const d=new Date(dateIn.getFullYear(),dateIn.getMonth(),dateIn.getDate());
  while(!(worker.workDays.includes(d.getDay())&&!isHoliday(d))) d.setDate(d.getDate()+1);
  return d;
}
// "YYYY-MM-DD"文字列をローカル日付として解釈（タイムゾーンずれ防止）
function parseLocalDate(str) {
  if (!str) return null;
  if (str instanceof Date) return str;
  const [y,m,d] = String(str).split("-").map(Number);
  if (!y||!m||!d) return new Date(str);
  return new Date(y, m-1, d);
}

function fmtDate(d) {
  if(!d) return "";
  const dt=new Date(d);
  return `${dt.getFullYear()}/${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}`;
}
function fmtDateShort(d) {
  if(!d) return "";
  const dt=new Date(d);
  return `${dt.getMonth()+1}/${dt.getDate()}`;
}

function calcScheduleDates(pickDate, rNeeded, qty, master, worker) {
  const thomsonDays = rNeeded>=10 ? 2 : 1;
  const posCount = master.positions.length;
  const totalMin = qty * posCount * master.minPerSheet;
  const wakka_days = Math.ceil(totalMin / worker.workMin);
  // "YYYY-MM-DD"文字列をローカル日付として解釈（タイムゾーンずれ防止）
  const [y,m,dd] = pickDate.split("-").map(Number);
  const d0 = new Date(y, m-1, dd);
  const d1 = addStdDays(d0, thomsonDays);
  const d2 = addStdDays(d1, 1);
  const cuttingStart = nextWorkerDay(d2, worker);
  const d3 = addWorkerDays(cuttingStart, wakka_days-1, worker);
  const d4 = addStdDays(d3, 1);
  const d5 = addStdDays(d4, 1);
  return { dates:[d0,d1,d2,d3,d4,d5], thomsonDays, totalMin, wakka_days, posCount };
}

// Dateオブジェクトを"YYYY-MM-DD"（ローカル日付）に変換
function toDateInputValue(d) {
  if (!d) return "";
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,"0");
  const dd = String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}

function buildCSVRows(schedule, lotLines, master) {
  const shipDate = fmtDate(schedule.dates[5]);
  const rows = [];
  if(!master.boxQty) {
    lotLines.forEach(lot => rows.push([master.displayId, lot.trim(), shipDate, schedule.qty+"ｾｯﾄ"]));
    return rows;
  }
  lotLines.forEach(lot => rows.push([master.displayId, lot.trim(), shipDate, master.boxQty+"ｾｯﾄ"]));
  master.endBoxes.forEach(eb => { for(let i=0;i<eb.count;i++) rows.push([master.displayId,"混載",shipDate,eb.qty+"ｾｯﾄ"]); });
  return rows;
}

// ============================================================
// スタイル定数
// ============================================================

// ============================================================
// メインコンポーネント
// ============================================================
// 画面幅の判定（見た目専用）
function useIsWide(minWidth=768){
  const [wide,setWide]=useState(()=>typeof window!=="undefined"&&window.matchMedia(`(min-width:${minWidth}px)`).matches);
  useEffect(()=>{
    const mq=window.matchMedia(`(min-width:${minWidth}px)`);
    const on=e=>setWide(e.matches);
    mq.addEventListener("change",on);
    return ()=>mq.removeEventListener("change",on);
  },[minWidth]);
  return wide;
}

export default function App() {
  const [tab,setTab]=useState(0);
  const [masters,setMasters]=useState(FALLBACK_MASTERS);
  const [workers,setWorkers]=useState(FALLBACK_WORKERS);
  const [inventory,setInventory]=useState(FALLBACK_INVENTORY);
  const [invNextId,setInvNextId]=useState(FALLBACK_INVENTORY.length+1);
  const [schedules,setSchedules]=useState([]);
  const [schedNextId,setSchedNextId]=useState(1);
  const [activeSchedId,setActiveSchedId]=useState(null);
  const [archive,setArchive]=useState([]);
  const [syncing,setSyncing]=useState(false);
  const [syncMsg,setSyncMsg]=useState("");
  const [syncError,setSyncError]=useState("");
  const [gasLoaded,setGasLoaded]=useState(false);
  const [step,setStep]=useState("input");
  const [orderPartNo,setOrderPartNo]=useState("");
  const [orderQty,setOrderQty]=useState("");
  const [orderDeadline,setOrderDeadline]=useState("");
  const [selectedWorkerId,setSelectedWorkerId]=useState(1);
  const [pickDate,setPickDate]=useState("");
  const [manualQty,setManualQty]=useState("");
  const [invPartNo,setInvPartNo]=useState("");
  const [invType,setInvType]=useState("入庫");
  const [invDate,setInvDate]=useState("");
  const [invNote,setInvNote]=useState("");
  const [invQtys,setInvQtys]=useState({});
  const [editingMaster,setEditingMaster]=useState(null);
  const [editBuf,setEditBuf]=useState(null);
  const [editingWorker,setEditingWorker]=useState(null);
  const [editWorkerBuf,setEditWorkerBuf]=useState(null);
  const [workerNextId,setWorkerNextId]=useState(2);
  const [newWorker,setNewWorker]=useState({name:"",workDays:[1,2,3,4],startTime:"10:00",endTime:"15:00",breakMin:50,workMin:250});
  const [showAddWorker,setShowAddWorker]=useState(false);
  const [calYear,setCalYear]=useState(new Date().getFullYear());
  const [calMonth,setCalMonth]=useState(new Date().getMonth());
  const isWide=useIsWide();
  const [allocErr,setAllocErr]=useState(false);
  const [masterQ,setMasterQ]=useState("");

  const stockMasters=masters.filter(m=>m.manageStock);
  const orderMaster=masters.find(x=>x.id===orderPartNo);
  const selectedWorker=workers.find(w=>w.id===selectedWorkerId)||workers[0];
  const activeSchedule=schedules.find(s=>s.id===activeSchedId)||null;

  // 在庫サマリ
  const invSummary={};
  stockMasters.forEach(m=>{invSummary[m.id]={};m.positions.forEach(p=>{invSummary[m.id][p]=0;});});
  inventory.forEach(r=>{
    if(!invSummary[r.partNo]) return;
    r.entries.forEach(({pos,qty})=>{
      if(invSummary[r.partNo][pos]===undefined) invSummary[r.partNo][pos]=0;
      invSummary[r.partNo][pos]+=r.type==="入庫"?qty:-qty;
    });
  });

  // GAS読み込み
  const loadFromGAS = useCallback(async () => {
    setSyncing(true); setSyncMsg("スプレッドシートから読み込み中..."); setSyncError("");
    try {
      const [ms,ws,inv,scheds,hols,arch] = await Promise.all([
        gasGet("masters"), gasGet("workers"), gasGet("inventory"), gasGet("schedules"), gasGet("holidays"), gasGet("archive")
      ]);
      if(ms?.length)    setMasters(ms);
      if(ws?.length)    setWorkers(ws);
      if(inv?.length) { setInventory(inv); setInvNextId(Math.max(...inv.map(r=>r.id))+1); }
      if(scheds?.length){
        // 日付文字列をローカルDateオブジェクトに変換
        const parsed = scheds.map(s=>({...s, dates:(s.dates||[]).map(d=>parseLocalDate(d))}));
        setSchedules(parsed);
        setSchedNextId(Math.max(...parsed.map(s=>s.id))+1);
      }
      // 祝日データをグローバル変数に反映
      if(hols?.length) { HOLIDAYS = new Set(hols.map(h=>h.date)); }
      if(arch?.length) {
        setArchive(arch.map(s=>({...s, dates:(s.dates||[]).map(d=>parseLocalDate(d))})));
      }
      setGasLoaded(true);
      setSyncMsg("✅ 読み込み完了");
    } catch(e) {
      setSyncError("❌ 読み込み失敗: "+e.message);
    } finally {
      setSyncing(false);
      setTimeout(()=>setSyncMsg(""),3000);
    }
  },[]);

  useEffect(()=>{ loadFromGAS(); },[loadFromGAS]);

  async function syncToGAS(action, payload, label) {
    setSyncing(true); setSyncMsg(label+"を保存中..."); setSyncError("");
    try {
      await gasPost(action, payload);
      setSyncMsg("✅ "+label+"を保存しました");
    } catch(e) {
      setSyncError("❌ 保存失敗: "+e.message);
    } finally {
      setSyncing(false);
      setTimeout(()=>setSyncMsg(""),3000);
    }
  }

  function calcAlloc() {
    const m=masters.find(x=>x.id===orderPartNo);
    if(!m||!orderQty) return null;
    const needed=parseInt(orderQty);
    const result=m.positions.map(pos=>{
      const stock=invSummary[m.id]?.[pos]||0;
      const canAlloc=stock>=m.shots;
      return {pos,stock,needed,shots:m.shots,canAlloc,alloc:canAlloc?m.shots:0,shortage:Math.max(0,needed-(canAlloc?stock:0))};
    });
    return {result,maxShortage:Math.max(...result.map(r=>r.shortage)),needed};
  }
  const allocData=(orderPartNo&&orderQty)?calcAlloc():null;

  async function doCalcSchedule() {
    if(!pickDate||!orderPartNo) return;
    const m=masters.find(x=>x.id===orderPartNo);
    if(!m) return;
    const qty=m.qty||(manualQty?parseInt(manualQty):0);
    if(!qty) return;
    const hasAlloc=allocData&&allocData.result.every(r=>r.canAlloc);
    const baseRNeeded=m.boxQty?Math.ceil(qty/m.shots):1;
    const rNeeded=hasAlloc?Math.max(1,baseRNeeded-1):baseRNeeded;
    const csvPartNoId=hasAlloc?(orderPartNo+"(在庫有)"):orderPartNo;
    const csvMaster=masters.find(x=>x.id===csvPartNoId)||m;
    const res=calcScheduleDates(pickDate,rNeeded,qty,m,selectedWorker);
    const ns={
      id:schedNextId,partNo:orderPartNo,csvPartNo:csvMaster.id,
      worker:selectedWorker.name,qty,rNeeded,
      dates:res.dates,color:m.color,positions:m.positions,
      totalMin:res.totalMin,wakka_days:res.wakka_days,posCount:res.posCount,
      thomsonDays:res.thomsonDays,deadline:orderDeadline,lotInput:"",status:"生産中",
      createdAt:new Date().toLocaleDateString("ja-JP"),hasAlloc,
    };
    const newSchedules=[ns,...schedules];
    setSchedules(newSchedules);
    setSchedNextId(n=>n+1);
    setActiveSchedId(ns.id);
    await syncToGAS("saveSchedules",newSchedules,"スケジュール");
    setTab(1);
  }

  function resetOrder(){setStep("input");setOrderPartNo("");setOrderQty("");setOrderDeadline("");setPickDate("");setManualQty("");}

  function updateSchedLot(id,val){
    const updated=schedules.map(s=>s.id===id?{...s,lotInput:val}:s);
    setSchedules(updated);
    syncToGAS("saveSchedules",updated,"ロットNo.");
  }
  async function updateSchedDate(id, pi, val) {
    const updated = schedules.map(s => {
      if (s.id !== id) return s;
      const newDates = [...s.dates];
      newDates[pi] = val ? new Date(val) : s.dates[pi];
      return { ...s, dates: newDates };
    });
    setSchedules(updated);
    await syncToGAS("saveSchedules", updated, "工程日付");
  }

  async function updateSchedStatus(id,val){
    const updated=schedules.map(s=>s.id===id?{...s,status:val}:s);
    setSchedules(updated);
    await syncToGAS("saveSchedules",updated,"ステータス");
  }
  async function deleteSched(id){
    const updated=schedules.filter(s=>s.id!==id);
    setSchedules(updated);
    if(activeSchedId===id) setActiveSchedId(null);
    await syncToGAS("saveSchedules",updated,"スケジュール削除");
  }

  // 実績として保存し、スケジュール一覧からは削除する
  async function archiveSched(id){
    const target=schedules.find(s=>s.id===id);
    if(!target) return;
    const remaining=schedules.filter(s=>s.id!==id);
    setSyncing(true); setSyncMsg("実績として保存中..."); setSyncError("");
    try{
      await gasPost("archiveSchedule",{id, remainingSchedules:remaining});
      setSchedules(remaining);
      setArchive(prev=>[{...target, archivedAt:new Date().toLocaleDateString("ja-JP")},...prev]);
      if(activeSchedId===id) setActiveSchedId(null);
      setSyncMsg("✅ 実績として保存しました");
    }catch(e){
      setSyncError("❌ 保存失敗: "+e.message);
    }finally{
      setSyncing(false);
      setTimeout(()=>setSyncMsg(""),3000);
    }
  }

  function downloadCSV(sched){
    const m=masters.find(x=>x.id===(sched.csvPartNo||sched.partNo));
    const lines=sched.lotInput.split(/\n/).map(l=>l.trim()).filter(l=>l.length>0);
    if(!lines.length) return;
    const csv="\uFEFF"+[["品番","ロットNo.","出荷日","数量"],...buildCSVRows(sched,lines,m)].map(r=>r.join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;
    a.download=`現品票_${m.displayId}_${fmtDate(sched.dates[5]).replace(/\//g,"")}.csv`;
    a.click();
  }

  function handleInvPartChange(pid){
    setInvPartNo(pid);
    const m=masters.find(x=>x.id===pid);
    if(m){const q={};m.positions.forEach(p=>{q[p]="";});setInvQtys(q);}else setInvQtys({});
  }
  async function addInvRecord(){
    if(!invDate||!invPartNo) return;
    const entries=Object.entries(invQtys).filter(([,v])=>v!==""&&parseInt(v)>0).map(([pos,v])=>({pos,qty:parseInt(v)}));
    if(!entries.length) return;
    const rec={id:invNextId,date:invDate,partNo:invPartNo,type:invType,entries,note:invNote};
    setInventory(prev=>[...prev,rec]);
    setInvNextId(n=>n+1);
    setInvQtys(q=>{const r={};Object.keys(q).forEach(k=>r[k]="");return r;});
    setInvNote("");
    await syncToGAS("addInventory",rec,"入出庫記録");
  }
  async function delInv(id){
    setInventory(prev=>prev.filter(r=>r.id!==id));
    await syncToGAS("delInventory",{id},"入出庫削除");
  }

  function startEdit(m){setEditingMaster(m.id);setEditBuf(JSON.parse(JSON.stringify(m)));}
  async function saveEdit(){
    const updated=masters.map(m=>m.id===editBuf.id?editBuf:m);
    setMasters(updated);setEditingMaster(null);setEditBuf(null);
    await syncToGAS("saveMasters",updated,"品番マスタ");
  }
  function startEditWorker(w){setEditingWorker(w.id);setEditWorkerBuf(JSON.parse(JSON.stringify(w)));}
  async function saveEditWorker(){
    const updated=workers.map(w=>w.id===editWorkerBuf.id?editWorkerBuf:w);
    setWorkers(updated);setEditingWorker(null);setEditWorkerBuf(null);
    await syncToGAS("saveWorkers",updated,"作業者マスタ");
  }
  async function addWorker(){
    const updated=[...workers,{...newWorker,id:workerNextId}];
    setWorkers(updated);setWorkerNextId(n=>n+1);
    setNewWorker({name:"",workDays:[1,2,3,4],startTime:"10:00",endTime:"15:00",breakMin:50,workMin:250});
    setShowAddWorker(false);
    await syncToGAS("saveWorkers",updated,"作業者マスタ");
  }
  function toggleDay(buf,setBuf,dow){const days=buf.workDays.includes(dow)?buf.workDays.filter(d=>d!==dow):[...buf.workDays,dow].sort();setBuf({...buf,workDays:days});}

  function buildCalEvents(){
    const map={};
    schedules.forEach((s,si)=>{
      const color=SCHED_COLORS[si%SCHED_COLORS.length];
      const labels=["材料","トムソン","引取受入","カット","検品梱包","出荷"];
      s.dates.forEach((d,pi)=>{
        if(!d) return;
        const key=toKey(new Date(d));
        if(!map[key]) map[key]=[];
        map[key].push({label:labels[pi],color,pi});
      });
    });
    return map;
  }

  const tabs=["📅 生産スケジュール","📄 ロット・CSV","📦 仕掛在庫","📆 カレンダー","🗄️ 生産実績","⚙️ 品番マスタ","👷 作業者マスタ"];
  const wizSteps=[{key:"input",label:"① 品番・数量"},{key:"alloc",label:"② 在庫引当"},{key:"schedule",label:"③ スケジュール"}];

  // ---------- 見た目用の共通スタイル（ロジックには触れない） ----------
  const NAVY="#1a237e", INK="#263238", MUTED="#6b7280", LINE="#e3e6f2", OK="#2e7d32", OKBG="#e8f5e9", WARNBG="#fff4cc", WARNTX="#8a5a00", DANGER="#c62828";
  const card={background:"#fff",border:`1px solid ${LINE}`,borderRadius:12,padding:isWide?20:14,marginBottom:14};
  const lbl={display:"block",fontWeight:600,marginBottom:6,fontSize:12,color:"#3b4256"};
  const inp={width:"100%",minHeight:44,padding:"8px 10px",border:"1px solid #c5cae9",borderRadius:8,boxSizing:"border-box",fontSize:14,background:"#fff"};
  const th={padding:"8px 10px",borderBottom:`1px solid ${LINE}`,background:"#eef0fb",textAlign:"left",whiteSpace:"nowrap",fontSize:12,color:"#3b4256",fontWeight:600};
  const td=(ex={})=>({padding:"8px 10px",borderBottom:`1px solid ${LINE}`,...ex});
  const btnMain={minHeight:44,padding:"0 20px",background:NAVY,color:"#fff",border:"none",borderRadius:8,fontWeight:700,fontSize:14,cursor:"pointer"};
  const btnTonal={minHeight:40,padding:"0 14px",background:"#e8eaf6",color:"#283593",border:"none",borderRadius:8,fontWeight:600,fontSize:13,cursor:"pointer"};
  const btnGhost={minHeight:40,padding:"0 14px",background:"#fff",color:"#3b4256",border:"1px solid #c5cae9",borderRadius:8,fontSize:13,cursor:"pointer"};
  const iconBtn={width:40,height:40,display:"inline-flex",alignItems:"center",justifyContent:"center",border:"none",borderRadius:8,background:"#e8eaf6",color:"#283593",cursor:"pointer",padding:0};
  const h3s={margin:0,color:NAVY,fontSize:18};
  const badge=(bg,fg,ex={})=>({display:"inline-block",fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:999,background:bg,color:fg,...ex});
  const fieldIn={width:"100%",minHeight:36,padding:"4px 6px",border:"1px solid #c5cae9",borderRadius:6,boxSizing:"border-box",fontSize:13};
  const IconPencil=()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>;
  const IconTrash=()=><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>;
  const colorDot=c=><span style={{display:"inline-block",width:14,height:14,borderRadius:"50%",background:c==="黄"?"#f6c90e":"#fff",border:"1px solid #aab0c4",verticalAlign:"-2px",marginRight:6}}/>;
  const pageTitle=(txt,right)=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:14}}>
      <h3 style={h3s}>{txt}</h3>{right}
    </div>
  );

  const WorkdayToggle=({buf,setBuf})=>(
    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
      {DOW_LABELS.map((l,i)=>(
        <button key={i} onClick={()=>toggleDay(buf,setBuf,i)}
          style={{minWidth:40,minHeight:40,borderRadius:8,border:"1px solid #c5cae9",cursor:"pointer",fontSize:13,
            background:buf.workDays.includes(i)?NAVY:"#fff",
            color:buf.workDays.includes(i)?"#fff":"#3b4256",fontWeight:buf.workDays.includes(i)?700:400}}>
          {l}
        </button>
      ))}
    </div>
  );

  const twoCol=(left,right,ratio="5fr 7fr")=>(
    <div style={{display:"grid",gridTemplateColumns:isWide?ratio:"1fr",gap:isWide?24:0,alignItems:"start"}}>
      <div style={{minWidth:0}}>{left}</div><div style={{minWidth:0}}>{right}</div>
    </div>
  );

  return (
    <div style={{fontFamily:"'Hiragino Sans','Yu Gothic UI','Meiryo',sans-serif",fontSize:14,color:INK,background:"#f5f6fa",minHeight:"100vh"}}>
      {/* ヘッダー */}
      <div style={{background:NAVY,color:"#fff",padding:isWide?"12px 24px":"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontWeight:700,fontSize:isWide?17:15}}>🏭 反射材コーンカバー 生産管理ツール</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {syncMsg&&<span style={{fontSize:12,color:"#a5d6a7"}}>{syncMsg}</span>}
          {syncError&&<span style={{fontSize:12,color:"#ffcdd2"}}>{syncError}</span>}
          {syncing&&<span style={{fontSize:12,color:"#fff9c4"}}>⏳</span>}
          <button onClick={loadFromGAS} disabled={syncing}
            style={{minHeight:36,padding:"0 12px",background:"#283593",color:"#fff",border:"1px solid #5c6bc0",borderRadius:8,cursor:"pointer",fontSize:12}}>
            🔄 再読込
          </button>
        </div>
      </div>

      {/* タブ：スマホは横スクロール */}
      <div style={{background:"#283593",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
        <div style={{display:"flex",flexWrap:"nowrap",maxWidth:1280,margin:"0 auto",padding:isWide?"0 16px":0}}>
          {tabs.map((t,i)=>(
            <button key={i} onClick={()=>setTab(i)}
              style={{flex:"0 0 auto",whiteSpace:"nowrap",minHeight:46,padding:"0 16px",border:"none",cursor:"pointer",fontWeight:tab===i?700:400,
                background:tab===i?"#f5f6fa":"transparent",color:tab===i?NAVY:"#dfe3f7",
                borderBottom:tab===i?"3px solid #ffeb3b":"3px solid transparent",fontSize:13}}>{t}
              {i===1&&schedules.length>0&&<span style={{marginLeft:6,background:"#ffeb3b",color:NAVY,borderRadius:10,padding:"1px 7px",fontSize:11,fontWeight:700}}>{schedules.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {!gasLoaded&&(
        <div style={{background:"#eef0fb",borderBottom:`1px solid ${LINE}`,padding:"8px 16px",fontSize:12,color:"#3b4256"}}>
          ⏳ スプレッドシートからデータを読み込んでいます...
        </div>
      )}

      <div style={{padding:isWide?24:12,maxWidth:1280,margin:"0 auto",boxSizing:"border-box"}}>

        {/* TAB 0 生産スケジュール */}
        {tab===0&&(<>
          {pageTitle("生産スケジュール",<button onClick={resetOrder} style={btnGhost}>リセット</button>)}
          {twoCol(
            <div>
              <div style={{display:"flex",marginBottom:14}}>
                {wizSteps.map((s,i)=>{
                  const done=(s.key==="input"&&(step==="alloc"||step==="schedule"))||(s.key==="alloc"&&step==="schedule");
                  const active=step===s.key;
                  return <div key={s.key} style={{flex:1,textAlign:"center",padding:"9px 4px",fontSize:12,
                    background:done?"#c8e6c9":active?NAVY:"#e8eaf6",color:done?"#1b5e20":active?"#fff":"#7a8099",
                    borderRadius:i===0?"8px 0 0 8px":i===wizSteps.length-1?"0 8px 8px 0":"0",
                    fontWeight:active?700:400,borderRight:i<wizSteps.length-1?"1px solid #fff":"none"}}>
                    {done?"✅ ":""}{s.label}
                  </div>;
                })}
              </div>

              {step==="input"&&(
                <div style={card}>
                  <h4 style={{margin:"0 0 12px",color:"#283593"}}>品番・受注数量を入力</h4>
                  <div style={{marginBottom:12}}>
                    <label style={lbl}>品番</label>
                    <select value={orderPartNo} onChange={e=>{setOrderPartNo(e.target.value);setAllocErr(false);}} style={inp}>
                      <option value="">-- 選択 --</option>
                      {masters.map(m=><option key={m.id} value={m.id}>{m.id}（{m.color}・{m.positions.join("")}）</option>)}
                    </select>
                  </div>
                  {orderMaster&&<div style={{background:"#eef0fb",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,lineHeight:1.8}}>
                    色: <b>{orderMaster.color}</b>　位置: <b>{orderMaster.positions.join(" ")}</b>　定番出荷数: <b>{orderMaster.qty??"出来高"}</b>　ショット数: <b>{orderMaster.shots}</b>
                  </div>}
                  <div style={{marginBottom:12}}>
                    <label style={lbl}>受注数量（セット）</label>
                    <input type="number" value={orderQty} onChange={e=>{setOrderQty(e.target.value);setAllocErr(false);}} placeholder={orderMaster?.qty?`定番: ${orderMaster.qty}`:"数量を入力"} style={inp}/>
                  </div>
                  <div style={{marginBottom:14}}>
                    <label style={lbl}>希望納期（任意）</label>
                    <input type="date" value={orderDeadline} onChange={e=>setOrderDeadline(e.target.value)} style={inp}/>
                  </div>
                  {allocErr&&(!orderPartNo||!orderQty)&&(
                    <div role="alert" style={{color:DANGER,fontSize:12,marginBottom:10}}>
                      ⚠️ {!orderPartNo&&!orderQty?"品番と受注数量を入力してください":!orderPartNo?"品番を選択してください":"受注数量を入力してください"}
                    </div>
                  )}
                  <button onClick={()=>{if(!orderPartNo||!orderQty){setAllocErr(true);return;}setAllocErr(false);setStep("alloc");}}
                    style={{...btnMain,width:"100%",background:"#3949ab"}}>
                    在庫引当を確認 →
                  </button>
                </div>
              )}

              {step==="alloc"&&allocData&&(
                <div style={card}>
                  <h4 style={{margin:"0 0 4px",color:"#283593"}}>在庫引当確認</h4>
                  <div style={{fontSize:12,color:MUTED,marginBottom:10}}>
                    品番: <b>{orderPartNo}</b>　受注数: <b>{orderQty}セット</b>　引当条件: 在庫 ≥ <b>{orderMaster?.shots}</b>
                  </div>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:12}}>
                    <thead><tr>
                      <th style={th}>位置</th><th style={{...th,textAlign:"right"}}>現在庫</th>
                      <th style={{...th,textAlign:"center"}}>引当</th><th style={{...th,textAlign:"right"}}>不足数</th>
                    </tr></thead>
                    <tbody>
                      {allocData.result.map(r=>(
                        <tr key={r.pos} style={{background:!r.canAlloc?"#fff8e1":"#f1f8e9"}}>
                          <td style={td({textAlign:"center",fontWeight:700,fontSize:15})}>{r.pos}</td>
                          <td style={td({textAlign:"right"})}>{r.stock}</td>
                          <td style={td({textAlign:"center",color:r.canAlloc?"#1b5e20":WARNTX,fontWeight:700})}>{r.canAlloc?"✅ 可":"❌ 不可"}</td>
                          <td style={td({textAlign:"right",color:r.shortage>0?WARNTX:"#1b5e20",fontWeight:700})}>{r.shortage>0?r.shortage:"—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {allocData.maxShortage>0
                    ?<div style={{background:WARNBG,border:"1px solid #f0c24b",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:13}}>⚠️ 不足数: <b>{allocData.maxShortage}セット</b> → 新規生産が必要</div>
                    :<div style={{background:OKBG,border:"1px solid #81c784",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:13}}>✅ 在庫で充足可 — 新規生産不要</div>
                  }
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setStep("input")} style={{...btnGhost,flex:1,minHeight:44}}>← 戻る</button>
                    <button onClick={()=>setStep("schedule")} style={{...btnMain,flex:2}}>
                      引当を承認 {allocData.maxShortage>0?"→ スケジュール生成":"→ 完了"}
                    </button>
                  </div>
                </div>
              )}

              {step==="schedule"&&(
                <div>
                  {allocData?.maxShortage===0
                    ?<div style={{...card,background:OKBG,border:"1px solid #81c784"}}><b>✅ 引当完了</b> — 在庫充足のため新規生産不要</div>
                    :<div style={card}>
                      <h4 style={{margin:"0 0 8px",color:"#283593"}}>スケジュール生成</h4>
                      <div style={{background:"#eef0fb",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:13}}>
                        品番: <b>{orderPartNo}</b>　生産数: <b>{orderMaster?.qty||"?"}セット</b>
                      </div>
                      {orderMaster?.qty===null&&(
                        <div style={{marginBottom:12}}>
                          <label style={lbl}>生産数量（セット）</label>
                          <input type="number" value={manualQty} onChange={e=>setManualQty(e.target.value)} style={inp} placeholder="数量を入力"/>
                        </div>
                      )}
                      <div style={{marginBottom:12}}>
                        <label style={lbl}>作業者</label>
                        <select value={selectedWorkerId} onChange={e=>setSelectedWorkerId(parseInt(e.target.value))} style={inp}>
                          {workers.map(w=><option key={w.id} value={w.id}>{w.name}（{w.workDays.map(d=>DOW_LABELS[d]).join("・")}　{w.workMin}分/日）</option>)}
                        </select>
                      </div>
                      <div style={{marginBottom:14}}>
                        <label style={lbl}>材料引取り日</label>
                        <input type="date" value={pickDate} onChange={e=>setPickDate(e.target.value)} style={inp}/>
                      </div>
                      {pickDate&&orderPartNo&&(()=>{
                        const m=masters.find(x=>x.id===orderPartNo);
                        const qty=m?.qty||(manualQty?parseInt(manualQty):0);
                        if(!qty||!m) return null;
                        const hasAlloc=allocData&&allocData.result.every(r=>r.canAlloc);
                        const baseR=m.boxQty?Math.ceil(qty/m.shots):1;
                        const rN=hasAlloc?Math.max(1,baseR-1):baseR;
                        const res=calcScheduleDates(pickDate,rN,qty,m,selectedWorker);
                        return (
                          <div style={{background:"#eef0fb",borderRadius:8,padding:"10px 12px",marginBottom:12,fontSize:12,lineHeight:1.8}}>
                            <b>📅 プレビュー</b>　トムソン:{res.thomsonDays}日（{rN}R）　わっか:{res.totalMin.toFixed(0)}分→{res.wakka_days}稼働日　出荷: <b>{fmtDate(res.dates[5])}</b>
                            {orderDeadline&&<span style={{marginLeft:8,color:res.dates[5]<=new Date(orderDeadline)?"#1b5e20":DANGER,fontWeight:700}}>{res.dates[5]<=new Date(orderDeadline)?"✅ 納期OK":"⚠️ 納期NG"}</span>}
                          </div>
                        );
                      })()}
                      <button onClick={doCalcSchedule} disabled={!pickDate||syncing}
                        style={{...btnMain,width:"100%",opacity:!pickDate?0.5:1}}>
                        📅 スケジュールを生成・保存
                      </button>
                    </div>
                  }
                </div>
              )}
            </div>,
            <div>
              <h4 style={{margin:"0 0 10px",color:NAVY,fontSize:15}}>📋 生産スケジュール一覧</h4>
              {schedules.length===0&&<div style={{...card,color:MUTED,textAlign:"center"}}>まだスケジュールがありません。左のフォームから生成してください。</div>}
              {schedules.map(s=>{
                const shipOk=!s.deadline||new Date(s.dates[5])<=new Date(s.deadline);
                const expanded=s.expanded||false;
                return (
                  <div key={s.id} style={{background:"#fff",border:`1px solid ${LINE}`,borderLeft:`4px solid ${STATUS_TEXT[s.status]||"#9aa0b5"}`,borderRadius:12,marginBottom:12,overflow:"hidden"}}>
                    <div style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:6}}>
                        <span style={{fontWeight:700,fontSize:15,color:NAVY}}>{s.partNo}</span>
                        <span style={badge(STATUS_COLORS[s.status],STATUS_TEXT[s.status],{border:`1px solid ${STATUS_TEXT[s.status]}`})}>{s.status}</span>
                        <span style={{fontSize:12,color:MUTED}}>作業者 <b style={{color:INK}}>{s.worker}</b></span>
                        <span style={{fontSize:12,color:MUTED}}><b style={{color:INK}}>{s.qty}</b> セット</span>
                      </div>
                      <div style={{fontSize:13,display:"flex",flexWrap:"wrap",gap:12,marginBottom:10}}>
                        <span>🚚 出荷予定: <b style={{color:shipOk?INK:DANGER}}>{fmtDate(s.dates[5])}</b></span>
                        {s.deadline&&<span style={{color:shipOk?"#1b5e20":DANGER}}>{shipOk?"✅":"⚠️"} 希望納期: {s.deadline}</span>}
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                        <div style={{display:"inline-flex",border:"1px solid #c5cae9",borderRadius:8,overflow:"hidden"}}>
                          {["生産中","完了","保留"].map((st,si)=>(
                            <button key={st} onClick={()=>updateSchedStatus(s.id,st)}
                              style={{minHeight:40,padding:"0 14px",fontSize:13,border:"none",borderLeft:si?"1px solid #c5cae9":"none",cursor:"pointer",
                                background:s.status===st?STATUS_TEXT[st]:"#fff",color:s.status===st?"#fff":"#3b4256",fontWeight:s.status===st?700:400}}>
                              {st}
                            </button>
                          ))}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                          <button onClick={()=>setSchedules(prev=>prev.map(x=>x.id===s.id?{...x,expanded:!expanded}:x))} style={btnTonal}>
                            {expanded?"▲ 閉じる":"▼ 工程"}
                          </button>
                          <button onClick={()=>{setActiveSchedId(s.id);setTab(1);}} style={btnTonal}>CSV</button>
                          {s.status==="完了"&&(
                            <button onClick={()=>archiveSched(s.id)} style={{...btnTonal,background:OKBG,color:"#1b5e20"}}>📦 実績保存</button>
                          )}
                          <span style={{width:1,height:24,background:LINE,margin:"0 6px"}}/>
                          <button onClick={()=>deleteSched(s.id)} aria-label="削除" title="削除"
                            style={{...iconBtn,background:"#fff",color:DANGER,border:"1px solid #f3c9c9"}}><IconTrash/></button>
                        </div>
                      </div>
                    </div>
                    {expanded&&(
                      <div style={{borderTop:`1px solid ${LINE}`,background:"#fafbff",padding:"12px 14px"}}>
                        <div style={{fontSize:12,color:MUTED,marginBottom:6}}>※ 日付セルをクリックして直接変更できます</div>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                          <thead><tr>
                            <th style={{...th,width:"55%"}}>工程</th>
                            <th style={{...th,textAlign:"center"}}>予定日</th>
                          </tr></thead>
                          <tbody>
                            {PROCESSES.map((p,i)=>{
                              const dateVal = s.dates[i] ? toDateInputValue(s.dates[i]) : "";
                              return (
                                <tr key={i} style={{background:i===5?"#eef0fb":"#fff"}}>
                                  <td style={td({fontWeight:i===5?700:400})}>{i===5?"🚚 ":""}{p}</td>
                                  <td style={td({textAlign:"center",padding:"4px 6px"})}>
                                    <input type="date" value={dateVal}
                                      onChange={e=>updateSchedDate(s.id,i,e.target.value)}
                                      style={{border:"1px solid #c5cae9",borderRadius:6,padding:"6px 8px",minHeight:40,boxSizing:"border-box",
                                        fontSize:13,textAlign:"center",cursor:"pointer",background:"#fff",
                                        fontWeight:i===5?700:400,color:i===5?NAVY:"inherit",width:"100%"}}/>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div style={{marginTop:8,fontSize:12,color:MUTED,display:"flex",gap:12,flexWrap:"wrap"}}>
                          <span>トムソン: <b>{s.thomsonDays}日</b>（{s.rNeeded}R）</span>
                          <span>わっか加工: <b>{Number(s.totalMin)?.toFixed(0)}分 → {s.wakka_days}稼働日</b></span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>)}

        {/* TAB 1 ロット・CSV */}
        {tab===1&&(<>
          {pageTitle("ロットNo. & 現品票CSV")}
          {schedules.length===0
            ?<div style={{color:MUTED,padding:20}}>先にスケジュールを生成してください。</div>
            :(()=>{
              const m=activeSchedule?masters.find(x=>x.id===(activeSchedule.csvPartNo||activeSchedule.partNo)):null;
              const rNeeded=activeSchedule?(activeSchedule.rNeeded||null):null;
              const lines=activeSchedule?activeSchedule.lotInput.split(/\n/).map(l=>l.trim()).filter(l=>l.length>0):[];
              const previewRows=activeSchedule&&lines.length>0?buildCSVRows(activeSchedule,lines,m):[];
              const match=rNeeded?lines.length===rNeeded:lines.length>0;
              const left=(
                <div>
                  <div style={card}>
                    <label style={lbl}>スケジュールを選択</label>
                    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                      {schedules.map(s=>(
                        <button key={s.id} onClick={()=>setActiveSchedId(s.id)}
                          style={{minHeight:48,padding:"6px 14px",border:"2px solid",borderRadius:8,cursor:"pointer",fontSize:13,textAlign:"left",
                            borderColor:activeSchedId===s.id?NAVY:"#d5daee",background:activeSchedId===s.id?NAVY:"#fff",
                            color:activeSchedId===s.id?"#fff":INK,fontWeight:activeSchedId===s.id?700:400}}>
                          {s.partNo}<br/><span style={{fontSize:11,opacity:0.85}}>{fmtDate(s.dates[5])}出荷</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {activeSchedule&&(<>
                    <div style={card}>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:"10px 16px"}}>
                        {[["品番",m?.displayId],["出荷日",fmtDate(activeSchedule.dates[5])],["数量",activeSchedule.qty+" セット"],["必要原反数",rNeeded?rNeeded+"R":"—"],["箱入り数",m?.boxQty??"—"]].map(([k,v])=>(
                          <div key={k}>
                            <div style={{fontSize:11,color:MUTED}}>{k}</div>
                            <div style={{fontSize:14,fontWeight:k==="出荷日"?800:600,color:INK}}>{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={card}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:6}}>
                        <label style={{...lbl,marginBottom:0}}>ロットNo.（1行1ロット）</label>
                        <span style={badge(match?"#d9f0dc":WARNBG,match?"#1b5e20":WARNTX)}>
                          {rNeeded?`${lines.length}/${rNeeded}行`:`${lines.length}行`}
                        </span>
                      </div>
                      <textarea value={activeSchedule.lotInput} onChange={e=>updateSchedLot(activeSchedule.id,e.target.value)}
                        rows={Math.max(4,rNeeded||4)} placeholder={"N08ZQ9190\nN08ZQ9220\n..."}
                        style={{width:"100%",padding:"10px",border:"2px solid #c5cae9",borderRadius:8,boxSizing:"border-box",fontSize:14,fontFamily:"monospace",resize:"vertical"}}/>
                      <div style={{fontSize:12,color:lines.length>0?(match?"#1b5e20":WARNTX):MUTED,marginTop:4}}>
                        {lines.length===0?"ロットNo.をペーストしてください":match?"✅ 行数が一致しています":rNeeded?`行数が必要数（${rNeeded}行）と異なります`:`${lines.length}行入力済み`}
                      </div>
                    </div>
                  </>)}
                </div>
              );
              const right=activeSchedule?(
                <div>
                  <div style={card}>
                    <h4 style={{margin:"0 0 8px",color:"#283593"}}>📋 現品票プレビュー{previewRows.length>0?`（${previewRows.length}行）`:""}</h4>
                    {previewRows.length===0
                      ?<div style={{color:MUTED,fontSize:13,padding:"12px 0"}}>ロットNo.を入力するとプレビューが表示されます。</div>
                      :<div style={{overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                          <thead><tr>{["品番","ロットNo.","出荷日","数量"].map((h,i)=><th key={i} style={{...th,textAlign:i===3?"right":"left"}}>{h}</th>)}</tr></thead>
                          <tbody>
                            {previewRows.map((row,i)=>{
                              const mix=row[1]==="混載";
                              return (
                                <tr key={i} style={{background:mix?"#fff8dc":"#fff"}}>
                                  <td style={td()}>{row[0]}</td>
                                  <td style={td()}>{mix?<span style={badge("#f5e6a8","#6b5200")}>混載</span>:row[1]}</td>
                                  <td style={td({whiteSpace:"nowrap"})}>{row[2]}</td>
                                  <td style={td({textAlign:"right",fontVariantNumeric:"tabular-nums"})}>{row[3]}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>}
                  </div>
                  <button onClick={()=>downloadCSV(activeSchedule)} disabled={lines.length===0}
                    style={{...btnMain,width:"100%",background:lines.length>0?NAVY:"#c5c9d6",cursor:lines.length>0?"pointer":"not-allowed"}}>
                    📥 現品票CSVをダウンロード
                  </button>
                </div>
              ):<div style={{...card,color:MUTED}}>スケジュールを選択してください。</div>;
              return twoCol(left,right,"1fr 1fr");
            })()
          }
        </>)}

        {/* TAB 2 仕掛在庫 */}
        {tab===2&&(()=>{
          const rows=stockMasters.map(m=>{
            const pd=invSummary[m.id]||{};
            const total=Object.values(pd).reduce((a,b)=>a+b,0);
            return {m,pd,total};
          });
          const stocked=rows.filter(r=>r.total!==0);
          const zero=rows.filter(r=>r.total===0);
          const allocPositions=rows.reduce((n,r)=>n+r.m.positions.filter(p=>(r.pd[p]||0)>=r.m.shots).length,0);
          const tile=(label,val,c)=>(
            <div style={{flex:"1 1 0",minWidth:0,background:"#fff",border:`1px solid ${LINE}`,borderRadius:12,padding:isWide?"14px 18px":"10px 12px"}}>
              <div style={{fontSize:11,color:MUTED}}>{label}</div>
              <div style={{fontSize:isWide?28:22,fontWeight:800,color:c}}>{val}</div>
            </div>
          );
          const selM=masters.find(x=>x.id===invPartNo);
          const toggle=(v)=>(
            <button key={v} onClick={()=>setInvType(v)}
              style={{flex:1,minHeight:44,border:`2px solid ${invType===v?NAVY:"#d5daee"}`,borderRadius:8,background:invType===v?"#e8eaf6":"#fff",
                color:invType===v?NAVY:"#5c6378",fontWeight:invType===v?700:400,fontSize:14,cursor:"pointer"}}>{v}</button>
          );
          return (<>
            {pageTitle("仕掛品在庫管理")}
            <div style={{display:"flex",gap:isWide?14:8,marginBottom:14}}>
              {tile("引当可の位置の数",allocPositions,OK)}
              {tile("在庫ありの品番数",stocked.length,NAVY)}
              {tile("在庫0の品番数",zero.length,MUTED)}
            </div>
            <div style={card}>
              <h4 style={{margin:"0 0 10px",color:"#283593"}}>📊 現在庫サマリ</h4>
              {stocked.length===0&&<div style={{color:MUTED,fontSize:13}}>在庫のある品番はありません。</div>}
              {stocked.map(({m,pd,total},idx)=>(
                <div key={m.id} style={{display:"grid",gridTemplateColumns:isWide?"220px 1fr":"1fr",gap:isWide?20:8,padding:"12px 0",borderTop:idx?`1px solid ${LINE}`:"none"}}>
                  <div>
                    <div style={{fontWeight:700,color:NAVY,fontSize:15}}>{m.id}</div>
                    <div style={{fontSize:12,color:MUTED}}>合計 <b style={{color:total<0?DANGER:INK}}>{total}</b>　引当条件 ≥{m.shots}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {m.positions.map(pos=>{
                      const q=pd[pos]||0;const ok=q>=m.shots;
                      const w=Math.max(0,Math.min(1,q/m.shots))*100;
                      return (
                        <div key={pos} style={{display:"grid",gridTemplateColumns:"28px 1fr auto",alignItems:"center",gap:10}}>
                          <span style={{fontWeight:700,fontSize:15,textAlign:"center"}}>{pos}</span>
                          <div style={{height:22,background:"#eceef6",borderRadius:6,position:"relative",overflow:"hidden"}}>
                            <div style={{width:`${w}%`,height:"100%",background:ok?"#66bb6a":"#f6c945"}}/>
                            <span style={{position:"absolute",left:8,top:0,lineHeight:"22px",fontSize:12,fontWeight:700,color:q<0?DANGER:INK}}>{q}</span>
                          </div>
                          <span style={{minWidth:92,fontSize:12,fontWeight:600,color:ok?"#1b5e20":WARNTX}}>
                            {ok?"引当可":`引当不可 あと${m.shots-q}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {zero.length>0&&(
                <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${LINE}`}}>
                  <div style={{fontSize:12,color:MUTED,marginBottom:6}}>在庫0の品番</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {zero.map(({m})=><span key={m.id} style={badge("#eceef6","#5c6378",{fontWeight:500,fontSize:12,padding:"4px 10px"})}>{m.id}</span>)}
                  </div>
                </div>
              )}
            </div>
            <div style={card}>
              <h4 style={{margin:"0 0 12px",color:"#283593"}}>➕ 入出庫記録</h4>
              <div style={{display:"grid",gridTemplateColumns:isWide?"1fr 1fr":"1fr",gap:12,marginBottom:12}}>
                <div><label style={lbl}>日付</label>
                  <input type="date" value={invDate} onChange={e=>setInvDate(e.target.value)} style={inp}/></div>
                <div><label style={lbl}>入庫 / 出庫</label>
                  <div style={{display:"flex",gap:8}}>{toggle("入庫")}{toggle("出庫")}</div></div>
                <div><label style={lbl}>品番</label>
                  <select value={invPartNo} onChange={e=>handleInvPartChange(e.target.value)} style={inp}>
                    <option value="">-- 選択 --</option>
                    {stockMasters.map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select></div>
                <div><label style={lbl}>備考</label>
                  <input type="text" value={invNote} onChange={e=>setInvNote(e.target.value)} placeholder="任意" style={inp}/></div>
              </div>
              {selM&&(
                <div style={{background:"#eef0fb",borderRadius:8,padding:"10px 12px",marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:600,marginBottom:8,color:"#283593"}}>位置ごとの数量</div>
                  <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                    {selM.positions.map(pos=>(
                      <div key={pos} style={{textAlign:"center"}}>
                        <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>{pos}</div>
                        <input type="number" value={invQtys[pos]||""} min="0" onChange={e=>setInvQtys(q=>({...q,[pos]:e.target.value}))}
                          style={{width:80,minHeight:44,padding:"6px",border:"1px solid #c5cae9",borderRadius:8,textAlign:"center",fontSize:14,boxSizing:"border-box"}}/>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={addInvRecord} disabled={!invDate||!invPartNo||Object.values(invQtys).every(v=>!v||parseInt(v)<=0)||syncing}
                style={{...btnMain,opacity:(!invDate||!invPartNo||Object.values(invQtys).every(v=>!v||parseInt(v)<=0)||syncing)?0.5:1}}>記録を追加</button>
            </div>
            <div style={card}>
              <h4 style={{margin:"0 0 8px",color:"#283593"}}>📋 入出庫履歴</h4>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead><tr>{["日付","品番","区分","位置・数量","備考",""].map((h,i)=><th key={i} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {[...inventory].reverse().map(r=>(
                      <tr key={r.id}>
                        <td style={td({whiteSpace:"nowrap"})}>{r.date}</td>
                        <td style={td()}>{r.partNo}</td>
                        <td style={td({textAlign:"center"})}><span style={r.type==="入庫"?badge("#d9f0dc","#1b5e20"):badge("#e8eaf6","#283593")}>{r.type}</span></td>
                        <td style={td()}><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {r.entries.map(({pos,qty})=><span key={pos} style={{background:"#eef0fb",borderRadius:6,padding:"2px 8px",whiteSpace:"nowrap"}}>{pos}: <b>{qty}</b></span>)}
                        </div></td>
                        <td style={td()}>{r.note}</td>
                        <td style={td({textAlign:"center"})}><button onClick={()=>delInv(r.id)} aria-label="削除" title="削除" style={{...iconBtn,width:36,height:36,background:"#fff",color:"#8a90a6"}}><IconTrash/></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>);
        })()}

        {/* TAB 3 カレンダー */}
        {tab===3&&(()=>{
          const calEvents=buildCalEvents();
          const firstDay=new Date(calYear,calMonth,1);
          const lastDay=new Date(calYear,calMonth+1,0);
          const startDow=(firstDay.getDay()+6)%7;
          const cells=[];
          for(let i=0;i<startDow;i++) cells.push(null);
          for(let d=1;d<=lastDay.getDate();d++) cells.push(d);
          while(cells.length%7!==0) cells.push(null);
          const weeks=[];for(let i=0;i<cells.length;i+=7)weeks.push(cells.slice(i,i+7));
          const today=new Date();
          const monthPrefix=`${calYear}-${String(calMonth+1).padStart(2,"0")}-`;
          const eventDays=Object.keys(calEvents).filter(k=>k.startsWith(monthPrefix)).sort();
          const muted="#8a90a6";
          const navBtn={minWidth:40,height:40,border:"1px solid #c5cae9",borderRadius:8,background:"#fff",color:NAVY,cursor:"pointer",fontSize:14};
          const Bar=({ev})=>{
            const ship=ev.pi===5;
            const pad=isWide?"2px 6px":"6px 10px";
            const fs=isWide?11:13;
            return ship
              ?<div style={{background:ev.color,color:"#fff",fontWeight:700,borderRadius:4,padding:pad,fontSize:fs}}>🚚 {ev.label}</div>
              :<div style={{background:ev.color+"1f",color:INK,borderLeft:`3px solid ${ev.color}`,borderRadius:4,padding:pad,fontSize:fs}}>{ev.label}</div>;
          };
          return (
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
                <h3 style={h3s}>📆 生産カレンダー</h3>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <button aria-label="前の月" onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);}} style={navBtn}>◀</button>
                  <span style={{fontWeight:700,fontSize:15,minWidth:96,textAlign:"center"}}>{calYear}年{calMonth+1}月</span>
                  <button aria-label="次の月" onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);}} style={navBtn}>▶</button>
                  <button onClick={()=>{setCalYear(today.getFullYear());setCalMonth(today.getMonth());}} style={{...navBtn,padding:"0 14px",background:"#e8eaf6",fontSize:13}}>今月</button>
                </div>
              </div>
              {schedules.length>0&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center",marginBottom:12}}>
                  {schedules.map((s,si)=>{
                    const m=masters.find(x=>x.id===s.partNo);
                    const c=SCHED_COLORS[si%SCHED_COLORS.length];
                    return (
                      <span key={s.id} style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,padding:"4px 10px",borderRadius:999,background:c+"1f",border:`1px solid ${c}`,color:"#1f2a44"}}>
                        <span style={{width:10,height:10,borderRadius:3,background:c}}/>
                        {m?.displayId||s.partNo}　{fmtDateShort(s.dates[0])}〜{fmtDateShort(s.dates[5])}
                      </span>
                    );
                  })}
                  <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,color:"#5c6378"}}>
                    <span style={{width:22,height:12,borderRadius:3,background:"#37474f"}}/>塗りつぶし＝出荷日
                  </span>
                </div>
              )}
              {isWide?(
                <div style={{background:"#fff",borderRadius:12,border:"1px solid #dfe3f0",overflow:"hidden"}}>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"#e8eaf6"}}>
                    {["月","火","水","木","金","土","日"].map((l,i)=>(
                      <div key={i} style={{padding:"8px 0",textAlign:"center",fontSize:12,fontWeight:700,color:i>=5?muted:"#283593",borderRight:i<6?"1px solid #d5daee":"none"}}>{l}</div>
                    ))}
                  </div>
                  {weeks.map((week,wi)=>(
                    <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderTop:"1px solid #e3e6f2"}}>
                      {week.map((d,di)=>{
                        if(!d) return <div key={di} style={{minHeight:96,background:"#f7f8fc",borderRight:di<6?"1px solid #e3e6f2":"none"}}/>;
                        const date=new Date(calYear,calMonth,d);
                        const events=calEvents[toKey(date)]||[];
                        const isToday=date.toDateString()===today.toDateString();
                        const adj=(date.getDay()+6)%7;
                        const off=adj>=5||isHoliday(date);
                        return (
                          <div key={di} style={{minHeight:96,padding:"4px 6px",background:off?"#f3f4f8":"#fff",borderRight:di<6?"1px solid #e3e6f2":"none"}}>
                            <div style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:4,fontSize:12,fontWeight:events.length||isToday?700:400,background:isToday?NAVY:"transparent",color:isToday?"#fff":off?muted:INK}}>{d}</div>
                            <div style={{display:"flex",flexDirection:"column",gap:3}}>
                              {events.map((ev,ei)=><Bar key={ei} ev={ev}/>)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {eventDays.length===0&&schedules.length>0&&(
                    <div style={{textAlign:"center",color:muted,padding:32,fontSize:13}}>この月の予定はありません</div>
                  )}
                  {eventDays.map(k=>{
                    const [y,mo,dd]=k.split("-").map(Number);
                    const dt=new Date(y,mo-1,dd);
                    const off=dt.getDay()===0||dt.getDay()===6||isHoliday(dt);
                    return (
                      <div key={k} style={{display:"flex",gap:12,background:off?"#f3f4f8":"#fff",border:"1px solid #dfe3f0",borderRadius:10,padding:"10px 12px"}}>
                        <div style={{minWidth:52,textAlign:"center"}}>
                          <div style={{fontSize:20,fontWeight:700,color:off?muted:NAVY,lineHeight:1.1}}>{mo}/{dd}</div>
                          <div style={{fontSize:12,color:muted}}>（{DOW_LABELS[dt.getDay()]}）</div>
                        </div>
                        <div style={{flex:1,display:"flex",flexDirection:"column",gap:6}}>
                          {calEvents[k].map((ev,ei)=><Bar key={ei} ev={ev}/>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {schedules.length===0&&<div style={{textAlign:"center",color:"#aaa",padding:40,fontSize:13}}>スケジュールを生成するとカレンダーに表示されます</div>}
            </div>
          );
        })()}

        {/* TAB 4 生産実績 */}
        {tab===4&&(
          <div style={{maxWidth:isWide?1100:"none"}}>
            {pageTitle("🗄️ 生産実績")}
            {archive.length===0
              ? <div style={{color:MUTED,padding:20}}>まだ実績データがありません。生産スケジュール一覧で「完了」ステータスにすると「📦 実績保存」ボタンが表示されます。</div>
              : archive.map(s=>{
                  const expanded=s.expanded||false;
                  const stepNames=["材料引取り","トムソン抜き","引取り・受入","カット/貼合せ","検品・梱包","出荷"];
                  return (
                    <div key={s.id} style={{background:"#fff",border:`1px solid ${LINE}`,borderRadius:12,marginBottom:10,overflow:"hidden"}}>
                      <div style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:"6px 16px",flexWrap:"wrap"}}>
                        <span style={{fontWeight:700,fontSize:15,color:NAVY,minWidth:110}}>{s.partNo}</span>
                        <span style={badge("#d9f0dc","#1b5e20")}>完了</span>
                        <span style={{fontSize:13,color:MUTED}}>作業者 <b style={{color:INK}}>{s.worker}</b></span>
                        <span style={{fontSize:13,color:MUTED}}><b style={{color:INK}}>{s.qty}</b> セット</span>
                        <span style={{fontSize:13,color:MUTED}}>🚚 出荷 <b style={{color:INK}}>{fmtDate(s.dates[5])}</b></span>
                        <span style={{fontSize:12,color:MUTED}}>アーカイブ {s.archivedAt}</span>
                        <button onClick={()=>setArchive(prev=>prev.map(x=>x.id===s.id?{...x,expanded:!expanded}:x))}
                          style={{...btnTonal,marginLeft:"auto"}}>
                          {expanded?"▲ 閉じる":"▼ 詳細"}
                        </button>
                      </div>
                      {expanded&&(
                        <div style={{borderTop:`1px solid ${LINE}`,background:"#fafbff",padding:"14px"}}>
                          <div style={{display:"flex",flexDirection:isWide?"row":"column",gap:isWide?0:0}}>
                            {stepNames.map((nm,i)=>{
                              const last=i===5;
                              return (
                                <div key={i} style={{flex:1,display:"flex",flexDirection:isWide?"column":"row",alignItems:"center",gap:isWide?6:12,padding:isWide?"0 4px":"6px 0",position:"relative"}}>
                                  <div style={{width:30,height:30,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,flexShrink:0,
                                    background:last?NAVY:"#fff",color:last?"#fff":NAVY,border:`2px solid ${NAVY}`}}>{last?"🚚":i+1}</div>
                                  <div style={{textAlign:isWide?"center":"left",flex:isWide?"none":1}}>
                                    <div style={{fontSize:12,color:MUTED}}>{nm}</div>
                                    <div style={{fontSize:14,fontWeight:last?800:600,color:last?NAVY:INK}}>{fmtDate(s.dates[i])}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap"}}>
                            <span style={badge("#eceef6","#3b4256",{fontWeight:500})}>トムソン {s.thomsonDays}日（{s.rNeeded}R）</span>
                            <span style={badge("#eceef6","#3b4256",{fontWeight:500})}>わっか加工 {Number(s.totalMin)?.toFixed(0)}分 → {s.wakka_days}稼働日</span>
                            <span style={badge("#eceef6","#3b4256",{fontWeight:500})}>ロットNo. {s.lotInput?s.lotInput.split(/\n/).filter(l=>l.trim()).length+"件":"—"}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
            }
          </div>
        )}

        {/* TAB 5 品番マスタ */}
        {tab===5&&(()=>{
          const list=masters.filter(m=>!masterQ||m.id.toLowerCase().includes(masterQ.toLowerCase()));
          const cells=(m,isEd,buf)=>[
            {k:"色",v:isEd?<select value={buf.color} onChange={e=>setEditBuf(b=>({...b,color:e.target.value}))} style={fieldIn}><option>黄</option><option>白</option></select>:<>{colorDot(m.color)}{m.color}</>},
            {k:"位置",v:m.positions.join(" ")},
            {k:"出荷数",num:true,v:isEd?<input type="number" value={buf.qty??""} placeholder="出来高" onChange={e=>setEditBuf(b=>({...b,qty:e.target.value===''?null:parseInt(e.target.value)}))} style={fieldIn}/>:(m.qty??"出来高")},
            {k:"ショット数/R",num:true,v:isEd?<input type="number" value={buf.shots} onChange={e=>setEditBuf(b=>({...b,shots:parseInt(e.target.value)||0}))} style={fieldIn}/>:m.shots},
            {k:"箱入り数",num:true,v:isEd?<input type="number" value={buf.boxQty??""} placeholder="なし" onChange={e=>setEditBuf(b=>({...b,boxQty:e.target.value===''?null:parseInt(e.target.value)}))} style={fieldIn}/>:(m.boxQty??"—")},
            {k:"作業時間(分/枚)",num:true,v:isEd?<input type="number" step="0.001" value={buf.minPerSheet} onChange={e=>setEditBuf(b=>({...b,minPerSheet:parseFloat(e.target.value)||0}))} style={fieldIn}/>:m.minPerSheet},
            {k:"在庫管理",v:isEd?<select value={buf.manageStock?"する":"しない"} onChange={e=>setEditBuf(b=>({...b,manageStock:e.target.value==="する"}))} style={fieldIn}><option>する</option><option>しない</option></select>:<span style={m.manageStock?badge("#d9f0dc","#1b5e20"):badge("#eceef6","#6b7280")}>{m.manageStock?"する":"しない"}</span>},
          ];
          const actions=(m,isEd)=>!isEd
            ?<button onClick={()=>startEdit(m)} aria-label="編集" title="編集" style={iconBtn}><IconPencil/></button>
            :<div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
              <button onClick={saveEdit} disabled={syncing} style={{...btnTonal,background:OKBG,color:"#1b5e20"}}>保存</button>
              <button onClick={()=>{setEditingMaster(null);setEditBuf(null);}} style={btnGhost}>キャンセル</button>
            </div>;
          const endLine=m=>m.endBoxes.length>0&&<span style={{fontSize:12,color:MUTED}}>端数箱: {m.endBoxes.map(eb=>`${eb.qty}セット×${eb.count}箱`).join("　＋　")}</span>;
          return (<>
            {pageTitle("品番マスタ管理",
              <input type="search" value={masterQ} onChange={e=>setMasterQ(e.target.value)} placeholder="品番で検索"
                style={{...inp,width:isWide?240:150,minHeight:40}}/>)}
            {isWide?(
              <div style={{...card,padding:0,overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead><tr>
                    {["品番","色","位置","出荷数","ショット数/R","箱入り数","作業時間(分/枚)","在庫管理","編集"].map((h,i)=>(
                      <th key={i} style={{...th,textAlign:[3,4,5,6].includes(i)?"right":i===8?"right":"left"}}>{h}</th>))}
                  </tr></thead>
                  <tbody>
                    {list.map(m=>{
                      const isEd=editingMaster===m.id;
                      const buf=isEd?editBuf:m;
                      const cs=cells(m,isEd,buf);
                      return (
                        <Fragment key={m.id}>
                          <tr style={{background:isEd?"#f4f6ff":"#fff"}}>
                            <td style={td({fontWeight:700,color:NAVY,borderBottom:m.endBoxes.length?"none":`1px solid ${LINE}`})}>{m.id}</td>
                            {cs.map((c,i)=><td key={i} style={td({textAlign:c.num?"right":"left",fontVariantNumeric:"tabular-nums",borderBottom:m.endBoxes.length?"none":`1px solid ${LINE}`})}>{c.v}</td>)}
                            <td style={td({textAlign:"right",borderBottom:m.endBoxes.length?"none":`1px solid ${LINE}`})}>{actions(m,isEd)}</td>
                          </tr>
                          {m.endBoxes.length>0&&(
                            <tr style={{background:isEd?"#f4f6ff":"#fff"}}><td colSpan={9} style={td({paddingTop:0,paddingBottom:8})}>{endLine(m)}</td></tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ):(
              list.map(m=>{
                const isEd=editingMaster===m.id;
                const buf=isEd?editBuf:m;
                return (
                  <div key={m.id} style={{...card,padding:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <span style={{fontWeight:700,fontSize:15,color:NAVY}}>{m.id}</span>
                      {actions(m,isEd)}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px 12px"}}>
                      {cells(m,isEd,buf).map((c,i)=>(
                        <div key={i}><div style={{fontSize:11,color:MUTED,marginBottom:2}}>{c.k}</div><div style={{fontWeight:600}}>{c.v}</div></div>
                      ))}
                    </div>
                    {m.endBoxes.length>0&&<div style={{marginTop:8}}>{endLine(m)}</div>}
                  </div>
                );
              })
            )}
          </>);
        })()}

        {/* TAB 6 作業者マスタ */}
        {tab===6&&(<>
          {pageTitle("👷 作業者マスタ",
            <button onClick={()=>setShowAddWorker(v=>!v)} style={btnMain}>＋ 追加</button>)}
          <div style={{display:"flex",gap:10,alignItems:"flex-start",background:"#eef2f8",border:"1px solid #d5ddec",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#3b4a63"}}>
            <span aria-hidden="true" style={{fontSize:16,lineHeight:"20px"}}>ℹ️</span>
            <span>カット/貼合せ工程のみ作業者の勤務曜日・実働時間を使用。その他工程は月〜金・祝日除く標準稼働日で計算。</span>
          </div>
          {showAddWorker&&(
            <div style={{...card,border:`2px solid ${NAVY}`}}>
              <h4 style={{margin:"0 0 10px",color:"#283593"}}>新規作業者</h4>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                <div style={{gridColumn:"1/-1"}}><label style={lbl}>氏名</label><input type="text" value={newWorker.name} onChange={e=>setNewWorker(w=>({...w,name:e.target.value}))} style={inp} placeholder="例：田中"/></div>
                <div style={{gridColumn:"1/-1"}}><label style={lbl}>勤務曜日</label><WorkdayToggle buf={newWorker} setBuf={setNewWorker}/></div>
                <div><label style={lbl}>出勤時間</label><input type="time" value={newWorker.startTime} onChange={e=>setNewWorker(w=>({...w,startTime:e.target.value}))} style={inp}/></div>
                <div><label style={lbl}>退勤時間</label><input type="time" value={newWorker.endTime} onChange={e=>setNewWorker(w=>({...w,endTime:e.target.value}))} style={inp}/></div>
                <div><label style={lbl}>休憩（分）</label><input type="number" value={newWorker.breakMin} onChange={e=>setNewWorker(w=>({...w,breakMin:parseInt(e.target.value)||0}))} style={inp}/></div>
                <div><label style={lbl}>実働（分/日）</label><input type="number" value={newWorker.workMin} onChange={e=>setNewWorker(w=>({...w,workMin:parseInt(e.target.value)||0}))} style={inp}/></div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setShowAddWorker(false)} style={btnGhost}>キャンセル</button>
                <button onClick={addWorker} disabled={!newWorker.name||syncing} style={{...btnTonal,opacity:!newWorker.name?0.5:1}}>追加</button>
              </div>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:isWide?"1fr 1fr":"1fr",gap:14,alignItems:"start"}}>
            {workers.map(w=>{
              const isEd=editingWorker===w.id;
              const buf=isEd?editWorkerBuf:w;
              return (
                <div key={w.id} style={{...card,marginBottom:0,padding:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <span style={{fontWeight:700,fontSize:16,color:NAVY}}>👤 {w.name}</span>
                    {!isEd
                      ?<button onClick={()=>startEditWorker(w)} aria-label="編集" title="編集" style={iconBtn}><IconPencil/></button>
                      :<div style={{display:"flex",gap:6}}>
                        <button onClick={saveEditWorker} disabled={syncing} style={{...btnTonal,background:OKBG,color:"#1b5e20"}}>保存</button>
                        <button onClick={()=>{setEditingWorker(null);setEditWorkerBuf(null);}} style={btnGhost}>キャンセル</button>
                      </div>}
                  </div>
                  <div style={{marginBottom:10}}>
                    {isEd?<WorkdayToggle buf={editWorkerBuf} setBuf={setEditWorkerBuf}/>
                      :<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{DOW_LABELS.map((l,i)=><span key={i} style={{minWidth:28,textAlign:"center",padding:"3px 0",borderRadius:6,fontSize:12,fontWeight:w.workDays.includes(i)?700:400,background:w.workDays.includes(i)?NAVY:"#eceef6",color:w.workDays.includes(i)?"#fff":"#a3a9bd"}}>{l}</span>)}</div>}
                  </div>
                  {isEd?(
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      {[
                        ["出勤時間",<input type="time" value={buf.startTime} onChange={e=>setEditWorkerBuf(b=>({...b,startTime:e.target.value}))} style={fieldIn}/>],
                        ["退勤時間",<input type="time" value={buf.endTime} onChange={e=>setEditWorkerBuf(b=>({...b,endTime:e.target.value}))} style={fieldIn}/>],
                        ["休憩（分）",<input type="number" value={buf.breakMin} onChange={e=>setEditWorkerBuf(b=>({...b,breakMin:parseInt(e.target.value)||0}))} style={fieldIn}/>],
                        ["実働（分/日）",<input type="number" value={buf.workMin} onChange={e=>setEditWorkerBuf(b=>({...b,workMin:parseInt(e.target.value)||0}))} style={fieldIn}/>],
                      ].map(([k,v],i)=>(
                        <div key={i}><div style={{color:MUTED,fontSize:11,marginBottom:2}}>{k}</div>{v}</div>
                      ))}
                    </div>
                  ):(
                    <div style={{fontSize:14,color:"#3b4256"}}>
                      {w.startTime}〜{w.endTime}　休憩{w.breakMin}分　実働<b style={{color:INK}}>{w.workMin}分/日</b>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>)}
      </div>
    </div>
  );
}
