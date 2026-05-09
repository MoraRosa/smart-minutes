// @ts-nocheck
import { useState, useRef, useEffect } from "react";
import type { MLCEngine } from "@mlc-ai/web-llm";

// ─── Palette (matches the Word template) ────────────────────────────────────
const C = {
  navy:   "#1B2B4B",
  navyDk: "#111D33",
  navyLt: "#2C3F6A",
  gold:   "#C9A84C",
  goldLt: "#E8C97A",
  slate:  "#4A5568",
  slateL: "#718096",
  silver: "#E8ECF0",
  white:  "#FFFFFF",
  bg:     "#F0F3F8",
  red:    "#C53030",
};

// ─── Extract dynamic section numbers ────────────────────────────────────────
function buildSections(m) {
  let n = 1;
  const sec = {};
  sec.details       = n++;
  sec.attendees     = n++;
  if (m.call_to_order_time)        sec.callToOrder    = n++;
  if (m.previous_minutes)          sec.prevMinutes    = n++;
  if (m.business_arising?.length)  sec.bizArising     = n++;
  if (m.pm_report)                 sec.pmReport       = n++;
  if (m.financial_report)          sec.financial      = n++;
  if (m.old_business?.length)      sec.oldBiz         = n++;
  if (m.new_business?.length)      sec.newBiz         = n++;
  if (m.owners_forum?.length)      sec.ownersForum    = n++;
  if (m.action_items?.length)      sec.actions        = n++;
  if (m.next_meeting)              sec.nextMeeting    = n++;
  if (m.adjournment_time)          sec.adjournment    = n++;
  return sec;
}

