// @ts-nocheck
// Free, offline extractors for board-meeting transcripts.
// Two strategies: pure rule-based (instant) and Transformers.js (CPU AI, slower).

// ────────────────────────────────────────────────────────────────────────────
// RULE-BASED EXTRACTOR
// Parses a transcript with heuristics. Produces the same JSON shape that the
// WebLLM SYSTEM prompt emits, so the UI/exports work unchanged. Anything it
// can't confidently parse is simply omitted (UI skips empty sections).
// ────────────────────────────────────────────────────────────────────────────

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";

function findDate(text: string): string | undefined {
  const m = text.match(new RegExp(`(${MONTHS})\\s+\\d{1,2},?\\s+\\d{4}`, "i"));
  if (m) return m[0].replace(/\s+/g, " ");
  const slash = text.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (slash) {
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const mo = +slash[1], d = +slash[2]; let y = +slash[3]; if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12) return `${months[mo-1]} ${d}, ${y}`;
  }
  return undefined;
}

function findTime(text: string, near?: RegExp): string | undefined {
  const slice = near ? (text.match(near)?.[0] || text) : text;
  const m = slice.match(/\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?|AM|PM)\b/i);
  if (m) return `${m[1]}:${m[2]} ${m[3].replace(/\./g,"").toUpperCase()}`;
  const m2 = slice.match(/\b(\d{1,2})\s*(a\.?m\.?|p\.?m\.?|AM|PM)\b/i);
  if (m2) return `${m2[1]}:00 ${m2[2].replace(/\./g,"").toUpperCase()}`;
  return undefined;
}

function findLocation(text: string): string | undefined {
  const m = text.match(/\b(?:location|held at|venue|at the)\s*[:\-–]?\s*([^\n.;]{3,80})/i);
  return m ? m[1].trim() : undefined;
}

function listAfter(text: string, label: RegExp): string[] {
  const m = text.match(label);
  if (!m) return [];
  const start = m.index! + m[0].length;
  const chunk = text.slice(start, start + 400);
  const stop = chunk.search(/\n\n|\n[A-Z][a-z]+\s*[\:\-]/);
  const seg = stop > 0 ? chunk.slice(0, stop) : chunk.split(/\n\n/)[0];
  return seg.split(/[,;\n]|\band\b/i).map(s => s.trim().replace(/^[-–•*\d.)\s]+/, "")).filter(s => s.length > 1 && s.length < 80);
}

function findMotions(text: string) {
  const out: any[] = [];
  const re = /moved\s+by\s+([A-Z][\w.\-' ]{1,40}?)[,;]?\s*(?:and\s+)?seconded\s+by\s+([A-Z][\w.\-' ]{1,40}?)[,;.\s]+(?:that\s+)?([^.\n]{5,200}?)\.?\s*(carried|defeated|tabled|approved|passed)?/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push({
      mover: m[1].trim(),
      seconder: m[2].trim(),
      motion: `MOVED by ${m[1].trim()}; SECONDED by ${m[2].trim()} that ${m[3].trim()}.`,
      result: (m[4] || "CARRIED").toUpperCase(),
      raw: m[0],
    });
  }
  return out;
}

function findActions(text: string) {
  const out: any[] = [];
  const re = /(?:action(?:\s*item)?|to[-\s]?do|follow[-\s]?up)\s*[:\-–]\s*([^\n.]{3,200})/gi;
  let m; let n = 1;
  while ((m = re.exec(text)) !== null) {
    const body = m[1].trim();
    const owner = body.match(/\(([^)]{2,40})\)|—\s*([A-Z][\w. ]{1,40})$/);
    const due = body.match(/\bby\s+([^,.;)]{3,40})/i);
    out.push({
      no: String(n++),
      action: body.replace(/\([^)]*\)|—\s*[A-Z][\w. ]+$/, "").trim(),
      owner: (owner?.[1] || owner?.[2] || "").trim(),
      due: due?.[1].trim() || "",
    });
  }
  return out;
}

function splitBullets(text: string, max = 6): string[] {
  // split on sentence-ish boundaries, keep meaningful chunks
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])|\n+|\s*•\s*|\s*-\s+/)
    .map(s => s.trim().replace(/^[-–•*\d.)\s]+/, ""))
    .filter(s => s.length > 12 && s.length < 260)
    .slice(0, max);
}

function sectionBetween(text: string, start: RegExp, end?: RegExp): string {
  const s = text.match(start);
  if (!s) return "";
  const from = s.index! + s[0].length;
  if (!end) return text.slice(from);
  const rest = text.slice(from);
  const e = rest.match(end);
  return e ? rest.slice(0, e.index!) : rest;
}

