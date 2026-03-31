(() => {
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");
  const wrap = document.getElementById("stageWrap");
  const fileInput = document.getElementById("fileInput");
  const slider = document.getElementById("straightenSlider");

  const buttons = {
    loadBtn: document.getElementById("loadBtn"),
    moreBtn: document.getElementById("moreBtn"),
    applyBtn: document.getElementById("applyBtn"),
    downloadBtn: document.getElementById("downloadBtn"),
    cancelBtn: document.getElementById("cancelBtn"),
    rotate90Btn: document.getElementById("rotate90Btn"),
    mirrorBtn: document.getElementById("mirrorBtn"),
    aspectBtn: document.getElementById("aspectBtn"),
    moveModeBtn: document.getElementById("moveModeBtn"),
    cropModeBtn: document.getElementById("cropModeBtn"),
    straightenModeBtn: document.getElementById("straightenModeBtn"),
  };

  const ratioButtons = [...document.querySelectorAll("#ratioSeg button")];

  const state = {
    img: null,
    baseRotation: 0,
    straightenDeg: 0,
    flipX: 1,
    scale: 1,
    minScale: 0.2,
    maxScale: 8,
    tx: 0,
    ty: 0,
    mode: "move", // move | crop | straighten
    activeRatio: "free",
    crop: { x: 120, y: 120, w: 260, h: 260 },
    dragging: null,
    pointers: new Map(),
    pinchStart: null,
    didMove: false,
  };

  const HANDLE = 18;
  const MIN_CROP = 80;

  function setMode(mode) {
    state.mode = mode;
    buttons.moveModeBtn.classList.toggle("active", mode === "move");
    buttons.cropModeBtn.classList.toggle("active", mode === "crop");
    buttons.straightenModeBtn.classList.toggle("active", mode === "straighten");
    slider.style.opacity = mode === "straighten" ? "1" : ".7";
    draw();
  }

  function resizeCanvas() {
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!state.img) {
      resetCropToDefault();
    } else {
      clampImageIntoCrop();
    }

    draw();
  }

  function resetCropToDefault() {
    const rect = wrap.getBoundingClientRect();
    const margin = Math.max(26, Math.min(rect.width, rect.height) * 0.1);
    const size = Math.min(rect.width, rect.height) - margin * 2;

    state.crop = {
      x: Math.round((rect.width - size) / 2),
      y: Math.round((rect.height - size) / 2),
      w: Math.round(size),
      h: Math.round(size),
    };
  }

  function getTotalRotationRad() {
    return ((state.baseRotation + state.straightenDeg) * Math.PI) / 180;
  }

  function fitImageToCrop() {
    if (!state.img) return;

    const crop = state.crop;
    const rad = getTotalRotationRad();
    const c = Math.abs(Math.cos(rad));
    const s = Math.abs(Math.sin(rad));
    const rotatedW = state.img.width * c + state.img.height * s;
    const rotatedH = state.img.width * s + state.img.height * c;

    state.scale = Math.max(crop.w / rotatedW, crop.h / rotatedH);
    state.tx = crop.x + crop.w / 2;
    state.ty = crop.y + crop.h / 2;
    state.minScale = state.scale * 0.85;
    state.maxScale = Math.max(state.minScale * 10, 8);
  }

  function loadImageFromURL(src) {
    const img = new Image();

    img.onload = () => {
      state.img = img;
      state.baseRotation = 0;
      state.straightenDeg = 0;
      state.flipX = 1;
      slider.value = 0;

      resetCropToDefault();
      fitImageToCrop();
      clampImageIntoCrop();
      draw();
    };

    img.src = src;
  }

  function ensureDemoImage() {
    if (state.img) return;

    const off = document.createElement("canvas");
    off.width = 1200;
    off.height = 1600;
    const o = off.getContext("2d");

    const g = o.createLinearGradient(0, 0, 1200, 1600);
    g.addColorStop(0, "#d6e6ff");
    g.addColorStop(0.5, "#fff4d6");
    g.addColorStop(1, "#ffd8de");
    o.fillStyle = g;
    o.fillRect(0, 0, off.width, off.height);

    o.save();
    o.translate(600, 800);
    o.rotate(-0.08);
    o.fillStyle = "rgba(255,255,255,.86)";
    roundRect(o, -340, -520, 680, 1040, 40);
    o.fill();

    o.fillStyle = "#2b2b2b";
    o.font = "bold 92px -apple-system, sans-serif";
    o.fillText("Crop", -160, -320);
    o.font = "64px -apple-system, sans-serif";
    o.fillText("iPhone-style demo", -260, -240);

    o.strokeStyle = "rgba(43,43,43,.15)";
    o.lineWidth = 4;
    for (let i = 0; i < 8; i++) {
      o.beginPath();
      o.moveTo(-250, -150 + i * 90);
      o.lineTo(250, -150 + i * 90);
      o.stroke();
    }

    o.fillStyle = "#111";
    o.beginPath();
    o.arc(0, 210, 170, 0, Math.PI * 2);
    o.fill();

    o.fillStyle = "#fff";
    o.font = "bold 90px -apple-system, sans-serif";
    o.fillText("JS", -55, 245);
    o.restore();

    loadImageFromURL(off.toDataURL("image/png"));
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawImageLayer() {
    if (!state.img) return;

    ctx.save();
    ctx.translate(state.tx, state.ty);
    ctx.rotate(getTotalRotationRad());
    ctx.scale(state.scale * state.flipX, state.scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(state.img, -state.img.width / 2, -state.img.height / 2);
    ctx.restore();
  }

  function drawCropOverlay() {
    const { x, y, w, h } = state.crop;

    ctx.save();

    ctx.fillStyle = "rgba(0,0,0,.42)";
    ctx.beginPath();
    ctx.rect(0, 0, wrap.clientWidth, wrap.clientHeight);
    ctx.rect(x, y, w, h);
    ctx.fill("evenodd");

    ctx.strokeStyle = "rgba(255,255,255,.96)";
    ctx.lineWidth = 1.6;
    ctx.strokeRect(x, y, w, h);

    const showGrid =
      state.dragging || state.mode === "crop" || state.mode === "straighten";

    if (showGrid) {
      ctx.strokeStyle = "rgba(255,255,255,.42)";
      ctx.lineWidth = 1;

      for (let i = 1; i < 3; i++) {
        const gx = x + (w * i) / 3;
        const gy = y + (h * i) / 3;

        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.lineTo(gx, y + h);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.lineTo(x + w, gy);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = "white";
    ctx.lineWidth = 4;
    const len = 18;

    ctx.beginPath();
    ctx.moveTo(x, y + len);
    ctx.lineTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + w - len, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + len);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + w, y + h - len);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w - len, y + h);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + len, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + h - len);
    ctx.stroke();

    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
    drawImageLayer();
    drawCropOverlay();
  }

  function clampCropToBounds() {
    const maxW = wrap.clientWidth - 20;
    const maxH = wrap.clientHeight - 20;

    state.crop.w = Math.min(Math.max(state.crop.w, MIN_CROP), maxW);
    state.crop.h = Math.min(Math.max(state.crop.h, MIN_CROP), maxH);
    state.crop.x = Math.min(
      Math.max(state.crop.x, 10),
      wrap.clientWidth - state.crop.w - 10
    );
    state.crop.y = Math.min(
      Math.max(state.crop.y, 10),
      wrap.clientHeight - state.crop.h - 10
    );
  }

  function applyRatio(currentHandle = null) {
    const r = state.activeRatio;
    if (r === "free") return;

    const ratio = Number(r);
    if (!Number.isFinite(ratio) || ratio <= 0) return;

    let { x, y, w, h } = state.crop;

    if (currentHandle) {
      if (["n", "s"].includes(currentHandle)) {
        w = h * ratio;
      } else {
        h = w / ratio;
      }
    } else {
      const cx = x + w / 2;
      const cy = y + h / 2;

      if (w / h > ratio) {
        w = h * ratio;
      } else {
        h = w / ratio;
      }

      x = cx - w / 2;
      y = cy - h / 2;
    }

    state.crop = { x, y, w, h };
    clampCropToBounds();
  }

  function clampImageIntoCrop() {
    if (!state.img) return;

    const crop = state.crop;
    const rad = getTotalRotationRad();
    const c = Math.abs(Math.cos(rad));
    const s = Math.abs(Math.sin(rad));
    const rotatedW = state.img.width * c + state.img.height * s;
    const rotatedH = state.img.width * s + state.img.height * c;

    const minScaleToCover = Math.max(crop.w / rotatedW, crop.h / rotatedH);
    state.minScale = minScaleToCover * 0.85;

    if (state.scale < minScaleToCover) {
      state.scale = minScaleToCover;
    }

    const bboxW = rotatedW * state.scale;
    const bboxH = rotatedH * state.scale;

    const minTx = crop.x + crop.w - bboxW / 2;
    const maxTx = crop.x + bboxW / 2;
    const minTy = crop.y + crop.h - bboxH / 2;
    const maxTy = crop.y + bboxH / 2;

    state.tx = Math.min(Math.max(state.tx, minTx), maxTx);
    state.ty = Math.min(Math.max(state.ty, minTy), maxTy);
  }

  function hitTestCrop(px, py) {
    const { x, y, w, h } = state.crop;

    const left = Math.abs(px - x) <= HANDLE;
    const right = Math.abs(px - (x + w)) <= HANDLE;
    const top = Math.abs(py - y) <= HANDLE;
    const bottom = Math.abs(py - (y + h)) <= HANDLE;
    const inside = px > x && px < x + w && py > y && py < y + h;

    if (left && top) return "nw";
    if (right && top) return "ne";
    if (right && bottom) return "se";
    if (left && bottom) return "sw";
    if (top && px > x && px < x + w) return "n";
    if (bottom && px > x && px < x + w) return "s";
    if (left && py > y && py < y + h) return "w";
    if (right && py > y && py < y + h) return "e";
    if (inside) return "move";

    return null;
  }

  function updateCropByHandle(handle, dx, dy) {
    let { x, y, w, h } = state.dragging.startCrop;

    if (handle === "move") {
      x += dx;
      y += dy;
    } else {
      if (handle.includes("e")) w += dx;
      if (handle.includes("s")) h += dy;
      if (handle.includes("w")) {
        x += dx;
        w -= dx;
      }
      if (handle.includes("n")) {
        y += dy;
        h -= dy;
      }
    }

    state.crop = { x, y, w, h };

    if (state.activeRatio !== "free" && handle !== "move") {
      const ratio = Number(state.activeRatio);
      const anchor = state.dragging.startCrop;
      let c = state.crop;

      if (["e", "w"].includes(handle)) {
        c.h = c.w / ratio;
      } else if (["n", "s"].includes(handle)) {
        c.w = c.h * ratio;
      } else {
        const useW =
          Math.abs(c.w - anchor.w) >= Math.abs(c.h - anchor.h) * ratio;

        if (useW) {
          c.h = c.w / ratio;
        } else {
          c.w = c.h * ratio;
        }
      }

      const ax = handle.includes("w") ? anchor.x + anchor.w : anchor.x;
      const ay = handle.includes("n") ? anchor.y + anchor.h : anchor.y;

      if (handle.includes("w")) c.x = ax - c.w;
      else c.x = ax;

      if (handle.includes("n")) c.y = ay - c.h;
      else c.y = ay;

      if (handle === "e" || handle === "w") {
        c.y = anchor.y + (anchor.h - c.h) / 2;
      }

      if (handle === "n" || handle === "s") {
        c.x = anchor.x + (anchor.w - c.w) / 2;
      }

      state.crop = c;
    }

    clampCropToBounds();
    clampImageIntoCrop();
    draw();
  }

  function getEventPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    const p = getEventPoint(e);
    state.pointers.set(e.pointerId, p);
    state.didMove = false;

    if (state.pointers.size === 2 && state.img) {
      const pts = [...state.pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);

      state.pinchStart = {
        dist: d,
        scale: state.scale,
        tx: state.tx,
        ty: state.ty,
        center: {
          x: (pts[0].x + pts[1].x) / 2,
          y: (pts[0].y + pts[1].y) / 2,
        },
      };
      return;
    }

    if (state.mode === "crop") {
      const handle = hitTestCrop(p.x, p.y);
      if (handle) {
        state.dragging = {
          type: "crop",
          handle,
          start: p,
          startCrop: { ...state.crop },
        };
        draw();
        return;
      }
    }

    state.dragging = {
      type: "image",
      start: p,
      startTx: state.tx,
      startTy: state.ty,
    };

    canvas.classList.add("dragging");
  }

  function onPointerMove(e) {
    if (!state.pointers.has(e.pointerId)) return;

    const p = getEventPoint(e);
    state.pointers.set(e.pointerId, p);

    if (state.pointers.size === 2 && state.img && state.pinchStart) {
      const pts = [...state.pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const center = {
        x: (pts[0].x + pts[1].x) / 2,
        y: (pts[0].y + pts[1].y) / 2,
      };

      const factor = d / state.pinchStart.dist;

      state.scale = Math.min(
        state.maxScale,
        Math.max(state.minScale, state.pinchStart.scale * factor)
      );

      state.tx = state.pinchStart.tx + (center.x - state.pinchStart.center.x);
      state.ty = state.pinchStart.ty + (center.y - state.pinchStart.center.y);

      clampImageIntoCrop();
      state.didMove = true;
      draw();
      return;
    }

    if (!state.dragging) return;

    const dx = p.x - state.dragging.start.x;
    const dy = p.y - state.dragging.start.y;

    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      state.didMove = true;
    }

    if (state.dragging.type === "image") {
      state.tx = state.dragging.startTx + dx;
      state.ty = state.dragging.startTy + dy;
      clampImageIntoCrop();
      draw();
    } else if (state.dragging.type === "crop") {
      updateCropByHandle(state.dragging.handle, dx, dy);
    }
  }

  function onPointerUp(e) {
    state.pointers.delete(e.pointerId);

    if (state.pointers.size < 2) {
      state.pinchStart = null;
    }

    state.dragging = null;
    canvas.classList.remove("dragging");
    draw();
  }

  function onWheel(e) {
    e.preventDefault();
    if (!state.img) return;

    const factor = Math.exp(-e.deltaY * 0.0015);
    state.scale = Math.min(
      state.maxScale,
      Math.max(state.minScale, state.scale * factor)
    );

    clampImageIntoCrop();
    draw();
  }

  function rotate90() {
    state.baseRotation = (state.baseRotation + 90) % 360;
    fitImageToCrop();
    clampImageIntoCrop();
    draw();
  }

  function mirror() {
    state.flipX *= -1;
    clampImageIntoCrop();
    draw();
  }

  function nextAspect() {
    const order = ["free", "1", "1.3333333333", "1.7777777778"];
    const idx = order.indexOf(state.activeRatio);
    setRatio(order[(idx + 1) % order.length]);
  }

  function setRatio(r) {
    state.activeRatio = r;

    ratioButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.ratio === r);
    });

    applyRatio();
    clampImageIntoCrop();
    draw();
  }

  function exportCanvas() {
    if (!state.img) return null;

    const crop = state.crop;
    const out = document.createElement("canvas");
    const scaleFactor = Math.min(3, Math.max(1, 2048 / Math.max(crop.w, crop.h)));

    out.width = Math.round(crop.w * scaleFactor);
    out.height = Math.round(crop.h * scaleFactor);

    const o = out.getContext("2d");
    o.scale(scaleFactor, scaleFactor);
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = "high";

    o.save();
    o.beginPath();
    o.rect(0, 0, crop.w, crop.h);
    o.clip();

    o.translate(state.tx - crop.x, state.ty - crop.y);
    o.rotate(getTotalRotationRad());
    o.scale(state.scale * state.flipX, state.scale);
    o.drawImage(state.img, -state.img.width / 2, -state.img.height / 2);
    o.restore();

    return out;
  }

  function downloadPNG() {
    const out = exportCanvas();
    if (!out) return;

    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = "iphone-style-crop.png";
    a.click();
  }

  function resetAll() {
    if (!state.img) {
      ensureDemoImage();
      return;
    }

    state.baseRotation = 0;
    state.straightenDeg = 0;
    slider.value = 0;
    state.flipX = 1;
    resetCropToDefault();
    fitImageToCrop();
    clampImageIntoCrop();
    draw();
  }

  function bind() {
    window.addEventListener("resize", resizeCanvas);

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    buttons.loadBtn.addEventListener("click", () => fileInput.click());
    buttons.moreBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const url = URL.createObjectURL(file);
      loadImageFromURL(url);
    });

    buttons.rotate90Btn.addEventListener("click", rotate90);
    buttons.mirrorBtn.addEventListener("click", mirror);
    buttons.aspectBtn.addEventListener("click", nextAspect);
    buttons.cancelBtn.addEventListener("click", resetAll);
    buttons.applyBtn.addEventListener("click", downloadPNG);
    buttons.downloadBtn.addEventListener("click", downloadPNG);

    buttons.moveModeBtn.addEventListener("click", () => setMode("move"));
    buttons.cropModeBtn.addEventListener("click", () => setMode("crop"));
    buttons.straightenModeBtn.addEventListener("click", () => setMode("straighten"));

    slider.addEventListener("input", (e) => {
      state.straightenDeg = Number(e.target.value);
      clampImageIntoCrop();
      draw();
    });

    ratioButtons.forEach((btn) => {
      btn.addEventListener("click", () => setRatio(btn.dataset.ratio));
    });
  }

  bind();
  resizeCanvas();
  ensureDemoImage();
})();
