const state = {
  mapSrc: "",
  mapScale: 100,
  tokens: [],
};

const els = {
  mapImage: document.getElementById("mapImage"),
  mapWrapper: document.getElementById("mapWrapper"),
  mapUpload: document.getElementById("mapUpload"),
  zoomInput: document.getElementById("zoomInput"),
  zoomIn: document.getElementById("zoomIn"),
  zoomOut: document.getElementById("zoomOut"),
  tokenLayer: document.getElementById("tokenLayer"),
  tokenList: document.getElementById("tokenList"),
  tokenForm: document.getElementById("tokenForm"),
  tokenName: document.getElementById("tokenName"),
  tokenColor: document.getElementById("tokenColor"),
  tokenTemplate: document.getElementById("tokenTemplate"),
};

const STORAGE_KEY = "map_helper_v1";

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (data && typeof data === "object") {
      state.mapSrc = data.mapSrc || "";
      state.mapScale = Number(data.mapScale) || 100;
      state.tokens = Array.isArray(data.tokens) ? data.tokens : [];
    }
  } catch {
    // ignore broken local cache
  }
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function applyMap() {
  if (!state.mapSrc) {
    els.mapImage.style.display = "none";
    els.mapImage.removeAttribute("src");
    return;
  }
  els.mapImage.src = state.mapSrc;
  els.mapImage.style.display = "block";
  els.mapWrapper.style.width = `${state.mapScale}%`;
  els.zoomInput.value = String(state.mapScale);
}

function setMapScale(next) {
  state.mapScale = clamp(Math.round(next), 20, 300);
  els.mapWrapper.style.width = `${state.mapScale}%`;
  els.zoomInput.value = String(state.mapScale);
  saveState();
}

function createToken(token) {
  const fragment = els.tokenTemplate.content.cloneNode(true);
  const node = fragment.querySelector(".token");
  const dot = fragment.querySelector(".token-dot");
  const label = fragment.querySelector(".token-label");

  node.dataset.id = token.id;
  node.style.left = `${token.x}%`;
  node.style.top = `${token.y}%`;
  dot.style.background = token.color;

  if (token.name) {
    label.textContent = token.name;
    label.hidden = false;
  } else {
    label.hidden = true;
  }

  node.classList.toggle("locked", token.locked);
  if (!token.locked) {
    enableDrag(node, token.id);
  }

  els.tokenLayer.appendChild(fragment);
}

function animateToken(node, fromX, fromY, toX, toY) {
  const duration = 300;
  const start = performance.now();

  function easeOutCubic(t) {
    return 1 - (1 - t) ** 3;
  }

  function step(now) {
    const t = clamp((now - start) / duration, 0, 1);
    const k = easeOutCubic(t);
    const x = fromX + (toX - fromX) * k;
    const y = fromY + (toY - fromY) * k;
    node.style.left = `${x}%`;
    node.style.top = `${y}%`;
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
    ghost.style.background = token.color;
    document.body.appendChild(ghost);
    moveGhost(event.clientX, event.clientY);
    node.setPointerCapture(event.pointerId);
  });

  node.addEventListener("pointermove", (event) => {
    if (!dragging || !ghost) return;
    moveGhost(event.clientX, event.clientY);
  });

  node.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    dragging = false;

    const token = state.tokens.find((item) => item.id === tokenId);
    if (!token) return;

    const rect = els.tokenLayer.getBoundingClientRect();
    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);

    token.x = x;
    token.y = y;
    saveState();
    animateToken(node, startX, startY, x, y);

    if (ghost) {
      ghost.remove();
      ghost = null;
    }

    renderTokenList();
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
    lockBtn.addEventListener("click", () => {
      token.locked = !token.locked;
      saveState();
      renderAll();
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "编辑";
    editBtn.addEventListener("click", () => {
      const nextName = prompt("输入新名字（可留空）", token.name || "");
      if (nextName === null) return;
      token.name = nextName.trim();
      saveState();
      renderAll();
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", () => {
      state.tokens = state.tokens.filter((item) => item.id !== token.id);
      saveState();
      renderAll();
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
    const reader = new FileReader();
    reader.onload = () => {
      state.mapSrc = String(reader.result || "");
      saveState();
      applyMap();
    };
    reader.readAsDataURL(file);
  });

  els.zoomInput.addEventListener("change", () => {
    setMapScale(Number(els.zoomInput.value));
  });

  els.zoomIn.addEventListener("click", () => setMapScale(state.mapScale + 5));
  els.zoomOut.addEventListener("click", () => setMapScale(state.mapScale - 5));

  els.tokenForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const token = {
      id: crypto.randomUUID(),
      name: els.tokenName.value.trim(),
      color: els.tokenColor.value,
      x: 50,
      y: 50,
      locked: false,
    };

    state.tokens.push(token);
    saveState();
    els.tokenForm.reset();
    els.tokenColor.value = "#e63946";
    renderAll();
  });
}

loadState();
attachEvents();
renderAll();
