/* =========================================================
 * Jannat Bakery – Admin dashboard (admin.html)
 * ========================================================= */
import {
  APP, db, menuCol, ordersCol, doc, addDoc, setDoc, updateDoc, deleteDoc, writeBatch,
  onSnapshot, query, orderBy, limit,
  fmt, esc, toDate, timeStr, minutesAgo, statusBadge, STATUS, SEED_MENU, toast, configBanner
} from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const state = { menu: [], orders: [], filter: "active", search: "", tab: "orders" };

configBanner();

/* ---------- PIN gate (client-side convenience lock; see README for real security) ---------- */
const unlock = () => { $("login").classList.add("hidden"); boot(); };
if (sessionStorage.getItem("jb_admin") === "1") unlock();
$("login-form").onsubmit = (e) => {
  e.preventDefault();
  if ($("pin").value === APP.adminPin) { sessionStorage.setItem("jb_admin", "1"); unlock(); }
  else { $("pin-err").classList.remove("hidden"); $("pin").value = ""; }
};
$("logout").onclick = () => { sessionStorage.removeItem("jb_admin"); location.reload(); };

/* ---------- Tabs ---------- */
const setTab = (t) => {
  state.tab = t;
  $("tab-orders").classList.toggle("hidden", t !== "orders");
  $("tab-menu").classList.toggle("hidden", t !== "menu");
  document.querySelectorAll(".tab-btn").forEach((b) => {
    const on = b.dataset.tab === t;
    b.classList.toggle("bg-amber-400", on); b.classList.toggle("text-brand-900", on);
  });
};
document.querySelectorAll(".tab-btn").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));

/* ---------- Boot: real-time listeners ---------- */
let booted = false;
function boot() {
  if (booted) return; booted = true;
  setTab("orders");

  onSnapshot(menuCol, (snap) => {
    state.menu = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.name.localeCompare(b.name));
    renderMenu();
  }, (e) => { console.error(e); toast("Menu load failed – check Firebase config/rules", "err"); });

  onSnapshot(query(ordersCol, orderBy("createdAt", "desc"), limit(300)), (snap) => {
    state.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderStats(); renderFilters(); renderOrders();
  }, (e) => { console.error(e); toast("Orders load failed – check Firebase config/rules", "err"); });

  setInterval(renderOrders, 30000); // refresh "x min ago"
}

/* ---------- Analytics ---------- */
const todayOrders = () => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return state.orders.filter((o) => toDate(o) >= start);
};

const renderStats = () => {
  const t = todayOrders();
  const valid = t.filter((o) => o.status !== "cancelled");
  const revenue = valid.reduce((s, o) => s + (o.total || 0), 0);
  const active = state.orders.filter((o) => ["pending", "preparing", "ready"].includes(o.status)).length;
  const avg = valid.length ? revenue / valid.length : 0;

  const cards = [
    { icon: "▤", label: "Orders today", value: t.length, iconTone: "admin-stat-icon--brown" },
    { icon: "₹", label: "Revenue today", value: fmt(revenue), iconTone: "admin-stat-icon--green" },
    { icon: "↗", label: "Active orders", value: active, iconTone: "admin-stat-icon--amber" },
    { icon: "◉", label: "Average order", value: fmt(avg), iconTone: "admin-stat-icon--blue" }
  ];
  $("stats").innerHTML = cards.map((c) => `
    <div class="admin-stat-card card-lift">
      <div class="admin-stat-icon ${c.iconTone}">${c.icon}</div>
      <p class="admin-stat-value">${c.value}</p>
      <p class="admin-stat-label">${c.label}</p>
    </div>`).join("");

  /* hourly mini chart */
  const hours = new Array(24).fill(0);
  valid.forEach((o) => hours[toDate(o).getHours()]++);
  const max = Math.max(1, ...hours);
  const first = Math.max(0, hours.findIndex((h) => h > 0) - 1);
  const shown = hours.slice(first < 0 ? 0 : first, 24).slice(0, 16);
  $("hour-chart").innerHTML = shown.map((n, i) => `
    <div class="flex-1 flex flex-col items-center justify-end h-full gap-1" title="${n} orders">
      <span class="text-[10px] text-brand-500">${n || ""}</span>
      <div class="admin-chart-bar w-full rounded-t" style="height:${(n / max) * 80}%;min-height:${n ? 4 : 2}px;${n ? "" : "opacity:.25"}"></div>
      <span class="text-[10px] text-brand-400">${(first + i) % 24}h</span>
    </div>`).join("");

  /* top items */
  const counts = {};
  valid.forEach((o) => (o.items || []).forEach((i) => (counts[i.name] = (counts[i.name] || 0) + i.qty)));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  $("top-items").innerHTML = top.length
    ? top.map(([n, q], i) => `<li class="admin-top-item"><span class="admin-top-rank">${String(i + 1).padStart(2, "0")}</span><span class="min-w-0 flex-1 truncate font-medium text-brand-800">${esc(n)}</span><b class="text-brand-600">${q} sold</b></li>`).join("")
    : `<li class="text-brand-400 text-sm py-2">No sales yet today</li>`;
};

