/* =========================================================
 * Jannat Bakery – Customer table ordering (index.html)
 * ========================================================= */
import {
  APP, menuCol, ordersCol, db, doc, addDoc, onSnapshot, query, where, serverTimestamp,
  fmt, esc, calcBill, STATUS, toast, configBanner
} from "./firebase-config.js";

const $ = (id) => document.getElementById(id);

/* ---------- State ---------- */
const state = {
  table: null,
  customerName: "",
  menu: [],            // all menu docs
  cart: {},            // { itemId: {id,name,price,qty} }
  category: "All",
  search: "",
  selectedItemId: null,
  trackedOrderIds: [],
  trackedOrders: new Map(),
  trackUnsubs: new Map(),
  confirmationOrderIds: [],
  pendingPositions: new Map(),
  pendingOrderCount: 0
};

configBanner();

/* ---------- Table number detection ---------- */
const initTable = () => {
  state.table = null;
  $("customer-name").value = sessionStorage.getItem("jb_customer_name") || "";
  $("table-modal").classList.remove("hidden");
  $("table-input").focus();
  $("menu-skeleton").classList.add("hidden");
  $("menu-root").innerHTML = "";
  $("menu-empty").classList.add("hidden");
  $("cat-list").innerHTML = "";
};
const setTable = (raw) => {
  const n = String(raw).replace(/[^0-9A-Za-z]/g, "").slice(0, 4);
  if (!n) return;
  const table = n.padStart(2, "0");
  if (sessionStorage.getItem("jb_table") !== table) {
    state.cart = {};
    saveCart();
  }
  state.table = table;
  state.customerName = $("customer-name").value.trim().slice(0, 60);
  sessionStorage.setItem("jb_customer_name", state.customerName);
  sessionStorage.setItem("jb_table", state.table);
  $("table-no").textContent = state.table;
  document.querySelectorAll(".cart-table-no").forEach((el) => (el.textContent = state.table));
  $("table-modal").classList.add("hidden");
  renderCategories();
  renderMenu();
  renderCart();
};
$("table-save").onclick = () => {
  const v = $("table-input").value.trim();
  if (!v) return toast("Please enter your table number", "err");
  setTable(v);
};
$("table-badge").onclick = () => { $("table-input").value = state.table ? parseInt(state.table, 10) || "" : ""; $("customer-name").value = state.customerName; $("table-modal").classList.remove("hidden"); $("table-input").focus(); };

/* ---------- Cart persistence ---------- */
const saveCart = () => { try { localStorage.setItem("jb_cart", JSON.stringify(state.cart)); } catch (e) {} };
const loadCart = () => { try { state.cart = JSON.parse(localStorage.getItem("jb_cart") || "{}"); } catch (e) { state.cart = {}; } };

/* ---------- Menu (real-time) ---------- */
onSnapshot(menuCol, (snap) => {
  state.menu = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  $("menu-skeleton").classList.add("hidden");
  syncCartWithMenu();
  renderCategories();
  renderMenu();
  renderCart();
}, (err) => {
  console.error(err);
  $("menu-skeleton").classList.add("hidden");
  toast("Could not load menu. Check Firebase config/rules.", "err");
});

/* Remove cart items that were deleted or went out-of-stock; refresh prices */
const syncCartWithMenu = () => {
  let removed = [];
  Object.keys(state.cart).forEach((id) => {
    const m = state.menu.find((x) => x.id === id);
    if (!m || m.available === false) { removed.push(state.cart[id].name); delete state.cart[id]; }
    else { state.cart[id].price = Number(m.price); state.cart[id].name = m.name; }
  });
  if (removed.length) { toast(`${removed.join(", ")} just sold out and was removed from your cart`, "err"); saveCart(); }
};

const renderCategories = () => {
  if (!state.table) {
    $("cat-list").innerHTML = "";
    return;
  }

  const cats = ["All", ...new Set(state.menu.map((m) => m.category || "Others"))];
  if (!cats.includes(state.category)) state.category = "All";
  $("cat-list").innerHTML = cats.map((c) => `
    <button data-cat="${esc(c)}" class="btn-press px-4 py-1.5 rounded-full text-sm font-semibold border transition
      ${c === state.category ? "bg-brand-800 text-white border-brand-800" : "bg-white text-brand-700 border-brand-200 hover:bg-brand-50"}">${esc(c)}</button>`).join("");
  $("cat-list").querySelectorAll("button").forEach((b) => (b.onclick = () => { state.category = b.dataset.cat; renderCategories(); renderMenu(); window.scrollTo({ top: 0, behavior: "smooth" }); }));
};

