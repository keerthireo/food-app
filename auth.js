async function register() {
  let response = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: document.getElementById("reg-name").value,
      email: document.getElementById("reg-email").value,
      password: document.getElementById("reg-password").value,
      role: document.getElementById("reg-role").value,
      restaurant_name: document.getElementById("reg-restaurant").value,
      area: document.getElementById("reg-area").value,
      address: document.getElementById("reg-address").value
    })
  });
  let data = await response.json();
  document.getElementById("message").innerText = data.message || data.error;
}

async function login() {
  let response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: document.getElementById("login-email").value,
      password: document.getElementById("login-password").value
    })
  });
  let data = await response.json();

  if (response.ok) {
    if (data.role === "owner") {
      window.location.href = "owner.html";
    } else {
      window.location.href = "index.html";
    }
  } else {
      if (response.ok) {
    showTab("login");
    document.getElementById("message").innerText = data.message || "Registered! Please log in.";
  } else {
    document.getElementById("message").innerText = data.error;
  }
  }
}
function showTab(tab) {
  document.getElementById("login-form").style.display = tab === "login" ? "block" : "none";
  document.getElementById("register-form").style.display = tab === "register" ? "block" : "none";
  document.getElementById("tab-login").classList.toggle("active", tab === "login");
  document.getElementById("tab-register").classList.toggle("active", tab === "register");
  document.getElementById("message").innerText = "";
}