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
} from "./game/world";
import { play as playSfx, unlockAudio } from "./audio/sfx";
import type { HandLandmarker, FaceLandmarker } from "@mediapipe/tasks-vision";

const video = document.getElementById("video") as HTMLVideoElement;
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const errorEl = document.getElementById("error") as HTMLDivElement;
const errorMsg = document.getElementById("error-msg") as HTMLDivElement;
const ctx = canvas.getContext("2d")!;

// Cursor amplifies fingertip movement around the screen center so small hand
// motions cover more of the play area. State is kept in normalized [0,1]
// display coordinates and low-pass filtered for stability.
const CURSOR_GAIN = 2.6;
const CURSOR_SMOOTH = 0.4;
const cursor = { x: 0.5, y: 0.5, active: false };

// Blink-to-fire: the user blinks to shoot. An edge-triggered detector with
// hysteresis avoids spamming: eyes must fully open again before the next
// shot will register.
const BLINK_FIRE = 0.4;
const BLINK_RESET = 0.2;
const SHOT_COOLDOWN_MS = 220;
const blink = {
  closed: false,
  lastShotAt: -Infinity,
  score: 0,
};

type Shot = { x: number; y: number; t: number; hit: boolean };
const shots: Shot[] = [];
const SHOT_LIFETIME_MS = 700;

const game = createGame(performance.now());
game.onSound = (name) => playSfx(name);

window.addEventListener("keydown", (e) => {
  unlockAudio();
  if ((e.key === "Enter" || e.key === " ") && game.over) {
    resetGame(game, performance.now());
  }
});
window.addEventListener("pointerdown", unlockAudio, { once: false });

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function fireShot(now: number) {
  playSfx("shot");
  const hit = resolveHit(game, cursor.x, cursor.y, now);
  shots.push({ x: cursor.x, y: cursor.y, t: now, hit });
}

function updateCursor(tip: { x: number; y: number }) {
  const rawX = clamp01((1 - tip.x - 0.5) * CURSOR_GAIN + 0.5);
  const rawY = clamp01((tip.y - 0.5) * CURSOR_GAIN + 0.5);
  if (!cursor.active) {
    cursor.x = rawX;
    cursor.y = rawY;
    cursor.active = true;
  } else {
    cursor.x += (rawX - cursor.x) * CURSOR_SMOOTH;
    cursor.y += (rawY - cursor.y) * CURSOR_SMOOTH;
  }
}

function updateBlink(score: number, now: number, gunPose: boolean) {
  blink.score = score;
  if (!blink.closed && score > BLINK_FIRE) {
    blink.closed = true;
    if (gunPose && !game.over && now - blink.lastShotAt > SHOT_COOLDOWN_MS) {
      fireShot(now);
      blink.lastShotAt = now;
    }
  } else if (blink.closed && score < BLINK_RESET) {
    blink.closed = false;
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
    ctx.strokeStyle = s.hit ? "#66ff88" : "#ffdd33";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, 14 + (1 - k) * 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx, cy, 5 * k + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawCursor(gunPose: boolean) {
  if (!cursor.active) return;
  const cx = cursor.x * canvas.width;
  const cy = cursor.y * canvas.height;
  const color = gunPose ? "#ff3355" : "#ffffff";
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 52, cy);
  ctx.lineTo(cx - 14, cy);
  ctx.moveTo(cx + 14, cy);
  ctx.lineTo(cx + 52, cy);
  ctx.moveTo(cx, cy - 52);
  ctx.lineTo(cx, cy - 14);
  ctx.moveTo(cx, cy + 14);
  ctx.lineTo(cx, cy + 52);
  ctx.stroke();
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
  gunPose: boolean,
) {
  for (const lm of landmarksList) {
    ctx.strokeStyle = gunPose ? "#00ff88" : "#66ccff";
    ctx.lineWidth = 3;
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = lm[a];
      const pb = lm[b];
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(mirrorX(pa.x), pa.y * canvas.height);
      ctx.lineTo(mirrorX(pb.x), pb.y * canvas.height);
      ctx.stroke();
    }
    ctx.fillStyle = gunPose ? "#00ff88" : "#ffcc00";
    for (let i = 0; i < lm.length; i++) {
      const p = lm[i];
      ctx.beginPath();
      ctx.arc(mirrorX(p.x), p.y * canvas.height, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPoseLabel(gunPose: boolean, blinkScore: number) {
  const text = gunPose ? "GUN POSE: YES" : "GUN POSE: NO";
  ctx.font = "bold 32px -apple-system, system-ui, sans-serif";
  ctx.textBaseline = "top";
  const pad = 12;
  const metrics = ctx.measureText(text);
  const w = metrics.width + pad * 2;
  const h = 44;
  ctx.fillStyle = gunPose ? "rgba(0, 200, 100, 0.75)" : "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(16, 16, w, h);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, 16 + pad, 20);

  // blink meter
  const barX = 16;
  const barY = 72;
  const barW = 220;
  const barH = 14;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(barX, barY, barW, barH);
  const fillW = barW * Math.min(blinkScore, 1);
  ctx.fillStyle = blinkScore > BLINK_FIRE ? "#ff6677" : "#66aaff";
  ctx.fillRect(barX, barY, fillW, barH);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  const trigX = barX + barW * BLINK_FIRE;
  ctx.beginPath();
  ctx.moveTo(trigX, barY - 2);
  ctx.lineTo(trigX, barY + barH + 2);
  ctx.stroke();
}

async function loop(hand: HandLandmarker, face: FaceLandmarker) {
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
        const hasHand = landmarks.length > 0;
        const gunPose = hasHand && isGunPose(landmarks[0]);
        if (hasHand) {
          updateCursor(landmarks[0][LANDMARK.INDEX_TIP]);
        } else {
          cursor.active = false;
        }

        const bs = faceResult.faceBlendshapes?.[0]?.categories ?? [];
        const blinkScore = bs.length > 0 ? readBlinkScore(bs) : 0;
        updateBlink(blinkScore, ts, gunPose);

        updateGame(game, dt);

        drawGame(game, ctx, canvas.width, canvas.height, ts);
        drawLandmarks(landmarks, gunPose);
        drawShots(ts);
        drawCursor(gunPose);
        drawPoseLabel(gunPose, blinkScore);
        drawHud(game, ctx, canvas.width, canvas.height);

        statusEl.textContent = `${gunPose ? "🔫" : "—"} · wave ${game.wave} · zombies ${game.zombies.length}`;
      }
    }
    requestAnimationFrame(tick);
  };
  tick();
}

async function main() {
  try {
    statusEl.textContent = "카메라 연결 중…";
    await startCamera();
    resizeCanvas();
    statusEl.textContent = "MediaPipe 모델 로딩 중…";
    const [hand, face] = await Promise.all([
      createHandLandmarker(),
      createFaceLandmarker(),
    ]);
    statusEl.textContent = "준비 완료";
    loop(hand, face);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(err);
    showError(`초기화 실패: ${msg}`);
    statusEl.textContent = "오류";
  }
}

main();
