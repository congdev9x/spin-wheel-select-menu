const METHOD_KHO = "kho-rim";
const METHOD_XAO = "xao-rang-sot";
const LEGACY_STORAGE_KEY = "bep-quyet-dinh-v1";
const STORAGE_KEY = "bep-quyet-dinh-v2";
const DEFAULT_METHODS = [
  { id: METHOD_KHO, label: "Kho / Rim", color: { fill: "#f0b83f", text: "#24352b" } },
  { id: METHOD_XAO, label: "Xào / Rang / Sốt", color: { fill: "#28734b", text: "#ffffff" } },
  { id: "other-method", label: "Khác", color: { fill: "#768c60", text: "#ffffff" } },
];
const DEFAULT_ROLES = [
  { id: "main", label: "Món chính", inMealPlan: true, icon: "♨", color: "#e9674b", textColor: "#a3432e" },
  { id: "vegetable", label: "Món rau", inMealPlan: true, icon: "❋", color: "#28734b", textColor: "#28734b" },
  { id: "soup", label: "Món canh", inMealPlan: true, icon: "◒", color: "#f0b83f", textColor: "#775609" },
  { id: "other", label: "Món khác", inMealPlan: false, icon: "✳", color: "#768c60", textColor: "#50623e" },
];
const METHOD_SWATCHES = [
  { fill: "#d99c27", text: "#24352b" },
  { fill: "#bd5037", text: "#ffffff" },
  { fill: "#4b9160", text: "#ffffff" },
  { fill: "#768c60", text: "#ffffff" },
  { fill: "#f0b83f", text: "#24352b" },
];

let hasSavedState = false;

function mergeCatalog(saved = {}) {
  const mergeItems = (defaults, savedItems, type) => {
    const stored = Array.isArray(savedItems) ? savedItems : [];
    const merged = defaults.map((item) => ({ ...item, ...(stored.find((entry) => entry.id === item.id) || {}) }));
    for (const item of stored) {
      if (!item?.id || defaults.some((entry) => entry.id === item.id)) continue;
      const index = merged.length;
      merged.push(type === "method"
        ? { ...item, color: item.color || METHOD_SWATCHES[index % METHOD_SWATCHES.length] }
        : { icon: "✳", inMealPlan: false, color: METHOD_SWATCHES[index % METHOD_SWATCHES.length].fill, textColor: "#28734b", ...item });
    }
    return merged;
  };
  return {
    methods: mergeItems(DEFAULT_METHODS, saved.methods, "method"),
    roles: mergeItems(DEFAULT_ROLES, saved.roles, "role"),
  };
}

function uniqueCategoryId(label, items) {
  const base = normalizeHeader(label).replace(/^[0-9]/, "item-$&") || "muc-moi";
  let id = base;
  let suffix = 2;
  while (items.some((item) => item.id === id)) id = `${base}-${suffix++}`;
  return id;
}

function resolveCategoryId(items, value, fallbackId, type) {
  const label = String(value || "").trim();
  if (!label) return fallbackId;
  const normalized = normalizeHeader(label);
  const existing = items.find((item) => item.id === label || normalizeHeader(item.label) === normalized || (item.aliases || []).some((alias) => normalizeHeader(alias) === normalized));
  if (existing) return existing.id;
  const id = uniqueCategoryId(label, items);
  const category = type === "method"
    ? { id, label, color: METHOD_SWATCHES[items.length % METHOD_SWATCHES.length] }
    : { id, label, inMealPlan: false, icon: "✳", color: METHOD_SWATCHES[items.length % METHOD_SWATCHES.length].fill, textColor: "#28734b" };
  items.push(category);
  return id;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    const value = saved ? JSON.parse(saved) : null;
    if (value && Array.isArray(value.dishes)) {
      hasSavedState = true;
      return {
        dishes: value.dishes,
        history: Array.isArray(value.history) ? value.history : [],
        prefs: { method: "all", favoritesOnly: false, recentDays: 3, ...(value.prefs || {}) },
        catalog: mergeCatalog(value.catalog),
      };
    }
  } catch (error) {
    console.warn("Không thể đọc danh sách đã lưu", error);
  }
  return { dishes: [], history: [], prefs: { method: "all", favoritesOnly: false, recentDays: 3 }, catalog: mergeCatalog() };
}

