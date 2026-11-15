/*
  DineFlow frontend.
  1) Create a Supabase project.
  2) Run supabase.sql in Supabase SQL Editor.
  3) Paste your Project URL and anon/public key below.
  Never put a service_role key in browser code.
*/
const SUPABASE_URL = "https://xmwtryafmdxjexyptntx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_0tWpNvbb0hCnVPT3axI6xg_t_MSqyIt";

const $ = (id) => document.getElementById(id);
let db = null;
let menuCache = [];
let tableCache = [];

const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2
}).format(Number(value || 0));

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 2800);
}
function setMessage(message, isError = false) {
  $("order-message").textContent = message;
  $("order-message").classList.toggle("error", isError);
}
function showError(context, error) {
  console.error(context, error);
  toast(`${context}: ${error?.message || "Something went wrong"}`);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}
function ready() {
  if (!db) {
    toast("Add your Supabase URL and anon key in app.js first.");
    return false;
  }
  return true;
}

async function loadMenu() {
  const { data, error } = await db.from("menu_items")
    .select("id,item_name,category,price,is_available")
    .order("item_name");
  if (error) throw error;
  menuCache = data || [];
  $("stat-menu").textContent = menuCache.filter(x => x.is_available).length;
  $("menu-body").innerHTML = menuCache.length ? menuCache.map(item => `
    <tr><td class="item-name">${escapeHtml(item.item_name)}</td>
    <td>${escapeHtml(item.category || "—")}</td><td class="price">${money(item.price)}</td>
    <td><span class="pill">${item.is_available ? "Available" : "Unavailable"}</span></td></tr>
  `).join("") : '<tr><td colspan="4" class="empty">No menu items yet. Add your first dish above.</td></tr>';
  $("order-menu-item").innerHTML = '<option value="">Select a menu item</option>' +
    menuCache.filter(x => x.is_available).map(item =>
      `<option value="${item.id}">${escapeHtml(item.item_name)} · ${money(item.price)}</option>`
    ).join("");
}

async function loadTables() {
  const { data, error } = await db.from("restaurant_tables")
    .select("id,table_number,table_status").order("table_number");
  if (error) throw error;
  tableCache = data || [];
  const available = tableCache.filter(t => t.table_status === "available");
  $("order-table").innerHTML = '<option value="">Select an available table</option>' +
    available.map(t => `<option value="${t.id}">Table ${t.table_number}</option>`).join("");
  $("stat-tables").textContent = tableCache.length;
  $("stat-tables-sub").textContent = `${available.length} available · ${tableCache.length - available.length} occupied`;
  $("tables-grid").innerHTML = tableCache.length ? tableCache.map(t => `
    <div class="table-tile"><strong>Table ${t.table_number}</strong>
    <span class="pill ${t.table_status === "occupied" ? "occupied" : ""}">${escapeHtml(t.table_status)}</span></div>
  `).join("") : '<p class="empty">No tables found. Add rows to restaurant_tables in Supabase.</p>';
}

async function loadBills() {
  const { data, error } = await db.from("bills")
    .select("id,order_id,total_amount,bill_status,created_at,orders(table_id,restaurant_tables(table_number))")
    .eq("bill_status", "open").order("created_at", { ascending: false });
  if (error) throw error;
  $("stat-bills").textContent = data.length;
  $("bills-body").innerHTML = data.length ? data.map(bill => {
    const tableNo = bill.orders?.restaurant_tables?.table_number ?? "—";
    return `<tr><td class="item-name">#${bill.id}</td><td>Table ${tableNo}</td>
      <td>${new Date(bill.created_at).toLocaleString("en-IN", { dateStyle:"medium", timeStyle:"short" })}</td>
      <td class="price">${money(bill.total_amount)}</td>
      <td><button class="close-btn" data-close-bill="${bill.order_id}">Close bill</button></td></tr>`;
  }).join("") : '<tr><td colspan="5" class="empty">There are no open bills right now.</td></tr>';
  const { data: paid, error: paidError } = await db.from("bills")
    .select("total_amount").eq("bill_status", "paid");
  if (paidError) throw paidError;
  $("stat-revenue").textContent = money((paid || []).reduce((sum, b) => sum + Number(b.total_amount), 0));
}

