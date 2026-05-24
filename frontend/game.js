/**
 * game.js — Асык (Kazakh Knucklebones) game logic
 * Physics: drag Sak with mouse → release → collide with target Asyks → knock them out of ring
 */

// ── Config ───────────────────────────────────────────────────────────────────
const API_BASE = "https://asyk.onrender.com"; // ← замените на свой Render URL

const CFG = {
  ringRadius: 160,
  sakRadius: 18,
  asykRadius: 15,  // collision radius (bone is taller but we keep hitbox compact)
  asykCount: 10,
  friction: 0.985,
  restitution: 0.72,
  maxPullDist: 110,
  minSpeed: 0.15,
  colors: {
    ring: "rgba(232,146,26,0.18)",
    ringBorder: "#e8921a",
    ringInner: "rgba(255,200,80,0.08)",
    sak: "#ffc84a",
    sakStroke: "#a06010",
    sakHighlight: "rgba(255,255,200,0.55)",
    asyk: "#e8921a",
    asykDark: "#7a3800",
    asykHighlight: "rgba(255,230,120,0.6)",
    asykOut: "rgba(200,120,40,0.12)",
    guide: "rgba(255,200,80,0.3)",
    bg: "transparent", // bg drawn by bg-canvas
  },
};

// ── State ─────────────────────────────────────────────────────────────────────
let canvas, ctx, cx, cy;
let sak, asyks, moves, score;
let drag = { active: false, startX: 0, startY: 0, curX: 0, curY: 0 };
let animId = null;
let playerName = "";
let gameOver = false;
let hitEffects = []; // {x,y,r,alpha,color}
let scorePopups = []; // {x,y,alpha,dy,text}

// ── Screens & Elements ────────────────────────────────────────────────────────
const winOverlay = document.getElementById("win-overlay");
const hudMoves = document.getElementById("hud-moves");
const hudScore = document.getElementById("hud-score");
const hudName = document.getElementById("hud-name");
const lbBody = document.getElementById("lb-body");

// ── Screen routing ────────────────────────────────────────────────────────────
// Handled in index.html

// ── Init game ─────────────────────────────────────────────────────────────────
function initGame() {
  canvas = document.getElementById("game-canvas");
  ctx = canvas.getContext("2d");

  const size = Math.min(window.innerWidth - 24, window.innerHeight - 140, 540);
  canvas.width = size;
  canvas.height = size;
  cx = size / 2;
  cy = size / 2;

  resetGame();
  bindCanvasEvents();
  if (animId) cancelAnimationFrame(animId);
  loop();
}

function resetGame() {
  moves = 0;
  score = 0;
  gameOver = false;
  hitEffects = [];
  scorePopups = [];
  winOverlay.classList.add("hidden");
  updateHUD();

  // Sak starts below ring centre
  sak = {
    x: cx,
    y: cy + CFG.ringRadius + CFG.sakRadius * 2.5,
    vx: 0,
    vy: 0,
    r: CFG.sakRadius,
    inRing: false,
    out: false,
  };

  // Scatter Asyks randomly inside ring
  asyks = [];
  let attempts = 0;
  while (asyks.length < CFG.asykCount && attempts < 2000) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (CFG.ringRadius - CFG.asykRadius * 2.5);
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    // Avoid overlap
    const overlap = asyks.some(
      (a) => Math.hypot(a.x - x, a.y - y) < CFG.asykRadius * 2.4
    );
    if (!overlap) asyks.push({
        x, y, vx: 0, vy: 0, r: CFG.asykRadius, out: false,
        colorIdx: asyks.length % 8,               // cycle through colour palette
        tilt: (Math.random() - .5) * 0.55,        // random ±0.27 rad tilt
      });
  }
}

function updateHUD() {
  hudMoves.textContent = moves;
  hudScore.textContent = score;
  hudName.textContent = playerName || "—";
}

// ── Main loop ─────────────────────────────────────────────────────────────────
function loop() {
  animId = requestAnimationFrame(loop);
  update();
  draw();
}