const state = loadState();
state.dishes = state.dishes.map((dish, index) => ({
  ...dish,
  id: String(dish.id || `dish-${index + 1}`),
  name: String(dish.name || dish.title || "").trim(),
  method: resolveCategoryId(state.catalog.methods, dish.method || dish.group || dish.category, "other-method", "method"),
  role: resolveCategoryId(state.catalog.roles, normalizeRole(dish.role || dish.mealType || dish.type), "main", "role"),
  favorite: Boolean(dish.favorite),
})).filter((dish) => dish.name);
if (state.prefs.method !== "all") state.prefs.method = resolveCategoryId(state.catalog.methods, state.prefs.method, "other-method", "method");
let wheelItems = [];
let wheelRotation = 0;
let pendingWheelDishId = null;
let currentView = "wheel-view";
let mealPlan = Object.fromEntries(DEFAULT_ROLES.filter((role) => role.inMealPlan).map((role) => [role.id, null]));
let selectedBattleSize = 4;
let battle = null;
let toastTimer = 0;
let wheelSpinTimer = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const elements = {
  today: $("#today-label"),
  dishCount: $("#dish-count"),
  favoriteCount: $("#favorite-count"),
  methodFilter: $("#method-filter"),
  recentDays: $("#recent-days"),
  favoritesOnly: $("#favorites-only"),
  filterNote: $("#filter-note"),
  canvas: $("#wheel-canvas"),
  spin: $("#spin-button"),
  wheelAvailable: $("#wheel-available"),
  wheelList: $("#wheel-list"),
  wheelListCount: $("#wheel-list-count"),
  wheelPlaceholder: $("#wheel-placeholder"),
  wheelResult: $("#wheel-result"),
  wheelResultName: $("#wheel-result-name"),
  wheelResultMethod: $("#wheel-result-method"),
  wheelActions: $("#wheel-actions"),
  wheelFavorite: $("#wheel-favorite"),
  battleAvailable: $("#battle-available"),
  battleArena: $("#battle-arena"),
  battleControls: $("#battle-controls"),
  mealGrid: $("#meal-grid"),
  mealHint: $("#meal-hint"),
  history: $("#history-list"),
  dialog: $("#manage-dialog"),
  manageList: $("#manage-list"),
  manageCount: $("#manage-count"),
  dishForm: $("#dish-form"),
  dishId: $("#dish-id"),
  dishName: $("#dish-name"),
  dishMethod: $("#dish-method"),
  dishRole: $("#dish-role"),
  methodCategoryForm: $("#method-category-form"),
  methodCategoryName: $("#method-category-name"),
  methodCategoryList: $("#method-category-list"),
  roleCategoryForm: $("#role-category-form"),
  roleCategoryName: $("#role-category-name"),
  roleCategoryList: $("#role-category-list"),
  saveDish: $("#save-dish"),
  cancelEdit: $("#cancel-edit"),
  importFile: $("#import-file"),
  toast: $("#toast"),
};

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Không thể lưu danh sách trên trình duyệt", error);
    showToast("Trình duyệt chưa cho phép lưu dữ liệu trên thiết bị này.");
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2600);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function methodLabel(method) {
  return state.catalog.methods.find((item) => item.id === method)?.label || method || "Khác";
}

function roleLabel(role) {
  return state.catalog.roles.find((item) => item.id === role)?.label || role || "Món chính";
}

function mealRoles() {
  return state.catalog.roles.filter((role) => role.inMealPlan);
}

function resetMealPlan() {
  mealPlan = Object.fromEntries(mealRoles().map((role) => [role.id, null]));
}

function renderCategorySelects() {
  const currentDishMethod = elements.dishMethod.value;
  const currentDishRole = elements.dishRole.value;
  elements.methodFilter.innerHTML = `<option value="all">Tất cả món</option>${state.catalog.methods.map((method) => `<option value="${escapeHtml(method.id)}">${escapeHtml(method.label)}</option>`).join("")}`;
  elements.dishMethod.innerHTML = state.catalog.methods.map((method) => `<option value="${escapeHtml(method.id)}">${escapeHtml(method.label)}</option>`).join("");
  elements.dishRole.innerHTML = state.catalog.roles.map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.label)}</option>`).join("");
  elements.methodFilter.value = state.prefs.method === "all" || state.catalog.methods.some((method) => method.id === state.prefs.method) ? state.prefs.method : "all";
  elements.dishMethod.value = state.catalog.methods.some((method) => method.id === currentDishMethod) ? currentDishMethod : (state.catalog.methods[0]?.id || "");
  elements.dishRole.value = state.catalog.roles.some((role) => role.id === currentDishRole) ? currentDishRole : (state.catalog.roles[0]?.id || "");
}

function renderMethodLegend() {
  const legend = $("#wheel-legend");
  if (!legend) return;
  legend.innerHTML = state.catalog.methods.map((method) => `<span class="legend-item"><i class="legend-dot" style="--method-color:${escapeHtml(method.color?.fill || "#768c60")}"></i>${escapeHtml(method.label)}</span>`).join("");
}

function dishById(id) {
  return state.dishes.find((dish) => dish.id === id);
}

function getRecentIds(days = Number(state.prefs.recentDays)) {
  const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;
  return new Set(state.history.filter((entry) => days > 0 && new Date(entry.at).getTime() >= cutoff).flatMap((entry) => entry.items || []));
}

function filterDishes({ role, ignoreRecent = false } = {}) {
  const base = state.dishes.filter((dish) => {
    if (state.prefs.method !== "all" && dish.method !== state.prefs.method) return false;
    if (state.prefs.favoritesOnly && !dish.favorite) return false;
    if (role && dish.role !== role) return false;
    return true;
  });
  if (ignoreRecent || Number(state.prefs.recentDays) === 0) return base;
  const recent = getRecentIds();
  const fresh = base.filter((dish) => !recent.has(dish.id));
  if (fresh.length) return fresh;
  if (base.length) {
    elements.filterNote.textContent = "Đã nới lọc để vẫn có món chọn";
    return base;
  }
  return [];
}

function pickRandom(items) {
  return items.length ? items[Math.floor(Math.random() * items.length)] : null;
}

function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function addHistory(ids, source) {
  const items = [...new Set(ids)].filter((id) => dishById(id));
  if (!items.length) return;
  const names = items.map((id) => dishById(id)?.name || "");
  state.history.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, items, names, source, at: new Date().toISOString() });
  state.history = state.history.slice(0, 120);
  persist();
  renderHistory();
  renderCounts();
}

function snapshotHistoryNames() {
  state.history = state.history.map((entry) => ({
    ...entry,
    names: (entry.items || []).map((id, index) => entry.names?.[index] || dishById(id)?.name || ""),
  }));
}

function renderCounts() {
  elements.dishCount.textContent = state.dishes.length;
  elements.favoriteCount.textContent = state.dishes.filter((dish) => dish.favorite).length;
  elements.manageCount.textContent = `${state.dishes.length} món`;
  const recent = Number(state.prefs.recentDays);
  elements.filterNote.textContent = recent ? `Ưu tiên món chưa ăn trong ${recent} ngày` : "Không giới hạn lịch sử";
}

