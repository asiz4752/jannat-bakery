# 🥐 Jannat Bakery – Table Ordering System

Three apps, one Firestore database, real-time everywhere:

| Page | URL | Who uses it |
|---|---|---|
| `index.html` | `index.html?table=05` | Customers (mobile) |
| `admin.html` | `admin.html` | Owner / manager (tablet, desktop) |
| `kitchen.html` | `kitchen.html` | Kitchen staff (tablet / wall screen) |

Shared files: `firebase-config.js`, `tailwind-config.js`, `styles.css`, plus `customer.js`, `admin.js`, `kitchen.js`.

## 1. Create the Firebase project (5 minutes)
1. Go to <https://console.firebase.google.com> → **Add project**.
2. **Build → Firestore Database → Create database** (start in *test mode* for the first run).
3. **Project settings → Your apps → Web (</>)** → register an app → copy the `firebaseConfig` object.
4. Paste it into `firebase-config.js`. Also change `APP.adminPin` from `1234`.

## 2. Run it
ES modules don't work from `file://`, so serve the folder over HTTP:

```bash
cd jannat-bakery
python3 -m http.server 8080      # or: npx serve .
```
Open `http://localhost:8080/admin.html`, unlock with your PIN, go to **Menu → Load sample menu**, then open `index.html?table=05` on a phone and place an order. Open `kitchen.html`, tap **Start Kitchen Display**, and watch it arrive with a chime.

## 3. Deploy
Any static host works. With Firebase Hosting:
```bash
npm i -g firebase-tools
firebase login && firebase init hosting   # public dir: . ; single-page app: No
firebase deploy
```
Netlify / Vercel / GitHub Pages also work – just upload the folder.

## 4. Table QR codes
Generate one QR code per table pointing to `https://YOUR-DOMAIN/index.html?table=01`, `...=02`, etc. (any free QR generator works) and print them for the tables.

## Firestore data model
- `menu/{id}` → `name, category, price, description, emoji, imageUrl, available`
- `orders/{id}` → `orderCode, table, items[{id,name,price,qty}], subtotal, tax, total, note, status, createdAt`
- Order status flow: `pending → preparing → ready → completed` (or `cancelled`)

## Customising
- Tax rate / currency / PIN: `APP` object in `firebase-config.js`
- Colours: `tailwind-config.js` (`brand` palette)

## ⚠️ Going to production (important)
The admin PIN is a **convenience lock in browser code** – anyone who views the page source can read it, and the sample `firestore.rules` allow open writes so the app works out of the box. Before real use:
1. Enable **Firebase Authentication** (Email/Password) and create accounts for admin and kitchen staff.
2. Sign staff in on `admin.html` / `kitchen.html` (`signInWithEmailAndPassword`).
3. Tighten `firestore.rules`: public `read` on `menu`; `write` on `menu` and `update` on `orders` only when `request.auth != null`; keep public `create` on `orders` with validation.
4. Optionally add Firebase App Check to block bots from spamming orders.