async function loadReports() {
  const [best, revenue, busy] = await Promise.all([
    db.from("best_selling_dishes").select("*").limit(5),
    db.from("revenue_by_day").select("*").limit(7),
    db.from("busiest_hour").select("*").limit(5)
  ]);
  if (best.error) throw best.error;
  if (revenue.error) throw revenue.error;
  if (busy.error) throw busy.error;
  $("best-sellers").innerHTML = best.data.length ? best.data.map(r =>
    `<div class="report-row"><span>${escapeHtml(r.item_name)}</span><strong>${r.quantity_sold} sold</strong></div>`
  ).join("") : '<p class="empty">No paid sales yet.</p>';
  $("daily-revenue").innerHTML = revenue.data.length ? revenue.data.map(r =>
    `<div class="report-row"><span>${new Date(r.sale_day + "T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</span><strong>${money(r.revenue)}</strong></div>`
  ).join("") : '<p class="empty">No paid sales yet.</p>';
  $("busy-hour").innerHTML = busy.data.length ? busy.data.map(r =>
    `<div class="report-row"><span>${String(r.order_hour).padStart(2,"0")}:00–${String((Number(r.order_hour)+1)%24).padStart(2,"0")}:00</span><strong>${r.order_count} orders</strong></div>`
  ).join("") : '<p class="empty">No orders recorded yet.</p>';
}

async function refreshAll() {
  if (!ready()) return;
  try {
    await Promise.all([loadMenu(), loadTables(), loadBills(), loadReports()]);
    $("connection-label").textContent = "Connected to Supabase";
    document.querySelector(".status-dot").classList.add("connected");
  } catch (error) {
    $("connection-label").textContent = "Connection error";
    showError("Could not load data", error);
  }
}