function drawWheel(items) {
  const canvas = elements.canvas;
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const center = size / 2;
  const radius = center - 9;
  ctx.clearRect(0, 0, size, size);
  if (!items.length) {
    ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.fillStyle = "#f8f8f2"; ctx.fill();
    ctx.strokeStyle = "rgba(36,53,43,.16)"; ctx.lineWidth = 3; ctx.stroke();
    return;
  }
  const segment = (Math.PI * 2) / items.length;
  items.forEach((dish, index) => {
    const start = -Math.PI / 2 + index * segment;
    const end = start + segment;
    const method = state.catalog.methods.find((item) => item.id === dish.method);
    const color = method?.color || METHOD_SWATCHES[index % METHOD_SWATCHES.length];
    const fill = color.fill;
    ctx.beginPath(); ctx.moveTo(center, center); ctx.arc(center, center, radius, start, end); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = "#fffefa"; ctx.lineWidth = 2.1; ctx.stroke();
    const middle = start + segment / 2;
    const labelRadius = radius * .64;
    const x = center + Math.cos(middle) * labelRadius;
    const y = center + Math.sin(middle) * labelRadius;
    let labelRotation = middle;
    if (labelRotation > Math.PI / 2 && labelRotation < Math.PI * 1.5) labelRotation += Math.PI;
    if (items.length === 1) labelRotation = 0;
    ctx.save(); ctx.translate(x, y); ctx.rotate(labelRotation);
    ctx.fillStyle = color.text;
    ctx.font = `700 ${Math.max(8, Math.min(13, 300 / items.length))}px 'DM Sans', sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const maxLabelWidth = radius * (items.length === 1 ? .9 : .5);
    let label = dish.name;
    while (label.length > 2 && ctx.measureText(label).width > maxLabelWidth) {
      label = `${label.slice(0, -2).trimEnd()}…`;
    }
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });
  ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.strokeStyle = "#fffefa"; ctx.lineWidth = 6; ctx.stroke();
}

function renderWheel() {
  if (wheelSpinTimer) {
    window.clearTimeout(wheelSpinTimer);
    wheelSpinTimer = null;
  }
  wheelItems = filterDishes();
  wheelRotation = 0;
  elements.canvas.style.transition = "none";
  elements.canvas.style.transform = "rotate(0deg)";
  window.requestAnimationFrame(() => { elements.canvas.style.transition = "transform 5.3s cubic-bezier(.13,.72,.12,1)"; });
  drawWheel(wheelItems);
  renderMethodLegend();
  elements.wheelAvailable.textContent = `${wheelItems.length} món có thể chọn`;
  elements.wheelListCount.textContent = wheelItems.length;
  if (wheelItems.length) {
    elements.wheelList.innerHTML = wheelItems.map((dish, index) => {
      const method = state.catalog.methods.find((item) => item.id === dish.method);
      return `<li data-dish-id="${escapeHtml(dish.id)}"><span class="dish-number">${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(dish.name)}</span><i class="dish-dot" style="--method-color:${escapeHtml(method?.color?.fill || "#768c60")}"></i></li>`;
    }).join("");
    elements.spin.disabled = false;
  } else {
    elements.wheelList.innerHTML = '<li class="empty-inline">Không có món phù hợp. Hãy đổi bộ lọc hoặc thêm món.</li>';
    elements.spin.disabled = true;
  }
  pendingWheelDishId = null;
  elements.wheelPlaceholder.hidden = false;
  elements.wheelResult.hidden = true;
  elements.wheelActions.hidden = true;
}

function displayWheelResult(dish) {
  if (!dish) return;
  pendingWheelDishId = dish.id;
  elements.wheelPlaceholder.hidden = true;
  elements.wheelResult.hidden = false;
  elements.wheelActions.hidden = false;
  elements.wheelResultName.textContent = dish.name;
  elements.wheelResultMethod.textContent = `${methodLabel(dish.method)} · ${roleLabel(dish.role)}`;
  elements.wheelFavorite.textContent = dish.favorite ? "★" : "☆";
  elements.wheelFavorite.classList.toggle("is-favorite", dish.favorite);
  $$(".wheel-list li").forEach((row) => row.classList.toggle("winner-row", row.dataset.dishId === dish.id));
}

function spinWheel() {
  if (!wheelItems.length || elements.spin.disabled) return;
  elements.spin.disabled = true;
  const dish = pickRandom(wheelItems);
  const index = wheelItems.findIndex((item) => item.id === dish.id);
  const segment = 360 / wheelItems.length;
  const centerAngle = -90 + (index + .5) * segment;
  const desiredAngle = ((-90 - centerAngle) % 360 + 360) % 360;
  const currentMod = ((wheelRotation % 360) + 360) % 360;
  const delta = (desiredAngle - currentMod + 360) % 360;
  wheelRotation += 360 * 6 + delta;
  elements.canvas.style.transform = `rotate(${wheelRotation}deg)`;
  wheelSpinTimer = window.setTimeout(() => {
    wheelSpinTimer = null;
    displayWheelResult(dish);
    elements.spin.disabled = false;
  }, 5350);
}

function renderBattleAvailability() {
  const candidates = filterDishes();
  elements.battleAvailable.textContent = `${candidates.length} món có thể dự thi`;
  $("#start-battle").disabled = candidates.length < 2;
}

function makeMatchups(players) {
  const mixed = shuffled(players);
  const pairs = [];
  for (let i = 0; i < mixed.length; i += 2) pairs.push({ a: mixed[i], b: mixed[i + 1] || null });
  return pairs;
}

function startBattle() {
  const candidates = filterDishes();
  if (candidates.length < 2) return showToast("Cần ít nhất 2 món để bắt đầu đấu loại.");
  const participants = shuffled(candidates).slice(0, Math.min(selectedBattleSize, candidates.length)).map((dish) => dish.id);
  battle = { round: 1, matchups: makeMatchups(participants), index: 0, winners: [], resolvedId: null, finalId: null };
  renderBattle();
}

