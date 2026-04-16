import { createHandLandmarker } from "./hand/tracker";
import { HAND_CONNECTIONS, LANDMARK, isGunPose } from "./hand/gesture";
import { createFaceLandmarker, readBlinkScore } from "./face/tracker";
import {
  createGame,
  resetGame,
  updateGame,
  resolveHit,
  drawGame,
  drawHud,
  type Difficulty,
} from "./game/world";
import { play as playSfx, unlockAudio } from "./audio/sfx";
import { loadSprites, type Sprites } from "./game/sprites";
import { submitScore, fetchLeaderboard } from "./db/supabase";
import bgmMenuUrl from "./audio/bgm.mp3";
import bgmGameUrl from "./audio/bgm_game.mp3";
import bgmDualUrl from "./audio/bgm_dual.mp3";
import bgmOverUrl from "./audio/bgm_3.mp3";
import clickUrl from "./audio/click.mp3";
import killUrl from "./audio/item.mp3";
import type { HandLandmarker, FaceLandmarker } from "@mediapipe/tasks-vision";

// --- BGM & click sound ---
const bgmMenu = new Audio(bgmMenuUrl);
bgmMenu.loop = true;
bgmMenu.volume = 0.4;
const bgmGame = new Audio(bgmGameUrl);
bgmGame.loop = true;
bgmGame.volume = 0.7;
const bgmDual = new Audio(bgmDualUrl);
bgmDual.loop = true;
bgmDual.volume = 0.7;
const bgmOver = new Audio(bgmOverUrl);
bgmOver.loop = true;
bgmOver.volume = 0.5;
const allBgm = [bgmMenu, bgmGame, bgmDual, bgmOver];
const clickSfx = new Audio(clickUrl);
clickSfx.volume = 0.6;
const killSfx = new Audio(killUrl);
killSfx.volume = 0.2;

let muted = false;
const muteBtn = document.getElementById("mute-btn") as HTMLButtonElement;
muteBtn.addEventListener("click", () => {
  muted = !muted;
  allBgm.forEach((b) => (b.muted = muted));
  clickSfx.muted = muted;
  killSfx.muted = muted;
  muteBtn.textContent = muted ? "SOUND: OFF" : "SOUND: ON";
  muteBtn.style.color = muted ? "var(--crt-red)" : "var(--crt-green)";
  muteBtn.style.borderColor = muted ? "var(--crt-red)" : "var(--crt-dim)";
});

function playClick() {
  clickSfx.currentTime = 0;
  clickSfx.play().catch(() => {});
}

function stopAllBgm() {
  allBgm.forEach((b) => { b.pause(); b.currentTime = 0; });
}

function playBgm(track: HTMLAudioElement) {
  stopAllBgm();
  track.play().catch(() => {});
}