// ---------- CSV import / daily sales export ----------
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ""; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ""));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename, rows) {
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addCsvTools() {
  // Add CSV menu import immediately below the existing menu form.
  const menuForm = $("menu-form");
  if (menuForm && !$("menu-csv-tools")) {
    const tools = document.createElement("div");
    tools.id = "menu-csv-tools";
    tools.style.cssText = "display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0 18px;";
    tools.innerHTML = `
      <label for="menu-csv-file" style="font-size:13px;font-weight:600;">Import menu from CSV</label>
      <input id="menu-csv-file" type="file" accept=".csv,text/csv" style="max-width:260px;font-size:13px;">
      <button id="menu-csv-import" type="button" class="close-btn">Import CSV</button>
      <span style="font-size:12px;color:#718096;">Columns: item_name, category, price, is_available</span>`;
    menuForm.insertAdjacentElement("afterend", tools);
    $("menu-csv-import").addEventListener("click", importMenuCsv);
  }

  // Add date-scoped paid-sales export above the daily revenue report.
  const dailyRevenue = $("daily-revenue");
  if (dailyRevenue && !$("sales-csv-tools")) {
    const tools = document.createElement("div");
    tools.id = "sales-csv-tools";
    tools.style.cssText = "display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0 14px;";
    tools.innerHTML = `
      <label for="sales-csv-date" style="font-size:13px;font-weight:600;">Sales date</label>
      <input id="sales-csv-date" type="date" value="${localDateString()}" style="padding:8px;border:1px solid #d7e0dc;border-radius:8px;">
      <button id="sales-csv-export" type="button" class="close-btn">Export daily sales CSV</button>`;
    dailyRevenue.insertAdjacentElement("beforebegin", tools);
    $("sales-csv-export").addEventListener("click", exportDailySalesCsv);
  }
}

async function importMenuCsv() {
  if (!ready()) return;
  const file = $("menu-csv-file")?.files?.[0];
  if (!file) return toast("Choose a CSV file first.");
  try {
    const rawRows = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
    if (rawRows.length < 2) throw new Error("CSV must contain a header row and at least one menu item.");
    const headers = rawRows[0].map(h => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
    const findCol = (...names) => names.map(n => headers.indexOf(n)).find(i => i >= 0);
    const nameCol = findCol("item_name", "name", "item", "dish_name");
    const categoryCol = findCol("category", "item_category");
    const priceCol = findCol("price", "unit_price");
    const availableCol = findCol("is_available", "available", "status");
    if (nameCol === undefined || priceCol === undefined)
      throw new Error("CSV needs at least item_name (or name) and price columns.");

    const items = rawRows.slice(1).map((r, i) => {
      const itemName = String(r[nameCol] ?? "").trim();
      const price = Number(String(r[priceCol] ?? "").trim());
      if (!itemName) throw new Error(`Row ${i + 2}: item name is missing.`);
      if (!Number.isFinite(price) || price < 0) throw new Error(`Row ${i + 2}: price must be a valid non-negative number.`);
      let isAvailable = true;
      if (availableCol !== undefined) {
        const status = String(r[availableCol] ?? "true").trim().toLowerCase();
        isAvailable = !["false", "0", "no", "unavailable", "inactive"].includes(status);
      }
      return {
        item_name: itemName,
        category: categoryCol === undefined ? null : (String(r[categoryCol] ?? "").trim() || null),
        price,
        is_available: isAvailable
      };
    });
    const { error } = await db.from("menu_items").insert(items);
    if (error) throw error;
    $("menu-csv-file").value = "";
    toast(`${items.length} menu item(s) imported successfully.`);
    await refreshAll();
  } catch (error) {
    showError("CSV import failed", error);
  }
}

async function exportDailySalesCsv() {
  if (!ready()) return;
  const selectedDate = $("sales-csv-date")?.value;
  if (!selectedDate) return toast("Choose a sales date first.");
  try {
    const start = new Date(`${selectedDate}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const { data, error } = await db.from("bills")
      .select("id,order_id,total_amount,closed_at,orders(table_id,restaurant_tables(table_number))")
      .eq("bill_status", "paid")
      .gte("closed_at", start.toISOString())
      .lt("closed_at", end.toISOString())
      .order("closed_at", { ascending: true });
    if (error) throw error;
    const rows = [["bill_id", "order_id", "table_number", "paid_at", "total_amount_inr"]];
    (data || []).forEach(bill => {
      rows.push([
        bill.id,
        bill.order_id,
        bill.orders?.restaurant_tables?.table_number ?? "",
        bill.closed_at ? new Date(bill.closed_at).toLocaleString("en-IN") : "",
        Number(bill.total_amount || 0).toFixed(2)
      ]);
    });
    rows.push([]);
    rows.push(["TOTAL_DAILY_REVENUE_INR", "", "", "", (data || []).reduce((sum, bill) => sum + Number(bill.total_amount || 0), 0).toFixed(2)]);
    downloadCsv(`DineFlow_Daily_Sales_${selectedDate}.csv`, rows);
    toast(`${data?.length || 0} paid bill(s) exported for ${selectedDate}.`);
  } catch (error) {
    showError("Daily sales export failed", error);
  }
}

addCsvTools();

$("menu-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ready()) return;
  const item = {
    item_name: $("menu-name").value.trim(),
    category: $("menu-category").value.trim() || null,
    price: Number($("menu-price").value)
  };
  const { error } = await db.from("menu_items").insert(item);
  if (error) return showError("Could not add menu item", error);
  event.target.reset();
  toast("Menu item added.");
  await refreshAll();
});

$("order-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!ready()) return;
  const tableId = Number($("order-table").value);
  const menuItemId = Number($("order-menu-item").value);
  const quantity = Number($("order-quantity").value);
  if (!tableId || !menuItemId || !Number.isInteger(quantity) || quantity < 1) {
    return setMessage("Choose a table, menu item and valid quantity.", true);
  }
  setMessage("Creating order…");
  try {
    // The database trigger creates an open bill and marks this table occupied.
    const { data: order, error: orderError } = await db.from("orders")
      .insert({ table_id: tableId }).select("id").single();
    if (orderError) throw orderError;
    // The BEFORE INSERT trigger copies the current menu price.
    // The AFTER INSERT trigger adds the line amount to the bill total.
    const { error: itemError } = await db.from("order_items").insert({
      order_id: order.id, menu_item_id: menuItemId, quantity
    });
    if (itemError) throw itemError;
    event.target.reset();
    $("order-quantity").value = 1;
    setMessage(`Order #${order.id} created. Its bill has been updated automatically.`);
    toast("Order created successfully.");
    await refreshAll();
  } catch (error) {
    setMessage(error.message || "Could not create order.", true);
    showError("Order creation failed", error);
  }
});

$("bills-body").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-close-bill]");
  if (!button || !ready()) return;
  const orderId = Number(button.dataset.closeBill);
  button.disabled = true;
  button.textContent = "Closing…";
  const { error } = await db.rpc("close_bill", { p_order_id: orderId });
  if (error) {
    button.disabled = false;
    button.textContent = "Close bill";
    return showError("Could not close bill", error);
  }
  toast("Bill paid and table released.");
  await refreshAll();
});

$("refresh-btn").addEventListener("click", refreshAll);
$("today-label").textContent = new Date().toLocaleDateString("en-IN", {
  weekday: "short", day: "numeric", month: "short", year: "numeric"
});

if (SUPABASE_URL.startsWith("https://") && (SUPABASE_ANON_KEY.startsWith("ey") || SUPABASE_ANON_KEY.startsWith("sb_publishable_"))) {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  refreshAll();
} else {
  $("connection-label").textContent = "Add project credentials";
  $("menu-body").innerHTML = '<tr><td colspan="4" class="empty">Add your Supabase URL and anon key in app.js to connect.</td></tr>';
}
