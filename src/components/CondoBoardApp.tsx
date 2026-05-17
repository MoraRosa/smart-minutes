// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import type { MLCEngine } from "@mlc-ai/web-llm";
import { extractRuleBased, extractWithTransformers } from "@/lib/minutes-extractors";

type EngineMode = "auto" | "webllm" | "transformers" | "rules";

const C = {
  navy:"#1B2B4B", gold:"#C9A84C", goldLt:"#E8C97A",
  slate:"#4A5568", slateL:"#718096", silver:"#E8ECF0",
  bg:"#F0F3F8", red:"#C53030",
};

const SYSTEM = `You are a professional condo board secretary. Extract structured meeting minutes from a transcript and return ONLY valid JSON. No markdown fences, no preamble, no explanation — just the raw JSON object.

IMPORTANT RULES:
- All "description", "operations", "correspondence", and "narrative" fields MUST be ARRAYS OF STRINGS (one point per item). These render as bullet points. Never use a plain string for these fields.
- meeting_type is "Board Member Meeting" unless it is clearly an AGM, in which case use "Annual General Meeting".
- Use formal board-minutes language. Fix any spelling errors from the transcript.
- Omit any key entirely if there is no relevant content for it in the transcript.

Return this JSON structure:
{
  "meeting_date": "Month DD, YYYY",
  "meeting_time": "H:MM PM",
  "location": "string",
  "meeting_type": "Board Member Meeting",
  "board_present": ["Name, Title"],
  "board_absent": ["Name"],
  "also_present": ["Name, Role"],
  "quorum_note": "Quorum confirmed with X of X directors present.",
  "call_to_order_time": "H:MM PM",
  "call_to_order_chair": "Name, Title",
  "previous_minutes": {"period":"Month YYYY","mover":"Name","seconder":"Name","result":"CARRIED"},
  "business_arising": [{"title":"string","description":["point 1","point 2"],"motion":"MOVED by X; SECONDED by Y that...","result":"CARRIED"}],
  "pm_report": {
    "operations": ["point 1","point 2"],
    "correspondence": ["point 1","point 2"]
  },
  "financial_report": {
    "period":"Month YYYY or Current",
    "operating_balance":"$X,XXX",
    "reserve_balance":"$X,XXX",
    "ar_notes":"string",
    "narrative":["point 1","point 2"],
    "mover":"Name","seconder":"Name","result":"CARRIED"
  },
  "old_business": [{"title":"string","description":["point 1","point 2"],"motion":"string","result":"string"}],
  "new_business": [{"title":"string","description":["point 1","point 2"],"motion":"string","result":"string"}],
  "owners_forum": [{"speaker":"string","concern":"string","response":"string"}],
  "action_items": [{"no":"1","action":"string","owner":"string","due":"string"}],
  "next_meeting": "Month DD, YYYY at H:MM PM, Location",
  "adjournment_time": "H:MM PM",
  "adjournment_mover": "Name",
  "adjournment_seconder": "Name"
}`;

function buildSections(m) {
  let n = 1; const S: any = {};
  S.details = n++; S.attendees = n++;
  if (m.call_to_order_time)       S.callToOrder = n++;
  if (m.previous_minutes)         S.prevMinutes = n++;
  if (m.business_arising?.length) S.bizArising  = n++;
  if (m.pm_report)                S.pmReport    = n++;
  if (m.financial_report)         S.financial   = n++;
  if (m.old_business?.length)     S.oldBiz      = n++;
  if (m.new_business?.length)     S.newBiz      = n++;
  if (m.owners_forum?.length)     S.ownersForum = n++;
  if (m.action_items?.length)     S.actions     = n++;
  if (m.next_meeting)             S.nextMeeting = n++;
  if (m.adjournment_time)         S.adjournment = n++;
  return S;
}

