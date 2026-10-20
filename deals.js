function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

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

async function loadDeals() {
  let response = await fetch("/api/deals");
  let deals = await response.json();
  let div = document.getElementById("deals");
  div.innerHTML = "";

  if (deals.length === 0) {
    div.innerHTML = '<p class="empty">No deals right now. Check back soon!</p>';
    return;
  }

  for (let d of deals) {
    let saved = Math.round((1 - d.discount_price / d.price) * 100);
    div.innerHTML +=
      '<div class="card">' +
        '<div class="thumb">' + emojiFor(d.name) + '<span class="badge">' + saved + "% OFF</span></div>" +
        '<div class="info">' +
          "<h3>" + esc(d.name) + "</h3>" +
          '<p class="price"><span class="old">₹' + d.price + "</span><b>₹" + d.discount_price + "</b></p>" +
          '<p class="muted">Ends: ' + d.deal_expires_at.replace("T", " ") + "</p>" +
        "</div>" +
      "</div>";
  }
}

loadDeals();