const itemCard = (m) => {
  const out = m.available === false;
  const qty = state.cart[m.id]?.qty || 0;
  const media = m.imageUrl
    ? `<img src="${esc(m.imageUrl)}" alt="${esc(m.name)}" loading="lazy" class="w-full h-full object-cover" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'text-4xl',textContent:'${esc(m.emoji || "🍞")}'}))" />`
    : `<span class="text-4xl">${esc(m.emoji || "🍞")}</span>`;
  const action = out
    ? `<span class="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full">Sold out</span>`
    : qty === 0
      ? `<button data-add="${m.id}" class="btn-press bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm px-5 py-1.5 rounded-full shadow">ADD</button>`
      : `<div class="flex items-center bg-amber-500 text-white rounded-full shadow font-bold">
           <button data-dec="${m.id}" class="btn-press w-8 h-8 text-lg">−</button>
           <span class="w-6 text-center text-sm">${qty}</span>
           <button data-add="${m.id}" class="btn-press w-8 h-8 text-lg">+</button>
         </div>`;
  return `
    <article data-item="${m.id}" tabindex="0" aria-label="View details for ${esc(m.name)}" class="customer-item-card card-lift flex flex-col rounded-2xl p-3 cursor-pointer ${out ? "opacity-60 grayscale" : ""}">
      <div class="customer-item-media w-full h-36 shrink-0 rounded-xl overflow-hidden flex items-center justify-center">${media}</div>
      <div class="flex-1 min-w-0 flex flex-col pt-3">
        <h3 class="font-semibold text-brand-900 leading-snug">${esc(m.name)}</h3>
        <p class="text-xs text-brand-500 line-clamp-2 mt-0.5">${esc(m.description || "")}</p>
        <div class="mt-auto pt-2 flex items-center justify-between">
          <span class="customer-item-price font-bold">${fmt(m.price)}</span>
          ${action}
        </div>
      </div>
    </article>`;
};

const renderMenu = () => {
  if (!state.table) {
    $("menu-root").innerHTML = "";
    $("menu-empty").classList.add("hidden");
    return;
  }

  const q = state.search.trim().toLowerCase();
  let items = state.menu.filter((m) => (state.category === "All" || (m.category || "Others") === state.category));
  if (q) items = items.filter((m) => (m.name + " " + (m.description || "") + " " + (m.category || "")).toLowerCase().includes(q));

  /* group by category; in-stock first */
  const groups = {};
  items.sort((a, b) => (b.available !== false) - (a.available !== false) || a.name.localeCompare(b.name))
       .forEach((m) => { (groups[m.category || "Others"] ||= []).push(m); });

  const html = Object.entries(groups).map(([cat, list]) => `
    <section>
      <h2 class="font-display text-xl text-brand-800 mb-3 flex items-center gap-2"><span class="h-px flex-1 bg-brand-200"></span>${esc(cat)}<span class="h-px flex-1 bg-brand-200"></span></h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">${list.map(itemCard).join("")}</div>
    </section>`).join("");

  $("menu-root").innerHTML = html;
  $("menu-empty").classList.toggle("hidden", items.length > 0);
};

/* Event delegation for add / dec buttons */
$("menu-root").addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]"), dec = e.target.closest("[data-dec]");
  if (add) changeQty(add.dataset.add, +1);
  else if (dec) changeQty(dec.dataset.dec, -1);
  else {
    const item = e.target.closest("[data-item]");
    if (item) showItemDetails(item.dataset.item);
  }
});
$("menu-root").addEventListener("keydown", (e) => {
  const item = e.target.closest("[data-item]");
  if (item && e.target === item && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    showItemDetails(item.dataset.item);
  }
});
$("cart-items").addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]"), dec = e.target.closest("[data-dec]"), rm = e.target.closest("[data-rm]");
  if (add) changeQty(add.dataset.add, +1);
  if (dec) changeQty(dec.dataset.dec, -1);
  if (rm) { delete state.cart[rm.dataset.rm]; afterCartChange(); }
});
$("search").addEventListener("input", (e) => { state.search = e.target.value; renderMenu(); });

const changeQty = (id, delta) => {
  if (!state.table) {
    $("table-modal").classList.remove("hidden");
    $("table-input").focus();
    return toast("Please enter your table number first", "err");
  }

  const m = state.menu.find((x) => x.id === id);
  if (!m || m.available === false) return toast("Sorry, this item is sold out", "err");
  const cur = state.cart[id] || { id, name: m.name, price: Number(m.price), qty: 0 };
  cur.qty += delta;
  if (cur.qty <= 0) delete state.cart[id]; else state.cart[id] = cur;
  if (navigator.vibrate) navigator.vibrate(10);
  afterCartChange();
  if (state.selectedItemId === id) renderItemDetails();
};
const afterCartChange = () => { saveCart(); renderMenu(); renderCart(); };

