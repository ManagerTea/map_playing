const state = {
  mapSrc: "",
  mapScale: 100,
  stageZoom: 1,
  mapOffsetX: 0,
  mapOffsetY: 0,
  tokens: [],
  labelMode: "always",
  updatedAt: 0,
};

const uiState = {
  viewLocked: false,
  mapPanelCollapsed: false,
  tokenPanelCollapsed: false,
  selectedTokenIds: new Set(),
};

const els = {
  body: document.body,
  mapPanel: document.getElementById("mapPanel"),
  tokenPanel: document.getElementById("tokenPanel"),
  mapPanelBody: document.getElementById("mapPanelBody"),
  tokenPanelBody: document.getElementById("tokenPanelBody"),
  toggleMapPanel: document.getElementById("toggleMapPanel"),
  toggleTokenPanel: document.getElementById("toggleTokenPanel"),
  lockViewBtn: document.getElementById("lockViewBtn"),
  toggleUiBtn: document.getElementById("toggleUiBtn"),
  mapImage: document.getElementById("mapImage"),
  mapWrapper: document.getElementById("mapWrapper"),
  zoomLayer: document.getElementById("zoomLayer"),
  mapStage: document.getElementById("mapStage"),
  mapUpload: document.getElementById("mapUpload"),
  zoomInput: document.getElementById("zoomInput"),
  zoomIn: document.getElementById("zoomIn"),
  zoomOut: document.getElementById("zoomOut"),
  stageZoomText: document.getElementById("stageZoomText"),
  modeAlways: document.getElementById("modeAlways"),
  modeHover: document.getElementById("modeHover"),
  tokenLayer: document.getElementById("tokenLayer"),
  tokenList: document.getElementById("tokenList"),
  deleteSelectedBtn: document.getElementById("deleteSelectedBtn"),
  selectedCount: document.getElementById("selectedCount"),
  tokenForm: document.getElementById("tokenForm"),
  tokenName: document.getElementById("tokenName"),
  tokenColor: document.getElementById("tokenColor"),
  tokenImage: document.getElementById("tokenImage"),
  addTokenBtn: document.getElementById("addTokenBtn"),
  tokenTemplate: document.getElementById("tokenTemplate"),
};

const POLL_MS = 2000;
let syncing = false;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function toast(message) {
  alert(message);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    let msg = "请求失败";
    try {
      const data = await response.json();
      msg = data.error || msg;
    } catch {
      msg = await response.text();
    }
    throw new Error(msg || "请求失败");
  }

  return response.json();
}

async function loadStateFromServer() {
  const remote = await api("/api/state");
  applyIncomingState(remote, true);
}

function applyIncomingState(remote, force = false) {
  if (!force && Number(remote.updatedAt || 0) <= state.updatedAt) return;
  state.mapSrc = remote.mapSrc || "";
  state.mapScale = Number(remote.mapScale) || 100;
  state.stageZoom = Number(remote.stageZoom) || 1;
  state.mapOffsetX = Number(remote.mapOffsetX) || 0;
  state.mapOffsetY = Number(remote.mapOffsetY) || 0;
  state.tokens = Array.isArray(remote.tokens) ? remote.tokens : [];
  state.labelMode = remote.labelMode === "hover" ? "hover" : "always";
  state.updatedAt = Number(remote.updatedAt || 0);
  renderAll();
}

async function saveStateToServer() {
  if (syncing) return;
  syncing = true;
  try {
    const saved = await api("/api/state", {
      method: "PUT",
      body: JSON.stringify(state),
    });
    state.updatedAt = Number(saved.updatedAt || Date.now());
  } catch (error) {
    toast(`保存失败：${error.message}`);
  } finally {
    syncing = false;
  }
}

async function uploadImageFile(file) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });

  const result = await api("/api/upload-image", {
    method: "POST",
    body: JSON.stringify({ filename: file.name, dataUrl }),
  });

  return result.imageUrl;
}

function applyMap() {
  if (!state.mapSrc) {
    els.mapImage.style.display = "none";
    els.mapImage.removeAttribute("src");
  } else {
    els.mapImage.src = state.mapSrc;
    els.mapImage.style.display = "block";
  }

  els.mapWrapper.style.width = `${state.mapScale}%`;
  els.zoomInput.value = String(state.mapScale);
  els.zoomLayer.style.transform = `translate(${state.mapOffsetX}px, ${state.mapOffsetY}px) scale(${state.stageZoom})`;
  els.stageZoomText.textContent = `${Math.round(state.stageZoom * 100)}%`;

  const hoverMode = state.labelMode === "hover";
  els.body.classList.toggle("label-hover-mode", hoverMode);
  els.modeAlways.classList.toggle("active", !hoverMode);
  els.modeHover.classList.toggle("active", hoverMode);

  els.mapPanelBody.hidden = uiState.mapPanelCollapsed;
  els.tokenPanelBody.hidden = uiState.tokenPanelCollapsed;
  els.toggleMapPanel.textContent = uiState.mapPanelCollapsed ? "展开" : "收起";
  els.toggleTokenPanel.textContent = uiState.tokenPanelCollapsed ? "展开" : "收起";
  els.lockViewBtn.textContent = uiState.viewLocked ? "解除锁定地图与位置" : "锁定地图与位置";
}

