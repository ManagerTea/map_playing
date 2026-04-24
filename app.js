const state = {
  mapSrc: "",
  mapScale: 100,
  stageZoom: 1,
  tokens: [],
  updatedAt: 0,
};

const els = {
  mapImage: document.getElementById("mapImage"),
  mapWrapper: document.getElementById("mapWrapper"),
  zoomLayer: document.getElementById("zoomLayer"),
  mapStage: document.getElementById("mapStage"),
  mapUpload: document.getElementById("mapUpload"),
  zoomInput: document.getElementById("zoomInput"),
  zoomIn: document.getElementById("zoomIn"),
  zoomOut: document.getElementById("zoomOut"),
  stageZoomText: document.getElementById("stageZoomText"),
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
  state.tokens = Array.isArray(remote.tokens) ? remote.tokens : [];
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
    body: JSON.stringify({
      filename: file.name,
      dataUrl,
    }),
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

  els.zoomLayer.style.transform = `scale(${state.stageZoom})`;
  els.stageZoomText.textContent = `${Math.round(state.stageZoom * 100)}%`;
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
    image.src = token.imageUrl;
    image.style.display = "block";
    image.style.width = `${token.width || 100}px`;
    image.style.height = `${token.height || 100}px`;
    dot.style.display = "none";
  } else {
    image.style.display = "none";
    dot.style.display = "block";
    dot.style.background = token.color || "#e63946";
  }

  if (token.name) {
    label.textContent = token.name;
    label.hidden = false;
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
    title.textContent = `${index + 1}. ${token.name || "未命名 Token"} (${Math.round(token.x)}%, ${Math.round(token.y)}%)`;

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
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", async () => {
      const nextName = prompt("输入新名字（可留空）", token.name || "");
      if (nextName === null) return;
      token.name = nextName.trim();

      if (token.imageUrl) {
        const sizeText = prompt("输入图片尺寸（宽x高），例如 120x100", `${token.width || 100}x${token.height || 100}`);
        if (sizeText && /^\d+x\d+$/i.test(sizeText.trim())) {
          const [w, h] = sizeText.toLowerCase().split("x").map((n) => Number(n));
          token.width = clamp(w, 24, 512);
          token.height = clamp(h, 24, 512);
        }
      }

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
    item.append(title, actions);
    els.tokenList.appendChild(item);
  });
}

function renderAll() {
  applyMap();
  renderTokens();
  renderTokenList();
}

function attachEvents() {
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

  els.mapStage.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? -0.1 : 0.1;
      setStageZoom(Number((state.stageZoom + factor).toFixed(2)));
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
        width: 100,
        height: 100,
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