const showItemDetails = (id) => {
  const item = state.menu.find((m) => m.id === id);
  if (!item) return;
  state.selectedItemId = id;
  renderItemDetails();
  $("item-detail-modal").classList.remove("hidden");
  $("item-detail-close").focus();
};
const renderItemDetails = () => {
  const item = state.menu.find((m) => m.id === state.selectedItemId);
  if (!item) return closeItemDetails();
  const media = item.imageUrl
    ? `<img src="${esc(item.imageUrl)}" alt="${esc(item.name)}" class="w-full h-full object-cover" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'text-7xl',textContent:'${esc(item.emoji || "🍞")}'}))" />`
    : `<span class="text-7xl">${esc(item.emoji || "🍞")}</span>`;
  const qty = state.cart[item.id]?.qty || 0;
  $("detail-media").innerHTML = media;
  $("detail-category").textContent = item.category || "Bakery";
  $("detail-name").textContent = item.name;
  $("detail-description").textContent = item.description || "No description available.";
  $("detail-price").textContent = fmt(item.price);
  $("detail-availability").textContent = item.available === false ? "Currently unavailable" : qty ? `${qty} in your order` : "Available";
  $("detail-availability").className = `text-xs mt-1 ${item.available === false ? "text-red-600" : "text-green-700"}`;
  $("detail-add").textContent = item.available === false ? "Sold out" : qty ? `Add another · ${qty} in order` : "Add to order";
  $("detail-add").disabled = item.available === false;
};
const closeItemDetails = () => {
  $("item-detail-modal").classList.add("hidden");
  state.selectedItemId = null;
};
$("item-detail-close").onclick = closeItemDetails;
$("item-detail-backdrop").onclick = closeItemDetails;
$("detail-add").onclick = () => {
  if (state.selectedItemId) changeQty(state.selectedItemId, 1);
};
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("item-detail-modal").classList.contains("hidden")) closeItemDetails();
});

/* ---------- Cart UI ---------- */
const cartLines = () => Object.values(state.cart);

const renderCart = () => {
  if (!state.table) {
    $("cart-bar").classList.add("hidden");
    $("cart-modal").classList.add("hidden");
    return;
  }

  const lines = cartLines();
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const bill = calcBill(lines);

  $("cart-bar").classList.toggle("hidden", count === 0);
  const cc = $("cart-count");
  if (cc.textContent !== String(count)) { cc.classList.remove("bump"); void cc.offsetWidth; cc.classList.add("bump"); }
  cc.textContent = count;
  $("cart-total-bar").textContent = fmt(bill.total);

  $("bill-sub").textContent = fmt(bill.subtotal);
  $("bill-tax-label").textContent = APP.taxLabel;
  $("bill-tax").textContent = fmt(bill.tax);
  $("bill-total").textContent = fmt(bill.total);

  $("cart-items").innerHTML = lines.length ? lines.map((l) => `
    <div class="py-3 flex items-center gap-3">
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-brand-900 truncate">${esc(l.name)}</p>
        <p class="text-xs text-brand-500">${fmt(l.price)} each</p>
      </div>
      <div class="flex items-center border border-brand-200 rounded-full">
        <button data-dec="${l.id}" class="btn-press w-8 h-8 text-brand-700 text-lg">−</button>
        <span class="w-6 text-center text-sm font-semibold">${l.qty}</span>
        <button data-add="${l.id}" class="btn-press w-8 h-8 text-brand-700 text-lg">+</button>
      </div>
      <p class="w-20 text-right font-bold text-brand-800">${fmt(l.price * l.qty)}</p>
      <button data-rm="${l.id}" class="text-red-400 hover:text-red-600 text-lg" aria-label="Remove">🗑</button>
    </div>`).join("") : `<p class="py-10 text-center text-brand-400">Your cart is empty</p>`;

  if (!lines.length) closeCart();
};
const openCart = () => $("cart-modal").classList.remove("hidden");
const closeCart = () => $("cart-modal").classList.add("hidden");
$("open-cart").onclick = openCart;
$("close-cart").onclick = closeCart;
$("cart-backdrop").onclick = closeCart;