// ─── Word HTML Export ────────────────────────────────────────────────────────
function exportToWord(m, cfg) {
  const S = buildSections(m);

  const tbl = (rows, cols, widths) => `
    <table style="border-collapse:collapse;width:100%;margin-bottom:12pt">
      ${rows.map(r => `<tr>${r.map((c, i) => `<td style="border:1pt solid #CBD5E0;padding:5pt 8pt;vertical-align:top;width:${widths?.[i]||'auto'};${c.hdr ? `background:#1B2B4B;color:white;font-weight:bold;font-size:9pt` : 'font-size:9pt;color:#4A5568'}">${c.val||''}</td>`).join('')}</tr>`).join('')}
    </table>`;

  const heading = (no, title) =>
    `<p style="font-size:11pt;font-weight:bold;color:#1B2B4B;border-bottom:1.5pt solid #1B2B4B;padding-bottom:3pt;margin-top:18pt;margin-bottom:8pt">${no}.&nbsp;&nbsp;${title}</p>`;

  const para = (t) => t ? `<p style="font-size:10pt;color:#4A5568;margin:3pt 0 6pt">${t}</p>` : '';
  const motion = (t) => t ? `<p style="font-size:10pt;color:#4A5568;font-style:italic;margin:4pt 0 4pt 20pt">${t}</p>` : '';
  const result = (t) => t ? `<p style="font-size:10pt;font-weight:bold;color:#1B2B4B;margin-left:20pt">${t}</p>` : '';
  const bullet = (t) => t ? `<p style="font-size:10pt;color:#4A5568;margin:2pt 0 2pt 20pt">&bull;&nbsp;${t}</p>` : '';
  const subHd = (t) => `<p style="font-size:10pt;font-weight:bold;color:#1B2B4B;margin:8pt 0 4pt">${t}</p>`;

  let body = `
    <div style="background:#1B2B4B;color:white;padding:14pt 20pt;text-align:center">
      <p style="font-size:14pt;font-weight:bold;margin:0;color:white">CONDOMINIUM CORPORATION NO.&nbsp;${cfg.corpNo}</p>
      <p style="font-size:10pt;color:#B0BEC5;margin:4pt 0 0">${cfg.buildingName}&nbsp;&nbsp;&middot;&nbsp;&nbsp;${cfg.address}</p>
    </div>
    <div style="border-bottom:5pt solid #C9A84C;margin-bottom:14pt"></div>
    <p style="text-align:center;font-size:16pt;font-weight:bold;color:#1B2B4B;margin:10pt 0 4pt">MINUTES OF THE BOARD OF DIRECTORS MEETING</p>
    <p style="text-align:center;font-size:12pt;color:#4A5568;font-style:italic;margin-bottom:20pt">${m.meeting_date||''}</p>

    ${heading(S.details,'MEETING DETAILS')}
    ${tbl([[
      [{hdr:false,val:`<span style="font-weight:bold;color:#1B2B4B">Date:</span>&nbsp;${m.meeting_date||'–'}`},
       {hdr:false,val:`<span style="font-weight:bold;color:#1B2B4B">Time:</span>&nbsp;${m.meeting_time||'–'}`},
       {hdr:false,val:`<span style="font-weight:bold;color:#1B2B4B">Location:</span>&nbsp;${m.location||'–'}`},
       {hdr:false,val:`<span style="font-weight:bold;color:#1B2B4B">Type:</span>&nbsp;${m.meeting_type||'Regular Meeting'}`}]
    ]],4,['25%','15%','35%','25%'])}

    ${heading(S.attendees,'ATTENDEES')}
    ${tbl([
      [{hdr:true,val:'Board Members Present'},{hdr:true,val:'Absent'},{hdr:true,val:'Also Present'}],
      ...Array.from({length: Math.max((m.board_present||[]).length,(m.board_absent||[]).length,(m.also_present||[]).length,1)}, (_,i) => [
        {hdr:false,val:(m.board_present||[])[i]||''},
        {hdr:false,val:(m.board_absent||[])[i]||''},
        {hdr:false,val:(m.also_present||[])[i]||''},
      ])
    ],3,['34%','33%','33%'])}
  `;

  if (S.callToOrder) body += `
    ${heading(S.callToOrder,'CALL TO ORDER')}
    ${para(`The meeting was called to order at ${m.call_to_order_time} by ${m.call_to_order_chair}. ${m.quorum_note||''}`)}`;

  if (S.prevMinutes) { const pm=m.previous_minutes; body += `
    ${heading(S.prevMinutes,'APPROVAL OF PREVIOUS MINUTES')}
    ${para(`The minutes of the ${pm.period} Board Meeting were reviewed${pm.notes?` (${pm.notes})`:'.'}`)}
    ${motion(`MOVED by ${pm.mover}; SECONDED by ${pm.seconder} that the minutes of the ${pm.period} meeting be approved as circulated.`)}
    ${result(pm.result)}`; }

  if (S.bizArising) { body += heading(S.bizArising,'BUSINESS ARISING FROM PREVIOUS MINUTES');
    m.business_arising.forEach((it,i) => { body += `
      ${subHd(`${S.bizArising}.${i+1}&nbsp;&nbsp;${it.title}`)}
      ${para(it.description)}${motion(it.motion)}${result(it.result)}`; }); }

  if (S.pmReport) { body += heading(S.pmReport,"PROPERTY MANAGER'S REPORT");
    if (m.pm_report.operations) body += subHd(`${S.pmReport}.1&nbsp;&nbsp;Building Operations`)+para(m.pm_report.operations);
    if (m.pm_report.correspondence) body += subHd(`${S.pmReport}.2&nbsp;&nbsp;Correspondence`)+para(m.pm_report.correspondence); }

  if (S.financial) { const fr=m.financial_report; body += `
    ${heading(S.financial,'FINANCIAL REPORT')}
    ${para(`<span style="font-weight:bold;color:#1B2B4B">Reporting Period:</span>&nbsp;${fr.period||'–'}`)}
    ${fr.operating_balance ? bullet(`Operating Fund Balance: ${fr.operating_balance}`):''}
    ${fr.reserve_balance   ? bullet(`Reserve Fund Balance: ${fr.reserve_balance}`):''}
    ${fr.ar_notes          ? bullet(`Accounts Receivable: ${fr.ar_notes}`):''}
    ${fr.narrative         ? para(fr.narrative):''}
    ${fr.mover ? motion(`MOVED by ${fr.mover}; SECONDED by ${fr.seconder} that the financial report for ${fr.period} be accepted as presented.`):''}
    ${result(fr.result)}`; }

  if (S.oldBiz) { body += heading(S.oldBiz,'OLD BUSINESS');
    m.old_business.forEach((it,i) => { body += subHd(`${S.oldBiz}.${i+1}&nbsp;&nbsp;${it.title}`)+para(it.description)+motion(it.motion)+result(it.result); }); }

  if (S.newBiz) { body += heading(S.newBiz,'NEW BUSINESS');
    m.new_business.forEach((it,i) => { body += subHd(`${S.newBiz}.${i+1}&nbsp;&nbsp;${it.title}`)+para(it.description)+motion(it.motion)+result(it.result); }); }

  if (S.ownersForum) { body += `
    ${heading(S.ownersForum,"OWNERS' FORUM")}
    ${para('Owners/residents in attendance were given the opportunity to raise matters:')}
    ${m.owners_forum.map(it => `${bullet(`<strong>${it.speaker}</strong>: ${it.concern}`)}<p style="font-size:10pt;color:#4A5568;font-style:italic;margin:2pt 0 6pt 36pt">Board response: ${it.response}</p>`).join('')}`; }

  if (S.actions) { body += `
    ${heading(S.actions,'ACTION ITEMS SUMMARY')}
    ${tbl([
      [{hdr:true,val:'#'},{hdr:true,val:'Action Item'},{hdr:true,val:'Owner'},{hdr:true,val:'Due By'}],
      ...m.action_items.map(it=>[{hdr:false,val:it.no},{hdr:false,val:it.action},{hdr:false,val:it.owner},{hdr:false,val:it.due}])
    ],4,['5%','55%','25%','15%'])}`; }

  if (S.nextMeeting) body += heading(S.nextMeeting,'NEXT MEETING')+para(`The next regular Board of Directors meeting is scheduled for <strong>${m.next_meeting}</strong>.`);

  if (S.adjournment) { body += heading(S.adjournment,'ADJOURNMENT')+para(`There being no further business, the meeting was adjourned at <strong>${m.adjournment_time}</strong>.`);
    if (m.adjournment_mover) body += motion(`MOVED by ${m.adjournment_mover}; SECONDED by ${m.adjournment_seconder} that the meeting be adjourned.`)+result('CARRIED'); }

  body += `
    <br><hr style="border:1pt solid #1B2B4B;margin-top:30pt">
    <p style="text-align:center;font-style:italic;font-size:9pt;color:#4A5568;margin:10pt 0">These minutes were approved at the Board Meeting held on &nbsp;________________________,&nbsp;20____</p>
    <table style="width:100%;margin-top:34pt;border-collapse:collapse">
      <tr>
        <td style="width:45%;border:none;padding-top:40pt;border-top:1pt solid #4A5568"><p style="font-size:9pt;font-style:italic;color:#4A5568;margin:3pt 0">Chairperson / President</p></td>
        <td style="width:10%;border:none"></td>
        <td style="width:45%;border:none;padding-top:40pt;border-top:1pt solid #4A5568"><p style="font-size:9pt;font-style:italic;color:#4A5568;margin:3pt 0">Recording Secretary</p></td>
      </tr>
    </table>
    <p style="text-align:center;font-size:8pt;color:#4A5568;font-style:italic;margin-top:40pt;border-top:1pt solid #CBD5E0;padding-top:4pt">CONFIDENTIAL – For Board Use Only</p>`;

  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset="UTF-8"><style>body{font-family:Calibri,sans-serif;margin:72pt 72pt;}</style></head><body>${body}</body></html>`;
  const blob = new Blob([html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `CondoBoard_Minutes_${(m.meeting_date||'Draft').replace(/[,\s]+/g,'_')}.doc`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── System prompt ───────────────────────────────────────────────────────────
const SYSTEM = `You are a professional condo board secretary. Extract structured meeting minutes from a transcript and return ONLY valid JSON with no markdown fences or commentary. Omit array items where no content exists. Use formal board-minutes language throughout. Never invent information not in the transcript.

JSON structure (omit a key entirely if null/empty):
{
  "meeting_date": "Month DD, YYYY",
  "meeting_time": "H:MM PM",
  "location": "string",
  "meeting_type": "Regular Meeting",
  "board_present": ["Name, Title"],
  "board_absent": ["Name – regrets filed"],
  "also_present": ["Name, Role"],
  "quorum_note": "Quorum confirmed with X of X directors present.",
  "call_to_order_time": "H:MM PM",
  "call_to_order_chair": "Name, Title",
  "previous_minutes": {"period":"Month YYYY","notes":"or omit","mover":"Name","seconder":"Name","result":"CARRIED"},
  "business_arising": [{"title":"string","description":"formal paragraph","motion":"MOVED by X; SECONDED by Y that...","result":"CARRIED"}],
  "pm_report": {"operations":"paragraph","correspondence":"paragraph"},
  "financial_report": {"period":"Month YYYY","operating_balance":"$X,XXX.XX","reserve_balance":"$X,XXX.XX","ar_notes":"string","narrative":"string","mover":"Name","seconder":"Name","result":"CARRIED"},
  "old_business": [{"title":"string","description":"paragraph","motion":"string","result":"string"}],
  "new_business": [{"title":"string","description":"paragraph","motion":"string","result":"string"}],
  "owners_forum": [{"speaker":"Name or Unit No.","concern":"string","response":"string"}],
  "action_items": [{"no":"1","action":"string","owner":"Name","due":"date or TBD"}],
  "next_meeting": "Month DD, YYYY at H:MM PM, Location",
  "adjournment_time": "H:MM PM",
  "adjournment_mover": "Name",
  "adjournment_seconder": "Name"
}`;

// ─── Main Component ──────────────────────────────────────────────────────────
export default function App() {
  const [cfg, setCfg] = useState({ corpNo: "XXXX", buildingName: "Building Name", address: "123 Main Street NW, Calgary, AB" });
  const [transcript, setTranscript] = useState("");
  const [step, setStep] = useState("input"); // input | loading | review
  const [minutes, setMinutes] = useState(null);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);

  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); setListening(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition requires Chrome or Edge."); return; }
    const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = "en-CA";
    r.onresult = e => { let t=""; for(let i=0;i<e.results.length;i++) t+=e.results[i][0].transcript+" "; setTranscript(t); };
    r.onend = () => setListening(false);
    r.start(); recRef.current = r; setListening(true);
  };

  const engineRef = useRef<MLCEngine | null>(null);
  const [progress, setProgress] = useState("");
  const MODEL_ID = "Llama-3.2-3B-Instruct-q4f32_1-MLC";

  const ensureEngine = async () => {
    if (engineRef.current) return engineRef.current;
    const webllm = await import("@mlc-ai/web-llm");
    if (typeof navigator === "undefined" || !(navigator as any).gpu) {
      throw new Error("Your browser doesn't support WebGPU. Please use the latest Chrome or Edge on desktop.");
    }
    setProgress("Loading AI model (first time only, ~2GB cached)…");
    const engine = await webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (r: any) => setProgress(r.text || `Loading… ${(r.progress * 100).toFixed(0)}%`),
    });
    engineRef.current = engine;
    return engine;
  };

  const generate = async () => {
    if (!transcript.trim()) return;
    setStep("loading"); setError(""); setProgress("Initializing…");
    try {
      const engine = await ensureEngine();
      setProgress("Reading transcript and extracting minutes…");
      const reply = await engine.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Extract meeting minutes from this transcript:\n\n${transcript}` },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      });
      const raw = reply.choices?.[0]?.message?.content || "";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setMinutes(parsed); setStep("review");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Could not process the transcript. Please check it and try again.");
      setStep("input");
    }
  };

  // ── Shared UI atoms ──────────────────────────────────────────────────────
  const SecHead = ({no, label}) => (
    <div style={{fontFamily:"'Playfair Display',serif", fontSize:13, fontWeight:700, color:C.navy,
      borderBottom:`2px solid ${C.navy}`, paddingBottom:6, marginTop:22, marginBottom:10, letterSpacing:0.3}}>
      {no}.&nbsp;&nbsp;{label}
    </div>
  );

  const Tag = ({label, value}) => value ? (
    <div style={{display:"inline-flex", gap:4, alignItems:"center", background:C.silver,
      borderRadius:5, padding:"5px 10px", fontSize:12, marginRight:8, marginBottom:6}}>
      <span style={{fontWeight:700, color:C.navy}}>{label}:</span>
      <span style={{color:C.slate}}>{value}</span>
    </div>
  ) : null;

  const Motion = ({text}) => text ? (
    <p style={{fontSize:12, fontStyle:"italic", color:C.slateL, marginLeft:16, marginTop:4, marginBottom:2}}>{text}</p>
  ) : null;
  const Result = ({text}) => text ? (
    <p style={{fontSize:12, fontWeight:700, color:C.navy, marginLeft:16, marginBottom:8}}>{text}</p>
  ) : null;

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (step === "loading") return (
    <div style={{minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Lato',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lato:wght@300;400;700&display=swap" rel="stylesheet"/>
      <div style={{textAlign:"center"}}>
        <div style={{width:56, height:56, borderRadius:"50%", border:`3px solid ${C.silver}`,
          borderTopColor:C.navy, animation:"spin 0.8s linear infinite", margin:"0 auto 20px"}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{fontSize:17, fontWeight:700, color:C.navy, margin:"0 0 6px",fontFamily:"'Playfair Display',serif"}}>Generating Minutes</p>
        <p style={{fontSize:13, color:C.slateL, margin:0}}>AI is reading the transcript…</p>
      </div>
    </div>
  );

  // ─── Input ─────────────────────────────────────────────────────────────────
  if (step === "input") return (
    <div style={{minHeight:"100vh", background:C.bg, fontFamily:"'Lato',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lato:wght@300;400;700&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{background:C.navy, color:"white", padding:"18px 28px", display:"flex", alignItems:"center", justifyContent:"space-between"}}>
        <div>
          <p style={{fontFamily:"'Playfair Display',serif", fontSize:20, fontWeight:700, margin:"0 0 2px", letterSpacing:0.5}}>
            Condo Board Minutes
          </p>
          <p style={{fontSize:12, color:"#B0BEC5", margin:0}}>AI-Powered Minute Generator</p>
        </div>
        <div style={{width:4, height:40, background:C.gold, borderRadius:2}}/>
      </div>
      <div style={{height:4, background:`linear-gradient(90deg,${C.gold},${C.goldLt})`}}/>

      <div style={{maxWidth:780, margin:"0 auto", padding:"28px 20px"}}>

        {/* Building config */}
        <div style={{background:"white", borderRadius:10, boxShadow:"0 1px 6px rgba(0,0,0,0.07)", padding:"20px 24px", marginBottom:18}}>
          <p style={{fontFamily:"'Playfair Display',serif", fontSize:14, fontWeight:700, color:C.navy, margin:"0 0 14px"}}>
            Building Configuration
          </p>
          <div style={{display:"flex", gap:12, flexWrap:"wrap"}}>
            {[{k:"corpNo",l:"Corporation No.",flex:"0 0 140px"},{k:"buildingName",l:"Building Name",flex:"1 1 200px"},{k:"address",l:"Address",flex:"2 1 280px"}].map(f => (
              <div key={f.k} style={{flex:f.flex}}>
                <label style={{fontSize:11, fontWeight:700, color:C.navy, display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:0.5}}>{f.l}</label>
                <input value={cfg[f.k]} onChange={e=>setCfg(p=>({...p,[f.k]:e.target.value}))}
                  style={{width:"100%", border:"1.5px solid #CBD5E0", borderRadius:6, padding:"7px 11px",
                    fontSize:13, color:C.slate, outline:"none", boxSizing:"border-box",
                    fontFamily:"'Lato',sans-serif"}}/>
              </div>
            ))}
          </div>
        </div>

        {/* Transcript */}
        <div style={{background:"white", borderRadius:10, boxShadow:"0 1px 6px rgba(0,0,0,0.07)", padding:"20px 24px"}}>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14}}>
            <p style={{fontFamily:"'Playfair Display',serif", fontSize:14, fontWeight:700, color:C.navy, margin:0}}>Meeting Transcript</p>
            <button onClick={toggleMic} style={{
              padding:"7px 16px", borderRadius:6, fontSize:12, fontWeight:700, cursor:"pointer",
              border:`1.5px solid ${listening ? C.gold : C.navy}`,
              background: listening ? "#FEF9EC" : "transparent",
              color: listening ? "#92400E" : C.navy,
              display:"flex", alignItems:"center", gap:6, fontFamily:"'Lato',sans-serif"
            }}>
              {listening ? "⏹ Stop" : "🎙 Voice"}
            </button>
          </div>
          <textarea value={transcript} onChange={e=>setTranscript(e.target.value)}
            style={{width:"100%", minHeight:240, border:"1.5px solid #CBD5E0", borderRadius:8,
              padding:"12px 14px", fontSize:13, color:C.slate, resize:"vertical", lineHeight:1.7,
              outline:"none", boxSizing:"border-box", fontFamily:"'Lato',sans-serif"}}
            placeholder={`Paste the meeting transcript here…\n\nThe AI will extract all meeting details, attendees, motions, votes, financial updates, and action items — then format everything into polished board minutes. Sections with no content will be automatically omitted from the final document.`}
          />
          {error && <p style={{color:C.red, fontSize:13, marginTop:8}}>{error}</p>}
          <div style={{display:"flex", justifyContent:"flex-end", gap:10, marginTop:16}}>
            <button onClick={()=>setTranscript("")} style={{padding:"9px 20px", borderRadius:6, fontSize:13,
              fontWeight:700, cursor:"pointer", border:`1.5px solid #CBD5E0`, background:"transparent",
              color:C.slateL, fontFamily:"'Lato',sans-serif"}}>Clear</button>
            <button onClick={generate} disabled={!transcript.trim()} style={{
              padding:"9px 24px", borderRadius:6, fontSize:13, fontWeight:700, cursor:"pointer",
              background: transcript.trim() ? C.navy : "#A0AEC0", color:"white", border:"none",
              fontFamily:"'Lato',sans-serif", letterSpacing:0.3
            }}>Generate Minutes →</button>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── Review ────────────────────────────────────────────────────────────────
  if (step === "review" && minutes) {
    const m = minutes;
    const S = buildSections(m);

    return (
      <div style={{minHeight:"100vh", background:C.bg, fontFamily:"'Lato',sans-serif"}}>
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Lato:wght@300;400;700&display=swap" rel="stylesheet"/>

        {/* Header */}
        <div style={{background:C.navy, color:"white", padding:"14px 28px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:10}}>
          <div>
            <p style={{fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:700, margin:"0 0 1px"}}>Minutes Ready</p>
            <p style={{fontSize:12, color:"#B0BEC5", margin:0}}>Corp No. {cfg.corpNo}&nbsp;·&nbsp;{m.meeting_date}</p>
          </div>
          <div style={{display:"flex", gap:10}}>
            <button onClick={()=>{setStep("input");setMinutes(null)}} style={{
              padding:"8px 16px", borderRadius:6, fontSize:13, fontWeight:700, cursor:"pointer",
              border:"1.5px solid rgba(255,255,255,0.4)", background:"transparent", color:"white",
              fontFamily:"'Lato',sans-serif"}}>← Edit</button>
            <button onClick={()=>exportToWord(m, cfg)} style={{
              padding:"8px 20px", borderRadius:6, fontSize:13, fontWeight:700, cursor:"pointer",
              background:C.gold, color:"white", border:"none", fontFamily:"'Lato',sans-serif",
              letterSpacing:0.3}}>⬇ Export to Word</button>
          </div>
        </div>
        <div style={{height:4, background:`linear-gradient(90deg,${C.gold},${C.goldLt})`}}/>

        <div style={{maxWidth:780, margin:"0 auto", padding:"24px 20px 40px"}}>
          <div style={{background:"white", borderRadius:10, boxShadow:"0 1px 6px rgba(0,0,0,0.07)", overflow:"hidden"}}>

            {/* Document title bar */}
            <div style={{background:C.navy, padding:"22px 28px", textAlign:"center"}}>
              <p style={{fontFamily:"'Playfair Display',serif", fontSize:16, fontWeight:700, color:"white", margin:"0 0 3px", letterSpacing:0.5}}>
                CONDOMINIUM CORPORATION NO. {cfg.corpNo}
              </p>
              <p style={{fontSize:12, color:"#B0BEC5", margin:"0 0 14px"}}>{cfg.buildingName}&nbsp;&nbsp;·&nbsp;&nbsp;{cfg.address}</p>
              <div style={{width:80, height:3, background:C.gold, borderRadius:2, margin:"0 auto 14px"}}/>
              <p style={{fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:700, color:"white", margin:"0 0 5px", letterSpacing:0.8}}>
                MINUTES OF THE BOARD OF DIRECTORS MEETING
              </p>
              <p style={{fontSize:13, color:"#B0BEC5", fontStyle:"italic", margin:0}}>{m.meeting_date}</p>
            </div>

            <div style={{padding:"20px 28px"}}>

              {/* 1. Details */}
              <SecHead no={S.details} label="MEETING DETAILS"/>
              <div style={{display:"flex", flexWrap:"wrap"}}>
                <Tag label="Date" value={m.meeting_date}/>
                <Tag label="Time" value={m.meeting_time}/>
                <Tag label="Location" value={m.location}/>
                <Tag label="Type" value={m.meeting_type}/>
              </div>

              {/* 2. Attendees */}
              <SecHead no={S.attendees} label="ATTENDEES"/>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8}}>
                {[["Board Members Present", m.board_present],["Absent", m.board_absent],["Also Present", m.also_present]].map(([lbl,list])=>(
                  <div key={lbl}>
                    <div style={{background:C.navy, color:"white", fontSize:11, fontWeight:700, padding:"5px 8px", borderRadius:"5px 5px 0 0"}}>{lbl}</div>
                    <div style={{border:"1px solid #CBD5E0", borderTop:"none", borderRadius:"0 0 5px 5px", padding:"8px 10px", minHeight:32}}>
                      {(list||[]).map((p,i)=><p key={i} style={{fontSize:12, color:C.slate, margin:"2px 0"}}>{p}</p>)}
                      {!(list||[]).length && <p style={{fontSize:12, color:"#A0AEC0", fontStyle:"italic", margin:0}}>None</p>}
                    </div>
                  </div>
                ))}
              </div>

              {/* 3. Call to Order */}
              {S.callToOrder && <>
                <SecHead no={S.callToOrder} label="CALL TO ORDER"/>
                <p style={{fontSize:13, color:C.slate, margin:"4px 0"}}>
                  Called to order at <strong style={{color:C.navy}}>{m.call_to_order_time}</strong> by <strong style={{color:C.navy}}>{m.call_to_order_chair}</strong>. {m.quorum_note}
                </p>
              </>}

              {/* 4. Previous Minutes */}
              {S.prevMinutes && <>
                <SecHead no={S.prevMinutes} label="APPROVAL OF PREVIOUS MINUTES"/>
                <p style={{fontSize:13, color:C.slate, margin:"4px 0"}}>Minutes of the <strong style={{color:C.navy}}>{m.previous_minutes.period}</strong> meeting reviewed{m.previous_minutes.notes ? ` — ${m.previous_minutes.notes}` : ""}.</p>
                <Motion text={`MOVED by ${m.previous_minutes.mover}; SECONDED by ${m.previous_minutes.seconder}.`}/>
                <Result text={m.previous_minutes.result}/>
              </>}

              {/* 5. Business Arising */}
              {S.bizArising && <>
                <SecHead no={S.bizArising} label="BUSINESS ARISING FROM PREVIOUS MINUTES"/>
                {m.business_arising.map((it,i)=>(
                  <div key={i} style={{marginBottom:12}}>
                    <p style={{fontSize:13, fontWeight:700, color:C.navy, margin:"0 0 4px"}}>{S.bizArising}.{i+1}&nbsp;&nbsp;{it.title}</p>
                    <p style={{fontSize:13, color:C.slate, margin:"4px 0"}}>{it.description}</p>
                    <Motion text={it.motion}/><Result text={it.result}/>
                  </div>
                ))}
              </>}

              {/* PM Report */}
              {S.pmReport && <>
                <SecHead no={S.pmReport} label="PROPERTY MANAGER'S REPORT"/>
                {m.pm_report.operations && <><p style={{fontSize:13, fontWeight:700, color:C.navy, margin:"4px 0"}}>{S.pmReport}.1&nbsp;&nbsp;Building Operations</p><p style={{fontSize:13, color:C.slate, margin:"4px 0 10px"}}>{m.pm_report.operations}</p></>}
                {m.pm_report.correspondence && <><p style={{fontSize:13, fontWeight:700, color:C.navy, margin:"4px 0"}}>{S.pmReport}.2&nbsp;&nbsp;Correspondence</p><p style={{fontSize:13, color:C.slate, margin:"4px 0"}}>{m.pm_report.correspondence}</p></>}
              </>}

              {/* Financial */}
              {S.financial && <>
                <SecHead no={S.financial} label="FINANCIAL REPORT"/>
                <p style={{fontSize:13, color:C.slate, margin:"4px 0 8px"}}><strong style={{color:C.navy}}>Reporting Period:</strong>&nbsp;{m.financial_report.period}</p>
                {[["Operating Fund",m.financial_report.operating_balance],["Reserve Fund",m.financial_report.reserve_balance]].map(([l,v])=>v&&(
                  <p key={l} style={{fontSize:13, color:C.slate, marginLeft:16, margin:"3px 0 3px 16px"}}>• <strong>{l}:</strong>&nbsp;{v}</p>
                ))}
                {m.financial_report.ar_notes && <p style={{fontSize:13, color:C.slate, marginLeft:16}}>• Accounts Receivable:&nbsp;{m.financial_report.ar_notes}</p>}
                {m.financial_report.narrative && <p style={{fontSize:13, color:C.slate, margin:"8px 0"}}>{m.financial_report.narrative}</p>}
                {m.financial_report.mover && <><Motion text={`MOVED by ${m.financial_report.mover}; SECONDED by ${m.financial_report.seconder} that the financial report for ${m.financial_report.period} be accepted as presented.`}/><Result text={m.financial_report.result}/></>}
              </>}

              {/* Old Business */}
              {S.oldBiz && <>
                <SecHead no={S.oldBiz} label="OLD BUSINESS"/>
                {m.old_business.map((it,i)=>(
                  <div key={i} style={{marginBottom:12}}>
                    <p style={{fontSize:13, fontWeight:700, color:C.navy, margin:"0 0 4px"}}>{S.oldBiz}.{i+1}&nbsp;&nbsp;{it.title}</p>
                    <p style={{fontSize:13, color:C.slate, margin:"4px 0"}}>{it.description}</p>
                    <Motion text={it.motion}/><Result text={it.result}/>
                  </div>
                ))}
              </>}

              {/* New Business */}
              {S.newBiz && <>
                <SecHead no={S.newBiz} label="NEW BUSINESS"/>
                {m.new_business.map((it,i)=>(
                  <div key={i} style={{marginBottom:12}}>
                    <p style={{fontSize:13, fontWeight:700, color:C.navy, margin:"0 0 4px"}}>{S.newBiz}.{i+1}&nbsp;&nbsp;{it.title}</p>
                    <p style={{fontSize:13, color:C.slate, margin:"4px 0"}}>{it.description}</p>
                    <Motion text={it.motion}/><Result text={it.result}/>
                  </div>
                ))}
              </>}

              {/* Owners Forum */}
              {S.ownersForum && <>
                <SecHead no={S.ownersForum} label="OWNERS' FORUM"/>
                <p style={{fontSize:13, color:C.slate, margin:"4px 0 10px"}}>Owners/residents were given the opportunity to raise matters:</p>
                {m.owners_forum.map((it,i)=>(
                  <div key={i} style={{marginLeft:16, marginBottom:10}}>
                    <p style={{fontSize:13, color:C.slate, margin:"2px 0"}}>• <strong style={{color:C.navy}}>{it.speaker}</strong>: {it.concern}</p>
                    {it.response && <p style={{fontSize:12, color:C.slateL, fontStyle:"italic", marginLeft:16, margin:"2px 0 0 20px"}}>Board response: {it.response}</p>}
                  </div>
                ))}
              </>}

              {/* Action Items */}
              {S.actions && <>
                <SecHead no={S.actions} label="ACTION ITEMS SUMMARY"/>
                <table style={{width:"100%", borderCollapse:"collapse", marginTop:8}}>
                  <thead>
                    <tr>{["#","Action Item","Owner","Due By"].map(h=>(
                      <th key={h} style={{background:C.navy, color:"white", padding:"7px 10px", fontSize:12, textAlign:"left", border:"1px solid #CBD5E0", fontFamily:"'Lato',sans-serif"}}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {m.action_items.map((it,i)=>(
                      <tr key={i} style={{background: i%2 ? C.silver : "white"}}>
                        {[it.no,it.action,it.owner,it.due].map((v,j)=>(
                          <td key={j} style={{padding:"5px 10px", fontSize:12, border:"1px solid #CBD5E0", color:C.slate}}>{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>}

              {/* Next Meeting */}
              {S.nextMeeting && <>
                <SecHead no={S.nextMeeting} label="NEXT MEETING"/>
                <p style={{fontSize:13, color:C.slate}}>The next regular Board of Directors meeting is scheduled for <strong style={{color:C.navy}}>{m.next_meeting}</strong>.</p>
              </>}

              {/* Adjournment */}
              {S.adjournment && <>
                <SecHead no={S.adjournment} label="ADJOURNMENT"/>
                <p style={{fontSize:13, color:C.slate}}>The meeting was adjourned at <strong style={{color:C.navy}}>{m.adjournment_time}</strong>.</p>
                {m.adjournment_mover && <><Motion text={`MOVED by ${m.adjournment_mover}; SECONDED by ${m.adjournment_seconder} that the meeting be adjourned.`}/><Result text="CARRIED"/></>}
              </>}

              {/* Signatures */}
              <div style={{borderTop:`2px solid ${C.navy}`, marginTop:32, paddingTop:12}}>
                <p style={{textAlign:"center", fontSize:12, color:C.slateL, fontStyle:"italic"}}>
                  These minutes were approved at the Board Meeting held on ________________________, 20____
                </p>
                <div style={{display:"grid", gridTemplateColumns:"1fr 40px 1fr", gap:0, marginTop:32}}>
                  {["Chairperson / President","","Recording Secretary"].map((l,i)=>(
                    i===1 ? <div key={i}/> :
                    <div key={i} style={{borderTop:`1px solid ${C.slateL}`, paddingTop:6}}>
                      <p style={{fontSize:11, color:C.slateL, fontStyle:"italic", margin:0}}>{l}</p>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>

          <div style={{textAlign:"center", marginTop:20}}>
            <button onClick={()=>exportToWord(m,cfg)} style={{
              padding:"12px 32px", borderRadius:8, fontSize:14, fontWeight:700, cursor:"pointer",
              background:C.gold, color:"white", border:"none", letterSpacing:0.4,
              fontFamily:"'Lato',sans-serif", boxShadow:"0 2px 8px rgba(201,168,76,0.4)"
            }}>⬇&nbsp;&nbsp;Export Minutes to Word</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