function update() {
  if (gameOver) return;

  const entities = [sak, ...asyks.filter((a) => !a.out)];

  // Move all bodies
  entities.forEach((b) => {
    if (b === sak && drag.active) return; // frozen while dragging
    b.x += b.vx;
    b.y += b.vy;
    b.vx *= CFG.friction;
    b.vy *= CFG.friction;
    if (Math.abs(b.vx) < CFG.minSpeed) b.vx = 0;
    if (Math.abs(b.vy) < CFG.minSpeed) b.vy = 0;
  });

  // Circle-circle collisions among all moving bodies
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      resolveCollision(entities[i], entities[j]);
    }
  }

  // Check which asyks left the ring
  asyks.forEach((a) => {
    if (!a.out) {
      const d = Math.hypot(a.x - cx, a.y - cy);
      if (d + a.r > CFG.ringRadius) {
        a.out = true;
        score++;
        updateHUD();
        // Hit burst effect
        hitEffects.push({ x: a.x, y: a.y, r: a.r * 1.2, alpha: .8, color: "#ffc84a" });
        hitEffects.push({ x: a.x, y: a.y, r: a.r * .6, alpha: .6, color: "#e8921a" });
        scorePopups.push({ x: a.x, y: a.y - 10, text: "+1", alpha: 1, dy: 1.2 });
      }
    }
  });

  // Win condition
  if (!gameOver && asyks.every((a) => a.out)) {
    gameOver = true;
    setTimeout(triggerWin, 400);
  }
}

function resolveCollision(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = a.r + b.r;
  if (dist === 0 || dist >= minDist) return;

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = minDist - dist;

  // Separate
  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;

  // Velocity exchange along collision normal
  const dvx = a.vx - b.vx;
  const dvy = a.vy - b.vy;
  const dot = dvx * nx + dvy * ny;
  if (dot <= 0) return; // already separating

  const impulse = dot * CFG.restitution;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;

  // Spark on significant hits
  if (dot > 3) {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    hitEffects.push({ x: mx, y: my, r: 6, alpha: .7, color: "rgba(255,230,80,.8)" });
  }
}