/* ---------- Place order ---------- */
$("place-order").onclick = async () => {
  const lines = cartLines();
  if (!lines.length) return;
  if (!state.table) { closeCart(); $("table-modal").classList.remove("hidden"); return; }

  const btn = $("place-order");
  btn.disabled = true;
  $("place-label").innerHTML = `<span class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> Placing order…`;

  try {
    const bill = calcBill(lines);
    const code = "JB-" + Math.floor(1000 + Math.random() * 9000);
    const ref = await addDoc(ordersCol, {
      orderCode: code,
      table: state.table,
      customerName: state.customerName,
      items: lines.map((l) => ({ id: l.id, name: l.name, price: l.price, qty: l.qty })),
      subtotal: bill.subtotal, tax: bill.tax, total: bill.total,
      note: $("order-note").value.trim(),
      status: "pending",
      createdAt: serverTimestamp()
    });

    trackOrder(ref.id, {
      orderCode: code,
      table: state.table,
      customerName: state.customerName,
      total: bill.total,
      status: "pending"
    });
    state.cart = {}; saveCart(); $("order-note").value = "";
    renderMenu(); renderCart(); closeCart();
    showConfirmation();
  } catch (err) {
    console.error(err);
    toast("Could not place order. Please try again or call a waiter.", "err");
  } finally {
    btn.disabled = false;
    $("place-label").textContent = "Place Order";
  }
};

/* ---------- Confirmation + live tracking ---------- */
const STEPS = [
  { key: "pending", label: "Received" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "completed", label: "Served" }
];
const MESSAGES = {
  pending: "⏳ Waiting for the kitchen to accept your order…",
  preparing: "👩‍🍳 Our chefs are preparing your order!",
  ready: "🔔 Your order is ready and on its way to your table!",
  completed: "🎉 Enjoy your meal! Thank you for visiting Jannat Bakery.",
  cancelled: "❌ This order was cancelled. Please speak to our staff."
};

const orderPosition = (id) => {
  const position = state.pendingPositions.get(id);
  return position ? `Pending position: ${position} of ${state.pendingOrderCount}` : "Pending position: updating…";
};

const orderSteps = (status) => {
  const idx = STEPS.findIndex((s) => s.key === status);
  return STEPS.map((s, i) => {
    const cls = status === "cancelled" ? "" : i < idx || status === "completed" ? "done" : i === idx ? "current" : "";
    return `<div class="flex-1 flex flex-col items-center gap-1">
      <div class="step-dot ${cls}">${cls === "done" ? "✓" : i + 1}</div>
      <span class="text-[11px] ${cls ? "text-brand-800 font-semibold" : "text-stone-400"}">${s.label}</span></div>`;
  }).join("");
};

const renderConfirmation = () => {
  const orders = state.confirmationOrderIds
    .map((id) => ({ id, ...state.trackedOrders.get(id) }))
    .filter((order) => order.orderCode);
  $("confirm-title").textContent = orders.length > 1 ? "Orders Placed!" : "Order Placed!";
  $("confirm-message").textContent = orders.length > 1
    ? "Thank you! Your orders have gone to our kitchen."
    : "Thank you! Your order has gone to our kitchen.";
  $("cf-orders").innerHTML = orders.map((o) => {
    const status = o.status || "pending";
    const statusLabel = STATUS[status]?.label || STATUS.pending.label;
    const position = status === "pending" ? `<p class="mt-2 text-xs font-semibold text-amber-800">${orderPosition(o.id)}</p>` : "";
    return `<article class="bg-brand-50 rounded-2xl p-4 text-sm">
      <div class="space-y-1">
        <div class="flex justify-between gap-3"><span class="text-brand-500">Order ID</span><span class="font-mono font-bold text-right">${esc(o.orderCode || o.id)}</span></div>
        <div class="flex justify-between gap-3"><span class="text-brand-500">Table Number</span><span class="font-semibold">Table ${esc(o.table)}</span></div>
        ${o.customerName ? `<div class="flex justify-between gap-3"><span class="text-brand-500">Name</span><span class="font-semibold">${esc(o.customerName)}</span></div>` : ""}
        <div class="flex justify-between gap-3"><span class="text-brand-500">Total Amount</span><span class="font-bold">${fmt(o.total)}</span></div>
        <div class="flex justify-between gap-3 pt-1"><span class="text-brand-500">Status</span><span class="font-semibold">${esc(statusLabel)}</span></div>
      </div>
      ${position}
      <div class="mt-4 flex items-start justify-between text-center">${orderSteps(status)}</div>
      <p class="mt-4 text-center text-sm font-medium text-brand-700">${MESSAGES[status] || ""}</p>
    </article>`;
  }).join("");
};

const showConfirmation = () => {
  state.confirmationOrderIds = [...state.trackedOrderIds];
  renderConfirmation();
  $("confirm-modal").classList.remove("hidden");
};

