import { useState, useEffect, useCallback } from "react";

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
const SCHED_COLORS = ["#1565c0","#c62828","#2e7d32","#6a1b9a","#e65100","#00695c","#4527a0","#558b2f"];
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
function fmtDate(d) {
  if(!d) return "";
  const dt=new Date(d);
  return `${dt.getUTCFullYear()}/${String(dt.getUTCMonth()+1).padStart(2,"0")}/${String(dt.getUTCDate()).padStart(2,"0")}`;
}
function fmtDateShort(d) {
  if(!d) return "";
  const dt=new Date(d);
  return `${dt.getUTCMonth()+1}/${dt.getUTCDate()}`;
}

function calcScheduleDates(pickDate, rNeeded, qty, master, worker) {
  const thomsonDays = rNeeded>=10 ? 2 : 1;
  const posCount = master.positions.length;
  const totalMin = qty * posCount * master.minPerSheet;
  const wakka_days = Math.ceil(totalMin / worker.workMin);
  const d0 = new Date(new Date(pickDate).getFullYear(), new Date(pickDate).getMonth(), new Date(pickDate).getDate());
  const d1 = addStdDays(d0, thomsonDays);
  const d2 = addStdDays(d1, 1);
  const cuttingStart = nextWorkerDay(d2, worker);
  const d3 = addWorkerDays(cuttingStart, wakka_days-1, worker);
  const d4 = addStdDays(d3, 1);
  const d5 = addStdDays(d4, 1);
  return { dates:[d0,d1,d2,d3,d4,d5], thomsonDays, totalMin, wakka_days, posCount };
}

function buildCSVRows(schedule, lotLines, master) {
  const shipDate = fmtDate(schedule.dates[5]);
  const rows = [];
  if(!master.boxQty) {
    lotLines.forEach(lot => rows.push([master.displayId, lot.trim(), shipDate, schedule.qty+"セット"]));
    return rows;
  }
  lotLines.forEach(lot => rows.push([master.displayId, lot.trim(), shipDate, master.boxQty+"セット"]));
  master.endBoxes.forEach(eb => { for(let i=0;i<eb.count;i++) rows.push([master.displayId,"混載",shipDate,eb.qty+"セット"]); });
  return rows;
}

// ============================================================
// スタイル定数
// ============================================================
const th  = {padding:"6px 8px",border:"1px solid #ddd",background:"#e8eaf6",textAlign:"left",whiteSpace:"nowrap"};
const tdc = (ex={}) => ({padding:"5px 8px",border:"1px solid #ddd",...ex});
const card = {background:"#fff",borderRadius:8,padding:16,boxShadow:"0 1px 4px #0001",marginBottom:14};
const lbl  = {display:"block",fontWeight:"bold",marginBottom:4,fontSize:12};
const inp  = {width:"100%",padding:"6px 8px",border:"1px solid #ccc",borderRadius:4,boxSizing:"border-box",fontSize:13};

