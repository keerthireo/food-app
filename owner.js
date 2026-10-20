async function checkOwner() {
  let response = await fetch("/api/me");
  let me = await response.json();
  if (!me.loggedIn || me.role !== "owner") {
    window.location.href = "login.html";
  }
}
checkOwner();

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function toast(msg) {
  let t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, 2000);
}

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "login.html";
}

async function loadMenu() {
 const response = await fetch("/api/my-menu");
  let menu = await response.json();
  let menuDiv = document.getElementById("menu");
  menuDiv.innerHTML = "";

  for (let item of menu) {
    let dealHtml = "";
    if (item.on_deal) {
      dealHtml =
        "<p>🔥 Deal: ₹" + item.discount_price + "</p>" +
        '<p class="muted">Until ' + item.deal_expires_at.replace("T", " ") + "</p><br>" +
        '<button onclick="removeDeal(' + item.id + ')">Remove deal</button>';
    } else {
      dealHtml =
        '<input id="dp-' + item.id + '" type="number" placeholder="Deal price">' +
        '<input id="de-' + item.id + '" type="datetime-local">' +
        '<button onclick="setDeal(' + item.id + ')">Set deal</button>';
    }
    menuDiv.innerHTML +=
      '<div class="card">' + (item.image ? '<img src="' + esc(item.image) + '" alt="">' : "") + '<div class="info">' +
      "<h3>" + esc(item.name) + "</h3>" +
      '<p class="price">₹' + item.price + "</p>" +
      '<button class="danger" onclick="deleteItem(' + item.id + ')">Delete</button>' +
      "<hr>" + dealHtml +
      "</div></div>";
  }
}


async function addItem() {
  let name = document.getElementById("name").value;
  let price = document.getElementById("price").value;

  if (!name || !price) {
    toast("Enter a name and a price");
    return;
  }

  await fetch("/api/menu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name, price: price })
  });

  document.getElementById("name").value = "";
  document.getElementById("price").value = "";
  toast("Item added");
  loadMenu();
}

async function deleteItem(id) {
  if (!confirm("Delete this item?")) return;
  await fetch("/api/menu/" + id, { method: "DELETE" });
  loadMenu();
}

async function setDeal(id) {
  let price = document.getElementById("dp-" + id).value;
  let expires = document.getElementById("de-" + id).value;
  let response = await fetch("/api/deals/" + id, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ discount_price: price, deal_expires_at: expires })
  });
  let data = await response.json();
  if (!response.ok) {
    toast(data.error);
  }
  loadMenu();
}

async function removeDeal(id) {
  await fetch("/api/deals/" + id, { method: "DELETE" });
  loadMenu();
}

async function loadOrders() {
  loadQueue();
  let response = await fetch("/api/orders");
  if (!response.ok) return;
  let orders = await response.json();
  let div = document.getElementById("orders");
  div.innerHTML = "";

  if (orders.length === 0) {
    div.innerHTML = '<p class="empty">No orders yet.</p>';
    return;
  }

  let statuses = ["Placed", "Preparing", "Out for delivery", "Delivered"];

  for (let o of orders) {
    let lines = "";
    for (let it of o.items) {
      lines += "<li>" + esc(it.name) + " x " + it.quantity + "</li>";
    }
    let options = "";
    for (let s of statuses) {
      options += '<option value="' + s + '"' + (s === o.status ? " selected" : "") + ">" + s + "</option>";
    }
    div.innerHTML +=
      '<div class="card"><div class="info">' +
      "<h3>Order #" + o.id + "</h3>" +
      "<p>Customer: " + esc(o.customer) + "</p>" +
      '<p class="muted">📍 ' + esc(o.customer_address || "") + ", " + esc(o.customer_area || "") + "</p>" +
      "<ul>" + lines + "</ul>" +
      '<p class="price">Total: ₹' + o.total + "</p>" +
      '<p class="muted">' + o.created_at + "</p><br>" +
      '<select onchange="updateStatus(' + o.id + ', this.value)">' + options + "</select>" +
      "</div></div>";
  }
}

async function updateStatus(id, status) {
  await fetch("/api/orders/" + id + "/status", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: status })
  });
  toast("Status updated");
  loadOrders();
}

loadMenu();
loadOrders();


async function loadQueue() {
  let response = await fetch("/api/queue");
  if (!response.ok) return;
  let data = await response.json();
  document.getElementById("queue-view").textContent = data.waiting.length
    ? data.waiting.map(function (id) { return "#" + id; }).join("  →  ")
    : "empty";
}

async function nextOrder() {
  let response = await fetch("/api/queue/next", { method: "POST" });
  let data = await response.json();
  if (!response.ok) {
    toast(data.error);
    return;
  }
  toast("Order #" + data.orderId + " moved to Preparing");
  loadQueue();
  loadOrders();
}