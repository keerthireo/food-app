let cart = [];
let menuData = [];
let query = "";
let dealsOnly = false;
let restaurantFilter = "";
let favorites = [];
let favOnly = false;

// Prevents broken HTML if a name contains special characters
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// Picks an emoji from the dish name (no image files needed)
function emojiFor(name) {
  let n = name.toLowerCase();
  if (n.includes("burger")) return "🍔";
  if (n.includes("pizza")) return "🍕";
  if (n.includes("dosa")) return "🥞";
  if (n.includes("biryani") || n.includes("rice")) return "🍛";
  if (n.includes("noodle")) return "🍜";
  if (n.includes("sandwich")) return "🥪";
  if (n.includes("fries")) return "🍟";
  if (n.includes("cake") || n.includes("dessert")) return "🍰";
  if (n.includes("coffee") || n.includes("tea")) return "☕";
  return "🍽️";
}

function toast(msg) {
  let t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, 2000);
}

function toggleCart() {
  document.getElementById("cart-panel").classList.toggle("open");
}

function toggleFavOnly() {
  favOnly = !favOnly;
  document.getElementById("chip-fav").classList.toggle("active", favOnly);
  renderMenu();
}

async function toggleFavorite(id) {
  let response = await fetch("/api/favorites/" + id, { method: "POST" });
  if (!response.ok) {
    toast("Login as a customer to save favorites");
    return;
  }
  let data = await response.json();
  if (data.saved) favorites.push(id);
  else favorites = favorites.filter(function (f) { return f !== id; });
  renderMenu();
}

/* ---------- MENU ---------- */

async function loadMenu() {
  let response = await fetch("/api/menu");
  menuData = await response.json();
    fillRestaurants();
      let favResponse = await fetch("/api/favorites");
  favorites = favResponse.ok ? await favResponse.json() : [];
  renderMenu();
}

function renderMenu() {
  let html = "";
  for (let item of menuData) {
    if (dealsOnly && !item.on_deal) continue;
    if (!item.name.toLowerCase().includes(query)) continue;
    if (restaurantFilter && item.restaurant_name !== restaurantFilter) continue;
    if (favOnly && !favorites.includes(item.id)) continue;


    let priceHtml = "₹" + item.price;
    let badge = "";
    if (item.on_deal) {
      priceHtml = '<span class="old">₹' + item.price + "</span><b>₹" + item.current_price + "</b>";
      badge = '<span class="badge">DEAL</span>';
    }

    html +=
      '<div class="card">' +
        '<div class="thumb">' + (item.image ? '<img src="' + esc(item.image) + '" alt="">' : emojiFor(item.name)) + badge + "</div>" +
        '<div class="info">' +
          "<h3>" + esc(item.name) + "</h3>" +
                   '<div class="rest-row"><p class="muted">' + esc(item.restaurant_name || "") + "</p>" +
            '<button class="fav" onclick="toggleFavorite(' + item.id + ')">' + (favorites.includes(item.id) ? "♥" : "♡") + "</button></div>" +
          '<p class="price">' + priceHtml + "</p>" +
          '<button onclick="addToCart(' + item.id + ')">Add to cart</button>' +
        "</div>" +
      "</div>";
  }
  document.getElementById("menu").innerHTML = html || '<p class="empty">No items found</p>';
}

function setFilter(deals) {
  dealsOnly = deals;
  document.getElementById("chip-all").classList.toggle("active", !deals);
  document.getElementById("chip-deals").classList.toggle("active", deals);

  renderMenu();
}
function fillRestaurants() {
  let names = [];
  for (let item of menuData) {
    if (item.restaurant_name && !names.includes(item.restaurant_name)) names.push(item.restaurant_name);
  }
  let html = '<option value="">All restaurants</option>';
  for (let n of names) {
    html += '<option value="' + esc(n) + '">' + esc(n) + "</option>";
  }
  let select = document.getElementById("restaurant-select");
  select.innerHTML = html;
  select.value = restaurantFilter;
}

document.getElementById("restaurant-select").onchange = function (e) {
  restaurantFilter = e.target.value;
  renderMenu();
};

document.getElementById("search").oninput = function (e) {
  query = e.target.value.toLowerCase();
  renderMenu();
};

/* ---------- CART ---------- */

function addToCart(id) {
  let item = menuData.find(function (m) { return m.id === id; });
  cart.push({ id: item.id, name: item.name, price: item.current_price });
  showCart();
  toast(item.name + " added");
}

function changeQty(id, delta) {
  if (delta > 0) {
    let existing = cart.find(function (c) { return c.id === id; });
    cart.push({ id: existing.id, name: existing.name, price: existing.price });
  } else {
    let index = cart.findIndex(function (c) { return c.id === id; });
    if (index !== -1) cart.splice(index, 1);
  }
  showCart();
}

function showCart() {
  // Group the flat cart array by item id
  let groups = {};
  let total = 0;
  for (let item of cart) {
    if (!groups[item.id]) groups[item.id] = { id: item.id, name: item.name, price: item.price, qty: 0 };
    groups[item.id].qty++;
    total += item.price;
  }

  let html = "";
  for (let id in groups) {
    let g = groups[id];
    html +=
      '<div class="cart-row">' +
        "<span>" + esc(g.name) + "</span>" +
        '<span class="qty">' +
          '<button onclick="changeQty(' + g.id + ', -1)">−</button>' + g.qty +
          '<button onclick="changeQty(' + g.id + ', 1)">+</button>' +
        "</span>" +
        "<span>₹" + g.price * g.qty + "</span>" +
      "</div>";
  }

  document.getElementById("cart-list").innerHTML = html || '<p class="empty">Your cart is empty</p>';
  document.getElementById("total").innerText = total;
  document.getElementById("cart-count").innerText = cart.length;
  document.getElementById("place-order").disabled = cart.length === 0;
}

async function placeOrder() {
  if (cart.length === 0) {
    toast("Your cart is empty");
    return;
  }
  let response = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: cart.map(function (i) { return i.id; }) })
  });
  let data = await response.json();

  if (response.ok) {
    cart = [];
    showCart();
    toggleCart();
    toast("Order placed! See it under My orders.");
  } else {
    toast(data.error);
    if (response.status === 403) {
      setTimeout(function () { window.location.href = "login.html"; }, 1500);
    }
  }
}

/* ---------- USER ---------- */

async function loadUser() {
  let response = await fetch("/api/me");
  let me = await response.json();
  let bar = document.getElementById("user-bar");
  if (me.loggedIn) {
    bar.innerHTML = "<span>Hello, " + esc(me.name) + '</span> <a href="orders.html">My orders</a> <button onclick="logout()">Logout</button>';
  } else {
    bar.innerHTML = '<a href="login.html">Login / Register</a>';
  }
}

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "login.html";
}

loadMenu();
loadUser();
showCart();