// ============================================================
// メインコンポーネント
// ============================================================
export default function App() {
  const [tab,setTab]=useState(0);
  const [masters,setMasters]=useState(FALLBACK_MASTERS);
  const [workers,setWorkers]=useState(FALLBACK_WORKERS);
  const [inventory,setInventory]=useState(FALLBACK_INVENTORY);
  const [invNextId,setInvNextId]=useState(FALLBACK_INVENTORY.length+1);
  const [schedules,setSchedules]=useState([]);
  const [schedNextId,setSchedNextId]=useState(1);
  const [activeSchedId,setActiveSchedId]=useState(null);
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
      const [ms,ws,inv,scheds,hols] = await Promise.all([
        gasGet("masters"), gasGet("workers"), gasGet("inventory"), gasGet("schedules"), gasGet("holidays")
      ]);
      if(ms?.length)    setMasters(ms);
      if(ws?.length)    setWorkers(ws);
      if(inv?.length) { setInventory(inv); setInvNextId(Math.max(...inv.map(r=>r.id))+1); }
      if(scheds?.length){ setSchedules(scheds); setSchedNextId(Math.max(...scheds.map(s=>s.id))+1); }
      // 祝日データをグローバル変数に反映
      if(hols?.length) { HOLIDAYS = new Set(hols.map(h=>h.date)); }
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
      const m=masters.find(x=>x.id===s.partNo);
      const shortId=m?.displayId||s.partNo;
      const labels=["材料","トムソン","引取受入","カット","検品梱包","出荷"];
      s.dates.forEach((d,pi)=>{
        if(!d) return;
        const key=toKey(new Date(d));
        if(!map[key]) map[key]=[];
        map[key].push({label:`${shortId} ${labels[pi]}`,color});
      });
    });
    return map;
  }

  const tabs=["📅 生産スケジュール","📄 ロット・CSV","📦 仕掛在庫","📆 カレンダー","⚙️ 品番マスタ","👷 作業者マスタ"];
  const wizSteps=[{key:"input",label:"① 品番・数量"},{key:"alloc",label:"② 在庫引当"},{key:"schedule",label:"③ スケジュール"}];

  const WorkdayToggle=({buf,setBuf})=>(
    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
      {DOW_LABELS.map((l,i)=>(
        <button key={i} onClick={()=>toggleDay(buf,setBuf,i)}
          style={{padding:"4px 8px",borderRadius:4,border:"1px solid #ccc",cursor:"pointer",fontSize:12,
            background:buf.workDays.includes(i)?"#1a237e":"#f5f5f5",
            color:buf.workDays.includes(i)?"#fff":"#333",fontWeight:buf.workDays.includes(i)?"bold":"normal"}}>
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{fontFamily:"sans-serif",fontSize:13,background:"#f5f6fa",minHeight:"100vh"}}>
      {/* ヘッダー */}
      <div style={{background:"#1a237e",color:"#fff",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontWeight:"bold",fontSize:15}}>🏭 反射材コーンカバー 生産管理ツール</span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {syncMsg&&<span style={{fontSize:11,color:"#a5d6a7"}}>{syncMsg}</span>}
          {syncError&&<span style={{fontSize:11,color:"#ef9a9a"}}>{syncError}</span>}
          {syncing&&<span style={{fontSize:11,color:"#fff9c4"}}>⏳</span>}
          <button onClick={loadFromGAS} disabled={syncing}
            style={{padding:"4px 10px",background:"#283593",color:"#fff",border:"1px solid #5c6bc0",borderRadius:4,cursor:"pointer",fontSize:11}}>
            🔄 再読込
          </button>
        </div>
      </div>

      {/* タブ */}
      <div style={{display:"flex",background:"#283593",flexWrap:"wrap"}}>
        {tabs.map((t,i)=>(
          <button key={i} onClick={()=>setTab(i)}
            style={{padding:"8px 10px",border:"none",cursor:"pointer",fontWeight:tab===i?"bold":"normal",
              background:tab===i?"#fff":"transparent",color:tab===i?"#1a237e":"#cfd8dc",
              borderBottom:tab===i?"3px solid #ffeb3b":"none",fontSize:11}}>{t}
            {i===1&&schedules.length>0&&<span style={{marginLeft:4,background:"#ffeb3b",color:"#1a237e",borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:"bold"}}>{schedules.length}</span>}
          </button>
        ))}
      </div>

      {!gasLoaded&&(
        <div style={{background:"#fff9c4",border:"1px solid #f9a825",padding:"8px 16px",fontSize:12}}>
          ⏳ スプレッドシートからデータを読み込んでいます...
        </div>
      )}

      <div style={{padding:16}}>

        {/* TAB 0 生産スケジュール */}
        {tab===0&&(
          <div style={{maxWidth:520}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <h3 style={{margin:0,color:"#1a237e"}}>生産スケジュール</h3>
              <button onClick={resetOrder} style={{padding:"4px 10px",background:"#eee",border:"none",borderRadius:4,cursor:"pointer",fontSize:11,color:"#555"}}>リセット</button>
            </div>
            <div style={{display:"flex",marginBottom:16}}>
              {wizSteps.map((s,i)=>{
                const done=(s.key==="input"&&(step==="alloc"||step==="schedule"))||(s.key==="alloc"&&step==="schedule");
                const active=step===s.key;
                return <div key={s.key} style={{flex:1,textAlign:"center",padding:"6px 4px",fontSize:11,
                  background:done?"#c8e6c9":active?"#1a237e":"#e8eaf6",color:done?"#1b5e20":active?"#fff":"#888",
                  borderRadius:i===0?"6px 0 0 6px":i===wizSteps.length-1?"0 6px 6px 0":"0",
                  fontWeight:active?"bold":"normal",borderRight:i<wizSteps.length-1?"1px solid #fff":"none"}}>
                  {done?"✅ ":""}{s.label}
                </div>;
              })}
            </div>

            {step==="input"&&(
              <div style={card}>
                <h4 style={{margin:"0 0 12px",color:"#283593"}}>品番・受注数量を入力</h4>
                <div style={{marginBottom:10}}>
                  <label style={lbl}>品番</label>
                  <select value={orderPartNo} onChange={e=>setOrderPartNo(e.target.value)} style={inp}>
                    <option value="">-- 選択 --</option>
                    {masters.map(m=><option key={m.id} value={m.id}>{m.id}（{m.color}・{m.positions.join("")}）</option>)}
                  </select>
                </div>
                {orderMaster&&<div style={{background:"#e8eaf6",borderRadius:6,padding:"8px 12px",marginBottom:10,fontSize:12}}>
                  色: <b>{orderMaster.color}</b>　位置: <b>{orderMaster.positions.join(" ")}</b>　定番出荷数: <b>{orderMaster.qty??"出来高"}</b>　ショット数: <b>{orderMaster.shots}</b>
                </div>}
                <div style={{marginBottom:10}}>
                  <label style={lbl}>受注数量（セット）</label>
                  <input type="number" value={orderQty} onChange={e=>setOrderQty(e.target.value)} placeholder={orderMaster?.qty?`定番: ${orderMaster.qty}`:"数量を入力"} style={inp}/>
                </div>
                <div style={{marginBottom:14}}>
                  <label style={lbl}>希望納期（任意）</label>
                  <input type="date" value={orderDeadline} onChange={e=>setOrderDeadline(e.target.value)} style={inp}/>
                </div>
                <button onClick={()=>setStep("alloc")} disabled={!orderPartNo||!orderQty}
                  style={{width:"100%",padding:"10px",background:"#1a237e",color:"#fff",border:"none",borderRadius:6,fontWeight:"bold",cursor:"pointer",fontSize:14,opacity:(!orderPartNo||!orderQty)?0.5:1}}>
                  在庫引当を確認 →
                </button>
              </div>
            )}

            {step==="alloc"&&allocData&&(
              <div style={card}>
                <h4 style={{margin:"0 0 4px",color:"#283593"}}>在庫引当確認</h4>
                <div style={{fontSize:12,color:"#555",marginBottom:10}}>
                  品番: <b>{orderPartNo}</b>　受注数: <b>{orderQty}セット</b>　引当条件: 在庫 ≥ <b>{orderMaster?.shots}</b>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:12}}>
                  <thead><tr>
                    <th style={th}>位置</th><th style={{...th,textAlign:"right"}}>現在庫</th>
                    <th style={{...th,textAlign:"center"}}>引当</th><th style={{...th,textAlign:"right"}}>不足数</th>
                  </tr></thead>
                  <tbody>
                    {allocData.result.map(r=>(
                      <tr key={r.pos} style={{background:!r.canAlloc?"#ffebee":r.shortage>0?"#fff3e0":"#f1f8e9"}}>
                        <td style={tdc({textAlign:"center",fontWeight:"bold",fontSize:15})}>{r.pos}</td>
                        <td style={tdc({textAlign:"right"})}>{r.stock}</td>
                        <td style={tdc({textAlign:"center",color:r.canAlloc?"#1b5e20":"#c62828",fontWeight:"bold"})}>{r.canAlloc?"✅ 可":"❌ 不可"}</td>
                        <td style={tdc({textAlign:"right",color:r.shortage>0?"#c62828":"#1b5e20",fontWeight:"bold"})}>{r.shortage>0?r.shortage:"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {allocData.maxShortage>0
                  ?<div style={{background:"#fff3e0",border:"1px solid #ffb74d",borderRadius:6,padding:"8px 12px",marginBottom:12,fontSize:12}}>⚠️ 不足数: <b style={{color:"#c62828"}}>{allocData.maxShortage}セット</b> → 新規生産が必要</div>
                  :<div style={{background:"#e8f5e9",border:"1px solid #81c784",borderRadius:6,padding:"8px 12px",marginBottom:12,fontSize:12}}>✅ 在庫で充足可 — 新規生産不要</div>
                }
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setStep("input")} style={{flex:1,padding:"8px",background:"#eee",color:"#333",border:"none",borderRadius:6,cursor:"pointer",fontSize:13}}>← 戻る</button>
                  <button onClick={()=>setStep("schedule")} style={{flex:2,padding:"8px",background:"#1a237e",color:"#fff",border:"none",borderRadius:6,fontWeight:"bold",cursor:"pointer",fontSize:13}}>
                    引当を承認 {allocData.maxShortage>0?"→ スケジュール生成":"→ 完了"}
                  </button>
                </div>
              </div>
            )}

            {step==="schedule"&&(
              <div>
                {allocData?.maxShortage===0
                  ?<div style={{...card,background:"#e8f5e9",border:"1px solid #81c784"}}><b>✅ 引当完了</b> — 在庫充足のため新規生産不要</div>
                  :<div style={card}>
                    <h4 style={{margin:"0 0 4px",color:"#283593"}}>スケジュール生成</h4>
                    <div style={{background:"#e8eaf6",borderRadius:6,padding:"8px 12px",marginBottom:12,fontSize:12}}>
                      品番: <b>{orderPartNo}</b>　生産数: <b style={{color:"#c62828"}}>{orderMaster?.qty||"?"}セット</b>
                    </div>
                    {orderMaster?.qty===null&&(
                      <div style={{marginBottom:10}}>
                        <label style={lbl}>生産数量（セット）</label>
                        <input type="number" value={manualQty} onChange={e=>setManualQty(e.target.value)} style={inp} placeholder="数量を入力"/>
                      </div>
                    )}
                    <div style={{marginBottom:10}}>
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
                        <div style={{background:"#e8f5e9",borderRadius:6,padding:"8px 12px",marginBottom:12,fontSize:11}}>
                          <b>📅 プレビュー</b>　トムソン:{res.thomsonDays}日（{rN}R）　わっか:{res.totalMin.toFixed(0)}分→{res.wakka_days}稼働日　出荷: <b style={{color:"#c62828"}}>{fmtDate(res.dates[5])}</b>
                          {orderDeadline&&<span style={{marginLeft:8,color:res.dates[5]<=new Date(orderDeadline)?"#1b5e20":"#c62828",fontWeight:"bold"}}>{res.dates[5]<=new Date(orderDeadline)?"✅ 納期OK":"⚠️ 納期NG"}</span>}
                        </div>
                      );
                    })()}
                    <button onClick={doCalcSchedule} disabled={!pickDate||syncing}
                      style={{width:"100%",padding:"10px",background:"#1a237e",color:"#fff",border:"none",borderRadius:6,fontWeight:"bold",cursor:"pointer",fontSize:14,opacity:!pickDate?0.5:1}}>
                      📅 スケジュールを生成・保存
                    </button>
                  </div>
                }
              </div>
            )}

            {schedules.length>0&&(
              <div style={{marginTop:8}}>
                <h4 style={{margin:"0 0 8px",color:"#1a237e"}}>📋 生産スケジュール一覧</h4>
                {schedules.map(s=>{
                  const shipOk=!s.deadline||new Date(s.dates[5])<=new Date(s.deadline);
                  const expanded=s.expanded||false;
                  return (
                    <div key={s.id} style={{background:STATUS_COLORS[s.status]||"#fff",border:"1px solid #ddd",borderRadius:8,marginBottom:10,overflow:"hidden"}}>
                      <div style={{padding:"10px 12px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <span style={{fontWeight:"bold",fontSize:13,color:"#1a237e"}}>{s.partNo}</span>
                            <span style={{fontSize:11,background:STATUS_COLORS[s.status],color:STATUS_TEXT[s.status],border:`1px solid ${STATUS_TEXT[s.status]}`,borderRadius:4,padding:"1px 6px"}}>{s.status}</span>
                            <span style={{fontSize:11,color:"#555"}}>作業者: <b>{s.worker}</b></span>
                            <span style={{fontSize:11,color:"#555"}}>{s.qty}セット</span>
                          </div>
                          <div style={{display:"flex",gap:4,flexShrink:0}}>
                            <button onClick={()=>setSchedules(prev=>prev.map(x=>x.id===s.id?{...x,expanded:!expanded}:x))}
                              style={{padding:"3px 8px",background:"#e8eaf6",color:"#283593",border:"none",borderRadius:4,cursor:"pointer",fontSize:11}}>
                              {expanded?"▲ 閉じる":"▼ 工程"}
                            </button>
                            <button onClick={()=>{setActiveSchedId(s.id);setTab(1);}}
                              style={{padding:"3px 8px",background:"#e65100",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontSize:11}}>CSV</button>
                            <button onClick={()=>deleteSched(s.id)}
                              style={{padding:"3px 8px",background:"#ffebee",color:"#c62828",border:"none",borderRadius:4,cursor:"pointer",fontSize:11}}>削除</button>
                          </div>
                        </div>
                        <div style={{fontSize:11,color:"#555",display:"flex",flexWrap:"wrap",gap:10,marginBottom:6}}>
                          <span>🚚 出荷予定: <b style={{color:shipOk?"#1b5e20":"#c62828",fontSize:12}}>{fmtDate(s.dates[5])}</b></span>
                          {s.deadline&&<span style={{color:shipOk?"#1b5e20":"#c62828"}}>{shipOk?"✅":"⚠️"} 希望納期: {s.deadline}</span>}
                        </div>
                        <div style={{display:"flex",gap:4,alignItems:"center"}}>
                          <span style={{fontSize:11,color:"#888"}}>ステータス:</span>
                          {["生産中","完了","保留"].map(st=>(
                            <button key={st} onClick={()=>updateSchedStatus(s.id,st)}
                              style={{padding:"2px 8px",fontSize:11,border:"1px solid #ccc",borderRadius:4,cursor:"pointer",
                                background:s.status===st?STATUS_TEXT[st]:"#fff",color:s.status===st?"#fff":STATUS_TEXT[st],fontWeight:s.status===st?"bold":"normal"}}>
                              {st}
                            </button>
                          ))}
                        </div>
                      </div>
                      {expanded&&(
                        <div style={{borderTop:"1px solid #ddd",background:"#fff",padding:"10px 12px"}}>
                          <div style={{fontSize:11,color:"#888",marginBottom:6}}>※ 日付セルをクリックして直接変更できます</div>
                          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                            <thead><tr style={{background:"#e8eaf6"}}>
                              <th style={{...th,width:"55%"}}>工程</th>
                              <th style={{...th,textAlign:"center"}}>予定日</th>
                            </tr></thead>
                            <tbody>
                              {PROCESSES.map((p,i)=>{
                                const dateVal = s.dates[i] ? new Date(s.dates[i]).toISOString().split("T")[0] : "";
                                return (
                                  <tr key={i} style={{background:i===5?"#fff9c4":i%2===0?"#fff":"#fafafa"}}>
                                    <td style={tdc()}>{i===5?"🚚 ":""}{p}</td>
                                    <td style={tdc({textAlign:"center",padding:"3px 6px"})}>
                                      <input type="date" value={dateVal}
                                        onChange={e=>updateSchedDate(s.id,i,e.target.value)}
                                        style={{border:"1px solid #ddd",borderRadius:4,padding:"3px 6px",
                                          fontSize:12,textAlign:"center",cursor:"pointer",
                                          background:i===5?"#fff9c4":"#fff",
                                          fontWeight:i===5?"bold":"normal",
                                          color:i===5?"#c62828":"inherit",
                                          width:"100%"}}/>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <div style={{marginTop:8,fontSize:11,color:"#555",display:"flex",gap:12,flexWrap:"wrap"}}>
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
          </div>
        )}

        {/* TAB 1 ロット・CSV */}
        {tab===1&&(
          <div style={{maxWidth:560}}>
            <h3 style={{margin:"0 0 12px",color:"#1a237e"}}>ロットNo. & 現品票CSV</h3>
            {schedules.length===0
              ?<div style={{color:"#888",padding:20}}>先にスケジュールを生成してください。</div>
              :<>
                <div style={{...card,padding:12}}>
                  <label style={lbl}>スケジュールを選択</label>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {schedules.map(s=>(
                      <button key={s.id} onClick={()=>setActiveSchedId(s.id)}
                        style={{padding:"6px 12px",border:"2px solid",borderRadius:6,cursor:"pointer",fontSize:12,
                          borderColor:activeSchedId===s.id?"#1a237e":"#ddd",background:activeSchedId===s.id?"#1a237e":"#fff",
                          color:activeSchedId===s.id?"#fff":"#333",fontWeight:activeSchedId===s.id?"bold":"normal"}}>
                        {s.partNo}<br/><span style={{fontSize:10}}>{fmtDate(s.dates[5])}出荷</span>
                      </button>
                    ))}
                  </div>
                </div>
                {activeSchedule&&(()=>{
                  const m=masters.find(x=>x.id===(activeSchedule.csvPartNo||activeSchedule.partNo));
                  const rNeeded=activeSchedule.rNeeded||null;
                  const lines=activeSchedule.lotInput.split(/\n/).map(l=>l.trim()).filter(l=>l.length>0);
                  const previewRows=lines.length>0?buildCSVRows(activeSchedule,lines,m):[];
                  return (
                    <>
                      <div style={card}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:14}}>
                          <tbody>
                            {[["品番",m?.displayId],["出荷日",fmtDate(activeSchedule.dates[5])],["数量",activeSchedule.qty+" セット"],["必要原反数",rNeeded?rNeeded+"R":"—"],["箱入り数",m?.boxQty??"—"]].map(([k,v],i)=>(
                              <tr key={i} style={{background:i%2===0?"#e8eaf6":"#fff"}}>
                                <td style={tdc({fontWeight:"bold",width:"40%"})}>{k}</td>
                                <td style={tdc({color:k==="出荷日"?"#c62828":"inherit",fontWeight:k==="出荷日"?"bold":"normal"})}>{v}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <label style={{...lbl,marginBottom:4}}>ロットNo.（1行1ロット）{rNeeded&&<span style={{fontWeight:"normal",color:"#666",marginLeft:8}}>※{rNeeded}行必要</span>}</label>
                        <textarea value={activeSchedule.lotInput} onChange={e=>updateSchedLot(activeSchedule.id,e.target.value)}
                          rows={Math.max(4,rNeeded||4)} placeholder={"N08ZQ9190\nN08ZQ9220\n..."}
                          style={{width:"100%",padding:"8px",border:"2px solid #1a237e",borderRadius:4,boxSizing:"border-box",fontSize:13,fontFamily:"monospace",resize:"vertical"}}/>
                        <div style={{fontSize:11,color:lines.length>0?"#1b5e20":"#888",marginTop:2}}>
                          {lines.length>0?`✅ ${lines.length}行入力済み`:"ロットNo.をペーストしてください"}
                        </div>
                      </div>
                      {previewRows.length>0&&(
                        <div style={card}>
                          <h4 style={{margin:"0 0 8px",color:"#283593"}}>📋 現品票プレビュー（{previewRows.length}行）</h4>
                          <div style={{overflowX:"auto"}}>
                            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                              <thead><tr>{["品番","ロットNo.","出荷日","数量"].map((h,i)=><th key={i} style={th}>{h}</th>)}</tr></thead>
                              <tbody>
                                {previewRows.map((row,i)=>(
                                  <tr key={i} style={{background:row[1]==="混載"?"#fff3e0":i%2===0?"#fff":"#fafafa"}}>
                                    {row.map((cell,j)=><td key={j} style={tdc({color:row[1]==="混載"&&j===1?"#e65100":"inherit"})}>{cell}</td>)}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      <button onClick={()=>downloadCSV(activeSchedule)} disabled={lines.length===0}
                        style={{width:"100%",padding:"10px",background:lines.length>0?"#e65100":"#ccc",color:"#fff",border:"none",borderRadius:6,fontWeight:"bold",cursor:lines.length>0?"pointer":"not-allowed",fontSize:14}}>
                        📥 現品票CSVをダウンロード
                      </button>
                    </>
                  );
                })()}
              </>
            }
          </div>
        )}

        {/* TAB 2 仕掛在庫 */}
        {tab===2&&(
          <div>
            <h3 style={{margin:"0 0 12px",color:"#1a237e"}}>仕掛品在庫管理</h3>
            <div style={card}>
              <h4 style={{margin:"0 0 10px",color:"#283593"}}>📊 現在庫サマリ</h4>
              <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
                {stockMasters.map(m=>{
                  const pd=invSummary[m.id]||{};
                  const total=Object.values(pd).reduce((a,b)=>a+b,0);
                  return (
                    <div key={m.id} style={{background:"#f5f6fa",border:"1px solid #ddd",borderRadius:8,padding:"10px 14px",minWidth:180,flex:"1 1 180px"}}>
                      <div style={{fontWeight:"bold",color:"#1a237e",fontSize:13,marginBottom:6}}>{m.id}</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:6}}>
                        {m.positions.map(pos=>{
                          const q=pd[pos]||0;const canAlloc=q>=m.shots;
                          return (
                            <div key={pos} style={{background:q<0?"#ffebee":canAlloc?"#e8f5e9":"#fff9c4",borderRadius:6,padding:"4px 10px",textAlign:"center",minWidth:52}}>
                              <div style={{fontSize:14,fontWeight:"bold"}}>{pos}</div>
                              <div style={{fontSize:13,fontWeight:"bold",color:q<0?"#c62828":canAlloc?"#1b5e20":"#e65100"}}>{q}</div>
                              <div style={{fontSize:9,color:"#888"}}>{canAlloc?"引当可":"引当不可"}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{fontSize:11,color:"#555",borderTop:"1px solid #ddd",paddingTop:4}}>合計: <b style={{color:total<0?"#c62828":"#1b5e20"}}>{total}</b>　引当条件: ≥{m.shots}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={card}>
              <h4 style={{margin:"0 0 10px",color:"#283593"}}>➕ 入出庫記録</h4>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                <div><label style={{fontSize:11,fontWeight:"bold"}}>日付</label>
                  <input type="date" value={invDate} onChange={e=>setInvDate(e.target.value)} style={{width:"100%",padding:"5px",border:"1px solid #ccc",borderRadius:4,boxSizing:"border-box",fontSize:12}}/></div>
                <div><label style={{fontSize:11,fontWeight:"bold"}}>入庫 / 出庫</label>
                  <select value={invType} onChange={e=>setInvType(e.target.value)} style={{width:"100%",padding:"5px",border:"1px solid #ccc",borderRadius:4,boxSizing:"border-box",fontSize:12}}>
                    <option>入庫</option><option>出庫</option></select></div>
                <div style={{gridColumn:"1/-1"}}><label style={{fontSize:11,fontWeight:"bold"}}>品番</label>
                  <select value={invPartNo} onChange={e=>handleInvPartChange(e.target.value)} style={{width:"100%",padding:"5px",border:"1px solid #ccc",borderRadius:4,boxSizing:"border-box",fontSize:12}}>
                    <option value="">-- 選択 --</option>
                    {stockMasters.map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select></div>
              </div>
              {masters.find(x=>x.id===invPartNo)&&(
                <div style={{background:"#e8eaf6",borderRadius:6,padding:"10px 12px",marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:"bold",marginBottom:8,color:"#283593"}}>位置ごとの数量</div>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    {masters.find(x=>x.id===invPartNo).positions.map(pos=>(
                      <div key={pos} style={{textAlign:"center"}}>
                        <div style={{fontWeight:"bold",fontSize:14,marginBottom:4}}>{pos}</div>
                        <input type="number" value={invQtys[pos]||""} min="0" onChange={e=>setInvQtys(q=>({...q,[pos]:e.target.value}))}
                          style={{width:70,padding:"6px",border:"1px solid #aaa",borderRadius:4,textAlign:"center",fontSize:13,boxSizing:"border-box"}}/>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{marginBottom:10}}><label style={{fontSize:11,fontWeight:"bold"}}>備考</label>
                <input type="text" value={invNote} onChange={e=>setInvNote(e.target.value)} placeholder="任意"
                  style={{width:"100%",padding:"5px",border:"1px solid #ccc",borderRadius:4,boxSizing:"border-box",fontSize:12}}/></div>
              <button onClick={addInvRecord} disabled={!invDate||!invPartNo||Object.values(invQtys).every(v=>!v||parseInt(v)<=0)||syncing}
                style={{padding:"7px 20px",background:"#283593",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontWeight:"bold",fontSize:12}}>記録を追加</button>
            </div>
            <div style={card}>
              <h4 style={{margin:"0 0 8px",color:"#283593"}}>📋 入出庫履歴</h4>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead><tr style={{background:"#e8eaf6"}}>{["日付","品番","区分","位置・数量","備考",""].map((h,i)=><th key={i} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {[...inventory].reverse().map(r=>(
                      <tr key={r.id} style={{background:r.type==="出庫"?"#fff3e0":"#fff"}}>
                        <td style={tdc({whiteSpace:"nowrap"})}>{r.date}</td>
                        <td style={tdc()}>{r.partNo}</td>
                        <td style={tdc({textAlign:"center",color:r.type==="入庫"?"#1b5e20":"#c62828",fontWeight:"bold"})}>{r.type}</td>
                        <td style={tdc()}><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                          {r.entries.map(({pos,qty})=><span key={pos} style={{background:"#e8eaf6",borderRadius:4,padding:"2px 8px",whiteSpace:"nowrap"}}>{pos}: <b>{qty}</b></span>)}
                        </div></td>
                        <td style={tdc()}>{r.note}</td>
                        <td style={tdc({textAlign:"center"})}><button onClick={()=>delInv(r.id)} style={{background:"#ffebee",color:"#c62828",border:"none",borderRadius:3,cursor:"pointer",fontSize:11,padding:"2px 6px"}}>削除</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

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
          return (
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <h3 style={{margin:0,color:"#1a237e"}}>📆 生産カレンダー</h3>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <button onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);}} style={{padding:"4px 10px",border:"1px solid #ccc",borderRadius:4,cursor:"pointer",background:"#fff"}}>◀</button>
                  <span style={{fontWeight:"bold",fontSize:14}}>{calYear}年{calMonth+1}月</span>
                  <button onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);}} style={{padding:"4px 10px",border:"1px solid #ccc",borderRadius:4,cursor:"pointer",background:"#fff"}}>▶</button>
                  <button onClick={()=>{setCalYear(today.getFullYear());setCalMonth(today.getMonth());}} style={{padding:"4px 10px",border:"1px solid #ccc",borderRadius:4,cursor:"pointer",background:"#e8eaf6",fontSize:11}}>今月</button>
                </div>
              </div>
              {schedules.length>0&&(
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                  {schedules.map((s,si)=>{
                    const m=masters.find(x=>x.id===s.partNo);
                    return <span key={s.id} style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:SCHED_COLORS[si%SCHED_COLORS.length],color:"#fff",fontWeight:"bold"}}>{m?.displayId||s.partNo} {fmtDateShort(s.dates[0])}〜{fmtDateShort(s.dates[5])}</span>;
                  })}
                </div>
              )}
              <div style={{background:"#fff",borderRadius:8,boxShadow:"0 1px 4px #0001",overflow:"hidden"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"#e8eaf6"}}>
                  {["月","火","水","木","金","土","日"].map((l,i)=>(
                    <div key={i} style={{padding:"6px 0",textAlign:"center",fontSize:12,fontWeight:"bold",color:i===5?"#1565c0":i===6?"#c62828":"#333",borderRight:i<6?"1px solid #ddd":"none"}}>{l}</div>
                  ))}
                </div>
                {weeks.map((week,wi)=>(
                  <div key={wi} style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",borderTop:"1px solid #ddd"}}>
                    {week.map((d,di)=>{
                      if(!d) return <div key={di} style={{minHeight:70,background:"#f9f9f9",borderRight:di<6?"1px solid #ddd":"none"}}/>;
                      const date=new Date(calYear,calMonth,d);
                      const events=calEvents[toKey(date)]||[];
                      const isToday=date.toDateString()===today.toDateString();
                      const adj=(date.getDay()+6)%7;
                      const isSat=adj===5,isSun=adj===6,isHol=isHoliday(date);
                      return (
                        <div key={di} style={{minHeight:70,padding:"3px 4px",background:(isSat||isSun||isHol)?"#f5f5f5":"#fff",borderRight:di<6?"1px solid #ddd":"none"}}>
                          <div style={{width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:2,fontSize:12,fontWeight:isToday?"bold":"normal",background:isToday?"#1a237e":"transparent",color:isToday?"#fff":isSun||isHol?"#c62828":isSat?"#1565c0":"#333"}}>{d}</div>
                          <div style={{display:"flex",flexDirection:"column",gap:2}}>
                            {events.map((ev,ei)=>(
                              <div key={ei} style={{background:ev.color,color:"#fff",borderRadius:3,padding:"1px 4px",fontSize:10,fontWeight:"bold",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ev.label}</div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              {schedules.length===0&&<div style={{textAlign:"center",color:"#aaa",padding:40,fontSize:13}}>スケジュールを生成するとカレンダーに表示されます</div>}
            </div>
          );
        })()}

        {/* TAB 4 品番マスタ */}
        {tab===4&&(
          <div>
            <h3 style={{margin:"0 0 12px",color:"#1a237e"}}>品番マスタ管理</h3>
            {masters.map(m=>{
              const isEditing=editingMaster===m.id;
              const buf=isEditing?editBuf:m;
              return (
                <div key={m.id} style={{...card,padding:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontWeight:"bold",fontSize:14,color:"#1a237e"}}>{m.id}</span>
                    {!isEditing
                      ?<button onClick={()=>startEdit(m)} style={{padding:"4px 12px",background:"#e8eaf6",color:"#283593",border:"none",borderRadius:4,cursor:"pointer",fontSize:12}}>編集</button>
                      :<div style={{display:"flex",gap:6}}>
                        <button onClick={saveEdit} disabled={syncing} style={{padding:"4px 12px",background:"#1b5e20",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontSize:12}}>保存</button>
                        <button onClick={()=>{setEditingMaster(null);setEditBuf(null);}} style={{padding:"4px 12px",background:"#eee",color:"#333",border:"none",borderRadius:4,cursor:"pointer",fontSize:12}}>キャンセル</button>
                      </div>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:6,fontSize:12}}>
                    {[
                      ["色",isEditing?<select value={buf.color} onChange={e=>setEditBuf(b=>({...b,color:e.target.value}))} style={{width:"100%",fontSize:11}}><option>黄</option><option>白</option></select>:m.color],
                      ["位置",m.positions.join(" ")],
                      ["出荷数",isEditing?<input type="number" value={buf.qty??""} placeholder="出来高" onChange={e=>setEditBuf(b=>({...b,qty:e.target.value===''?null:parseInt(e.target.value)}))} style={{width:"100%",fontSize:11}}/>:(m.qty??"出来高")],
                      ["ショット数/R",isEditing?<input type="number" value={buf.shots} onChange={e=>setEditBuf(b=>({...b,shots:parseInt(e.target.value)||0}))} style={{width:"100%",fontSize:11}}/>:m.shots],
                      ["箱入り数",isEditing?<input type="number" value={buf.boxQty??""} placeholder="なし" onChange={e=>setEditBuf(b=>({...b,boxQty:e.target.value===''?null:parseInt(e.target.value)}))} style={{width:"100%",fontSize:11}}/>:(m.boxQty??"—")],
                      ["作業時間(分/枚)",isEditing?<input type="number" step="0.001" value={buf.minPerSheet} onChange={e=>setEditBuf(b=>({...b,minPerSheet:parseFloat(e.target.value)||0}))} style={{width:"100%",fontSize:11}}/>:m.minPerSheet],
                      ["在庫管理",isEditing?<select value={buf.manageStock?"する":"しない"} onChange={e=>setEditBuf(b=>({...b,manageStock:e.target.value==="する"}))} style={{width:"100%",fontSize:11}}><option>する</option><option>しない</option></select>:(m.manageStock?"する":"しない")],
                    ].map(([k,v],i)=>(
                      <div key={i} style={{background:"#f5f6fa",borderRadius:4,padding:"6px 8px"}}>
                        <div style={{color:"#888",fontSize:10,marginBottom:2}}>{k}</div>
                        <div style={{fontWeight:"bold"}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {m.endBoxes.length>0&&<div style={{marginTop:8,fontSize:11,color:"#555"}}>端数箱: {m.endBoxes.map(eb=>`${eb.qty}セット×${eb.count}箱`).join("　＋　")}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 5 作業者マスタ */}
        {tab===5&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <h3 style={{margin:0,color:"#1a237e"}}>👷 作業者マスタ</h3>
              <button onClick={()=>setShowAddWorker(v=>!v)} style={{padding:"6px 14px",background:"#1a237e",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:"bold"}}>＋ 追加</button>
            </div>
            <div style={{background:"#fffde7",border:"1px solid #f9a825",borderRadius:6,padding:"8px 12px",marginBottom:12,fontSize:11}}>
              ※ カット/貼合せ工程のみ作業者の勤務曜日・実働時間を使用。その他工程は月〜金・祝日除く標準稼働日で計算。
            </div>
            {showAddWorker&&(
              <div style={{...card,border:"2px solid #1a237e"}}>
                <h4 style={{margin:"0 0 10px",color:"#283593"}}>新規作業者</h4>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                  <div style={{gridColumn:"1/-1"}}><label style={lbl}>氏名</label><input type="text" value={newWorker.name} onChange={e=>setNewWorker(w=>({...w,name:e.target.value}))} style={inp} placeholder="例：田中"/></div>
                  <div style={{gridColumn:"1/-1"}}><label style={lbl}>勤務曜日</label><WorkdayToggle buf={newWorker} setBuf={setNewWorker}/></div>
                  <div><label style={lbl}>出勤時間</label><input type="time" value={newWorker.startTime} onChange={e=>setNewWorker(w=>({...w,startTime:e.target.value}))} style={inp}/></div>
                  <div><label style={lbl}>退勤時間</label><input type="time" value={newWorker.endTime} onChange={e=>setNewWorker(w=>({...w,endTime:e.target.value}))} style={inp}/></div>
                  <div><label style={lbl}>休憩（分）</label><input type="number" value={newWorker.breakMin} onChange={e=>setNewWorker(w=>({...w,breakMin:parseInt(e.target.value)||0}))} style={inp}/></div>
                  <div><label style={lbl}>実働（分/日）</label><input type="number" value={newWorker.workMin} onChange={e=>setNewWorker(w=>({...w,workMin:parseInt(e.target.value)||0}))} style={inp}/></div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setShowAddWorker(false)} style={{padding:"7px 16px",background:"#eee",color:"#333",border:"none",borderRadius:6,cursor:"pointer",fontSize:12}}>キャンセル</button>
                  <button onClick={addWorker} disabled={!newWorker.name||syncing} style={{padding:"7px 20px",background:"#1b5e20",color:"#fff",border:"none",borderRadius:6,cursor:"pointer",fontWeight:"bold",fontSize:12,opacity:!newWorker.name?0.5:1}}>追加</button>
                </div>
              </div>
            )}
            {workers.map(w=>{
              const isEd=editingWorker===w.id;
              const buf=isEd?editWorkerBuf:w;
              return (
                <div key={w.id} style={{...card,padding:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <span style={{fontWeight:"bold",fontSize:15,color:"#1a237e"}}>👤 {w.name}</span>
                    {!isEd
                      ?<button onClick={()=>startEditWorker(w)} style={{padding:"4px 12px",background:"#e8eaf6",color:"#283593",border:"none",borderRadius:4,cursor:"pointer",fontSize:12}}>編集</button>
                      :<div style={{display:"flex",gap:6}}>
                        <button onClick={saveEditWorker} disabled={syncing} style={{padding:"4px 12px",background:"#1b5e20",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontSize:12}}>保存</button>
                        <button onClick={()=>{setEditingWorker(null);setEditWorkerBuf(null);}} style={{padding:"4px 12px",background:"#eee",color:"#333",border:"none",borderRadius:4,cursor:"pointer",fontSize:12}}>キャンセル</button>
                      </div>}
                  </div>
                  <div style={{marginBottom:8}}>
                    <div style={{color:"#888",fontSize:10,marginBottom:4}}>勤務曜日</div>
                    {isEd?<WorkdayToggle buf={editWorkerBuf} setBuf={setEditWorkerBuf}/>
                      :<div style={{display:"flex",gap:4}}>{DOW_LABELS.map((l,i)=><span key={i} style={{padding:"3px 8px",borderRadius:4,fontSize:12,fontWeight:"bold",background:w.workDays.includes(i)?"#1a237e":"#eee",color:w.workDays.includes(i)?"#fff":"#aaa"}}>{l}</span>)}</div>}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:6}}>
                    {[
                      ["出勤時間",isEd?<input type="time" value={buf.startTime} onChange={e=>setEditWorkerBuf(b=>({...b,startTime:e.target.value}))} style={{width:"100%",fontSize:11}}/>:w.startTime],
                      ["退勤時間",isEd?<input type="time" value={buf.endTime} onChange={e=>setEditWorkerBuf(b=>({...b,endTime:e.target.value}))} style={{width:"100%",fontSize:11}}/>:w.endTime],
                      ["休憩（分）",isEd?<input type="number" value={buf.breakMin} onChange={e=>setEditWorkerBuf(b=>({...b,breakMin:parseInt(e.target.value)||0}))} style={{width:"100%",fontSize:11}}/>:w.breakMin],
                      ["実働（分/日）",isEd?<input type="number" value={buf.workMin} onChange={e=>setEditWorkerBuf(b=>({...b,workMin:parseInt(e.target.value)||0}))} style={{width:"100%",fontSize:11}}/>:w.workMin],
                    ].map(([k,v],i)=>(
                      <div key={i} style={{background:"#f5f6fa",borderRadius:4,padding:"6px 8px"}}>
                        <div style={{color:"#888",fontSize:10,marginBottom:2}}>{k}</div>
                        <div style={{fontWeight:"bold"}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
