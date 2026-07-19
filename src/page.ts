// Landing + live demo page, served at GET /. Self-contained (inline CSS/JS/logo).
// Calls the free, rate-limited POST /demo/:service route; the paid /api/:service routes
// stay agent-only behind x402.

import { LOGO_DATA_URI } from "./logo";
import { SERVICE_LIST } from "./advocate";

const SERVICE_OPTIONS = SERVICE_LIST.map(
  (s) => `<option value="${s.id}">${s.name}</option>`
).join("\n");

export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Advocado | An AI advocate for life's paperwork</title>
<style>
  :root {
    --cream:#fff7e6; --cream2:#fff0d1; --green:#3c6e3c; --green2:#7cb342;
    --flesh:#d7e578; --text:#2c2410; --dim:#7a6f52; --line:rgba(60,110,60,.22);
    --panel:rgba(255,255,255,.55);
  }
  * { box-sizing:border-box; margin:0; }
  body { background:linear-gradient(180deg,var(--cream),var(--cream2));
         color:var(--text); font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
         min-height:100vh; }
  main { max-width:760px; margin:0 auto; padding:56px 20px 90px; }

  .hero { text-align:center; margin-bottom:40px; }
  .hero img { width:100px; height:100px; border-radius:26px;
              box-shadow:0 10px 30px rgba(60,110,60,.25); animation:float 6s ease-in-out infinite; }
  @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
  h1 { font-size:44px; letter-spacing:.5px; margin:16px 0 6px; color:var(--green); }
  .tag { color:var(--dim); font-size:18px; max-width:520px; margin:0 auto; }
  .tag b { color:var(--text); }

  .card { background:var(--panel); border:1px solid var(--line); border-radius:16px;
          padding:26px; margin-bottom:22px; backdrop-filter:blur(4px); }
  .card h2 { font-size:13px; text-transform:uppercase; letter-spacing:3px;
             color:var(--green); margin-bottom:16px; }

  label { display:block; font-size:13px; color:var(--dim); margin:12px 0 5px; }
  select, textarea { width:100%; padding:13px 15px; border-radius:10px;
          border:1px solid rgba(60,40,10,.15); background:rgba(255,255,255,.8);
          color:var(--text); font-size:15px; font-family:inherit; }
  textarea { min-height:110px; resize:vertical; }
  select:focus, textarea:focus { outline:none; border-color:var(--green);
                box-shadow:0 0 0 3px rgba(60,110,60,.15); }
  button.go { margin-top:18px; width:100%; padding:14px; border-radius:10px; border:none;
              cursor:pointer; font-weight:800; font-size:16px; letter-spacing:.5px;
              background:linear-gradient(120deg, var(--green2), var(--green));
              color:#fff; transition:transform .1s, box-shadow .15s; }
  button.go:hover { box-shadow:0 4px 24px rgba(60,110,60,.35); transform:translateY(-1px); }
  button.go:disabled { opacity:.55; cursor:wait; transform:none; box-shadow:none; }

  #result { display:none; }
  .summary { font-size:16px; margin-bottom:14px; padding:14px; background:rgba(124,179,66,.12);
             border-left:4px solid var(--green2); border-radius:6px; }
  .section-label { font-size:12px; text-transform:uppercase; letter-spacing:2px; color:var(--dim);
                   margin:16px 0 6px; }
  ul.points li { margin:6px 0 6px 20px; }
  .draft { white-space:pre-wrap; background:rgba(255,255,255,.7); border:1px solid var(--line);
           border-radius:10px; padding:16px; font-size:14.5px; line-height:1.6; }
  .disclaimer { margin-top:16px; font-size:12.5px; color:var(--dim); font-style:italic;
                border-top:1px solid var(--line); padding-top:12px; }
  .err { color:#a23; margin-top:12px; font-size:14px; }

  .how { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
  .how div { background:rgba(255,255,255,.5); border-radius:12px; padding:16px; }
  .how b { color:var(--green); display:block; margin-bottom:6px; font-size:14px; }
  .how p { color:var(--dim); font-size:13px; line-height:1.5; }

  code { background:rgba(60,40,10,.08); padding:2px 7px; border-radius:5px; font-size:13px; }
  .foot { color:var(--dim); font-size:13px; margin-top:44px; text-align:center; }
  .foot a { color:var(--green); text-decoration:none; }

  @media (max-width:620px) { h1 { font-size:34px; } .how { grid-template-columns:1fr; } }
</style>
</head>
<body>
<main>
  <div class="hero">
    <img src="${LOGO_DATA_URI}" alt="Advocado">
    <h1>Advocado</h1>
    <p class="tag">Bills, claims, warranties, paperwork. <b>An AI advocate that goes to bat for you</b> — explains what's really going on and drafts the message to send.</p>
  </div>

  <div class="card">
    <h2>Try it live</h2>
    <label for="svc">What do you need help with?</label>
    <select id="svc">
      ${SERVICE_OPTIONS}
    </select>
    <label for="sit">Describe your situation</label>
    <textarea id="sit" placeholder="e.g. My internet bill jumped from $60 to $95 with no notice, I've been a customer for 3 years..."></textarea>
    <button class="go" id="go" onclick="runIt()">Get help</button>
    <p class="err" id="err"></p>
  </div>

  <div class="card" id="result">
    <h2>Result</h2>
    <div class="summary" id="rsummary"></div>
    <div class="section-label">Key points</div>
    <ul class="points" id="rpoints"></ul>
    <div class="section-label">Draft message</div>
    <div class="draft" id="rdraft"></div>
    <div class="disclaimer" id="rdisclaimer"></div>
  </div>

  <div class="card">
    <h2>How it works</h2>
    <div class="how">
      <div><b>1. Tell it what's wrong</b><p>A bill, a claim, a collections letter — describe it in your own words.</p></div>
      <div><b>2. It reads between the lines</b><p>Flags overcharges, explains your position, breaks down what's actually going on.</p></div>
      <div><b>3. Get a ready-to-send draft</b><p>A message you can copy, paste, and send today.</p></div>
    </div>
  </div>

  <div class="card">
    <h2>For agents</h2>
    <p style="font-size:14px">Machine callers use the paid routes — <code>GET|POST /api/&lt;service&gt;</code>,
    <b>0.01 USDT0</b> per call via the OKX Agent Payments Protocol (x402, X Layer). Six services:
    ${SERVICE_LIST.map((s) => `<code>${s.id}</code>`).join(", ")}.</p>
  </div>

  <p class="foot">On OKX.AI &middot; <a href="https://github.com/ometere123/advocado">github.com/ometere123/advocado</a></p>
</main>
<script>
async function runIt() {
  const svc = document.getElementById('svc').value;
  const sit = document.getElementById('sit').value.trim();
  const err = document.getElementById('err'); err.textContent = '';
  document.getElementById('result').style.display = 'none';
  if (sit.length < 10) { err.textContent = 'Describe your situation in a bit more detail.'; return; }
  const btn = document.getElementById('go'); btn.disabled = true; btn.textContent = 'Working...';
  try {
    const r = await fetch('/demo/' + svc, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ situation: sit }) });
    const d = await r.json();
    if (!r.ok) { err.textContent = d.error || ('HTTP ' + r.status); return; }
    document.getElementById('rsummary').textContent = d.summary;
    document.getElementById('rpoints').innerHTML = d.keyPoints.map(x => '<li>' + x.replace(/</g,'&lt;') + '</li>').join('');
    document.getElementById('rdraft').textContent = d.draftMessage;
    document.getElementById('rdisclaimer').textContent = d.disclaimer;
    const res = document.getElementById('result');
    res.style.display = 'block';
    res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch(e) { err.textContent = 'Request failed: ' + e.message; }
  finally { btn.disabled = false; btn.textContent = 'Get help'; }
}
</script>
</body>
</html>`;
