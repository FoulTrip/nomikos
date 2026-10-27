// Verifier UI :8765 — SSE snapshot + poll 2s + HITL.
// El Bearer vive SOLO en memoria (input password, nunca localStorage).
(() => {
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  if (q.get("run")) $("run").value = q.get("run");
  if (q.get("api")) $("api").value = q.get("api");

  const api = () => $("api").value.replace(/\/+$/, "");
  const run = () => $("run").value.trim();
  const auth = () => ({"Authorization": "Bearer " + $("bearer").value});

  function setConn(on, txt) {
    const c = $("conn");
    c.className = "pill " + (on ? "on" : "off");
    c.textContent = txt;
  }
  function say(o) { $("out").textContent = typeof o === "string" ? o : JSON.stringify(o, null, 2); }

  async function jget(path) {
    const r = await fetch(api() + path, {headers: auth()});
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${b.error || ""}`);
    return b;
  }
  async function jpost(path, body) {
    const r = await fetch(api() + path, {method: "POST", headers: {...auth(), "Content-Type": "application/json"}, body: JSON.stringify(body)});
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${b.error || ""}`);
    return b;
  }

  function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c])); }

  function renderDetail(d) {
    const r = d.run || {};
    $("status").textContent = `${r.id || ""} · ${r.status || ""}${r.signed_by ? " · firmado por " + r.signed_by : ""}`;
    $("memo").textContent = r.memorandum || "(sin entregar)";
    const turns = d.turns || [];
    $("turns-n").textContent = `(${turns.length})`;
    $("turns").innerHTML = turns.map((t) =>
      `<li><span class="role ${esc(t.role)}">[${esc(t.role)} #${esc(t.idx)}]</span> ${esc(String(t.content).slice(0, 500))}</li>`).join("");
    const evs = d.events || [];
    $("events").innerHTML = evs.map((e) =>
      `<li><b>${esc(e.kind)}</b> <span class="mono">${esc(JSON.stringify(e.payload)).slice(0, 220)}</span></li>`).join("");
  }

  function renderChecklist(c) {
    $("score").textContent = `verdict=${c.verdict} score=${c.score} · ${c.status}`;
    $("checklist").innerHTML = (c.checklist || []).map((i) =>
      `<li><b class="${esc(i.status)}">${esc(i.status)}</b> <b>${esc(i.id)}</b> — ${esc(i.description)}<br><span class="mono">must: ${esc((i.must_cite || []).join(", "))}</span>${(i.missing || []).length ? `<br><span class="mono">falta: ${esc(i.missing.join(", "))}</span>` : ""}</li>`).join("");
    $("world").innerHTML = (c.world || []).map((w) =>
      `<li><b>${esc(w.doc)}</b> — ${w.cited ? '<span class="pass">citado</span>' : '<span class="missing">no citado</span>'}</li>`).join("") || "<li>(sin evidencia world/)</li>";
    $("sign").disabled = !c.can_sign;
    $("sign").textContent = c.can_sign ? "Firmar (attorney)" : `Firmar (${c.verdict}/${c.status})`;
  }

  let timer = null;
  async function refresh() {
    if (!run() || !$("bearer").value) return;
    try {
      const [d, c] = await Promise.all([
        jget(`/legal/runs/${encodeURIComponent(run())}`),
        jget(`/legal/runs/${encodeURIComponent(run())}/checklist`),
      ]);
      renderDetail(d);
      renderChecklist(c);
      setConn(true, "en vivo · poll 2s");
    } catch (e) {
      setConn(false, "error");
      say(String(e));
    }
  }

  async function streamOnce() {
    // El endpoint /stream devuelve snapshot SSE one-shot; lo pedimos una vez
    // por conexión (con Authorization vía fetch, que EventSource no soporta).
    try {
      const r = await fetch(api() + `/legal/runs/${encodeURIComponent(run())}/stream`, {headers: auth()});
      const txt = await r.text();
      if (r.ok && txt.includes("event: run")) setConn(true, "en vivo · SSE+poll");
    } catch { /* el poll cubre */ }
  }

  $("go").onclick = async () => {
    if (timer) clearInterval(timer);
    await streamOnce();
    await refresh();
    timer = setInterval(refresh, 2000);
  };
  $("wgo").onclick = async () => {
    try {
      const b = await jpost(`/legal/runs/${encodeURIComponent(run())}/world`,
        {kind: "new_evidence", doc: $("wdoc").value.trim(), excerpt: $("wexcerpt").value.trim()});
      say({ok: true, events: (b.events || []).length});
      await refresh();
    } catch (e) { say(String(e)); }
  };
  $("esc").onclick = async () => {
    try {
      const b = await jpost(`/legal/runs/${encodeURIComponent(run())}/escalate`, {reason: $("reason").value});
      say({ok: true, status: b.run && b.run.status});
      await refresh();
    } catch (e) { say(String(e)); }
  };
  $("sign").onclick = async () => {
    try {
      const b = await jpost(`/legal/runs/${encodeURIComponent(run())}/signoff`, {attorney: $("attorney").value});
      say({ok: true, status: b.run && b.run.status, signed_by: b.run && b.run.signed_by});
      await refresh();
    } catch (e) { say(String(e)); }
  };
})();