function buildHTML(m) {
  const S = buildSections(m);
  const h   = (no,t) => `<p class="sh">${no}.&nbsp;&nbsp;${t}</p>`;
  const subh= (t)    => `<p class="subh">${t}</p>`;
  const mo  = (t)    => t?`<p class="mo">${t}</p>`:'';
  const re  = (t)    => t?`<p class="re">${t}</p>`:'';
  const bu  = (t)    => t?`<p class="bu">&ndash;&nbsp;${t}</p>`:'';
  const dot = (t)    => t?`<p class="dot">&bull;&nbsp;${t}</p>`:'';
  const buls= (arr)  => Array.isArray(arr)?arr.map(bu).join(''):(arr?bu(arr):'');
  const tbl = (rows,ws) => `<table>${rows.map(r=>`<tr>${r.map((c,i)=>`<td class="${c.h?'th':'td'}"${ws?` style="width:${ws[i]}"`:''}>${c.v||''}</td>`).join('')}</tr>`).join('')}</table>`;

  let b = '';
  b += h(S.details,'MEETING DETAILS');
  b += tbl([[
    [{h:0,v:`<b>Date:</b> ${m.meeting_date||'–'}`},{h:0,v:`<b>Time:</b> ${m.meeting_time||'–'}`},
     {h:0,v:`<b>Location:</b> ${m.location||'–'}`},{h:0,v:`<b>Type:</b> ${m.meeting_type||'Board Member Meeting'}`}]
  ]],['25%','15%','35%','25%']);

  b += h(S.attendees,'ATTENDEES');
  const mx = Math.max((m.board_present||[]).length,(m.board_absent||[]).length,(m.also_present||[]).length,1);
  b += tbl([
    [{h:1,v:'Board Members Present'},{h:1,v:'Absent'},{h:1,v:'Also Present'}],
    ...Array.from({length:mx},(_,i)=>[
      {h:0,v:(m.board_present||[])[i]||''},{h:0,v:(m.board_absent||[])[i]||''},{h:0,v:(m.also_present||[])[i]||''}
    ])
  ],['34%','33%','33%']);

  if(S.callToOrder){b+=h(S.callToOrder,'CALL TO ORDER');b+=`<p class="bt">The meeting was called to order at ${m.call_to_order_time} by ${m.call_to_order_chair}. ${m.quorum_note||''}</p>`;}
  if(S.prevMinutes){const pm=m.previous_minutes;b+=h(S.prevMinutes,'APPROVAL OF PREVIOUS MINUTES');b+=`<p class="bt">The minutes of the ${pm.period} Board Member Meeting were reviewed.</p>`;b+=mo(`MOVED by ${pm.mover}; SECONDED by ${pm.seconder} that the minutes of the ${pm.period} meeting be approved as circulated.`);b+=re(pm.result);}
  if(S.bizArising){b+=h(S.bizArising,'BUSINESS ARISING FROM PREVIOUS MINUTES');m.business_arising.forEach((it,i)=>{b+=subh(`${S.bizArising}.${i+1}&nbsp;&nbsp;${it.title}`);b+=buls(it.description);b+=mo(it.motion);b+=re(it.result);});}
  if(S.pmReport){b+=h(S.pmReport,"PROPERTY MANAGER'S REPORT");if(m.pm_report.operations?.length){b+=subh(`${S.pmReport}.1&nbsp;&nbsp;Building Operations`);b+=buls(m.pm_report.operations);}if(m.pm_report.correspondence?.length){b+=subh(`${S.pmReport}.2&nbsp;&nbsp;Correspondence`);b+=buls(m.pm_report.correspondence);}}
  if(S.financial){const fr=m.financial_report;b+=h(S.financial,'FINANCIAL REPORT');b+=`<p class="bt"><b>Period:</b> ${fr.period||'Current'}</p>`;if(fr.operating_balance)b+=dot(`Operating Fund: ${fr.operating_balance}`);if(fr.reserve_balance)b+=dot(`Reserve Fund: ${fr.reserve_balance}`);if(fr.ar_notes)b+=dot(`Accounts Receivable: ${fr.ar_notes}`);b+=buls(fr.narrative);if(fr.mover){b+=mo(`MOVED by ${fr.mover}; SECONDED by ${fr.seconder} that the financial report be accepted.`);b+=re(fr.result);}}
  if(S.oldBiz){b+=h(S.oldBiz,'OLD BUSINESS');m.old_business.forEach((it,i)=>{b+=subh(`${S.oldBiz}.${i+1}&nbsp;&nbsp;${it.title}`);b+=buls(it.description);b+=mo(it.motion);b+=re(it.result);});}
  if(S.newBiz){b+=h(S.newBiz,'NEW BUSINESS');m.new_business.forEach((it,i)=>{b+=subh(`${S.newBiz}.${i+1}&nbsp;&nbsp;${it.title}`);b+=buls(it.description);b+=mo(it.motion);b+=re(it.result);});}
  if(S.ownersForum){b+=h(S.ownersForum,"OWNERS' FORUM");b+=`<p class="bt">Owners/residents were given the opportunity to raise matters:</p>`;m.owners_forum.forEach(it=>{b+=`<p class="bu"><strong>${it.speaker}:</strong> ${it.concern}</p>`;if(it.response)b+=`<p class="bu" style="margin-left:28pt;font-style:italic">Board response: ${it.response}</p>`;});}
  if(S.actions){b+=h(S.actions,'ACTION ITEMS SUMMARY');b+=tbl([[{h:1,v:'#'},{h:1,v:'Action Item'},{h:1,v:'Owner'},{h:1,v:'Due By'}],...m.action_items.map(it=>[{h:0,v:it.no},{h:0,v:it.action},{h:0,v:it.owner},{h:0,v:it.due}])],['5%','55%','25%','15%']);}
  if(S.nextMeeting){b+=h(S.nextMeeting,'NEXT MEETING');b+=`<p class="bt">The next Board Member Meeting is scheduled for <strong>${m.next_meeting}</strong>.</p>`;}
  if(S.adjournment){b+=h(S.adjournment,'ADJOURNMENT');b+=`<p class="bt">There being no further business, the meeting was adjourned at <strong>${m.adjournment_time}</strong>.</p>`;if(m.adjournment_mover){b+=mo(`MOVED by ${m.adjournment_mover}; SECONDED by ${m.adjournment_seconder} that the meeting be adjourned.`);b+=re('CARRIED');}}
  b+=`<div class="fr"></div><p class="fn">Minutes prepared by the Recording Secretary on behalf of The Windsor Board of Directors.</p>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:Calibri,sans-serif;font-size:11pt;color:#4A5568;margin:54pt 72pt;}
.hbar{background:#1B2B4B;padding:13pt 20pt;text-align:center;}
.hn{font-size:18pt;font-weight:bold;color:white;margin:0 0 3pt;letter-spacing:1pt;}
.ha{font-size:10pt;color:#B0BEC5;margin:0;}
.gb{border-bottom:5pt solid #C9A84C;margin-bottom:13pt;}
.dt{text-align:center;font-size:16pt;font-weight:bold;color:#1B2B4B;margin:9pt 0 4pt;}
.dd{text-align:center;font-size:11pt;color:#4A5568;font-style:italic;margin-bottom:18pt;}
.sh{font-size:11pt;font-weight:bold;color:#1B2B4B;border-bottom:1.5pt solid #1B2B4B;padding-bottom:3pt;margin-top:17pt;margin-bottom:7pt;}
.subh{font-size:10pt;font-weight:bold;color:#1B2B4B;margin:9pt 0 4pt;}
.bt{font-size:10pt;color:#4A5568;margin:3pt 0 6pt;}
.bu{font-size:10pt;color:#4A5568;margin:2pt 0 3pt 12pt;}
.dot{font-size:10pt;color:#4A5568;margin:2pt 0 3pt 12pt;}
.mo{font-size:10pt;font-style:italic;color:#4A5568;margin:7pt 0 3pt;}
.re{font-size:10pt;font-weight:bold;color:#1B2B4B;margin:2pt 0 8pt;}
.fr{border-top:1pt solid #CBD5E0;margin-top:30pt;}
.fn{font-size:9pt;color:#718096;font-style:italic;text-align:center;margin-top:7pt;}
table{border-collapse:collapse;width:100%;margin-bottom:10pt;}
.th{background:#1B2B4B;color:white;font-weight:bold;font-size:9pt;padding:5pt 8pt;border:1pt solid #CBD5E0;vertical-align:top;}
.td{font-size:9pt;color:#4A5568;padding:5pt 8pt;border:1pt solid #CBD5E0;vertical-align:top;}
@media print{body{margin:36pt 54pt;}.sh{page-break-after:avoid;}}
</style></head><body>
<div class="hbar"><p class="hn">THE WINDSOR</p><p class="ha">315 50 Ave SW, Calgary, AB &nbsp; T2S 1H3</p></div>
<div class="gb"></div>
<p class="dt">Board Member Meeting Minutes</p>
<p class="dd">${m.meeting_date||''}</p>
${b}
</body></html>`;
}

