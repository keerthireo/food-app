function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// "Out for delivery" -> "out-for-delivery" (used for the badge color)
function statusClass(status) {
  return "status-" + status.toLowerCase().replace(/ /g, "-");
}

// "UPI - Paid", "Card ending 4242 - Paid", "Cash on delivery - Pending"
function payText(o) {
  let method = o.payment_method === "UPI" ? "UPI"
    : o.payment_method === "CARD" ? "Card ending " + esc(o.card_last4 || "")
    : "Cash on delivery";
  let ref = o.payment_ref ? " (ref " + esc(o.payment_ref) + ")" : "";
  return method + " - " + esc(o.payment_status) + ref;
}

async function loadOrders() {
  let response = await fetch("/api/my-orders");
  if (response.status === 403) {
    window.location.href = "login.html";
    return;
  }
  let orders = await response.json();
  let div = document.getElementById("orders");
  div.innerHTML = "";

  if (orders.length === 0) {
    div.innerHTML = '<p class="empty">No orders yet. <a href="index.html">Order something tasty!</a></p>';
    return;
  }

  for (let o of orders) {
    let lines = "";
    for (let it of o.items) {
      lines += "<li>" + esc(it.name) + " x " + it.quantity + " - ₹" + it.price * it.quantity + "</li>";
    }

        let routeHtml = "";
    if (o.route) {
      routeHtml =
        '<p class="muted">🛵 ' + esc(o.restaurant_name || "Restaurant") + " → you</p>" +
        "<p>" + o.route.path.map(esc).join(" → ") + "</p>" +
        '<p class="muted">' + o.route.km + " km · about " + o.route.eta_min + " min</p>" +
        '<p class="muted">📍 ' + esc(o.delivery_address || "") + ", " + esc(o.delivery_area || "") + "</p>";
    }

    div.innerHTML +=
      '<div class="card"><div class="info">' +
      "<h3>Order #" + o.id + "</h3>" +
      '<span class="status ' + statusClass(o.status) + '">' + esc(o.status) + "</span>" +
      "<ul>" + lines + "</ul>" +
      '<p class="price">Total: ₹' + o.total + "</p>" +
      '<p class="muted">💳 ' + payText(o) + "</p>" +
       routeHtml +
      '<p class="muted">' + o.created_at + "</p>" +
      "</div></div>";
  }
}

loadOrders();