// --- Tab switching ---
const tabBtns = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
const tabPanels = document.querySelectorAll<HTMLDivElement>(".tab-panel");
tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabBtns.forEach((b) => b.classList.remove("active"));
    tabPanels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`)?.classList.add("active");
    if (btn.dataset.tab === "ranking") loadLeaderboardUI();
  });
});

// --- Leaderboard UI ---
const lbDiffBtns = document.querySelectorAll<HTMLButtonElement>(".lb-diff-btn");
let lbDiff = "easy";
lbDiffBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    lbDiffBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    lbDiff = btn.dataset.lbdiff ?? "easy";
    loadLeaderboardUI();
  });
});

function loadLeaderboardUI() {
  const el = document.getElementById("lb-list")!;
  el.innerHTML = '<div class="lb-loading">LOADING...</div>';
  fetchLeaderboard(lbDiff, 100).then((rows) => {
    if (rows.length === 0) {
      el.innerHTML = '<div class="lb-loading">NO RECORDS YET</div>';
      return;
    }
    el.innerHTML = rows
      .map(
        (r, i) =>
          `<div class="lb-row"><span class="lb-rank">${i + 1}.</span><span class="lb-name">${escHtml(r.nickname)}</span><span class="lb-score">${r.score}</span></div>`,
      )
      .join("");
  }).catch(() => {
    el.innerHTML = '<div class="lb-loading">FAILED TO LOAD</div>';
  });
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- Hand cursor for UI ---
const handCursorEl = document.getElementById("hand-cursor") as HTMLDivElement;
let uiCursorX = 0;
let uiCursorY = 0;
let lastUiClickAt = 0;
const UI_CLICK_COOLDOWN = 600;
let uiBlinkWasClosed = false;

function updateUiCursor(nx: number, ny: number) {
  uiCursorX = nx * window.innerWidth;
  uiCursorY = ny * window.innerHeight;
  handCursorEl.style.left = `${uiCursorX}px`;
  handCursorEl.style.top = `${uiCursorY}px`;
}

function showUiCursor(show: boolean) {
  handCursorEl.style.display = show ? "block" : "none";
}

function uiBlinkClick(blinkScore: number, now: number) {
  if (!uiBlinkWasClosed && blinkScore > 0.4) {
    uiBlinkWasClosed = true;
    if (now - lastUiClickAt > UI_CLICK_COOLDOWN) {
      lastUiClickAt = now;
      const el = document.elementFromPoint(uiCursorX, uiCursorY);
      if (el && el instanceof HTMLElement) {
        playClick();
        el.click();
        el.focus();
        // flash cursor
        handCursorEl.style.filter = "brightness(3)";
        setTimeout(() => { handCursorEl.style.filter = ""; }, 120);
      }
    }
  } else if (uiBlinkWasClosed && blinkScore < 0.2) {
    uiBlinkWasClosed = false;
  }
}

const video = document.getElementById("video") as HTMLVideoElement;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const errorEl = document.getElementById("error") as HTMLDivElement;
const errorMsg = document.getElementById("error-msg") as HTMLDivElement;
const menuEl = document.getElementById("menu") as HTMLDivElement;
const pauseEl = document.getElementById("pause") as HTMLDivElement;
const nicknameInput = document.getElementById("nickname") as HTMLInputElement;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const gameoverEl = document.getElementById("gameover") as HTMLDivElement;
const backBtn = document.getElementById("back-btn") as HTMLButtonElement;

backBtn.addEventListener("click", () => {
  playClick();
  gameoverEl.classList.remove("show");
  menuEl.classList.add("show");
  phase = "menu";
  nicknameInput.value = game.nickname;
  playBgm(bgmMenu);
});
const ctx = canvas.getContext("2d")!;

type Phase = "menu" | "playing" | "paused" | "over";
let phase: Phase = "menu";

// --- Dual-gun system ---
const DUAL_THRESHOLD = 500;
let dualUnlocked = false;
let dualNotifyUntil = 0;

type Cursor = { x: number; y: number; active: boolean };
const CURSOR_GAIN = 2.6;
const CURSOR_SMOOTH = 0.4;
const cursors: [Cursor, Cursor] = [
  { x: 0.5, y: 0.5, active: false },
  { x: 0.5, y: 0.5, active: false },
];

const BLINK_FIRE = 0.4;
const BLINK_RESET = 0.2;
const SHOT_COOLDOWN_MS = 220;
const blink = { closed: false, lastShotAt: -Infinity, score: 0 };

type Shot = { x: number; y: number; t: number; hit: boolean };
const shots: Shot[] = [];
const SHOT_LIFETIME_MS = 700;

let selectedDiff: Difficulty = "easy";
const game = createGame(performance.now(), selectedDiff, "");
game.onSound = (name) => {
  if (name === "kill") {
    killSfx.currentTime = 0;
    killSfx.play().catch(() => {});
  } else {
    playSfx(name);
  }
};

// --- Difficulty buttons ---
const diffBtns = document.querySelectorAll<HTMLButtonElement>(".diff-btn");
diffBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    diffBtns.forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedDiff = btn.dataset.diff as Difficulty;
  });
});

// --- Start button ---
startBtn.addEventListener("click", () => {
  unlockAudio();
  playClick();
  playBgm(bgmGame);
  const nick = nicknameInput.value.trim() || "Player";
  resetGame(game, performance.now(), selectedDiff, nick);
  shots.length = 0;
  blink.closed = false;
  blink.lastShotAt = -Infinity;
  dualUnlocked = false;
  dualNotifyUntil = 0;
  cursors[0].active = false;
  cursors[1].active = false;
  menuEl.classList.remove("show");
  phase = "playing";
});

// --- Key handlers ---
window.addEventListener("keydown", (e) => {
  unlockAudio();
  if (e.key === "Escape") {
    if (phase === "playing") {
      phase = "paused";
      pauseEl.classList.add("show");
    } else if (phase === "paused") {
      phase = "playing";
      pauseEl.classList.remove("show");
    }
  }
  if ((e.key === "Enter" || e.key === " ") && phase === "over") {
    backBtn.click();
  }
});
window.addEventListener("pointerdown", unlockAudio, { once: false });

// --- Core helpers ---
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function fireShotAt(c: Cursor, now: number) {
  playSfx("shot");
  const hit = resolveHit(game, c.x, c.y, now);
  shots.push({ x: c.x, y: c.y, t: now, hit });
}

function fireAllGuns(now: number) {
  if (cursors[0].active) fireShotAt(cursors[0], now);
  if (dualUnlocked && cursors[1].active) fireShotAt(cursors[1], now);
}

function updateCursorAt(c: Cursor, tip: { x: number; y: number }) {
  const rawX = clamp01((1 - tip.x - 0.5) * CURSOR_GAIN + 0.5);
  const rawY = clamp01((tip.y - 0.5) * CURSOR_GAIN + 0.5);
  if (!c.active) {
    c.x = rawX;
    c.y = rawY;
    c.active = true;
  } else {
    c.x += (rawX - c.x) * CURSOR_SMOOTH;
    c.y += (rawY - c.y) * CURSOR_SMOOTH;
  }
}

function updateBlink(score: number, now: number, anyGunPose: boolean) {
  blink.score = score;
  if (!blink.closed && score > BLINK_FIRE) {
    blink.closed = true;
    if (
      anyGunPose &&
      phase === "playing" &&
      !game.over &&
      now - blink.lastShotAt > SHOT_COOLDOWN_MS
    ) {
      fireAllGuns(now);
      blink.lastShotAt = now;
    }
  } else if (blink.closed && score < BLINK_RESET) {
    blink.closed = false;
  }
}

function checkDualUnlock(now: number) {
  if (!dualUnlocked && game.score >= DUAL_THRESHOLD) {
    dualUnlocked = true;
    dualNotifyUntil = now + 4000;
    playBgm(bgmDual);
  }
}

function drawShots(now: number) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    const age = now - s.t;
    if (age > SHOT_LIFETIME_MS) {
      shots.splice(i, 1);
      continue;
    }
    const k = 1 - age / SHOT_LIFETIME_MS;
    const cx = s.x * canvas.width;
    const cy = s.y * canvas.height;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.strokeStyle = s.hit ? "#33ff66" : "#ffaa22";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 14 + (1 - k) * 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = s.hit ? "#33ff66" : "#fff";
    ctx.beginPath();
    ctx.arc(cx, cy, 5 * k + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawCrosshair(c: Cursor, armed: boolean, label?: string) {
  if (!c.active) return;
  const cx = c.x * canvas.width;
  const cy = c.y * canvas.height;
  const color = armed ? "#33ff66" : "rgba(51,255,102,0.4)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fill();
  const segments: [number, number][] = [[18, 48], [-18, -48]];
  for (const [a, b] of segments) {
    ctx.beginPath();
    ctx.moveTo(cx + a, cy);
    ctx.lineTo(cx + b, cy);
    ctx.moveTo(cx, cy + a);
    ctx.lineTo(cx, cy + b);
    ctx.stroke();
  }
  const d = 26;
  const l = 8;
  ctx.beginPath();
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      ctx.moveTo(cx + sx * d, cy + sy * (d - l));
      ctx.lineTo(cx + sx * d, cy + sy * d);
      ctx.lineTo(cx + sx * (d - l), cy + sy * d);
    }
  }
  ctx.stroke();
  if (label) {
    ctx.font = '18px "VT323", monospace';
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(label, cx, cy + 50);
    ctx.textAlign = "left";
  }
}

function drawDualNotify(now: number) {
  if (now > dualNotifyUntil) return;
  const age = dualNotifyUntil - now;
  const alpha = Math.min(age / 500, 1);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '42px "VT323", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffaa22";
  ctx.fillText(
    ">> DUAL GUNS UNLOCKED <<",
    canvas.width / 2,
    canvas.height * 0.2,
  );
  ctx.font = '26px "VT323", monospace';
  ctx.fillStyle = "#33ff66";
  ctx.fillText(
    "USE BOTH HANDS TO AIM",
    canvas.width / 2,
    canvas.height * 0.2 + 40,
  );
  ctx.restore();
}

function showError(msg: string) {
  errorMsg.textContent = msg;
  errorEl.classList.add("show");
}

async function startCamera(): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await new Promise<void>((resolve) => {
    video.onloadedmetadata = () => {
      video.play().then(() => resolve());
    };
  });
}

function resizeCanvas() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
}

function drawMirroredVideo() {
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
  ctx.restore();
}

function mirrorX(x: number): number {
  return (1 - x) * canvas.width;
}

function drawLandmarks(
  landmarksList: Array<Array<{ x: number; y: number; z: number }>>,
  gunPoses: boolean[],
) {
  for (let h = 0; h < landmarksList.length; h++) {
    const lm = landmarksList[h];
    const armed = gunPoses[h] ?? false;
    ctx.strokeStyle = armed ? "#33ff6644" : "#66ccff33";
    ctx.lineWidth = 2;
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = lm[a];
      const pb = lm[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(mirrorX(pa.x), pa.y * canvas.height);
      ctx.lineTo(mirrorX(pb.x), pb.y * canvas.height);
      ctx.stroke();
    }
  }
}

function drawPoseLabel(anyGun: boolean, dualActive: boolean) {
  const text = dualActive
    ? "DUAL ARMED"
    : anyGun
      ? "ARMED"
      : "STANDBY";
  ctx.font = '26px "VT323", monospace';
  ctx.textBaseline = "top";
  ctx.fillStyle = anyGun ? "#33ff66" : "rgba(51,255,102,0.3)";
  ctx.textAlign = "center";
  ctx.fillText(`[ ${text} ]`, canvas.width / 2, 16);
  ctx.textAlign = "left";
}

async function loop(
  hand: HandLandmarker,
  face: FaceLandmarker,
  sprites: Sprites,
) {
  let lastTs = -1;
  let lastRealTs = performance.now();
  const tick = () => {
    if (video.readyState >= 2) {
      if (canvas.width !== video.videoWidth) resizeCanvas();
      const ts = performance.now();
      if (ts !== lastTs) {
        lastTs = ts;
        const dt = Math.min((ts - lastRealTs) / 1000, 0.05);
        lastRealTs = ts;

        const handResult = hand.detectForVideo(video, ts);
        const faceResult = face.detectForVideo(video, ts);
        drawMirroredVideo();

        const landmarks = handResult.landmarks ?? [];
        const gunPoses: boolean[] = [];

        // Update cursors for each detected hand
        for (let i = 0; i < 2; i++) {
          if (i < landmarks.length) {
            const gp = isGunPose(landmarks[i]);
            gunPoses.push(gp);
            if (i === 0 || dualUnlocked) {
              updateCursorAt(cursors[i], landmarks[i][LANDMARK.INDEX_TIP]);
            }
          } else {
            gunPoses.push(false);
            if (i === 0) cursors[i].active = false;
            if (i === 1) cursors[i].active = false;
          }
        }

        const anyGunPose = gunPoses.some(Boolean);
        const bs = faceResult.faceBlendshapes?.[0]?.categories ?? [];
        const blinkScore = bs.length > 0 ? readBlinkScore(bs) : 0;

        // Hand cursor for UI when not playing
        const onUi = phase === "menu" || phase === "paused" || phase === "over";
        if (onUi && cursors[0].active) {
          updateUiCursor(cursors[0].x, cursors[0].y);
          showUiCursor(true);
          uiBlinkClick(blinkScore, ts);
        } else {
          showUiCursor(false);
        }

        updateBlink(blinkScore, ts, anyGunPose);

        if (phase === "playing") {
          updateGame(game, dt);
          checkDualUnlock(ts);
          if (game.over) {
            phase = "over";
            gameoverEl.classList.add("show");
            playBgm(bgmOver);
            submitScore(game.nickname, game.score, Math.floor(game.elapsed), game.difficulty)
              .then(() => fetchLeaderboard(game.difficulty))
              .then((rows) => {
                game.leaderboard = rows;
              })
              .catch(() => {});
          }
        }

        drawGame(game, ctx, canvas.width, canvas.height, ts, sprites);
        drawLandmarks(landmarks, gunPoses);
        drawShots(ts);
        drawCrosshair(cursors[0], gunPoses[0] ?? false, dualUnlocked ? "L" : undefined);
        if (dualUnlocked) {
          drawCrosshair(cursors[1], gunPoses[1] ?? false, "R");
        }
        if (phase !== "menu") {
          const dualActive = dualUnlocked && cursors[1].active && (gunPoses[1] ?? false);
          drawPoseLabel(anyGunPose, dualActive);
          drawHud(game, ctx, canvas.width, canvas.height);
          drawDualNotify(ts);
        }

        statusEl.textContent = `SYS ${anyGunPose ? "ARMED" : "IDLE"} // HOSTILES ${game.zombies.length}${dualUnlocked ? " // DUAL" : ""}`;
      }
    }
    requestAnimationFrame(tick);
  };
  tick();
}