function setMapScale(next) {
  if (uiState.viewLocked) return;
  state.mapScale = clamp(Math.round(next), 20, 300);
  renderAll();
  saveStateToServer();
}

function zoomAt(clientX, clientY, deltaY) {
  if (uiState.viewLocked) return;
  const rect = els.mapStage.getBoundingClientRect();
  const pointerX = clientX - rect.left;
  const pointerY = clientY - rect.top;
  const oldScale = state.stageZoom;
  const nextScale = clamp(Number((oldScale + (deltaY > 0 ? -0.1 : 0.1)).toFixed(2)), 0.3, 3);
  if (nextScale === oldScale) return;

  const mapX = (pointerX - state.mapOffsetX) / oldScale;
  const mapY = (pointerY - state.mapOffsetY) / oldScale;
  state.stageZoom = nextScale;
  state.mapOffsetX = pointerX - mapX * nextScale;
  state.mapOffsetY = pointerY - mapY * nextScale;
  renderAll();
  saveStateToServer();
}

function createToken(token) {
  const fragment = els.tokenTemplate.content.cloneNode(true);
  const node = fragment.querySelector(".token");
  const image = fragment.querySelector(".token-image");
  const dot = fragment.querySelector(".token-dot");
  const label = fragment.querySelector(".token-label");

  node.dataset.id = token.id;
  node.style.left = `${token.x}%`;
  node.style.top = `${token.y}%`;

  if (token.imageUrl) {
    const w = token.width || 100;
    const h = token.height || 100;
    image.src = token.imageUrl;
    image.style.display = "block";
    image.style.width = `${w}px`;
    image.style.height = `${h}px`;
    dot.style.display = "none";
    label.style.top = `${h / 2 + 6}px`;
  } else {
    const w = token.width || 24;
    const h = token.height || 24;
    image.style.display = "none";
    dot.style.display = "block";
    dot.style.background = token.color || "#e63946";
    dot.style.width = `${w}px`;
    dot.style.height = `${h}px`;
    label.style.top = `${h / 2 + 6}px`;
  }

  if (token.name) {
    label.textContent = token.name;
    label.style.setProperty("--label-scale", String((1 / state.stageZoom).toFixed(4)));
    if (state.labelMode === "hover") {
      label.hidden = true;
      node.addEventListener("mouseenter", () => (label.hidden = false));
      node.addEventListener("mouseleave", () => (label.hidden = true));
    } else {
      label.hidden = false;
    }
  } else {
    label.hidden = true;
  }

  node.classList.toggle("locked", Boolean(token.locked));
  if (!token.locked) enableDrag(node, token.id);
  els.tokenLayer.appendChild(fragment);
}