function exportWord(m) {
  const html = buildHTML(m);
  const blob = new Blob([html],{type:"application/msword"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.download=`Windsor_Minutes_${(m.meeting_date||'Draft').replace(/[,\s]+/g,'_')}.doc`; a.click();
  URL.revokeObjectURL(url);
}

function exportPDF(m) {
  const html = buildHTML(m);
  const win  = window.open('','_blank');
  if (!win) { alert("Please allow pop-ups for this site to export PDF."); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(()=>win.print(), 500);
}

export default function CondoBoardApp() {
  const [transcript, setTranscript] = useState("");
  const [step,       setStep]       = useState("input");
  const [minutes,    setMinutes]    = useState(null);
  const [error,      setError]      = useState("");
  const [progress,   setProgress]   = useState("");
  const [listening,  setListening]  = useState(false);
  const [gpuStatus,  setGpuStatus]  = useState({ checked: false, supported: true, message: "" });
  const [engineMode, setEngineMode] = useState<EngineMode>("auto");
  const recRef = useRef(null);
  const engineRef = useRef<MLCEngine | null>(null);
  const MODEL_ID = "Llama-3.2-3B-Instruct-q4f32_1-MLC";

  const checkWebGPU = async () => {
    if (typeof navigator === "undefined") {
      return { supported: false, message: "This app only runs in a browser." };
    }

    if (!(navigator as any).gpu) {
      return {
        supported: false,
        message:
          "WebLLM needs WebGPU, and this browser does not expose it. Try the latest Chrome or Edge on desktop with hardware acceleration enabled.",
      };
    }

    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (!adapter) {
        return {
          supported: false,
          message:
            "WebGPU is present, but no compatible GPU adapter is available on this device. This laptop/browser cannot run the local AI model right now.",
        };
      }
      return { supported: true, message: "" };
    } catch {
      return {
        supported: false,
        message:
          "This browser could not initialize WebGPU. Try Chrome or Edge, make sure hardware acceleration is on, and test again on a device with GPU support.",
      };
    }
  };

  useEffect(() => {
    let active = true;

    void (async () => {
      const result = await checkWebGPU();
      if (active) setGpuStatus({ checked: true, ...result });
    })();

    return () => {
      active = false;
    };
  }, []);

  const toggleMic = () => {
    if (listening){recRef.current?.stop();setListening(false);return;}
    const SR=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!SR){alert("Speech recognition requires Chrome or Edge.");return;}
    const r=new SR();r.continuous=true;r.interimResults=true;r.lang="en-CA";
    r.onresult=e=>{let t="";for(let i=0;i<e.results.length;i++)t+=e.results[i][0].transcript+" ";setTranscript(t);};
    r.onend=()=>setListening(false);r.start();recRef.current=r;setListening(true);
  };

  const ensureEngine = async () => {
    if (engineRef.current) return engineRef.current;
    const webllm = await import("@mlc-ai/web-llm");
    const support = await checkWebGPU();
    if (!support.supported) {
      throw new Error(support.message);
    }
    setProgress("Loading AI model (first time only, ~2GB cached)…");
    const engine = await webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (r: any) => setProgress(r.text || `Loading… ${(r.progress * 100).toFixed(0)}%`),
    });
    engineRef.current = engine;
    return engine;
  };

  const runWebLLM = async () => {
    const engine = await ensureEngine();
    setProgress("Reading transcript and extracting minutes…");
    const reply = await engine.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Extract meeting minutes from this transcript:\n\n${transcript}` },
      ],
      temperature: 0.2,
    });
    const raw = reply.choices?.[0]?.message?.content || "";
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    let jsonStr = fenced ? fenced[1] : raw;
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start !== -1 && end !== -1) jsonStr = jsonStr.slice(start, end + 1);
    return JSON.parse(jsonStr.trim());
  };

  const generate = async () => {
    if(!transcript.trim())return;
    setStep("loading"); setError(""); setProgress("Initializing…");
    try {
      let parsed: any;
      const mode: EngineMode = engineMode === "auto"
        ? (gpuStatus.checked && gpuStatus.supported ? "webllm" : "rules")
        : engineMode;

      if (mode === "webllm") {
        parsed = await runWebLLM();
      } else if (mode === "transformers") {
        parsed = await extractWithTransformers(transcript, setProgress);
      } else {
        setProgress("Extracting minutes from transcript…");
        parsed = extractRuleBased(transcript);
      }
      setMinutes(parsed); setStep("review");
    } catch(e:any){
      console.error(e);
      setError(e?.message || "Could not process the transcript.");
      setStep("input");
    }
  };

  // ── Atoms ─────────────────────────────────────────────────────────────────
  const GoldBar = () => <div style={{height:4,background:`linear-gradient(90deg,${C.gold},${C.goldLt})`}}/>;
  const Btn = ({onClick,children,variant="navy",disabled,small}:any)=>{
    const s:any={padding:small?"6px 14px":"9px 22px",borderRadius:6,fontSize:small?12:13,fontWeight:700,cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",letterSpacing:0.3,border:"none"};
    const v:any={navy:{...s,background:disabled?"#A0AEC0":C.navy,color:"white"},gold:{...s,background:C.gold,color:"white"},ghost:{...s,background:"transparent",color:"white",border:"1.5px solid rgba(255,255,255,0.45)"},outline:{...s,background:"transparent",color:C.navy,border:`1.5px solid ${C.navy}`},silver:{...s,background:C.silver,color:C.navy}};
    return <button onClick={onClick} disabled={disabled} style={v[variant]}>{children}</button>;
  };
  const SecHead=({no,label}:any)=><div style={{fontFamily:"Georgia,serif",fontSize:13,fontWeight:700,color:C.navy,borderBottom:`2px solid ${C.navy}`,paddingBottom:6,marginTop:22,marginBottom:10}}>{no}.&nbsp;&nbsp;{label}</div>;
  const SubHead=({children}:any)=><p style={{fontSize:13,fontWeight:700,color:C.navy,margin:"10px 0 5px"}}>{children}</p>;
  const Bullet=({text}:any)=>text?<p style={{fontSize:13,color:C.slate,margin:"3px 0 3px 14px"}}>–&nbsp; {text}</p>:null;
  const Bullets=({arr}:any)=>Array.isArray(arr)?arr.map((t,i)=><Bullet key={i} text={t}/>):(arr?<Bullet text={arr}/>:null);
  const Motion=({text}:any)=>text?<p style={{fontSize:12,fontStyle:"italic",color:C.slateL,margin:"8px 0 3px"}}>{text}</p>:null;
  const Result=({text}:any)=>text?<p style={{fontSize:12,fontWeight:700,color:C.navy,margin:"2px 0 8px"}}>{text}</p>:null;
  const Tag=({label,value}:any)=>value?<div style={{display:"inline-flex",gap:4,background:C.silver,borderRadius:5,padding:"5px 10px",fontSize:12,marginRight:8,marginBottom:6}}><span style={{fontWeight:700,color:C.navy}}>{label}:</span><span style={{color:C.slate}}>{value}</span></div>:null;

  const AppBar=({sub,children}:any)=><><div style={{background:C.navy,color:"white",padding:"15px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}><div><p style={{fontFamily:"Georgia,serif",fontSize:19,fontWeight:700,margin:"0 0 2px",letterSpacing:1}}>THE WINDSOR</p><p style={{fontSize:12,color:"#B0BEC5",margin:0}}>{sub}</p></div><div style={{display:"flex",gap:8}}>{children}</div></div><GoldBar/></>;

  // ── Loading ───────────────────────────────────────────────────────────────
  if(step==="loading") return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Lato',sans-serif"}}>
      <AppBar sub="Generating minutes…"/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"80vh"}}>
        <div style={{textAlign:"center",padding:"0 20px"}}>
          <div style={{width:48,height:48,borderRadius:"50%",border:`3px solid ${C.silver}`,borderTopColor:C.navy,animation:"spin 0.8s linear infinite",margin:"0 auto 18px"}}/>
          <p style={{fontFamily:"Georgia,serif",fontSize:17,fontWeight:700,color:C.navy,margin:"0 0 6px"}}>Generating Minutes</p>
          <p style={{fontSize:13,color:C.slateL,maxWidth:360,margin:"0 auto"}}>{progress || "AI is reading the transcript…"}</p>
        </div>
      </div>
    </div>
  );

  // ── Input ─────────────────────────────────────────────────────────────────
  if(step==="input") return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Lato',sans-serif"}}>
      <AppBar sub="Board Member Meeting Minutes Generator"/>
      <div style={{maxWidth:780,margin:"0 auto",padding:"24px 20px"}}>
        <div style={{background:"white",borderRadius:10,boxShadow:"0 1px 6px rgba(0,0,0,0.07)",padding:"20px 24px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <p style={{fontFamily:"Georgia,serif",fontSize:14,fontWeight:700,color:C.navy,margin:0}}>Meeting Transcript</p>
            <button onClick={toggleMic} style={{padding:"6px 14px",borderRadius:6,fontSize:12,fontWeight:700,cursor:"pointer",border:`1.5px solid ${listening?C.gold:C.navy}`,background:listening?"#FEF9EC":"transparent",color:listening?"#92400E":C.navy,fontFamily:"inherit"}}>
              {listening?"⏹ Stop":"🎙 Voice Input"}
            </button>
          </div>
          <textarea value={transcript} onChange={e=>setTranscript(e.target.value)}
            style={{width:"100%",minHeight:300,border:"1.5px solid #CBD5E0",borderRadius:8,padding:"12px 14px",fontSize:13,color:C.slate,resize:"vertical",lineHeight:1.7,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}
            placeholder={`Paste the meeting transcript here…\n\nThe AI will extract attendees, motions, votes, financial details, and action items — formatted into polished board minutes. Sections with no content are automatically omitted.`}
          />
          {!gpuStatus.supported && gpuStatus.checked && <div style={{marginTop:12,background:"#FFFAF0",border:"1.5px solid #F6AD55",borderRadius:8,padding:"12px 16px"}}>
            <p style={{fontWeight:700,color:"#9C4221",margin:"0 0 5px",fontSize:13}}>WebLLM unavailable on this device</p>
            <p style={{color:"#9C4221",fontSize:12,margin:0,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{gpuStatus.message}</p>
          </div>}
          {error&&<div style={{marginTop:12,background:"#FFF5F5",border:"1.5px solid #FC8181",borderRadius:8,padding:"12px 16px"}}>
            <p style={{fontWeight:700,color:C.red,margin:"0 0 5px",fontSize:13}}>⚠ Error</p>
            <p style={{color:C.red,fontSize:12,margin:0,fontFamily:"monospace",whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{error}</p>
          </div>}
          <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:16}}>
            <Btn onClick={()=>setTranscript("")} variant="outline">Clear</Btn>
            <Btn onClick={generate} disabled={!transcript.trim() || (gpuStatus.checked && !gpuStatus.supported)} variant="navy">Generate Minutes →</Btn>
          </div>
        </div>
      </div>
    </div>
  );

  // ── Review ────────────────────────────────────────────────────────────────
  if(step==="review"&&minutes){
    const m:any=minutes; const S=buildSections(m);
    return(
      <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Lato',sans-serif"}}>
        <AppBar sub={`Board Member Meeting  ·  ${m.meeting_date||''}`}>
          <Btn onClick={()=>{setStep("input");setMinutes(null);}} variant="ghost">← Edit</Btn>
          <Btn onClick={()=>exportWord(m)} variant="silver">⬇ Word</Btn>
          <Btn onClick={()=>exportPDF(m)}  variant="gold">⬇ PDF</Btn>
        </AppBar>
        <div style={{maxWidth:780,margin:"0 auto",padding:"24px 20px 48px"}}>
          <div style={{background:"white",borderRadius:10,boxShadow:"0 1px 6px rgba(0,0,0,0.07)",overflow:"hidden"}}>

            <div style={{background:C.navy,padding:"22px 28px",textAlign:"center"}}>
              <p style={{fontFamily:"Georgia,serif",fontSize:22,fontWeight:700,color:"white",margin:"0 0 4px",letterSpacing:2}}>THE WINDSOR</p>
              <p style={{fontSize:12,color:"#B0BEC5",margin:"0 0 14px"}}>315 50 Ave SW, Calgary, AB &nbsp; T2S 1H3</p>
              <div style={{width:80,height:3,background:C.gold,borderRadius:2,margin:"0 auto 14px"}}/>
              <p style={{fontFamily:"Georgia,serif",fontSize:17,fontWeight:700,color:"white",margin:"0 0 5px",letterSpacing:0.5}}>Board Member Meeting Minutes</p>
              <p style={{fontSize:13,color:"#B0BEC5",fontStyle:"italic",margin:0}}>{m.meeting_date}</p>
            </div>

            <div style={{padding:"20px 28px"}}>
              <SecHead no={S.details} label="MEETING DETAILS"/>
              <div style={{display:"flex",flexWrap:"wrap"}}><Tag label="Date" value={m.meeting_date}/><Tag label="Time" value={m.meeting_time}/><Tag label="Location" value={m.location}/><Tag label="Type" value={m.meeting_type}/></div>

              <SecHead no={S.attendees} label="ATTENDEES"/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[["Board Members Present",m.board_present],["Absent",m.board_absent],["Also Present",m.also_present]].map(([lbl,list]:any)=>(
                  <div key={lbl}><div style={{background:C.navy,color:"white",fontSize:11,fontWeight:700,padding:"5px 8px",borderRadius:"5px 5px 0 0"}}>{lbl}</div>
                  <div style={{border:"1px solid #CBD5E0",borderTop:"none",borderRadius:"0 0 5px 5px",padding:"8px 10px",minHeight:32}}>
                    {(list||[]).map((p,i)=><p key={i} style={{fontSize:12,color:C.slate,margin:"2px 0"}}>{p}</p>)}
                    {!(list||[]).length&&<p style={{fontSize:12,color:"#A0AEC0",fontStyle:"italic",margin:0}}>None</p>}
                  </div></div>
                ))}
              </div>

              {S.callToOrder&&<><SecHead no={S.callToOrder} label="CALL TO ORDER"/><p style={{fontSize:13,color:C.slate}}>Called to order at <strong style={{color:C.navy}}>{m.call_to_order_time}</strong> by <strong style={{color:C.navy}}>{m.call_to_order_chair}</strong>. {m.quorum_note}</p></>}

              {S.prevMinutes&&<><SecHead no={S.prevMinutes} label="APPROVAL OF PREVIOUS MINUTES"/><p style={{fontSize:13,color:C.slate}}>The minutes of the <strong style={{color:C.navy}}>{m.previous_minutes.period}</strong> Board Member Meeting were reviewed.</p><Motion text={`MOVED by ${m.previous_minutes.mover}; SECONDED by ${m.previous_minutes.seconder} that the minutes be approved as circulated.`}/><Result text={m.previous_minutes.result}/></>}

              {S.bizArising&&<><SecHead no={S.bizArising} label="BUSINESS ARISING FROM PREVIOUS MINUTES"/>{m.business_arising.map((it,i)=><div key={i} style={{marginBottom:14}}><SubHead>{S.bizArising}.{i+1}&nbsp;&nbsp;{it.title}</SubHead><Bullets arr={it.description}/><Motion text={it.motion}/><Result text={it.result}/></div>)}</>}

              {S.pmReport&&<><SecHead no={S.pmReport} label="PROPERTY MANAGER'S REPORT"/>
                {m.pm_report.operations?.length>0&&<><SubHead>{S.pmReport}.1&nbsp;&nbsp;Building Operations</SubHead><Bullets arr={m.pm_report.operations}/></>}
                {m.pm_report.correspondence?.length>0&&<><SubHead>{S.pmReport}.2&nbsp;&nbsp;Correspondence</SubHead><Bullets arr={m.pm_report.correspondence}/></>}
              </>}

              {S.financial&&<><SecHead no={S.financial} label="FINANCIAL REPORT"/>
                <p style={{fontSize:13,color:C.slate}}><strong style={{color:C.navy}}>Period:</strong> {m.financial_report.period||'Current'}</p>
                {m.financial_report.operating_balance&&<p style={{fontSize:13,color:C.slate,marginLeft:16}}>•&nbsp; <strong>Operating Fund:</strong> {m.financial_report.operating_balance}</p>}
                {m.financial_report.reserve_balance&&<p style={{fontSize:13,color:C.slate,marginLeft:16}}>•&nbsp; <strong>Reserve Fund:</strong> {m.financial_report.reserve_balance}</p>}
                {m.financial_report.ar_notes&&<p style={{fontSize:13,color:C.slate,marginLeft:16}}>•&nbsp; <strong>Accounts Receivable:</strong> {m.financial_report.ar_notes}</p>}
                <Bullets arr={m.financial_report.narrative}/>
                {m.financial_report.mover&&<><Motion text={`MOVED by ${m.financial_report.mover}; SECONDED by ${m.financial_report.seconder} that the financial report be accepted.`}/><Result text={m.financial_report.result}/></>}
              </>}

              {S.oldBiz&&<><SecHead no={S.oldBiz} label="OLD BUSINESS"/>{m.old_business.map((it,i)=><div key={i} style={{marginBottom:14}}><SubHead>{S.oldBiz}.{i+1}&nbsp;&nbsp;{it.title}</SubHead><Bullets arr={it.description}/><Motion text={it.motion}/><Result text={it.result}/></div>)}</>}
              {S.newBiz&&<><SecHead no={S.newBiz} label="NEW BUSINESS"/>{m.new_business.map((it,i)=><div key={i} style={{marginBottom:14}}><SubHead>{S.newBiz}.{i+1}&nbsp;&nbsp;{it.title}</SubHead><Bullets arr={it.description}/><Motion text={it.motion}/><Result text={it.result}/></div>)}</>}

              {S.ownersForum&&<><SecHead no={S.ownersForum} label="OWNERS' FORUM"/><p style={{fontSize:13,color:C.slate}}>Owners/residents were given the opportunity to raise matters:</p>
                {m.owners_forum.map((it,i)=><div key={i} style={{marginLeft:14,marginBottom:10}}><p style={{fontSize:13,color:C.slate,margin:"2px 0"}}>–&nbsp; <strong style={{color:C.navy}}>{it.speaker}:</strong> {it.concern}</p>{it.response&&<p style={{fontSize:12,color:C.slateL,fontStyle:"italic",margin:"2px 0 0 18px"}}>Board response: {it.response}</p>}</div>)}
              </>}

              {S.actions&&<><SecHead no={S.actions} label="ACTION ITEMS SUMMARY"/>
                <table style={{width:"100%",borderCollapse:"collapse",marginTop:8}}>
                  <thead><tr>{["#","Action Item","Owner","Due By"].map(h=><th key={h} style={{background:C.navy,color:"white",padding:"7px 10px",fontSize:12,textAlign:"left",border:"1px solid #CBD5E0",fontFamily:"inherit"}}>{h}</th>)}</tr></thead>
                  <tbody>{m.action_items.map((it,i)=><tr key={i} style={{background:i%2?C.silver:"white"}}>{[it.no,it.action,it.owner,it.due].map((v,j)=><td key={j} style={{padding:"5px 10px",fontSize:12,border:"1px solid #CBD5E0",color:C.slate}}>{v}</td>)}</tr>)}</tbody>
                </table>
              </>}

              {S.nextMeeting&&<><SecHead no={S.nextMeeting} label="NEXT MEETING"/><p style={{fontSize:13,color:C.slate}}>The next Board Member Meeting is scheduled for <strong style={{color:C.navy}}>{m.next_meeting}</strong>.</p></>}

              {S.adjournment&&<><SecHead no={S.adjournment} label="ADJOURNMENT"/><p style={{fontSize:13,color:C.slate}}>There being no further business, the meeting was adjourned at <strong style={{color:C.navy}}>{m.adjournment_time}</strong>.</p>{m.adjournment_mover&&<><Motion text={`MOVED by ${m.adjournment_mover}; SECONDED by ${m.adjournment_seconder} that the meeting be adjourned.`}/><Result text="CARRIED"/></>}</>}

              <div style={{borderTop:`1px solid #CBD5E0`,marginTop:32,paddingTop:10}}>
                <p style={{fontSize:12,color:C.slateL,fontStyle:"italic",textAlign:"center",margin:0}}>Minutes prepared by the Recording Secretary on behalf of The Windsor Board of Directors.</p>
              </div>
            </div>
          </div>

          <div style={{display:"flex",justifyContent:"center",gap:12,marginTop:20}}>
            <Btn onClick={()=>exportWord(m)} variant="silver">⬇&nbsp; Export to Word</Btn>
            <Btn onClick={()=>exportPDF(m)}  variant="gold">⬇&nbsp; Export to PDF</Btn>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
