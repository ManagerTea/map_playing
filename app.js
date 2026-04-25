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

const els = {
  body: document.body,
  introBar: document.getElementById("introBar"),
  mapPanel: document.getElementById("mapPanel"),
  tokenPanel: document.getElementById("tokenPanel"),
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
  labelMode: document.getElementById("labelMode"),
  tokenLayer: document.getElementById("tokenLayer"),
  tokenList: document.getElementById("tokenList"),
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

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "请求失败");
  }
  return response.json();
}

async function loadStateFromServer() {
  const remote = await api("/api/state");
  applyIncomingState(remote, true);
}

function applyIncomingState(remote, force = false) {
  if (!force && Number(remote.updatedAt || 0) <= state.updatedAt) {
    return;
  }

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
  els.labelMode.value = state.labelMode;
  els.body.classList.toggle("label-hover-mode", state.labelMode === "hover");
}

function setMapScale(next) {
  state.mapScale = clamp(Math.round(next), 20, 300);
  renderAll();
  saveStateToServer();
}

function setStageZoom(next) {
  state.stageZoom = clamp(next, 0.3, 3);
  renderAll();
  saveStateToServer();
}

function zoomAt(clientX, clientY, deltaY) {
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
      node.addEventListener("mouseenter", () => {
        label.hidden = false;
      });
      node.addEventListener("mouseleave", () => {
        label.hidden = true;
      });
    } else {
      label.hidden = false;
    }
  } else {
    label.hidden = true;
  }

  node.classList.toggle("locked", Boolean(token.locked));
  if (!token.locked) {
    enableDrag(node, token.id);
  }

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
    if (!token || token.locked) return;

    event.preventDefault();
    event.stopPropagation();
    dragging = true;
    startX = token.x;
    startY = token.y;

    ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    document.body.appendChild(ghost);
    moveGhost(event.clientX, event.clientY);
    node.setPointerCapture(event.pointerId);
  });

  node.addEventListener("pointermove", (event) => {
    if (!dragging || !ghost) return;
    moveGhost(event.clientX, event.clientY);
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
    if (ghost) {
      ghost.remove();
      ghost = null;
    }
  });

  function moveGhost(x, y) {
    if (!ghost) return;
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
  }
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

    const title = document.createElement("div");
    title.textContent = `${index + 1}. ${token.name || "未命名 Token"}`;

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

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "改名";
    editBtn.addEventListener("click", async () => {
      const nextName = prompt("输入新名字（可留空）", token.name || "");
      if (nextName === null) return;
      token.name = nextName.trim();
      renderAll();
      await saveStateToServer();
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", async () => {
      state.tokens = state.tokens.filter((itemToken) => itemToken.id !== token.id);
      renderAll();
      await saveStateToServer();
    });

    actions.append(lockBtn, editBtn, delBtn);
    item.append(title, sizeEdit, actions);
    els.tokenList.appendChild(item);
  });
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
    if (event.target.closest(".token") || event.target.closest(".draggable-panel") || event.target.closest("#toggleUiBtn")) {
      return;
    }
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

function makePanelDraggable(panel) {
  const handle = panel.querySelector(".drag-handle");
  if (!handle) return;

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener("pointerdown", (event) => {
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

  handle.addEventListener("pointercancel", () => {
    dragging = false;
    clampPanelIntoViewport(panel);
  });
}


function clampPanelIntoViewport(panel) {
  const rect = panel.getBoundingClientRect();
  const maxLeft = window.innerWidth - rect.width - 8;
  const maxTop = window.innerHeight - rect.height - 8;
  const left = clamp(rect.left, 8, Math.max(8, maxLeft));
  const top = clamp(rect.top, 8, Math.max(8, maxTop));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.style.right = "auto";
}

function initPanels() {
  const panelWidth = Math.min(360, window.innerWidth - 24);
  els.mapPanel.style.width = `${panelWidth}px`;
  els.tokenPanel.style.width = `${panelWidth}px`;

  els.mapPanel.style.left = `${window.innerWidth - panelWidth - 12}px`;
  els.mapPanel.style.top = `86px`;
  els.mapPanel.style.right = "auto";

  els.tokenPanel.style.left = `${window.innerWidth - panelWidth - 12}px`;
  els.tokenPanel.style.top = `360px`;
  els.tokenPanel.style.right = "auto";

  clampPanelIntoViewport(els.mapPanel);
  clampPanelIntoViewport(els.tokenPanel);
}

function attachEvents() {
  els.toggleUiBtn.addEventListener("click", () => {
    els.body.classList.toggle("ui-hidden");
    els.toggleUiBtn.textContent = els.body.classList.contains("ui-hidden") ? "恢复UI" : "一键隐藏UI";
  });

  els.mapUpload.addEventListener("change", async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    state.mapSrc = await uploadImageFile(file);
    renderAll();
    await saveStateToServer();
    els.mapUpload.value = "";
  });

  els.zoomInput.addEventListener("change", () => {
    setMapScale(Number(els.zoomInput.value));
  });

  els.zoomIn.addEventListener("click", () => setMapScale(state.mapScale + 5));
  els.zoomOut.addEventListener("click", () => setMapScale(state.mapScale - 5));

  els.labelMode.addEventListener("change", async () => {
    state.labelMode = els.labelMode.value === "hover" ? "hover" : "always";
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

  els.tokenForm.addEventListener("submit", async (event) => {
    event.preventDefault();
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
    } finally {
      els.addTokenBtn.disabled = false;
      els.addTokenBtn.textContent = "新增 Token";
    }
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
