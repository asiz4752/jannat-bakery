/* =========================================================
 * Jannat Bakery – shared Firebase config & helpers
 * Used by index.html, admin.html and kitchen.html
 * ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* 1) PASTE YOUR FIREBASE WEB APP CONFIG HERE
 *    Firebase Console → Project settings → Your apps → Web app → Config */
export const firebaseConfig = {
  apiKey: "AIzaSyDDwUEd_0uFRS0tlVpTOw4E6Javwm6G_NE",
  authDomain: "jannath-bakery.firebaseapp.com",
  projectId: "jannath-bakery",
  storageBucket: "jannath-bakery.firebasestorage.app",
  messagingSenderId: "635477594995",
  appId: "1:635477594995:web:68ec2077699b4d6964eb06",
  measurementId: "G-4T8V984NQS"
};

/* 2) App settings */
export const APP = {
  name: "Jannat Bakery",
  currency: "₹",
  taxRate: 0,             // GST disabled for this bakery
  taxLabel: "GST (0%)",
  adminPin: "1234"        // CHANGE THIS. Client-side gate only – see README for real security.
};

export const isConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  !/^(YOUR_|<)/i.test(firebaseConfig.apiKey) &&
  !/^(YOUR_|<)/i.test(firebaseConfig.projectId)
);

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

/* Collection references */
export const menuCol = collection(db, "menu");
export const ordersCol = collection(db, "orders");

/* Re-export Firestore helpers so pages only import from this file */
export {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, orderBy, limit, serverTimestamp, writeBatch
};

/* ---------- Shared helpers ---------- */
export const fmt = (n) => APP.currency + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Firestore timestamps are null briefly before the server confirms a write */
export const toDate = (o) => (o && o.createdAt && o.createdAt.toDate ? o.createdAt.toDate() : new Date());

export const timeStr = (d) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

export const minutesAgo = (d) => Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));

export const calcBill = (items) => {
  const list = Array.isArray(items) ? items : Object.values(items || {});
  const subtotal = list.reduce((s, i) => {
    const price = Number(i?.price || 0);
    const qty = Number(i?.qty || 0);
    return s + (price * qty);
  }, 0);
  const tax = +(subtotal * APP.taxRate).toFixed(2);
  return { subtotal: +subtotal.toFixed(2), tax, total: +(subtotal + tax).toFixed(2) };
};

/* Order status workflow */
export const STATUS = {
  pending:   { label: "Pending",        cls: "bg-amber-100 text-amber-800 border-amber-300",   next: "preparing", nextLabel: "Start Preparing" },
  preparing: { label: "Preparing",      cls: "bg-blue-100 text-blue-800 border-blue-300",      next: "ready",     nextLabel: "Mark Ready" },
  ready:     { label: "Ready to Serve", cls: "bg-green-100 text-green-800 border-green-300",   next: "completed", nextLabel: "Complete" },
  completed: { label: "Completed",      cls: "bg-stone-100 text-stone-600 border-stone-300",   next: null },
  cancelled: { label: "Cancelled",      cls: "bg-red-100 text-red-700 border-red-300",         next: null }
};

export const statusBadge = (s) => {
  const st = STATUS[s] || STATUS.pending;
  return `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${st.cls}">${st.label}</span>`;
};

export const toast = (msg, type = "ok") => {
  let box = document.getElementById("toast-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast-box";
    box.className = "fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center pointer-events-none";
    document.body.appendChild(box);
  }
  const t = document.createElement("div");
  t.className = "toast-pop px-4 py-2 rounded-xl shadow-lg text-sm font-medium text-white " + (type === "err" ? "bg-red-600" : "bg-brand-800");
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 2800);
};

/* Show a banner if Firebase hasn't been configured yet */
export const configBanner = () => {
  if (isConfigured) return;
  const d = document.createElement("div");
  d.className = "bg-red-600 text-white text-center text-sm py-2 px-3";
  d.innerHTML = "⚠️ Firebase is not configured. Open <code class='font-mono bg-red-700 px-1 rounded'>firebase-config.js</code> and paste your project config.";
  document.body.prepend(d);
};

/* Sample menu used by the admin "Load sample menu" button */
export const SEED_MENU = [
  { name: "Chocolate Truffle Cake", category: "Cakes", price: 450, emoji: "🍰", description: "Rich dark chocolate layers with silky ganache (500g)" },
  { name: "Red Velvet Slice", category: "Cakes", price: 140, emoji: "🍰", description: "Cream cheese frosting, soft crumb" },
  { name: "Black Forest Pastry", category: "Cakes", price: 90, emoji: "🧁", description: "Cherries, whipped cream & chocolate shavings" },
  { name: "Butter Croissant", category: "Bakery", price: 80, emoji: "🥐", description: "Flaky, buttery, baked fresh every morning" },
  { name: "Garlic Bread", category: "Bakery", price: 110, emoji: "🥖", description: "Toasted with herb butter and cheese" },
  { name: "Veg Puff", category: "Snacks", price: 40, emoji: "🥟", description: "Crispy puff pastry with spiced vegetable filling" },
  { name: "Chicken Sandwich", category: "Snacks", price: 150, emoji: "🥪", description: "Grilled chicken, lettuce, mayo on brown bread" },
  { name: "Paneer Tikka Burger", category: "Snacks", price: 170, emoji: "🍔", description: "Smoky paneer patty with mint mayo" },
  { name: "French Fries", category: "Snacks", price: 99, emoji: "🍟", description: "Golden, salted, with peri-peri dip" },
  { name: "Hot Coffee", category: "Beverages", price: 70, emoji: "☕", description: "Freshly brewed filter coffee" },
  { name: "Masala Chai", category: "Beverages", price: 40, emoji: "🍵", description: "Ginger-cardamom tea" },
  { name: "Cold Coffee", category: "Beverages", price: 120, emoji: "🧋", description: "Chilled, creamy and lightly sweet" },
  { name: "Fresh Lime Soda", category: "Beverages", price: 60, emoji: "🥤", description: "Sweet, salted or mixed" },
  { name: "Mango Milkshake", category: "Beverages", price: 130, emoji: "🥭", description: "Thick shake with Alphonso pulp" }
].map((i) => ({ ...i, available: true, imageUrl: "" }));