function renderBattle() {
  if (!battle) {
    elements.battleControls.hidden = false;
    elements.battleArena.hidden = true;
    return;
  }
  elements.battleControls.hidden = true;
  elements.battleArena.hidden = false;
  if (battle.finalId) {
    const champion = dishById(battle.finalId);
    elements.battleArena.innerHTML = `<div class="champion"><div class="champion-cup">🏆</div><small>Món thắng hôm nay</small><h3>${escapeHtml(champion?.name || "Món thắng cuộc")}</h3><p>${escapeHtml(methodLabel(champion?.method))} · ${escapeHtml(roleLabel(champion?.role))}</p><div class="champion-actions"><button class="button button-primary" type="button" data-battle-action="confirm">Chốt món này</button><button class="button button-outline" type="button" data-battle-action="restart">Đấu lại</button></div></div>`;
    return;
  }
  const matchup = battle.matchups[battle.index];
  const roundTotal = battle.matchups.length;
  const progress = Array.from({ length: roundTotal }, (_, index) => `<span class="${index < battle.index ? "done" : ""}"></span>`).join("");
  if (matchup.b === null) {
    const dish = dishById(matchup.a);
    elements.battleArena.innerHTML = `<div class="round-label">Vòng ${battle.round} · Cặp ${battle.index + 1}/${roundTotal}</div><div class="battle-bye">Món này được miễn đấu lượt này:<strong>${escapeHtml(dish?.name || "Món đã xóa")}</strong><button class="button button-outline" data-battle-action="advance" type="button">Sang lượt tiếp theo</button></div><div class="battle-progress">${progress}</div>`;
    return;
  }
  const first = dishById(matchup.a);
  const second = dishById(matchup.b);
  const resolved = battle.resolvedId;
  const card = (dish, id) => `<button class="battle-contestant ${resolved === id ? "selected" : ""}" type="button" data-battle-pick="${escapeHtml(id)}" ${resolved ? "disabled" : ""}><small>${escapeHtml(methodLabel(dish?.method))}</small><strong>${escapeHtml(dish?.name || "Món đã xóa")}</strong>${dish?.favorite ? '<span class="contestant-star">★</span>' : ""}</button>`;
  elements.battleArena.innerHTML = `<div class="round-label">Vòng ${battle.round} · Cặp ${battle.index + 1}/${roundTotal}</div><div class="battle-match">${card(first, matchup.a)}<span class="versus">vs</span>${card(second, matchup.b)}</div><div class="battle-actions">${resolved ? '<button class="button button-primary" data-battle-action="advance" type="button">Tiếp tục</button>' : '<button class="button button-quiet" data-battle-action="random" type="button">Chọn ngẫu nhiên</button>'}</div><div class="battle-progress">${progress}</div>`;
}

function pickBattleWinner(id) {
  if (!battle || battle.resolvedId) return;
  battle.resolvedId = id;
  renderBattle();
}

function advanceBattle() {
  if (!battle) return;
  const matchup = battle.matchups[battle.index];
  battle.winners.push(battle.resolvedId || matchup.a);
  battle.resolvedId = null;
  if (battle.index < battle.matchups.length - 1) {
    battle.index++;
    renderBattle();
    return;
  }
  if (battle.winners.length === 1) {
    battle.finalId = battle.winners[0];
    renderBattle();
    return;
  }
  battle.round++;
  battle.matchups = makeMatchups(battle.winners);
  battle.index = 0;
  battle.winners = [];
  renderBattle();
}

function renderMealPlan() {
  const roles = mealRoles();
  if (!roles.length) {
    elements.mealGrid.innerHTML = '<div class="meal-no-slots">Chưa có vai trò nào trong mâm. Bật “Trong mâm” ở Quản lý món để thêm ô món ăn.</div>';
    elements.mealHint.textContent = "Chọn những vai trò muốn có trong mâm cơm.";
    $("#confirm-meal").disabled = true;
    return;
  }
  elements.mealGrid.innerHTML = roles.map((role) => {
    const dish = dishById(mealPlan[role.id]);
    const label = role.label;
    const addAction = `<button type="button" data-add-role="${escapeHtml(role.id)}">+ Thêm ${escapeHtml(label.toLowerCase())}</button>`;
    const roleStyle = `--role-color:${escapeHtml(role.color || "#28734b")};--role-ink:${escapeHtml(role.textColor || "#28734b")}`;
    return `<article class="card meal-slot" style="${roleStyle}"><div class="meal-slot-head"><span class="meal-role">${escapeHtml(label)}</span>${dish ? `<button class="slot-reroll" type="button" data-reroll-role="${escapeHtml(role.id)}" aria-label="Đổi ${escapeHtml(label.toLowerCase())}">⟳</button>` : `<span class="meal-role-icon">${escapeHtml(role.icon || "✳")}</span>`}</div>${dish ? `<h3>${escapeHtml(dish.name)}</h3><span class="meal-method">${escapeHtml(methodLabel(dish.method))}</span>` : `<div class="meal-empty">Chưa có món nhà mình ở mục này.<br />${addAction}</div>`}</article>`;
  }).join("");
  const missing = roles.filter((role) => !filterDishes({ role: role.id }).length);
  elements.mealHint.textContent = missing.length
    ? `Mâm cơm đang thiếu ${missing.map((role) => role.label.toLowerCase()).join(", ")}. Thêm món ở “Quản lý món” để lập mâm.`
    : "Mỗi vai trò món ăn được chọn riêng và tránh trùng món gần đây.";
  $("#confirm-meal").disabled = roles.some((role) => !mealPlan[role.id] || !dishById(mealPlan[role.id]));
}

