/* =========================================================
 * Jannat Bakery – Kitchen Display System (kitchen.html)
 * ========================================================= */
import {
  db, ordersCol, doc, updateDoc, onSnapshot, query, orderBy, limit,
  esc, toDate, timeStr, minutesAgo, STATUS, toast, configBanner
} from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const state = { orders: [], muted: false, initialLoad: true, fresh: new Set() };

configBanner();

/* ---------- Audio chime (Web Audio API – no audio file needed) ---------- */
let audioCtx = null;
const ensureAudio = () => {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
};
const chime = () => {
  if (state.muted) return;
  try {
    ensureAudio();
    const notes = [880, 1108.73, 1318.51]; // A5, C#6, E6 – pleasant major arpeggio
    notes.forEach((freq, i) => {
      const t = audioCtx.currentTime + i * 0.16;
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t); osc.stop(t + 0.65);
    });
  } catch (e) { console.warn("Audio unavailable", e); }
};

$("start-btn").onclick = () => { ensureAudio(); chime(); $("sound-gate").classList.add("hidden"); };
$("test-sound").onclick = chime;
$("mute-btn").onclick = () => {
  state.muted = !state.muted;
  $("mute-btn").textContent = state.muted ? "🔕 Sound Off" : "🔔 Sound On";
};

/* ---------- Real-time orders ---------- */
onSnapshot(query(ordersCol, orderBy("createdAt", "asc"), limit(200)), (snap) => {
  /* New orders after the first load → chime + highlight */
  if (!state.initialLoad) {
    let hasNew = false;
    snap.docChanges().forEach((c) => {
      if (c.type === "added" && c.doc.data().status === "pending") { state.fresh.add(c.doc.id); hasNew = true; }
    });
    if (hasNew) chime();
  }
  state.initialLoad = false;
  state.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  render();
}, (err) => { console.error(err); toast("Cannot load orders – check Firebase config/rules", "err"); });

/* ---------- Rendering ---------- */
const card = (o) => {
  const d = toDate(o), mins = minutesAgo(d), st = STATUS[o.status];
  const urgency = o.status === "completed" ? "" : mins >= 20 ? "border-red-500" : mins >= 10 ? "border-amber-400" : "border-transparent";
  const isNew = state.fresh.has(o.id);
  return `
  <article class="bg-white text-brand-900 rounded-2xl p-4 shadow-lg border-4 ${urgency} ${isNew ? "new-order" : ""} fade-in">
    <div class="flex items-start justify-between">
      <div>
        <p class="text-3xl font-extrabold leading-none">TABLE ${esc(o.table)}</p>
        <p class="text-xs text-brand-500 font-mono mt-1">${esc(o.orderCode || "")}</p>
      </div>
      <div class="text-right">
        <p class="text-sm font-semibold ${mins >= 20 ? "text-red-600" : mins >= 10 ? "text-amber-600" : "text-brand-600"}">⏱ ${mins} min</p>
        <p class="text-xs text-brand-400">${timeStr(d)}</p>
      </div>
    </div>
    <ul class="mt-3 space-y-1">
      ${(o.items || []).map((i) => `<li class="flex gap-2 text-lg"><span class="font-extrabold text-amber-600 w-8">${i.qty}×</span><span class="font-medium">${esc(i.name)}</span></li>`).join("")}
    </ul>
    ${o.note ? `<p class="mt-3 text-sm bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">📝 <b>${esc(o.note)}</b></p>` : ""}
    <button data-adv="${o.id}" data-to="${st.next}" class="btn-press mt-4 w-full py-3 rounded-xl font-bold text-white text-lg
      ${o.status === "pending" ? "bg-amber-500 hover:bg-amber-600" : o.status === "preparing" ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"}">
      ${st.nextLabel} →
    </button>
  </article>`;
};

const render = () => {
  const cols = { pending: [], preparing: [], ready: [] };
  let doneToday = 0;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  state.orders.forEach((o) => {
    if (cols[o.status]) cols[o.status].push(o);
    else if (o.status === "completed" && toDate(o) >= start) doneToday++;
  });

  Object.entries(cols).forEach(([k, list]) => {
    $("col-" + k).innerHTML = list.length ? list.map(card).join("") : `<div class="text-center text-brand-400 border-2 border-dashed border-brand-700 rounded-2xl py-10">No orders</div>`;
    $("n-" + k).textContent = list.length;
  });
  $("counts").innerHTML = `<span class="px-3 py-1 rounded-full bg-white/10">Completed today: <b>${doneToday}</b></span>`;
};

/* ---------- Status workflow buttons ---------- */
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-adv]");
  if (!b) return;
  b.disabled = true; b.classList.add("opacity-60");
  state.fresh.delete(b.dataset.adv);
  try { await updateDoc(doc(db, "orders", b.dataset.adv), { status: b.dataset.to }); }
  catch (err) { console.error(err); toast("Update failed", "err"); b.disabled = false; b.classList.remove("opacity-60"); }
});

/* Clock + refresh elapsed timers every 30s */
setInterval(() => { $("clock").textContent = new Date().toLocaleTimeString("en-IN"); }, 1000);
setInterval(render, 30000);