/* ---------- Order filters & list ---------- */
const FILTERS = [
  ["active", "Active"], ["pending", "Pending"], ["preparing", "Preparing"],
  ["ready", "Ready"], ["completed", "Completed"], ["cancelled", "Cancelled"], ["all", "All"]
];
const countFor = (f) => state.orders.filter((o) => f === "all" ? true : f === "active" ? ["pending", "preparing", "ready"].includes(o.status) : o.status === f).length;

const renderFilters = () => {
  $("status-filters").innerHTML = FILTERS.map(([k, l]) => `
    <button data-f="${k}" class="admin-filter-btn btn-press px-3 py-1.5 rounded-full text-sm font-semibold border
      ${state.filter === k ? "bg-brand-800 text-white border-brand-800" : "bg-white text-brand-700 border-brand-200"}">
      ${l} <span class="opacity-70">(${countFor(k)})</span></button>`).join("");
  $("status-filters").querySelectorAll("button").forEach((b) => (b.onclick = () => { state.filter = b.dataset.f; renderFilters(); renderOrders(); }));
};
$("order-search").oninput = (e) => { state.search = e.target.value.trim().toLowerCase(); renderOrders(); };

const renderOrders = () => {
  let list = state.orders.filter((o) => state.filter === "all" ? true : state.filter === "active" ? ["pending", "preparing", "ready"].includes(o.status) : o.status === state.filter);
  if (state.search) list = list.filter((o) => (`table ${o.table} ${o.orderCode}`).toLowerCase().includes(state.search) || String(o.table) === state.search.replace(/^0+/, ""));

  $("orders-empty").classList.toggle("hidden", list.length > 0);
  $("orders-grid").innerHTML = list.map((o) => {
    const d = toDate(o), st = STATUS[o.status] || STATUS.pending;
    return `
    <article class="admin-order-card card-lift flex flex-col">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-[11px] uppercase tracking-wider text-brand-400 font-semibold">Order ${esc(o.orderCode || o.id.slice(0, 6))}</p>
          <h4 class="text-xl font-bold text-brand-900 mt-1">Table ${esc(o.table)}</h4>
        </div>
        ${statusBadge(o.status)}
      </div>
      <p class="admin-order-time">${timeStr(d)} <span>·</span> ${minutesAgo(d)} min ago</p>
      <ul class="admin-order-items text-sm space-y-2 flex-1">
        ${(o.items || []).map((i) => `<li class="flex justify-between"><span>${i.qty} × ${esc(i.name)}</span><span class="text-brand-500">${fmt(i.price * i.qty)}</span></li>`).join("")}
      </ul>
      ${o.note ? `<p class="admin-order-note mt-3">Note: ${esc(o.note)}</p>` : ""}
      <div class="admin-order-total flex justify-between font-bold text-brand-900 mt-3 pt-3"><span>Total</span><span>${fmt(o.total)}</span></div>
      <div class="flex gap-2 mt-3">
        ${st.next ? `<button data-adv="${o.id}" data-to="${st.next}" class="admin-order-primary btn-press flex-1 text-sm font-semibold py-2.5 rounded-xl">${st.nextLabel}</button>` : ""}
        ${["pending", "preparing"].includes(o.status) ? `<button data-cancel="${o.id}" class="admin-order-cancel btn-press px-3 py-2.5 rounded-xl border text-sm font-semibold">Cancel</button>` : ""}
      </div>
    </article>`;
  }).join("");
};

$("orders-grid").addEventListener("click", async (e) => {
  const adv = e.target.closest("[data-adv]"), can = e.target.closest("[data-cancel]");
  try {
    if (adv) await updateDoc(doc(db, "orders", adv.dataset.adv), { status: adv.dataset.to });
    if (can && confirm("Cancel this order?")) await updateDoc(doc(db, "orders", can.dataset.cancel), { status: "cancelled" });
  } catch (err) { console.error(err); toast("Update failed", "err"); }
});