const saveTrackedOrderIds = () => {
  try {
    localStorage.setItem("jb_active_orders", JSON.stringify(state.trackedOrderIds));
    localStorage.removeItem("jb_last_order");
  } catch (err) {
    console.error("Could not save active order tracking", err);
  }
};

const trackOrder = (id, initialOrder = null) => {
  if (!state.trackedOrderIds.includes(id)) state.trackedOrderIds.push(id);
  if (initialOrder) state.trackedOrders.set(id, { id, ...initialOrder });
  saveTrackedOrderIds();
  renderTrackChip();
  if (state.trackUnsubs.has(id)) return;
  const unsubscribe = onSnapshot(doc(db, "orders", id), (snap) => {
    if (!snap.exists()) {
      state.trackedOrderIds = state.trackedOrderIds.filter((orderId) => orderId !== id);
      state.trackedOrders.delete(id);
      state.trackUnsubs.get(id)?.();
      state.trackUnsubs.delete(id);
      saveTrackedOrderIds();
      renderTrackChip();
      renderConfirmation();
      return;
    }

    const order = { id: snap.id, ...snap.data() };
    state.trackedOrders.set(id, order);
    if (order.status === "completed" || order.status === "cancelled") {
      state.trackedOrderIds = state.trackedOrderIds.filter((orderId) => orderId !== id);
      saveTrackedOrderIds();
      state.trackUnsubs.get(id)?.();
      state.trackUnsubs.delete(id);
    }
    renderTrackChip();
    if (!$("confirm-modal").classList.contains("hidden")) renderConfirmation();
  }, (err) => {
    console.error("Could not track order", err);
    toast("Could not update order tracking. Please refresh the page.", "err");
  });
  state.trackUnsubs.set(id, unsubscribe);
};

onSnapshot(query(ordersCol, where("status", "==", "pending")), (snap) => {
  const pendingOrders = snap.docs.sort((a, b) => {
    const aTime = a.data().createdAt?.toMillis?.() || 0;
    const bTime = b.data().createdAt?.toMillis?.() || 0;
    return aTime - bTime || a.id.localeCompare(b.id);
  });
  state.pendingPositions = new Map(pendingOrders.map((order, index) => [order.id, index + 1]));
  state.pendingOrderCount = pendingOrders.length;
  renderTrackChip();
  if (!$("confirm-modal").classList.contains("hidden")) renderConfirmation();
}, (err) => {
  console.error("Could not load pending order positions", err);
  toast("Could not load pending order positions.", "err");
});

const renderTrackChip = () => {
  const chip = $("track-chip");
  const orders = state.trackedOrderIds
    .map((id) => state.trackedOrders.get(id))
    .filter(Boolean);
  if (!orders.length) { chip.classList.add("hidden"); chip.innerHTML = ""; return; }
  chip.classList.remove("hidden");
  chip.innerHTML = `<div class="bg-white border border-amber-300 rounded-2xl px-4 py-3 shadow-sm">
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm font-bold text-brand-800">📦 ${orders.length === 1 ? "Active order" : `${orders.length} active orders`}</p>
        <button data-track-orders class="text-amber-700 font-semibold text-sm">Track all →</button>
      </div>
      <ul class="mt-2 space-y-1 text-sm">${orders.map((o) => {
        const status = o.status || "pending";
        const statusLabel = STATUS[status]?.label || STATUS.pending.label;
        const position = status === "pending" ? ` · ${orderPosition(o.id)}` : "";
        return `<li>Table <b>${esc(o.table)}</b> · ${esc(statusLabel)}${esc(position)}</li>`;
      }).join("")}</ul>
    </div>`;
  chip.querySelector("[data-track-orders]").onclick = showConfirmation;
};

$("cf-close").onclick = () => $("confirm-modal").classList.add("hidden");

/* Resume tracking if the customer reloads the page */
const resumeTracking = () => {
  try {
    const savedIds = JSON.parse(localStorage.getItem("jb_active_orders") || "null");
    const lastOrder = JSON.parse(localStorage.getItem("jb_last_order") || "null");
    const ids = Array.isArray(savedIds) ? savedIds : [];
    if (lastOrder?.id) ids.push(lastOrder.id);
    state.trackedOrderIds = [...new Set(ids.filter((id) => typeof id === "string" && id))];
    state.trackedOrderIds.forEach((id) => trackOrder(id));
    saveTrackedOrderIds();
  } catch (err) {
    console.error("Could not restore active order tracking", err);
    toast("Could not restore order tracking.", "err");
  }
};

/* ---------- Boot ---------- */
loadCart();
initTable();
renderCart();
resumeTracking();