// ── Drawing ───────────────────────────────────────────────────────────────────
function draw() {
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);

  // Semi-transparent ground inside canvas
  const groundGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * .7);
  groundGrad.addColorStop(0,  "rgba(30,14,0,0.55)");
  groundGrad.addColorStop(1,  "rgba(10,5,0,0.75)");
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, 0, W, H);

  // ── Ring shadow
  ctx.save();
  ctx.shadowColor = "rgba(232,146,26,0.4)";
  ctx.shadowBlur  = 28;
  ctx.beginPath();
  ctx.arc(cx, cy, CFG.ringRadius, 0, Math.PI * 2);
  ctx.strokeStyle = CFG.colors.ringBorder;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // ── Ring fill (warm glow)
  const ringFill = ctx.createRadialGradient(cx - CFG.ringRadius*.3, cy - CFG.ringRadius*.3, 0, cx, cy, CFG.ringRadius);
  ringFill.addColorStop(0,   "rgba(255,190,60,0.12)");
  ringFill.addColorStop(0.7, "rgba(232,146,26,0.08)");
  ringFill.addColorStop(1,   "rgba(120,60,0,0.06)");
  ctx.beginPath();
  ctx.arc(cx, cy, CFG.ringRadius, 0, Math.PI * 2);
  ctx.fillStyle = ringFill;
  ctx.fill();

  // ── Kazakh ornament dots on ring border
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const dx = Math.cos(angle) * CFG.ringRadius;
    const dy = Math.sin(angle) * CFG.ringRadius;
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, i % 3 === 0 ? 3 : 1.5, 0, Math.PI * 2);
    ctx.fillStyle = i % 3 === 0 ? "rgba(255,200,80,.5)" : "rgba(255,200,80,.2)";
    ctx.fill();
  }

  // ── Inner decorative rings
  [8, 20].forEach((offset, idx) => {
    ctx.beginPath();
    ctx.arc(cx, cy, CFG.ringRadius - offset, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,200,80,${idx===0 ? .12 : .06})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // ── Hit effects
  hitEffects = hitEffects.filter(e => e.alpha > 0);
  hitEffects.forEach(e => {
    ctx.save();
    ctx.globalAlpha = e.alpha;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    e.r += 2.5;
    e.alpha -= 0.05;
    ctx.restore();
  });

  // ── Score popups
  scorePopups = scorePopups.filter(p => p.alpha > 0);
  scorePopups.forEach(p => {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = "#ffc84a";
    ctx.font = `bold 16px 'Unbounded', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(p.text, p.x, p.y);
    p.y -= p.dy;
    p.alpha -= 0.025;
    ctx.restore();
  });

  // ── Out Asyks (faded silhouette)
  asyks.filter((a) => a.out).forEach((a) => {
    ctx.save();
    ctx.globalAlpha = .18;
    drawAsyk(a, false);
    ctx.restore();
  });

  // ── Active Asyks (3D-style)
  asyks.filter((a) => !a.out).forEach((a) => drawAsyk(a, true));

  // ── Drag guide (dotted line)
  if (drag.active) {
    const { dx, dy, power } = getDragVector();
    // trajectory dots
    ctx.save();
    for (let i = 1; i <= 7; i++) {
      const t = i / 7;
      const px = sak.x + dx * power * t * 90;
      const py = sak.y + dy * power * t * 90;
      ctx.globalAlpha = .5 - t * .4;
      ctx.beginPath();
      ctx.arc(px, py, 3 - t * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ffc84a";
      ctx.fill();
    }
    ctx.restore();

    // Power ring
    ctx.beginPath();
    ctx.arc(sak.x, sak.y, sak.r + 6, -Math.PI/2, -Math.PI/2 + Math.PI * 2 * power);
    ctx.strokeStyle = `rgba(255,200,80,${0.4 + power * 0.5})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // ── SAK (big shooting piece, premium golden look)
  drawSak();
}

// ── Asyk bone shape path (knucklebone silhouette) ────────────────────────────
// Real asyk shape: wide top cap, narrow waist, wide bottom cap — tilted slightly
function asykPath(c, x, y, r, angle) {
  // r is the "radius" / half-size unit
  const W  = r * 1.05;  // half-width of caps
  const HT = r * 0.55;  // half-height of top cap
  const HB = r * 0.58;  // half-height of bottom cap
  const WW = r * 0.42;  // waist half-width
  const WH = r * 0.22;  // waist half-height (vertical centre band)

  c.save();
  c.translate(x, y);
  c.rotate(angle || 0);

  c.beginPath();
  // Top cap (ellipse-like rounded rect)
  c.moveTo(-W, -WH - WH * .6);
  c.bezierCurveTo(-W, -HT * 1.8, -W * .6, -HT * 2.1, 0, -HT * 2.1);
  c.bezierCurveTo( W * .6, -HT * 2.1,  W, -HT * 1.8,  W, -WH - WH * .6);
  // Right waist curve down
  c.bezierCurveTo( W, -WH,  WW, -WH * .3,  WW, 0);
  c.bezierCurveTo( WW,  WH * .3,  W,  WH,  W,  WH + WH * .6);
  // Bottom cap
  c.bezierCurveTo( W, HB * 1.8,  W * .6, HB * 2.1, 0, HB * 2.1);
  c.bezierCurveTo(-W * .6, HB * 2.1, -W, HB * 1.8, -W,  WH + WH * .6);
  // Left waist curve up
  c.bezierCurveTo(-W,  WH, -WW,  WH * .3, -WW, 0);
  c.bezierCurveTo(-WW, -WH * .3, -W, -WH, -W, -WH - WH * .6);
  c.closePath();

  c.restore();
}

// Colour palette matching real asyks in photo
const ASYK_COLORS = [
  { body: "#e8d4b0", shadow: "#b09060", accent: null },        // natural bone/cream
  { body: "#d4b896", shadow: "#9a7040", accent: null },        // tan bone
  { body: "#cc2020", shadow: "#801010", accent: "#ff6040" },   // red
  { body: "#cc2020", shadow: "#801010", accent: "#ff6040" },   // red (more common)
  { body: "#2030a0", shadow: "#101860", accent: "#5070d0" },   // blue/navy
  { body: "#1a6040", shadow: "#0a3020", accent: "#40a070" },   // dark green/teal
  { body: "#e8d4b0", shadow: "#b09060", accent: null },        // natural bone
  { body: "#d4b896", shadow: "#9a7040", accent: null },        // tan
];

function drawAsyk(a, active) {
  const r  = a.r;
  const cl = a.colorIdx !== undefined ? ASYK_COLORS[a.colorIdx] : ASYK_COLORS[0];
  const tilt = a.tilt || 0;

  ctx.save();
  ctx.translate(a.x, a.y);

  if (active) {
    // Drop shadow
    ctx.shadowColor   = "rgba(0,0,0,0.55)";
    ctx.shadowBlur    = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 5;
  }

  // ── Body fill
  asykPath(ctx, 0, 0, r, tilt);

  if (active) {
    const grad = ctx.createLinearGradient(-r, -r * 2, r * .5, r * 2);
    grad.addColorStop(0,   lighten(cl.body, 40));
    grad.addColorStop(0.35, cl.body);
    grad.addColorStop(1,   cl.shadow);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = "rgba(180,140,80,.25)";
  }
  ctx.fill();

  if (active) {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur  = 0;

    // ── Outline
    asykPath(ctx, 0, 0, r, tilt);
    ctx.strokeStyle = cl.shadow;
    ctx.lineWidth   = 1.2;
    ctx.stroke();

    // ── Colour accent stripe (like the painted ones in photo)
    if (cl.accent) {
      ctx.save();
      ctx.rotate(tilt);
      // Paint the waist band in accent colour
      const WW = r * 0.42, WH = r * 0.22;
      const acGrad = ctx.createLinearGradient(-WW, 0, WW, 0);
      acGrad.addColorStop(0,   cl.shadow);
      acGrad.addColorStop(0.3, cl.accent);
      acGrad.addColorStop(0.7, cl.accent);
      acGrad.addColorStop(1,   cl.shadow);
      ctx.fillStyle = acGrad;
      // waist rectangle clipped by asyk shape
      asykPath(ctx, 0, 0, r, 0);
      ctx.clip();
      ctx.fillRect(-WW, -WH * 1.6, WW * 2, WH * 3.2);
      ctx.restore();
    }

    // ── Specular highlight (top-left)
    ctx.save();
    ctx.rotate(tilt);
    const hl = ctx.createRadialGradient(-r * .28, -r * 1.2, 0, -r * .1, -r * .9, r * .9);
    hl.addColorStop(0,   "rgba(255,255,240,.65)");
    hl.addColorStop(0.5, "rgba(255,255,240,.15)");
    hl.addColorStop(1,   "rgba(255,255,240,0)");
    asykPath(ctx, 0, 0, r, 0);
    ctx.clip();
    ctx.fillStyle = hl;
    ctx.fillRect(-r * 1.2, -r * 2.4, r * 2.4, r * 4.8);
    ctx.restore();
  }

  ctx.restore();
}

// Lighten a hex colour by amt (0-255)
function lighten(hex, amt) {
  let r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  r = Math.min(255, r + amt); g = Math.min(255, g + amt); b = Math.min(255, b + amt);
  return `rgb(${r},${g},${b})`;
}

function drawSak() {
  const r = sak.r * 1.15; // slightly bigger than asyks
  // Sak = large golden natural bone — no colour accent, premium finish
  ctx.save();
  ctx.translate(sak.x, sak.y);

  // Drop shadow
  ctx.shadowColor   = "rgba(0,0,0,.65)";
  ctx.shadowBlur    = 16;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 7;

  asykPath(ctx, 0, 0, r, -0.18); // slight tilt

  const grad = ctx.createLinearGradient(-r, -r * 2, r * .5, r * 2);
  grad.addColorStop(0,   "#fff4c8");
  grad.addColorStop(0.3, "#f0c870");
  grad.addColorStop(0.65,"#c88830");
  grad.addColorStop(1,   "#7a4800");
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur  = 0;

  // Outline
  asykPath(ctx, 0, 0, r, -0.18);
  ctx.strokeStyle = "#7a4800";
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Specular
  ctx.save();
  ctx.rotate(-0.18);
  const hl = ctx.createRadialGradient(-r * .25, -r * 1.1, 0, -r * .1, -r * .8, r);
  hl.addColorStop(0,   "rgba(255,255,230,.75)");
  hl.addColorStop(0.5, "rgba(255,255,230,.2)");
  hl.addColorStop(1,   "rgba(255,255,230,0)");
  asykPath(ctx, 0, 0, r, 0);
  ctx.clip();
  ctx.fillStyle = hl;
  ctx.fillRect(-r * 1.3, -r * 2.6, r * 2.6, r * 5.2);
  ctx.restore();

  ctx.restore();
}

// ── Drag logic ────────────────────────────────────────────────────────────────
function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return { x: src.clientX - rect.left, y: src.clientY - rect.top };
}

function getDragVector() {
  const rawDx = drag.startX - drag.curX;
  const rawDy = drag.startY - drag.curY;
  const rawDist = Math.hypot(rawDx, rawDy);
  const clamped = Math.min(rawDist, CFG.maxPullDist);
  const power = clamped / CFG.maxPullDist;
  const dx = rawDist > 0 ? rawDx / rawDist : 0;
  const dy = rawDist > 0 ? rawDy / rawDist : 0;
  return { dx, dy, power, dist: clamped };
}

function isMoving() {
  const all = [sak, ...asyks];
  return all.some((b) => Math.abs(b.vx) > CFG.minSpeed || Math.abs(b.vy) > CFG.minSpeed);
}

function bindCanvasEvents() {
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
}

function onDown(e) {
  if (gameOver || isMoving()) return;
  const pos = getPos(e);
  const d = Math.hypot(pos.x - sak.x, pos.y - sak.y);
  if (d < sak.r + 10) {
    drag.active = true;
    drag.startX = sak.x;
    drag.startY = sak.y;
    drag.curX = pos.x;
    drag.curY = pos.y;
  }
}

function onMove(e) {
  if (!drag.active) return;
  const pos = getPos(e);
  drag.curX = pos.x;
  drag.curY = pos.y;
}

function onUp() {
  if (!drag.active) return;
  drag.active = false;

  const { dx, dy, power } = getDragVector();
  if (power < 0.05) return;

  const speed = power * 22;
  sak.vx = dx * speed;
  sak.vy = dy * speed;
  moves++;
  updateHUD();
}

// ── Win & API ─────────────────────────────────────────────────────────────────
function triggerWin() {
  // index.html's inline script overrides this; keep as fallback
  winOverlay.classList.remove("hidden");
  const scoreEl = document.getElementById("win-score-val");
  const movesEl = document.getElementById("win-moves-val");
  if (scoreEl) scoreEl.textContent = score;
  if (movesEl) movesEl.textContent = moves;
  // legacy support
  const desc = document.getElementById("win-desc");
  if (desc) desc.textContent = `Выбито: ${score} за ${moves} ходов`;
  submitScore(playerName, score, moves);
}

async function submitScore(name, sc, mv) {
  try {
    await fetch(`${API_BASE}/api/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player_name: name, score: sc, moves: mv }),
    });
  } catch (err) {
    console.error("Score submit failed:", err);
  }
}

// ── Leaderboard and Button bindings ────────────────────────────────────────────
// Handled in index.html to support full UI (Shop, Profile, etc.)