/* ---------- Menu management ---------- */
const renderMenu = () => {
  $("menu-empty").classList.toggle("hidden", state.menu.length > 0);
  $("seed-btn").classList.toggle("hidden", state.menu.length > 0);
  $("cat-options").innerHTML = [...new Set(state.menu.map((m) => m.category))].map((c) => `<option value="${esc(c)}">`).join("");

  $("menu-body").innerHTML = state.menu.map((m) => `
    <tr class="admin-menu-row">
      <td class="px-4 py-3.5">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-lg bg-brand-100 flex items-center justify-center overflow-hidden text-2xl shrink-0">
            ${m.imageUrl ? `<img src="${esc(m.imageUrl)}" class="w-full h-full object-cover" alt="" />` : esc(m.emoji || "🍞")}
          </div>
          <div class="min-w-0"><p class="font-semibold text-brand-900">${esc(m.name)}</p><p class="text-xs text-brand-500 truncate max-w-xs">${esc(m.description || "")}</p></div>
        </div>
      </td>
      <td class="px-4 py-3.5"><span class="admin-category-tag">${esc(m.category)}</span></td>
      <td class="px-4 py-3.5">
        <input data-price="${m.id}" type="number" min="0" step="0.5" value="${m.price}" class="admin-price-input w-24 px-2 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-amber-400" title="Edit price, press Enter or click away to save" />
      </td>
      <td class="px-4 py-3.5">
        <label class="flex items-center gap-2"><span class="switch"><input data-avail="${m.id}" type="checkbox" ${m.available !== false ? "checked" : ""} /><span class="slider"></span></span>
        <span class="text-xs font-semibold ${m.available !== false ? "text-green-700" : "text-red-600"}">${m.available !== false ? "Available" : "Out of Stock"}</span></label>
      </td>
      <td class="px-4 py-3.5 text-right whitespace-nowrap">
        <button data-edit="${m.id}" class="admin-menu-action px-2.5 py-1.5 text-brand-700 rounded-lg">Edit</button>
        <button data-del="${m.id}" class="admin-menu-delete px-2.5 py-1.5 text-red-600 rounded-lg" aria-label="Delete ${esc(m.name)}">Delete</button>
      </td>
    </tr>`).join("");
};

$("menu-body").addEventListener("change", async (e) => {
  const av = e.target.closest("[data-avail]"), pr = e.target.closest("[data-price]");
  try {
    if (av) { await updateDoc(doc(db, "menu", av.dataset.avail), { available: av.checked }); toast(av.checked ? "Marked available" : "Marked out of stock"); }
    if (pr) {
      const v = parseFloat(pr.value);
      if (isNaN(v) || v < 0) return toast("Invalid price", "err");
      await updateDoc(doc(db, "menu", pr.dataset.price), { price: v }); toast("Price updated");
    }
  } catch (err) { console.error(err); toast("Update failed", "err"); }
});
$("menu-body").addEventListener("click", async (e) => {
  const ed = e.target.closest("[data-edit]"), del = e.target.closest("[data-del]");
  if (ed) openItemModal(state.menu.find((m) => m.id === ed.dataset.edit));
  if (del && confirm("Delete this item permanently?")) {
    try { await deleteDoc(doc(db, "menu", del.dataset.del)); toast("Item deleted"); } catch (err) { toast("Delete failed", "err"); }
  }
});

/* Item modal */
const openItemModal = (m) => {
  $("item-title").textContent = m ? "Edit Menu Item" : "Add Menu Item";
  $("f-id").value = m?.id || "";
  $("f-name").value = m?.name || ""; $("f-cat").value = m?.category || "";
  $("f-price").value = m?.price ?? ""; $("f-desc").value = m?.description || "";
  $("f-emoji").value = m?.emoji || ""; $("f-img").value = m?.imageUrl || "";
  $("f-avail").checked = m ? m.available !== false : true;
  $("item-modal").classList.remove("hidden");
};
const closeItemModal = () => $("item-modal").classList.add("hidden");
$("add-item").onclick = () => openItemModal(null);
$("item-cancel").onclick = closeItemModal;
$("item-backdrop").onclick = closeItemModal;

$("item-form").onsubmit = async (e) => {
  e.preventDefault();
  const data = {
    name: $("f-name").value.trim(), category: $("f-cat").value.trim(),
    price: parseFloat($("f-price").value), description: $("f-desc").value.trim(),
    emoji: $("f-emoji").value.trim(), imageUrl: $("f-img").value.trim(),
    available: $("f-avail").checked
  };
  const id = $("f-id").value;
  $("item-save").disabled = true;
  try {
    if (id) await updateDoc(doc(db, "menu", id), data); else await addDoc(menuCol, data);
    toast(id ? "Item updated" : "Item added");
    closeItemModal();
  } catch (err) { console.error(err); toast("Save failed", "err"); }
  $("item-save").disabled = false;
};

/* Sample menu loader */
$("seed-btn").onclick = async () => {
  try {
    const batch = writeBatch(db);
    SEED_MENU.forEach((i) => batch.set(doc(menuCol), i));
    await batch.commit();
    toast("Sample menu loaded 🎉");
  } catch (err) { console.error(err); toast("Could not load sample menu", "err"); }
};
