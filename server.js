const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { DatabaseSync } = require("node:sqlite");
const { Queue, Graph, buildCityMap } = require("./dsa");
const fs = require("fs");
const path = require("path");
const cityMap = buildCityMap();

const app = express();
const db = new DatabaseSync("food.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Placed',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    menu_item_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    quantity INTEGER NOT NULL
  );
`);

try { db.exec("ALTER TABLE menu_items ADD COLUMN discount_price INTEGER"); } catch (e) {}
try { db.exec("ALTER TABLE menu_items ADD COLUMN deal_expires_at TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN restaurant_name TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN area TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE users ADD COLUMN address TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE menu_items ADD COLUMN image TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE menu_items ADD COLUMN restaurant_id INTEGER"); } catch (e) {}
try { db.exec("ALTER TABLE orders ADD COLUMN restaurant_id INTEGER"); } catch (e) {}
// Simulated payment: method (COD / UPI / CARD), status (Paid / Pending), a reference and the last 4 card digits
try { db.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE orders ADD COLUMN payment_status TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE orders ADD COLUMN payment_ref TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE orders ADD COLUMN card_last4 TEXT"); } catch (e) {}
db.exec("CREATE TABLE IF NOT EXISTS favorites (user_id INTEGER, menu_item_id INTEGER, PRIMARY KEY (user_id, menu_item_id))");
db.exec("CREATE TABLE IF NOT EXISTS meal_plans (user_id INTEGER, day TEXT, menu_item_id INTEGER, PRIMARY KEY (user_id, day))");
app.use(express.json({ limit: "5mb" }));
app.use(session({ secret: "food-app-secret", resave: false, saveUninitialized: false }));
app.use(express.static(__dirname));

function onlyOwner(req, res, next) {
  if (!req.session.user || req.session.user.role !== "owner") {
    return res.status(403).json({ error: "Owners only" });
  }
  next();
}

function onlyCustomer(req, res, next) {
  if (!req.session.user || req.session.user.role !== "customer") {
    return res.status(403).json({ error: "Please log in as a customer" });
  }
  next();
}

function dealActive(item) {
  return item.discount_price && item.deal_expires_at && new Date(item.deal_expires_at) > new Date();
}

function currentPrice(item) {
  return dealActive(item) ? item.discount_price : item.price;
}

app.post("/api/register", (req, res) => {
  const { name, email, password, role, restaurant_name, area, address } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "All fields are required" });
  }
    if (role === "owner" && !restaurant_name) {
    return res.status(400).json({ error: "Restaurant name is required for owners" });
  }

    if (!area || !cityMap.has(area)) {
    return res.status(400).json({ error: "Please choose your area" });
  }
  if (role === "customer" && !address) {
    return res.status(400).json({ error: "Delivery address is required" });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    return res.status(400).json({ error: "Email already registered" });
  }
  const hash = bcrypt.hashSync(password, 10);
     db.prepare("INSERT INTO users (name, email, password, role, restaurant_name, area, address) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(name, email, hash, role, restaurant_name || null, area || null, address || null);
  res.json({ message: "Registered. Please log in." });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: "Wrong email or password" });
  }
  req.session.user = { id: user.id, name: user.name, role: user.role };
  res.json({ message: "Logged in", role: user.role });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ message: "Logged out" }));
});

app.get("/api/me", (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, name: req.session.user.name, role: req.session.user.role });
  } else {
    res.json({ loggedIn: false });
  } 
});

app.get("/api/menu", (req, res) => {
  const items = db.prepare("SELECT menu_items.*, users.restaurant_name FROM menu_items LEFT JOIN users ON users.id = menu_items.restaurant_id").all();
  const result = items.map((item) => ({
    ...item,
    on_deal: !!dealActive(item),
    current_price: currentPrice(item)
  }));
  res.json(result);
});

app.get("/api/my-menu", onlyOwner, (req, res) => {
  const items = db.prepare("SELECT * FROM menu_items WHERE restaurant_id = ?").all(req.session.user.id);
  res.json(items.map((item) => ({ ...item, on_deal: !!dealActive(item), current_price: currentPrice(item) })));
});

app.post("/api/menu", onlyOwner, (req, res) => {
  const { name, price, image } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: "Name and price are required" });
  }
  let imagePath = null;
  if (image) {
    const match = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(image);
    if (!match) {
      return res.status(400).json({ error: "Please choose a PNG, JPG or WEBP image" });
    }
    fs.mkdirSync(path.join(__dirname, "images"), { recursive: true });
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const fileName = "food-" + Date.now() + "-" + Math.floor(Math.random() * 1000) + "." + ext;
    fs.writeFileSync(path.join(__dirname, "images", fileName), Buffer.from(match[2], "base64"));
    imagePath = "images/" + fileName;
  }
  db.prepare("INSERT INTO menu_items (name, price, restaurant_id, image) VALUES (?, ?, ?, ?)")
    .run(name, Number(price), req.session.user.id, imagePath);
  res.json({ message: "Item added" });
});

app.delete("/api/menu/:id", onlyOwner, (req, res) => { 
  db.prepare("DELETE FROM menu_items WHERE id = ? AND restaurant_id = ?").run(req.params.id, req.session.user.id);
  res.json({ message: "Item deleted" });
});

app.get("/api/deals", (req, res) => {
  const items = db.prepare("SELECT * FROM menu_items").all();
  const deals = items
    .filter((item) => dealActive(item))
    .map((item) => ({ ...item, current_price: currentPrice(item) }));
  res.json(deals);
});

app.post("/api/deals/:id", onlyOwner, (req, res) => {
   const item = db.prepare("SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?").get(req.params.id, req.session.user.id);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }
  const price = Number(req.body.discount_price);
  const expires = req.body.deal_expires_at;
  if (!price || price >= item.price) {
    return res.status(400).json({ error: "Deal price must be less than the normal price" });
  }
  if (!expires || new Date(expires) <= new Date()) {
    return res.status(400).json({ error: "Choose a future expiry time" });
  }
   db.prepare("UPDATE menu_items SET discount_price = ?, deal_expires_at = ? WHERE id = ? AND restaurant_id = ?")
    .run(price, expires, req.params.id, req.session.user.id);
  res.json({ message: "Deal saved" });
});

app.delete("/api/deals/:id", onlyOwner, (req, res) => {
     db.prepare("UPDATE menu_items SET discount_price = NULL, deal_expires_at = NULL WHERE id = ? AND restaurant_id = ?")
    .run(req.params.id, req.session.user.id);
  res.json({ message: "Deal removed" });
});

// ---------- SIMULATED PAYMENT ----------
// No real money moves and no real bank is contacted. This only imitates a payment gateway:
// it checks the details, then answers "paid", "pending" (cash on delivery) or "declined".
const PAYMENT_METHODS = ["COD", "UPI", "CARD"];

// Luhn algorithm: the checksum that every real card number must pass
function luhnValid(number) {
  let sum = 0;
  let double = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let digit = Number(number[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function simulatePayment(payment) {
  const method = payment && payment.method;
  if (!PAYMENT_METHODS.includes(method)) {
    return { ok: false, error: "Please choose a payment method" };
  }

  if (method === "COD") {
    return { ok: true, method: method, status: "Pending", ref: null, last4: null };
  }

  const ref = "SIM-" + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1000);

  if (method === "UPI") {
    const upi = String(payment.upiId || "").trim();
    if (!/^[A-Za-z0-9._-]{2,}@[A-Za-z]{2,}$/.test(upi)) {
      return { ok: false, error: "Enter a valid UPI ID, for example name@upi" };
    }
    return { ok: true, method: method, status: "Paid", ref: ref, last4: null };
  }

  // CARD
  const number = String(payment.cardNumber || "").replace(/\s+/g, "");
  const expiry = String(payment.expiry || "").trim();
  const cvv = String(payment.cvv || "").trim();
  if (!/^\d{16}$/.test(number) || !luhnValid(number)) {
    return { ok: false, error: "Card number is not valid" };
  }
  const m = /^(\d{2})\/(\d{2})$/.exec(expiry);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) {
    return { ok: false, error: "Enter the expiry as MM/YY" };
  }
  const now = new Date();
  const expiresAt = new Date(2000 + Number(m[2]), Number(m[1]), 1);   // first day after the expiry month
  if (expiresAt <= now) {
    return { ok: false, error: "This card has expired" };
  }
  if (!/^\d{3}$/.test(cvv)) {
    return { ok: false, error: "CVV must be 3 digits" };
  }
  // Test card that is always declined (like the test cards of real gateways)
  if (number === "4000000000000002") {
    return { ok: false, error: "Payment declined by the bank (test card). Try another card." };
  }
  // We keep only the last 4 digits. The full number and the CVV are never stored.
  return { ok: true, method: method, status: "Paid", ref: ref, last4: number.slice(-4) };
}

app.post("/api/orders", onlyCustomer, (req, res) => {
  const ids = req.body.items;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Cart is empty" });
  }

  const counts = {};
  for (const id of ids) {
    counts[id] = (counts[id] || 0) + 1;
  }

  let total = 0;
  const lines = [];
  for (const id in counts) {
    const item = db.prepare("SELECT * FROM menu_items WHERE id = ?").get(id);
    if (!item) continue;
    total += currentPrice(item) * counts[id];
    lines.push({ item: item, qty: counts[id] });
  }
  if (lines.length === 0) {
    return res.status(400).json({ error: "No valid items in cart" });
  }
    const restaurantId = lines[0].item.restaurant_id;
  if (lines.some((l) => l.item.restaurant_id !== restaurantId)) {
    return res.status(400).json({ error: "Please order from one restaurant at a time" });
  }

  // Pay first. If the payment fails, no order is created.
  const pay = simulatePayment(req.body.payment || { method: "COD" });
  if (!pay.ok) {
    return res.status(402).json({ error: pay.error });
  }

  const result = db
    .prepare(
      "INSERT INTO orders (user_id, total, status, created_at, restaurant_id, payment_method, payment_status, payment_ref, card_last4) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(req.session.user.id, total, "Placed", new Date().toLocaleString(), restaurantId,
         pay.method, pay.status, pay.ref, pay.last4);
  const orderId = Number(result.lastInsertRowid);
  getQueue(restaurantId).enqueue(orderId);

  const insertLine = db.prepare(
    "INSERT INTO order_items (order_id, menu_item_id, name, price, quantity) VALUES (?, ?, ?, ?, ?)"
  );
  for (const line of lines) {
    insertLine.run(orderId, line.item.id, line.item.name, currentPrice(line.item), line.qty);
  }

  res.json({ message: "Order placed", orderId: orderId, payment_method: pay.method, payment_status: pay.status, payment_ref: pay.ref });
});

app.get("/api/my-orders", onlyCustomer, (req, res) => {
  const me = db.prepare("SELECT area, address FROM users WHERE id = ?").get(req.session.user.id);
  const orders = db
    .prepare(
      "SELECT orders.*, users.restaurant_name, users.area AS restaurant_area FROM orders " +
      "LEFT JOIN users ON users.id = orders.restaurant_id WHERE orders.user_id = ? ORDER BY orders.id DESC"
    )
    .all(req.session.user.id);
  const result = [];
  for (const o of orders) {
    const items = db
      .prepare("SELECT name, price, quantity FROM order_items WHERE order_id = ?")
      .all(o.id);
    // Graph: shortest road route from the restaurant's area to the customer's area
    const route = o.restaurant_area && me.area ? cityMap.shortestPath(o.restaurant_area, me.area) : null;
    result.push({
      id: o.id,
      total: o.total,
      status: o.status,
      created_at: o.created_at,
      items: items,
      payment_method: o.payment_method || "COD",
      payment_status: o.payment_status || "Pending",
      payment_ref: o.payment_ref,
      card_last4: o.card_last4,
      restaurant_name: o.restaurant_name,
      delivery_area: me.area,
      delivery_address: me.address,
      route: route ? { path: route.path, km: route.km, eta_min: route.km * 4 + 10 } : null
    });
  }
  res.json(result);
});

const STATUSES = ["Placed", "Preparing", "Out for delivery", "Delivered"];

app.get("/api/orders", onlyOwner, (req, res) => {
  const orders = db
    .prepare(
      "SELECT orders.id, orders.total, orders.status, orders.created_at, orders.payment_method, orders.payment_status, users.name AS customer, users.address AS customer_address, users.area AS customer_area "  +
       "FROM orders JOIN users ON users.id = orders.user_id WHERE orders.restaurant_id = ? ORDER BY orders.id DESC"
    )
     .all(req.session.user.id);
  const result = [];
  for (const o of orders) {
    const items = db
      .prepare("SELECT name, quantity, price FROM order_items WHERE order_id = ?")
      .all(o.id);
    result.push({
      id: o.id,
      total: o.total,
      status: o.status,
      created_at: o.created_at,
      payment_method: o.payment_method || "COD",
      payment_status: o.payment_status || "Pending",
      customer: o.customer,
      customer_address: o.customer_address,
      customer_area: o.customer_area,
      items: items
    });
  }
  res.json(result);
});

app.put("/api/orders/:id/status", onlyOwner, (req, res) => {
  const status = req.body.status;
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  db.prepare("UPDATE orders SET status = ? WHERE id = ? AND restaurant_id = ?").run(status, req.params.id, req.session.user.id);
  // Cash on delivery is collected when the food is handed over, so it becomes Paid on delivery
  if (status === "Delivered") {
    db.prepare("UPDATE orders SET payment_status = 'Paid' WHERE id = ? AND restaurant_id = ? AND payment_method = 'COD'")
      .run(req.params.id, req.session.user.id);
  }
  res.json({ message: "Status updated" });
});
// List the item ids this customer has saved
app.get("/api/favorites", onlyCustomer, (req, res) => {
  const rows = db.prepare("SELECT menu_item_id FROM favorites WHERE user_id = ?").all(req.session.user.id);
  res.json(rows.map((r) => r.menu_item_id));
});

// Save or un-save an item (toggle)
app.post("/api/favorites/:id", onlyCustomer, (req, res) => {
  const userId = req.session.user.id;
  const itemId = Number(req.params.id);
  const existing = db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND menu_item_id = ?").get(userId, itemId);
  if (existing) {
    db.prepare("DELETE FROM favorites WHERE user_id = ? AND menu_item_id = ?").run(userId, itemId);
    return res.json({ saved: false });
  }
  db.prepare("INSERT INTO favorites (user_id, menu_item_id) VALUES (?, ?)").run(userId, itemId);
  res.json({ saved: true });
});

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Get this customer's weekly plan
app.get("/api/meal-plan", onlyCustomer, (req, res) => {
  const rows = db
    .prepare(
      "SELECT meal_plans.day, menu_items.id AS item_id, menu_items.name, menu_items.price, users.restaurant_name " +
      "FROM meal_plans JOIN menu_items ON menu_items.id = meal_plans.menu_item_id " +
      "LEFT JOIN users ON users.id = menu_items.restaurant_id WHERE meal_plans.user_id = ?"
    )
    .all(req.session.user.id);
  res.json(rows);
});

// Set (or replace) the dish for a day
app.post("/api/meal-plan", onlyCustomer, (req, res) => {
  const { day, item_id } = req.body;
  if (!DAYS.includes(day) || !item_id) {
    return res.status(400).json({ error: "Valid day and item are required" });
  }
  const item = db.prepare("SELECT id FROM menu_items WHERE id = ?").get(item_id);
  if (!item) {
    return res.status(404).json({ error: "Item not found" });
  }
  db.prepare("INSERT OR REPLACE INTO meal_plans (user_id, day, menu_item_id) VALUES (?, ?, ?)")
    .run(req.session.user.id, day, item_id);
  res.json({ message: "Saved" });
});

// Clear a day
app.delete("/api/meal-plan/:day", onlyCustomer, (req, res) => {
  db.prepare("DELETE FROM meal_plans WHERE user_id = ? AND day = ?").run(req.session.user.id, req.params.day);
  res.json({ message: "Cleared" });
});

// HashMap: restaurant id -> Queue of waiting order ids (FIFO)
const orderQueues = new Map();

function getQueue(restaurantId) {
  if (!orderQueues.has(restaurantId)) orderQueues.set(restaurantId, new Queue());
  return orderQueues.get(restaurantId);
}

// Rebuild the queues from the database when the server starts
const waitingOrders = db.prepare("SELECT id, restaurant_id FROM orders WHERE status = 'Placed' ORDER BY id").all();
for (const o of waitingOrders) getQueue(o.restaurant_id).enqueue(o.id);

// Owner: see the waiting queue (front = next to cook)
app.get("/api/queue", onlyOwner, (req, res) => {
  const ids = getQueue(req.session.user.id).toArray().filter((id) => {
    const row = db.prepare("SELECT status FROM orders WHERE id = ?").get(id);
    return row && row.status === "Placed";
  });
  res.json({ waiting: ids });
});

// Owner: take the next order from the front of the queue
app.post("/api/queue/next", onlyOwner, (req, res) => {
  const queue = getQueue(req.session.user.id);
  let orderId = queue.dequeue();
  while (orderId !== null) {
    const row = db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId);
    if (row && row.status === "Placed") break;
    orderId = queue.dequeue();
  }
  if (orderId === null) {
    return res.status(404).json({ error: "No orders waiting" });
  }
  db.prepare("UPDATE orders SET status = 'Preparing' WHERE id = ? AND restaurant_id = ?").run(orderId, req.session.user.id);
  res.json({ orderId: orderId });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running at http://localhost:" + PORT);
});