function drawMealPlan() {
  const roles = mealRoles();
  const used = new Set();
  for (const role of roles) {
    const options = filterDishes({ role: role.id }).filter((dish) => !used.has(dish.id));
    const selected = pickRandom(options);
    mealPlan[role.id] = selected?.id || null;
    if (selected) used.add(selected.id);
  }
  renderMealPlan();
}

function rerollMealRole(role) {
  const used = new Set(Object.entries(mealPlan).filter(([key]) => key !== role).map(([, id]) => id).filter(Boolean));
  const candidate = pickRandom(filterDishes({ role }).filter((dish) => !used.has(dish.id)));
  mealPlan[role] = candidate?.id || null;
  renderMealPlan();
}

function renderHistory() {
  const rows = state.history.slice(0, 6).map((entry) => {
    const names = (entry.items || []).map((id, index) => entry.names?.[index] || dishById(id)?.name).filter(Boolean);
    if (!names.length) return "";
    const date = new Date(entry.at);
    const time = Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(date);
    return `<div class="history-item"><span>✳</span><strong>${escapeHtml(names.length > 1 ? `Mâm cơm (${names.length} món)` : names[0])}</strong><small>${escapeHtml(entry.source || "Đã chọn")} · ${escapeHtml(time)}</small></div>`;
  }).filter(Boolean);
  elements.history.innerHTML = rows.length ? rows.join("") : '<span class="history-empty">Món đã chốt sẽ hiện ở đây và giúp hạn chế lặp lại.</span>';
}

function renderManageList() {
  elements.manageCount.textContent = `${state.dishes.length} món`;
  if (!state.dishes.length) {
    elements.manageList.innerHTML = '<div class="empty-inline" style="padding:18px;text-align:center">Danh sách chưa có món. Hãy thêm món mới hoặc nhập CSV.</div>';
    return;
  }
  elements.manageList.innerHTML = state.dishes.map((dish) => `<div class="manage-row" data-manage-id="${escapeHtml(dish.id)}"><div class="manage-name">${escapeHtml(dish.name)}</div><span class="manage-meta"><strong>${escapeHtml(methodLabel(dish.method))}</strong>${escapeHtml(roleLabel(dish.role))}</span><button class="row-action favorite ${dish.favorite ? "" : ""}" type="button" data-manage-action="favorite" aria-label="${dish.favorite ? "Bỏ yêu thích" : "Đánh dấu yêu thích"}">${dish.favorite ? "★" : "☆"}</button><button class="row-action" type="button" data-manage-action="edit" aria-label="Sửa món">✎</button><button class="row-action delete" type="button" data-manage-action="delete" aria-label="Xóa món">×</button></div>`).join("");
}

function renderCategoryManager() {
  const methodDefaults = new Set(DEFAULT_METHODS.map((item) => item.id));
  const roleDefaults = new Set(DEFAULT_ROLES.map((item) => item.id));
  elements.methodCategoryList.innerHTML = state.catalog.methods.map((method) => `<div class="category-row" data-category-kind="method" data-category-id="${escapeHtml(method.id)}"><input type="text" data-category-name aria-label="Tên cách nấu" value="${escapeHtml(method.label)}" maxlength="50" /><button class="button button-quiet" type="button" data-category-action="save">Lưu</button>${methodDefaults.has(method.id) ? '<span class="category-default">Mặc định</span>' : '<button class="button button-outline" type="button" data-category-action="delete">Xóa</button>'}</div>`).join("");
  elements.roleCategoryList.innerHTML = state.catalog.roles.map((role) => `<div class="category-row" data-category-kind="role" data-category-id="${escapeHtml(role.id)}"><input type="text" data-category-name aria-label="Tên vai trò món" value="${escapeHtml(role.label)}" maxlength="50" /><label class="category-meal-toggle"><input type="checkbox" data-role-meal-toggle ${role.inMealPlan ? "checked" : ""} /><span>Trong mâm</span></label><button class="button button-quiet" type="button" data-category-action="save">Lưu</button>${roleDefaults.has(role.id) ? '<span class="category-default">Mặc định</span>' : '<button class="button button-outline" type="button" data-category-action="delete">Xóa</button>'}</div>`).join("");
}

function addCategory(type, rawLabel) {
  const label = rawLabel.trim();
  if (!label) return;
  const items = type === "method" ? state.catalog.methods : state.catalog.roles;
  if (items.some((item) => normalizeHeader(item.label) === normalizeHeader(label))) {
    showToast("Danh mục này đã có rồi.");
    return;
  }
  const id = uniqueCategoryId(label, items);
  if (type === "method") {
    items.push({ id, label, color: METHOD_SWATCHES[items.length % METHOD_SWATCHES.length] });
  } else {
    items.push({ id, label, inMealPlan: false, icon: "✳", color: METHOD_SWATCHES[items.length % METHOD_SWATCHES.length].fill, textColor: "#28734b" });
  }
  persist();
  renderAll();
  $(type === "method" ? "#method-category-name" : "#role-category-name").value = "";
  renderCategoryManager();
}

function saveCategoryLabel(type, id, rawLabel) {
  const label = rawLabel.trim();
  const items = type === "method" ? state.catalog.methods : state.catalog.roles;
  const category = items.find((item) => item.id === id);
  if (!category || !label) return showToast("Nhập tên danh mục trước khi lưu.");
  if (items.some((item) => item.id !== id && normalizeHeader(item.label) === normalizeHeader(label))) return showToast("Tên này đã được dùng trong danh mục.");
  if (category.label !== label) category.aliases = [...new Set([...(category.aliases || []), category.label])];
  category.label = label;
  persist();
  renderAll();
  renderCategoryManager();
  showToast("Đã lưu tên danh mục.");
}