const loadingBar = document.getElementById("loading-bar") as HTMLDivElement;
const loadingLabel = document.getElementById("loading-label") as HTMLSpanElement;
const loadingPct = document.getElementById("loading-pct") as HTMLSpanElement;
const loadingFill = document.getElementById("loading-fill") as HTMLDivElement;

function setLoading(label: string, pct: number) {
  loadingBar.style.display = "block";
  loadingLabel.textContent = label;
  loadingPct.textContent = `${Math.round(pct)}%`;
  loadingFill.style.width = `${pct}%`;
}

function hideLoading() {
  loadingBar.style.display = "none";
}

async function main() {
  try {
    setLoading("CONNECTING CAMERA...", 0);
    await startCamera();
    resizeCanvas();

    setLoading("LOADING HAND MODEL...", 20);
    const hand = await createHandLandmarker();

    setLoading("LOADING FACE MODEL...", 50);
    const face = await createFaceLandmarker();

    setLoading("LOADING SPRITES...", 80);
    const sprites = await loadSprites();

    setLoading("READY", 100);
    setTimeout(hideLoading, 600);
    statusEl.textContent = "준비 완료";
    playBgm(bgmMenu);
    loop(hand, face, sprites);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(err);
    showError(`초기화 실패: ${msg}`);
    statusEl.textContent = "오류";
  }
}

main();