export function extractRuleBased(transcript: string): any {
  const t = transcript.replace(/\r\n/g, "\n");
  const m: any = {
    meeting_date: findDate(t),
    meeting_time: findTime(t, /(call(?:ed)?\s+to\s+order[^.]{0,80})/i) || findTime(t),
    location: findLocation(t),
    meeting_type: /\bAGM\b|annual\s+general\s+meeting/i.test(t) ? "Annual General Meeting" : "Board Member Meeting",
  };

  // Attendees
  const present = listAfter(t, /\b(?:board\s+(?:members?\s+)?present|present|in\s+attendance)\s*[\:\-–]/i);
  const absent  = listAfter(t, /\b(?:absent|regrets|with\s+regrets)\s*[\:\-–]/i);
  const also    = listAfter(t, /\b(?:also\s+present|guests?|staff\s+present)\s*[\:\-–]/i);
  if (present.length) m.board_present = present;
  if (absent.length)  m.board_absent  = absent;
  if (also.length)    m.also_present  = also;
  if (present.length) m.quorum_note = `Quorum confirmed with ${present.length} director${present.length===1?"":"s"} present.`;

  // Call to order
  const ctoTime = findTime(t, /(call(?:ed)?\s+to\s+order[^.]{0,80})/i);
  if (ctoTime) {
    m.call_to_order_time = ctoTime;
    const chair = t.match(/(?:chair(?:ed)?|by)\s+([A-Z][\w.\-' ]{1,40})/);
    if (chair) m.call_to_order_chair = chair[1].trim();
  }

  // Motions — classify by surrounding context
  const motions = findMotions(t);

  // Previous minutes
  const pmMo = motions.find(x => /minutes/i.test(x.raw) && /(approved|circulated|previous)/i.test(x.raw));
  if (pmMo) {
    const per = pmMo.raw.match(new RegExp(`(${MONTHS})\\s+\\d{4}`, "i"));
    m.previous_minutes = { period: per?.[0] || "previous", mover: pmMo.mover, seconder: pmMo.seconder, result: pmMo.result };
  }

  // Financial report
  const finSec = sectionBetween(t, /\b(?:financial\s+report|treasurer'?s?\s+report|finance)\b[^\n]*/i, /\b(?:old\s+business|new\s+business|owners'?\s+forum|adjourn)\b/i);
  if (finSec.trim()) {
    const op = finSec.match(/operating[^$]{0,40}\$\s?([\d,]+(?:\.\d+)?)/i);
    const re = finSec.match(/reserve[^$]{0,40}\$\s?([\d,]+(?:\.\d+)?)/i);
    const ar = finSec.match(/(?:accounts?\s+receivable|arrears?|a\/r)[^.\n]{0,200}/i);
    const finMo = motions.find(x => /financial|report\s+be\s+accepted/i.test(x.raw));
    m.financial_report = {
      period: finSec.match(new RegExp(`(${MONTHS})\\s+\\d{4}|current`, "i"))?.[0] || "Current",
      ...(op ? { operating_balance: `$${op[1]}` } : {}),
      ...(re ? { reserve_balance: `$${re[1]}` } : {}),
      ...(ar ? { ar_notes: ar[0].trim() } : {}),
      narrative: splitBullets(finSec, 4),
      ...(finMo ? { mover: finMo.mover, seconder: finMo.seconder, result: finMo.result } : {}),
    };
  }

  // PM report
  const pmSec = sectionBetween(t, /\b(?:property\s+manager'?s?\s+report|pm\s+report|management\s+report)\b[^\n]*/i, /\b(?:financial|old\s+business|new\s+business|owners'?\s+forum)\b/i);
  if (pmSec.trim()) {
    const ops = sectionBetween(pmSec, /\b(?:operations?|building\s+operations?|maintenance)\b[^\n]*/i, /\b(?:correspondence|complaints?|letters?)\b/i);
    const corr= sectionBetween(pmSec, /\b(?:correspondence|complaints?|letters?)\b[^\n]*/i);
    m.pm_report = {
      operations:    splitBullets(ops || pmSec, 5),
      correspondence:splitBullets(corr, 4),
    };
    if (!m.pm_report.correspondence.length) delete m.pm_report.correspondence;
    if (!m.pm_report.operations.length) delete m.pm_report.operations;
    if (!m.pm_report.operations && !m.pm_report.correspondence) delete m.pm_report;
  }

  // Old / new business — split by motion blocks under headings
  const buildBiz = (label: RegExp, endLabel: RegExp) => {
    const sec = sectionBetween(t, label, endLabel);
    if (!sec.trim()) return [];
    const blocks = sec.split(/\n(?=[A-Z][A-Za-z0-9 ,'\-]{3,60}\s*(?:\n|:))/).filter(b => b.trim().length > 20);
    return blocks.slice(0, 6).map(block => {
      const title = (block.split(/\n/)[0] || "Item").replace(/[\:\-–.]+$/,"").trim().slice(0, 80);
      const mo = findMotions(block)[0];
      return {
        title,
        description: splitBullets(block, 4),
        ...(mo ? { motion: mo.motion, result: mo.result } : {}),
      };
    });
  };
  const oldBiz = buildBiz(/\bold\s+business\b[^\n]*/i, /\b(?:new\s+business|owners'?\s+forum|adjourn)\b/i);
  const newBiz = buildBiz(/\bnew\s+business\b[^\n]*/i, /\b(?:owners'?\s+forum|adjourn|action\s+items?)\b/i);
  if (oldBiz.length) m.old_business = oldBiz;
  if (newBiz.length) m.new_business = newBiz;

  // Owners' forum
  const ofSec = sectionBetween(t, /\bowners'?\s+forum\b[^\n]*/i, /\b(?:action\s+items?|adjourn|next\s+meeting)\b/i);
  if (ofSec.trim()) {
    const items = ofSec.split(/\n+/).map(l => l.trim()).filter(l => l.length > 10);
    const forum = items.slice(0, 8).map(line => {
      const m2 = line.match(/^([A-Z][\w.\-' ]{1,40})\s*[\:\-–]\s*(.+)$/);
      return m2 ? { speaker: m2[1].trim(), concern: m2[2].trim() } : { speaker: "Owner", concern: line };
    });
    if (forum.length) m.owners_forum = forum;
  }

  // Action items
  const actions = findActions(t);
  if (actions.length) m.action_items = actions;

  // Next meeting
  const nm = t.match(/next\s+(?:board\s+)?meeting[^.\n]{0,120}/i);
  if (nm) m.next_meeting = nm[0].replace(/^next\s+(?:board\s+)?meeting\s*(?:is|will\s+be|scheduled\s+for)?\s*[\:\-–]?\s*/i, "").trim();

  // Adjournment
  const adj = t.match(/adjourn(?:ed|ment)[^.\n]{0,120}/i);
  if (adj) {
    const tt = findTime(adj[0]);
    if (tt) m.adjournment_time = tt;
    const adjMo = motions.find(x => /adjourn/i.test(x.raw));
    if (adjMo) { m.adjournment_mover = adjMo.mover; m.adjournment_seconder = adjMo.seconder; }
  }

  return m;
}

// ────────────────────────────────────────────────────────────────────────────
// TRANSFORMERS.JS (CPU) — polishes the rule-based output.
// We DON'T ask a tiny CPU model to produce strict JSON (it won't reliably).
// Instead, rule-based extracts structure, and a small instruction-tuned T5
// rewrites/condenses each narrative chunk into clean board-minutes prose.
// ────────────────────────────────────────────────────────────────────────────

let pipelinePromise: Promise<any> | null = null;

async function getPipeline(onProgress?: (msg: string) => void) {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      onProgress?.("Downloading small AI model (~250MB, cached for next time)…");
      const pipe = await pipeline("text2text-generation", "Xenova/LaMini-Flan-T5-248M", {
        progress_callback: (p: any) => {
          if (p?.status === "progress" && p?.file) {
            const pct = p.progress ? ` ${Math.round(p.progress)}%` : "";
            onProgress?.(`Downloading ${p.file}${pct}`);
          } else if (p?.status === "done") {
            onProgress?.("Loading model into memory…");
          }
        },
      });
      return pipe;
    })();
  }
  return pipelinePromise;
}

async function polish(pipe: any, prompt: string): Promise<string> {
  try {
    const out = await pipe(prompt, { max_new_tokens: 120, temperature: 0.3 });
    return Array.isArray(out) ? (out[0]?.generated_text || "").trim() : String(out).trim();
  } catch { return ""; }
}

export async function extractWithTransformers(transcript: string, onProgress?: (msg: string) => void): Promise<any> {
  const base = extractRuleBased(transcript);
  const pipe = await getPipeline(onProgress);
  onProgress?.("Polishing extracted text…");

  const rewriteList = async (arr?: string[]) => {
    if (!Array.isArray(arr) || !arr.length) return arr;
    const out: string[] = [];
    for (const item of arr) {
      const p = `Rewrite this as one concise, formal board-meeting bullet point in past tense. Keep it under 25 words. Text: "${item}"`;
      const r = await polish(pipe, p);
      out.push(r || item);
    }
    return out;
  };

  if (base.pm_report?.operations)     base.pm_report.operations     = await rewriteList(base.pm_report.operations);
  if (base.pm_report?.correspondence) base.pm_report.correspondence = await rewriteList(base.pm_report.correspondence);
  if (base.financial_report?.narrative) base.financial_report.narrative = await rewriteList(base.financial_report.narrative);
  if (Array.isArray(base.old_business)) for (const it of base.old_business) it.description = await rewriteList(it.description);
  if (Array.isArray(base.new_business)) for (const it of base.new_business) it.description = await rewriteList(it.description);

  return base;
}