function animateToken(node, fromX, fromY, toX, toY) {
  const duration = 300;
  const start = performance.now();
  const easeOutCubic = (t) => 1 - (1 - t) ** 3;

  function step(now) {
    const t = clamp((now - start) / duration, 0, 1);
    const k = easeOutCubic(t);
    node.style.left = `${fromX + (toX - fromX) * k}%`;
    node.style.top = `${fromY + (toY - fromY) * k}%`;
    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

function enableDrag(node, tokenId) {
  let dragging = false;
  let ghost = null;
  let startX = 0;
  let startY = 0;

  node.addEventListener("pointerdown", (event) => {
    const token = state.tokens.find((item) => item.id === tokenId);
    if (!token || token.locked || uiState.viewLocked) return;
    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    startX = token.x;
    startY = token.y;
    ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    document.body.appendChild(ghost);
    ghost.style.left = `${event.clientX}px`;
    ghost.style.top = `${event.clientY}px`;
    node.setPointerCapture(event.pointerId);
  });

  node.addEventListener("pointermove", (event) => {
    if (!dragging || !ghost) return;
    ghost.style.left = `${event.clientX}px`;
    ghost.style.top = `${event.clientY}px`;
  });

  node.addEventListener("pointerup", async (event) => {
    if (!dragging) return;
    dragging = false;

    const token = state.tokens.find((item) => item.id === tokenId);
    if (!token) return;

    const rect = els.tokenLayer.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);
    token.x = x;
    token.y = y;
    animateToken(node, startX, startY, x, y);

    if (ghost) {
      ghost.remove();
      ghost = null;
    }

    renderTokenList();
    await saveStateToServer();
  });

  node.addEventListener("pointercancel", () => {
    dragging = false;
    if (ghost) ghost.remove();
    ghost = null;
  });
}

function renderTokens() {
  els.tokenLayer.innerHTML = "";
  state.tokens.forEach(createToken);
}

function renderTokenList() {
  els.tokenList.innerHTML = "";

  state.tokens.forEach((token, index) => {
    const item = document.createElement("li");
    item.className = "token-item";

    const topRow = document.createElement("div");
    topRow.className = "token-top-row";

    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = uiState.selectedTokenIds.has(token.id);
    check.addEventListener("change", () => {
      if (check.checked) uiState.selectedTokenIds.add(token.id);
      else uiState.selectedTokenIds.delete(token.id);
      updateSelectedCount();
    });

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = token.name || "";
    nameInput.placeholder = `${index + 1}. 未命名 Token`;

    const saveNameBtn = document.createElement("button");
    saveNameBtn.type = "button";
    saveNameBtn.textContent = "保存名";
    saveNameBtn.addEventListener("click", async () => {
      token.name = nameInput.value.trim();
      renderAll();
      await saveStateToServer();
    });

    topRow.append(check, nameInput, saveNameBtn);

    const sizeEdit = document.createElement("div");
    sizeEdit.className = "size-edit";
    const widthInput = document.createElement("input");
    widthInput.type = "number";
    widthInput.min = "16";
    widthInput.max = "512";
    widthInput.value = String(token.width || (token.imageUrl ? 100 : 24));
    const heightInput = document.createElement("input");
    heightInput.type = "number";
    heightInput.min = "16";
    heightInput.max = "512";
    heightInput.value = String(token.height || (token.imageUrl ? 100 : 24));
    const sizeBtn = document.createElement("button");
    sizeBtn.type = "button";
    sizeBtn.textContent = "改大小";
    sizeBtn.addEventListener("click", async () => {
      token.width = clamp(Number(widthInput.value) || 24, 16, 512);
      token.height = clamp(Number(heightInput.value) || 24, 16, 512);
      renderAll();
      await saveStateToServer();
    });
    sizeEdit.append(widthInput, heightInput, sizeBtn);

    const actions = document.createElement("div");
    actions.className = "token-actions";

    const lockBtn = document.createElement("button");
    lockBtn.type = "button";
    lockBtn.textContent = token.locked ? "解锁" : "锁定";
    lockBtn.addEventListener("click", async () => {
      token.locked = !token.locked;
      renderAll();
      await saveStateToServer();
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", async () => {
      state.tokens = state.tokens.filter((itemToken) => itemToken.id !== token.id);
      uiState.selectedTokenIds.delete(token.id);
      renderAll();
      await saveStateToServer();
    });

    actions.append(lockBtn, delBtn);
    item.append(topRow, sizeEdit, actions);
    els.tokenList.appendChild(item);
  });

  updateSelectedCount();
}

function updateSelectedCount() {
  let valid = 0;
  state.tokens.forEach((t) => {
    if (uiState.selectedTokenIds.has(t.id)) valid += 1;
  });
  els.selectedCount.textContent = `已选 ${valid} 个`;
}

function renderAll() {
  applyMap();
  renderTokens();
  renderTokenList();
}

function bindMapDrag() {
  let draggingMap = false;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;

  els.mapStage.addEventListener("pointerdown", (event) => {
    if (uiState.viewLocked) return;
    if (event.target.closest(".token") || event.target.closest(".draggable-panel") || event.target.closest(".floating-actions")) return;
    draggingMap = true;
    els.mapStage.classList.add("grabbing");
    startX = event.clientX;
    startY = event.clientY;
    baseX = state.mapOffsetX;
    baseY = state.mapOffsetY;
  });

  window.addEventListener("pointermove", (event) => {
    if (!draggingMap) return;
    state.mapOffsetX = baseX + (event.clientX - startX);
    state.mapOffsetY = baseY + (event.clientY - startY);
    applyMap();
  });

  window.addEventListener("pointerup", async () => {
    if (!draggingMap) return;
    draggingMap = false;
    els.mapStage.classList.remove("grabbing");
    await saveStateToServer();
  });
}

function clampPanelIntoViewport(panel) {
  const rect = panel.getBoundingClientRect();
  const maxLeft = window.innerWidth - rect.width - 8;
  const maxTop = window.innerHeight - rect.height - 8;
  panel.style.left = `${clamp(rect.left, 8, Math.max(8, maxLeft))}px`;
  panel.style.top = `${clamp(rect.top, 8, Math.max(8, maxTop))}px`;
  panel.style.right = "auto";
}

function initPanels() {
  const panelWidth = Math.min(360, window.innerWidth - 24);
  [els.mapPanel, els.tokenPanel].forEach((panel, i) => {
    panel.style.width = `${panelWidth}px`;
    panel.style.left = `${window.innerWidth - panelWidth - 12}px`;
    panel.style.top = `${i === 0 ? 86 : 360}px`;
    panel.style.right = "auto";
    clampPanelIntoViewport(panel);
  });
}

function makePanelDraggable(panel) {
  const handle = panel.querySelector(".drag-handle");
  if (!handle) return;

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener("pointerdown", (event) => {
    if (uiState.viewLocked || event.target.closest(".header-btn")) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    panel.style.left = `${event.clientX - offsetX}px`;
    panel.style.top = `${event.clientY - offsetY}px`;
    panel.style.right = "auto";
    clampPanelIntoViewport(panel);
  });

  handle.addEventListener("pointerup", () => {
    dragging = false;
    clampPanelIntoViewport(panel);
  });
}

function attachEvents() {
  els.toggleUiBtn.addEventListener("click", () => {
    els.body.classList.toggle("ui-hidden");
    els.toggleUiBtn.textContent = els.body.classList.contains("ui-hidden") ? "恢复UI" : "一键隐藏UI";
  });

  els.lockViewBtn.addEventListener("click", () => {
    uiState.viewLocked = !uiState.viewLocked;
    applyMap();
  });

  els.toggleMapPanel.addEventListener("click", () => {
    uiState.mapPanelCollapsed = !uiState.mapPanelCollapsed;
    applyMap();
  });

  els.toggleTokenPanel.addEventListener("click", () => {
    uiState.tokenPanelCollapsed = !uiState.tokenPanelCollapsed;
    applyMap();
  });

  els.mapUpload.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      state.mapSrc = await uploadImageFile(file);
      renderAll();
      await saveStateToServer();
    } catch (error) {
      toast(`地图上传失败：${error.message}`);
    } finally {
      els.mapUpload.value = "";
    }
  });

  els.zoomInput.addEventListener("change", () => setMapScale(Number(els.zoomInput.value)));
  els.zoomIn.addEventListener("click", () => setMapScale(state.mapScale + 5));
  els.zoomOut.addEventListener("click", () => setMapScale(state.mapScale - 5));

  els.modeAlways.addEventListener("click", async () => {
    state.labelMode = "always";
    renderAll();
    await saveStateToServer();
  });

  els.modeHover.addEventListener("click", async () => {
    state.labelMode = "hover";
    renderAll();
    await saveStateToServer();
  });

  els.mapStage.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY);
    },
    { passive: false }
  );

  const handleAddToken = async (event) => {
    event?.preventDefault();
    els.addTokenBtn.disabled = true;
    els.addTokenBtn.textContent = "上传中...";

    try {
      const imageFile = (els.tokenImage.files || [])[0];
      const imageUrl = imageFile ? await uploadImageFile(imageFile) : "";
      const token = {
        id: crypto.randomUUID(),
        name: els.tokenName.value.trim(),
        color: els.tokenColor.value,
        imageUrl,
        width: imageUrl ? 100 : 24,
        height: imageUrl ? 100 : 24,
        x: 50,
        y: 50,
        locked: false,
      };
      state.tokens.push(token);
      renderAll();
      await saveStateToServer();
      els.tokenForm.reset();
      els.tokenColor.value = "#e63946";
    } catch (error) {
      toast(`新增 Token 失败：${error.message}`);
    } finally {
      els.addTokenBtn.disabled = false;
      els.addTokenBtn.textContent = "新增 Token";
    }
  };

  els.tokenForm.addEventListener("submit", handleAddToken);
  els.addTokenBtn.addEventListener("click", handleAddToken);

  els.deleteSelectedBtn.addEventListener("click", async () => {
    const ids = Array.from(uiState.selectedTokenIds);
    if (ids.length === 0) return;
    state.tokens = state.tokens.filter((token) => !uiState.selectedTokenIds.has(token.id));
    uiState.selectedTokenIds.clear();
    renderAll();
    await saveStateToServer();
  });

  bindMapDrag();
  makePanelDraggable(els.mapPanel);
  makePanelDraggable(els.tokenPanel);
  initPanels();

  window.addEventListener("resize", () => {
    clampPanelIntoViewport(els.mapPanel);
    clampPanelIntoViewport(els.tokenPanel);
  });
}

async function start() {
  attachEvents();
  await loadStateFromServer();
  setInterval(async () => {
    try {
      const remote = await api("/api/state");
      applyIncomingState(remote);
    } catch {
      // ignore polling errors
    }
  }, POLL_MS);
}

start();
