const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
let menuData = [];
let planByDay = {};

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

async function loadPlan() {
  let menuResponse = await fetch("/api/menu");
  menuData = await menuResponse.json();

  let planResponse = await fetch("/api/meal-plan");
  if (!planResponse.ok) {
    window.location.href = "login.html";
    return;
  }
  let rows = await planResponse.json();
  planByDay = {};
  for (let r of rows) planByDay[r.day] = r;
  renderPlan();
}

function renderPlan() {
  let html = "";
  for (let day of DAYS) {
    let chosen = planByDay[day];
    let options = '<option value="">-- choose a dish --</option>';
    for (let item of menuData) {
      let selected = chosen && chosen.item_id === item.id ? " selected" : "";
      options +=
        '<option value="' + item.id + '"' + selected + ">" +
        esc(item.name) + " (" + esc(item.restaurant_name || "") + ") - ₹" + item.current_price +
        "</option>";
    }
    html +=
      '<div class="card"><div class="info">' +
        "<h3>" + day + "</h3>" +
        '<select onchange="savePlan(\'' + day + "', this.value)\">" + options + "</select>" +
      "</div></div>";
  }
  document.getElementById("plan").innerHTML = html;
}

async function savePlan(day, itemId) {
  if (!itemId) {
    await fetch("/api/meal-plan/" + day, { method: "DELETE" });
  } else {
    await fetch("/api/meal-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day: day, item_id: Number(itemId) })
    });
  }
  loadPlan();
}

loadPlan();