function deleteCategory(type, id) {
  const items = type === "method" ? state.catalog.methods : state.catalog.roles;
  const defaults = type === "method" ? DEFAULT_METHODS : DEFAULT_ROLES;
  const category = items.find((item) => item.id === id);
  if (!category || defaults.some((item) => item.id === id)) return;
  const usedCount = state.dishes.filter((dish) => dish[type] === id).length;
  const fallbackId = type === "method" ? "other-method" : "other";
  const message = usedCount
    ? `Xóa “${category.label}” và chuyển ${usedCount} món sang “${type === "method" ? methodLabel(fallbackId) : roleLabel(fallbackId)}”?`
    : `Xóa danh mục “${category.label}”?`;
  if (!window.confirm(message)) return;
  if (usedCount) state.dishes.forEach((dish) => { if (dish[type] === id) dish[type] = fallbackId; });
  if (type === "role") delete mealPlan[id];
  if (type === "method" && state.prefs.method === id) state.prefs.method = "all";
  if (type === "method") state.catalog.methods = items.filter((item) => item.id !== id);
  else state.catalog.roles = items.filter((item) => item.id !== id);
  persist();
  renderAll();
  renderCategoryManager();
  showToast("Đã xóa danh mục.");
}

function toggleRoleInMealPlan(id, included) {
  const role = state.catalog.roles.find((item) => item.id === id);
  if (!role) return;
  role.inMealPlan = included;
  if (included && !(id in mealPlan)) mealPlan[id] = null;
  if (!included) delete mealPlan[id];
  persist();
  renderAll();
  renderCategoryManager();
}

function handleCategoryAction(event) {
  const button = event.target.closest("[data-category-action]");
  const row = event.target.closest("[data-category-kind]");
  if (!button || !row) return;
  const type = row.dataset.categoryKind;
  const id = row.dataset.categoryId;
  if (button.dataset.categoryAction === "save") saveCategoryLabel(type, id, row.querySelector("[data-category-name]").value);
  if (button.dataset.categoryAction === "delete") deleteCategory(type, id);
}

function renderAll() {
  renderCategorySelects();
  renderCounts();
  renderWheel();
  renderBattleAvailability();
  renderMealPlan();
  renderHistory();
  if (elements.dialog.open) {
    renderManageList();
    renderCategoryManager();
  }
}

function setView(viewId) {
  currentView = viewId;
  $$(".mode-tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === viewId));
  $$(".view-panel").forEach((panel) => {
    const active = panel.id === viewId;
    panel.classList.toggle("is-visible", active);
    panel.hidden = !active;
  });
  if (viewId === "meal-view" && mealRoles().every((role) => !mealPlan[role.id])) drawMealPlan();
}

function resetDishForm() {
  elements.dishForm.reset();
  elements.dishId.value = "";
  elements.dishMethod.value = state.catalog.methods.some((method) => method.id === METHOD_KHO) ? METHOD_KHO : (state.catalog.methods[0]?.id || "");
  elements.dishRole.value = "main";
  elements.saveDish.textContent = "Thêm món";
  elements.cancelEdit.hidden = true;
}

function startEditDish(dish) {
  elements.dishId.value = dish.id;
  elements.dishName.value = dish.name;
  elements.dishMethod.value = dish.method;
  elements.dishRole.value = dish.role || "main";
  elements.saveDish.textContent = "Lưu thay đổi";
  elements.cancelEdit.hidden = false;
  elements.dishName.focus();
  $(".dialog-content").scrollTo({ top: 0, behavior: "smooth" });
}

function addOrUpdateDish(event) {
  event.preventDefault();
  const name = elements.dishName.value.trim();
  if (!name) return;
  const existingId = elements.dishId.value;
  const duplicate = state.dishes.find((dish) => dish.name.toLocaleLowerCase("vi") === name.toLocaleLowerCase("vi") && dish.id !== existingId);
  if (duplicate) {
    showToast("Món này đã có trong danh sách.");
    return;
  }
  if (existingId) {
    const dish = dishById(existingId);
    if (dish) Object.assign(dish, { name, method: elements.dishMethod.value, role: elements.dishRole.value });
    showToast("Đã cập nhật món.");
  } else {
    state.dishes.push({ id: crypto.randomUUID ? crypto.randomUUID() : `dish-${Date.now()}-${Math.random()}`, name, method: elements.dishMethod.value, role: elements.dishRole.value, favorite: false });
    showToast("Đã thêm món vào danh sách.");
  }
  persist();
  resetDishForm();
  renderAll();
}

function parseCsv(source) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"' && quoted && source[i + 1] === '"') { cell += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/đ/g, "d").replace(/[^a-z0-9]/g, "");
}

function normalizeRole(value) {
  const raw = String(value || "main").trim();
  const role = normalizeHeader(raw);
  const aliases = {
    main: "main", monchinh: "main",
    vegetable: "vegetable", rau: "vegetable", monrau: "vegetable",
    soup: "soup", canh: "soup", moncanh: "soup",
    other: "other", khac: "other", monkhac: "other",
  };
  return aliases[role] || raw;
}

function parseImportedData(text, fileName) {
  if (fileName.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : parsed.dishes;
  }
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!rows.length) return [];
  const first = rows[0].map(normalizeHeader);
  const nameIndex = first.findIndex((key) => ["name", "tenmon", "tenmonan", "mon", "monan", "dish", "dishname"].includes(key));
  const hasHeader = nameIndex >= 0;
  const headers = hasHeader ? first : ["name", "group", "role", "favorite"];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const indexOf = (names, fallback) => {
    const found = headers.findIndex((key) => names.includes(key));
    return found >= 0 ? found : fallback;
  };
  const iName = indexOf(["name", "tenmon", "tenmonan", "mon", "monan", "dish", "dishname"], 0);
  const iId = indexOf(["id", "dishid"], -1);
  const iMethod = indexOf(["group", "nhom", "nhommon", "cachnau", "loainau", "loaimon", "nhomchebien", "phuongphap", "phuongphapchebien", "method", "category", "phanloai", "phanloaimon"], 1);
  const iRole = indexOf(["role", "vaitro", "loaimon", "mealrole", "foodrole"], 2);
  const iFavorite = indexOf(["favorite", "yeuthich", "favourite"], 3);
  return dataRows.map((values, index) => ({
    id: iId >= 0 ? String(values[iId] || "").trim() : `import-${Date.now()}-${index}`,
    name: (values[iName] || "").trim(),
    method: (values[iMethod] || "Khác").trim(),
    role: normalizeRole(values[iRole]),
    favorite: ["true", "1", "yes", "co", "x"].includes(normalizeHeader(values[iFavorite] || "")),
  })).filter((dish) => dish.name);
}

function normalizeImportedDishes(imported) {
  const usedIds = new Set();
  return imported.map((dish, index) => {
    const name = String(dish.name || dish.title || "").trim();
    const originalId = String(dish.id || `dish-${Date.now()}-${index}`);
    let id = originalId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${originalId}-${suffix++}`;
    usedIds.add(id);
    return {
      id,
      name,
      method: resolveCategoryId(state.catalog.methods, dish.method || dish.group || dish.category || "Khác", "other-method", "method"),
      role: resolveCategoryId(state.catalog.roles, normalizeRole(dish.role || dish.mealType || dish.type), "main", "role"),
      favorite: [true, 1, "true", "1", "yes", "co", "x"].includes(typeof dish.favorite === "string" ? normalizeHeader(dish.favorite) : dish.favorite),
    };
  }).filter((dish) => dish.name);
}

async function readStarterCsv() {
  const response = await fetch(new URL("./data/dishes.csv", window.location.href), { cache: "no-store" });
  if (!response.ok) throw new Error("Không đọc được data/dishes.csv.");
  const imported = parseImportedData(await response.text(), "dishes.csv");
  if (!imported.length) throw new Error("data/dishes.csv chưa có món hợp lệ.");
  return normalizeImportedDishes(imported);
}

async function loadInitialCsv() {
  if (hasSavedState) return;
  try {
    const dishes = await readStarterCsv();
    if (hasSavedState || state.dishes.length) return;
    state.dishes = dishes;
    resetMealPlan();
    persist();
    renderAll();
    if (currentView === "meal-view" && mealRoles().length) drawMealPlan();
  } catch (error) {
    if (hasSavedState || state.dishes.length) return;
    renderAll();
    showToast("Không tải được CSV. Mở app qua máy chủ cục bộ hoặc nhập CSV thủ công.");
  }
}

async function reloadStarterCsv() {
  if (!window.confirm("Thay danh sách hiện tại bằng dữ liệu trong data/dishes.csv? Lịch sử sẽ được giữ lại.")) return;
  try {
    const dishes = await readStarterCsv();
    snapshotHistoryNames();
    state.dishes = dishes;
    state.prefs.method = "all";
    resetMealPlan();
    persist();
    resetDishForm();
    renderAll();
    if (currentView === "meal-view" && mealRoles().length) drawMealPlan();
    showToast(`Đã nạp ${state.dishes.length} món từ CSV.`);
  } catch (error) {
    showToast("Không tải được CSV. Mở app qua máy chủ cục bộ hoặc nhập CSV thủ công.");
  }
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = parseImportedData(String(reader.result || ""), file.name);
      if (!imported?.length) throw new Error("Không tìm thấy món ăn hợp lệ trong tệp.");
      const validRows = imported.filter((dish) => String(dish.name || dish.title || "").trim());
      if (!validRows.length) throw new Error("Tệp không có cột tên món hợp lệ.");
      if (!window.confirm(`Thay toàn bộ danh sách hiện tại bằng ${validRows.length} món trong tệp? Lịch sử chọn món sẽ được giữ lại.`)) return;
      const normalized = normalizeImportedDishes(validRows);
      snapshotHistoryNames();
      state.dishes = normalized;
      state.prefs.method = "all";
      resetMealPlan();
      persist();
      resetDishForm();
      renderAll();
      if (currentView === "meal-view" && mealRoles().length) drawMealPlan();
      showToast(`Đã nhập ${normalized.length} món.`);
    } catch (error) {
      showToast(error.message || "Không thể đọc tệp này.");
    } finally {
      elements.importFile.value = "";
    }
  };
  reader.onerror = () => showToast("Không thể mở tệp đã chọn.");
  reader.readAsText(file, "UTF-8");
}

function exportCsv() {
  const escapeCell = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const rows = [["id", "name", "method", "role", "favorite"], ...state.dishes.map((dish) => [dish.id, dish.name, methodLabel(dish.method), roleLabel(dish.role), dish.favorite ? "true" : "false"])];
  const csv = "\uFEFF" + rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = "danh-sach-mon-an.csv"; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toggleFavorite(id) {
  const dish = dishById(id);
  if (!dish) return;
  const wasPendingWheelResult = pendingWheelDishId === id;
  dish.favorite = !dish.favorite;
  persist();
  renderAll();
  if (wasPendingWheelResult) displayWheelResult(dish);
  showToast(dish.favorite ? "Đã thêm vào món yêu thích." : "Đã bỏ khỏi món yêu thích.");
}

function removeDish(id) {
  const dish = dishById(id);
  if (!dish || !window.confirm(`Xóa “${dish.name}” khỏi danh sách món?`)) return;
  snapshotHistoryNames();
  state.dishes = state.dishes.filter((item) => item.id !== id);
  for (const role of Object.keys(mealPlan)) if (mealPlan[role] === id) mealPlan[role] = null;
  if (pendingWheelDishId === id) pendingWheelDishId = null;
  persist();
  renderAll();
  showToast("Đã xóa món.");
}

function addRole(role) {
  elements.dialog.showModal();
  resetDishForm();
  elements.dishRole.value = role;
  window.setTimeout(() => elements.dishName.focus(), 50);
}

function initialize() {
  elements.today.textContent = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  renderCategorySelects();
  elements.methodFilter.value = state.prefs.method;
  elements.recentDays.value = String(state.prefs.recentDays);
  elements.favoritesOnly.checked = Boolean(state.prefs.favoritesOnly);
  $(".mode-tabs").addEventListener("click", (event) => {
    const tab = event.target.closest("[data-view]");
    if (tab) setView(tab.dataset.view);
  });
  elements.methodFilter.addEventListener("change", () => { state.prefs.method = elements.methodFilter.value; persist(); renderAll(); });
  elements.recentDays.addEventListener("change", () => { state.prefs.recentDays = Number(elements.recentDays.value); persist(); renderAll(); });
  elements.favoritesOnly.addEventListener("change", () => { state.prefs.favoritesOnly = elements.favoritesOnly.checked; persist(); renderAll(); });
  elements.spin.addEventListener("click", spinWheel);
  $("#reroll-wheel").addEventListener("click", spinWheel);
  $("#confirm-wheel").addEventListener("click", () => {
    const dish = dishById(pendingWheelDishId);
    if (!dish) return;
    addHistory([dish.id], "Vòng quay");
    showToast(`Đã chốt: ${dish.name}`);
    renderAll();
  });
  elements.wheelFavorite.addEventListener("click", () => pendingWheelDishId && toggleFavorite(pendingWheelDishId));
  elements.battleArena.addEventListener("click", (event) => {
    const pick = event.target.closest("[data-battle-pick]");
    if (pick) return pickBattleWinner(pick.dataset.battlePick);
    const action = event.target.closest("[data-battle-action]")?.dataset.battleAction;
    if (action === "advance") advanceBattle();
    if (action === "random" && battle) {
      const matchup = battle.matchups[battle.index];
      pickBattleWinner(Math.random() < .5 ? matchup.a : matchup.b);
    }
    if (action === "confirm" && battle?.finalId) {
      const dish = dishById(battle.finalId);
      addHistory([battle.finalId], "Đấu loại");
      showToast(`Quán quân đã chốt: ${dish?.name || "món ăn"}`);
      battle = null; renderBattle();
    }
    if (action === "restart") { battle = null; renderBattle(); }
  });
  $("#start-battle").addEventListener("click", startBattle);
  $$(".candidate-size").forEach((button) => button.addEventListener("click", () => {
    selectedBattleSize = Number(button.dataset.size);
    $$(".candidate-size").forEach((item) => item.classList.toggle("is-selected", item === button));
  }));
  $("#shuffle-meal").addEventListener("click", drawMealPlan);
  elements.mealGrid.addEventListener("click", (event) => {
    const reroll = event.target.closest("[data-reroll-role]");
    const add = event.target.closest("[data-add-role]");
    if (reroll) rerollMealRole(reroll.dataset.rerollRole);
    if (add) addRole(add.dataset.addRole);
  });
  $("#confirm-meal").addEventListener("click", () => {
    const roles = mealRoles();
    const ids = roles.map((role) => mealPlan[role.id]).filter((id) => id && dishById(id));
    if (!roles.length) return showToast("Hãy chọn ít nhất một vai trò trong mâm.");
    if (ids.length !== roles.length) return showToast("Hãy thêm đủ món cho các vai trò đang chọn.");
    addHistory(ids, "Mâm cơm");
    showToast("Đã chốt mâm cơm hôm nay.");
  });
  $$(".manage-open").forEach((button) => button.addEventListener("click", () => { renderManageList(); renderCategoryManager(); elements.dialog.showModal(); }));
  $("#close-manage").addEventListener("click", () => elements.dialog.close());
  elements.dialog.addEventListener("click", (event) => { if (event.target === elements.dialog) elements.dialog.close(); });
  elements.dialog.addEventListener("close", resetDishForm);
  elements.dishForm.addEventListener("submit", addOrUpdateDish);
  elements.cancelEdit.addEventListener("click", resetDishForm);
  elements.methodCategoryForm.addEventListener("submit", (event) => { event.preventDefault(); addCategory("method", elements.methodCategoryName.value); });
  elements.roleCategoryForm.addEventListener("submit", (event) => { event.preventDefault(); addCategory("role", elements.roleCategoryName.value); });
  elements.methodCategoryList.addEventListener("click", handleCategoryAction);
  elements.roleCategoryList.addEventListener("click", handleCategoryAction);
  elements.roleCategoryList.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-role-meal-toggle]");
    const row = event.target.closest("[data-category-id]");
    if (checkbox && row) toggleRoleInMealPlan(row.dataset.categoryId, checkbox.checked);
  });
  $("#reload-starter").addEventListener("click", reloadStarterCsv);
  elements.manageList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-manage-action]");
    const row = event.target.closest("[data-manage-id]");
    if (!button || !row) return;
    const dish = dishById(row.dataset.manageId);
    if (!dish) return;
    if (button.dataset.manageAction === "favorite") toggleFavorite(dish.id);
    if (button.dataset.manageAction === "edit") startEditDish(dish);
    if (button.dataset.manageAction === "delete") removeDish(dish.id);
  });
  elements.importFile.addEventListener("change", () => { if (elements.importFile.files[0]) importData(elements.importFile.files[0]); });
  $("#export-data").addEventListener("click", exportCsv);
  $("#clear-history").addEventListener("click", () => {
    if (!state.history.length) return showToast("Lịch sử đang trống.");
    if (!window.confirm("Xóa toàn bộ lịch sử chọn món?")) return;
    state.history = []; persist(); renderHistory(); renderAll(); showToast("Đã xóa lịch sử.");
  });
  renderAll();
  if (hasSavedState) persist();
  else loadInitialCsv();
}

initialize();
