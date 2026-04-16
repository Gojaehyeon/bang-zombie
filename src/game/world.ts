export type Difficulty = "easy" | "hard";
export type ZombieKind = "normal" | "runner" | "tank";

export type Zombie = {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  kind: ZombieKind;
  alive: boolean;
  hurtAt: number;
};

export type LeaderboardRow = {
  nickname: string;
  score: number;
  wave: number;
  difficulty: string;
};

export type Game = {
  zombies: Zombie[];
  score: number;
  highScore: number;
  hp: number;
  maxHp: number;
  over: boolean;
  elapsed: number;
  spawnTimer: number;
  startedAt: number;
  difficulty: Difficulty;
  nickname: string;
  leaderboard: LeaderboardRow[];
  onSound?: (name: SoundName) => void;
};

export type SoundName = "hit" | "kill" | "player-dead";

const PLAYER_HOME_X = 0.5;
const PLAYER_HOME_Y = 0.5;
const PLAYER_HURT_RADIUS = 0.07;
const HIT_PAD = 0.015;
const HIGH_SCORE_KEY = "bang-zombie.highscore";
const SPAWN_BASE = 2.0;
const SPAWN_MIN = 0.4;

const KIND_STATS: Record<
  ZombieKind,
  { hp: number; speed: number; radius: number; score: number }
> = {
  normal: { hp: 1, speed: 0.055, radius: 0.08, score: 10 },
  runner: { hp: 1, speed: 0.11, radius: 0.065, score: 20 },
  tank: { hp: 3, speed: 0.032, radius: 0.11, score: 50 },
};

const DIFF_MULT: Record<Difficulty, { speed: number; spawnRate: number }> = {
  easy: { speed: 0.7, spawnRate: 1.4 },
  hard: { speed: 1.15, spawnRate: 0.7 },
};

function loadHighScore(): number {
  try {
    const v = localStorage.getItem(HIGH_SCORE_KEY);
    return v ? parseInt(v, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function saveHighScore(score: number): void {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(score));
  } catch {
    // ignore
  }
}

function pickKind(elapsed: number): ZombieKind {
  const t = elapsed / 60; // 0..1 over first minute
  const r = Math.random();
  if (t < 0.25) return "normal";
  if (t < 0.5) return r < 0.7 ? "normal" : "runner";
  if (r < 0.4) return "normal";
  if (r < 0.75) return "runner";
  return "tank";
}

function spawnInterval(elapsed: number, diff: Difficulty): number {
  const ramp = Math.min(elapsed / 90, 1);
  const base = SPAWN_BASE - (SPAWN_BASE - SPAWN_MIN) * ramp;
  return base * DIFF_MULT[diff].spawnRate;
}

export function createGame(
  now: number,
  difficulty: Difficulty = "easy",
  nickname = "",
): Game {
  return {
    zombies: [],
    score: 0,
    highScore: loadHighScore(),
    hp: 1,
    maxHp: 1,
    over: false,
    elapsed: 0,
    spawnTimer: 1.0,
    startedAt: now,
    difficulty,
    nickname,
    leaderboard: [],
  };
}

export function resetGame(
  g: Game,
  now: number,
  difficulty?: Difficulty,
  nickname?: string,
): void {
  g.zombies.length = 0;
  g.score = 0;
  g.hp = g.maxHp;
  g.over = false;
  g.elapsed = 0;
  g.spawnTimer = 1.0;
  g.startedAt = now;
  g.leaderboard = [];
  if (difficulty !== undefined) g.difficulty = difficulty;
  if (nickname !== undefined) g.nickname = nickname;
}

function spawnZombie(elapsed: number, diff: Difficulty): Zombie {
  const side = Math.floor(Math.random() * 4);
  let x = 0.5;
  let y = 0.5;
  const m = -0.06;
  if (side === 0) { x = Math.random(); y = m; }
  else if (side === 1) { x = Math.random(); y = 1 - m; }
  else if (side === 2) { x = m; y = Math.random(); }
  else { x = 1 - m; y = Math.random(); }
  const kind = pickKind(elapsed);
  const stats = KIND_STATS[kind];
  const ramp = 1 + elapsed * 0.003;
  return {
    x, y,
    hp: stats.hp,
    maxHp: stats.hp,
    speed: stats.speed * ramp * (0.9 + Math.random() * 0.2) * DIFF_MULT[diff].speed,
    radius: stats.radius,
    kind,
    alive: true,
    hurtAt: -Infinity,
  };
}

export function updateGame(g: Game, dt: number): void {
  if (g.over) return;
  g.elapsed += dt;

  g.spawnTimer -= dt;
  if (g.spawnTimer <= 0) {
    g.zombies.push(spawnZombie(g.elapsed, g.difficulty));
    g.spawnTimer = spawnInterval(g.elapsed, g.difficulty);
  }

  for (const z of g.zombies) {
    if (!z.alive) continue;
    const dx = PLAYER_HOME_X - z.x;
    const dy = PLAYER_HOME_Y - z.y;
    const d = Math.hypot(dx, dy);
    if (d < PLAYER_HURT_RADIUS) {
      z.alive = false;
      g.hp -= 1;
      if (g.hp <= 0) {
        g.hp = 0;
        g.over = true;
        g.onSound?.("player-dead");
        if (g.score > g.highScore) {
          g.highScore = g.score;
          saveHighScore(g.highScore);
        }
      }
      continue;
    }
    z.x += (dx / d) * z.speed * dt;
    z.y += (dy / d) * z.speed * dt;
  }

  for (let i = g.zombies.length - 1; i >= 0; i--) {
    if (!g.zombies[i].alive) g.zombies.splice(i, 1);
  }
}

export function resolveHit(
  g: Game,
  hx: number,
  hy: number,
  now: number,
): boolean {
  if (g.over) return false;
  let best: Zombie | null = null;
  let bestD = Infinity;
  for (const z of g.zombies) {
    if (!z.alive) continue;
    const d = Math.hypot(hx - z.x, hy - z.y);
    if (d < z.radius + HIT_PAD && d < bestD) {
      best = z;
      bestD = d;
    }
  }
  if (!best) return false;
  best.hp -= 1;
  best.hurtAt = now;
  if (best.hp <= 0) {
    best.alive = false;
    g.score += KIND_STATS[best.kind].score;
    g.onSound?.("kill");
  } else {
    g.onSound?.("hit");
  }
  return true;
}

// --- Drawing ---

export type SpriteMap = {
  player: HTMLImageElement;
  normal: HTMLImageElement;
  runner: HTMLImageElement;
  tank: HTMLImageElement;
};

const ZOMBIE_IMG_KEY: Record<ZombieKind, keyof SpriteMap> = {
  normal: "normal",
  runner: "runner",
  tank: "tank",
};

const CRT_GREEN = "#33ff66";
const CRT_AMBER = "#ffaa22";
const CRT_RED = "#ff3344";
const CRT_FONT = '"VT323", monospace';

function drawSpriteCentered(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  size: number,
) {
  ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
}

export function drawGame(
  g: Game,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
  sprites: SpriteMap,
): void {
  const minDim = Math.min(w, h);

  // player at center
  const phx = PLAYER_HOME_X * w;
  const phy = PLAYER_HOME_Y * h;
  const phr = PLAYER_HURT_RADIUS * minDim;
  const playerSize = phr * 3.6;
  const bob = Math.sin(now / 320) * phr * 0.05;
  drawSpriteCentered(ctx, sprites.player, phx, phy + bob, playerSize);

  // scanline-style danger ring
  ctx.save();
  const pulse = 0.5 + Math.sin(now / 180) * 0.5;
  ctx.strokeStyle = `rgba(51, 255, 102, ${0.15 + pulse * 0.2})`;
  ctx.setLineDash([2, 8]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(phx, phy, phr * 1.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // zombies
  for (const z of g.zombies) {
    if (!z.alive) continue;
    const cx = z.x * w;
    const cy = z.y * h;
    const r = z.radius * minDim;
    const size = r * 2.8;
    const hurt = now - z.hurtAt < 120;
    const img = sprites[ZOMBIE_IMG_KEY[z.kind]];
    ctx.save();
    if (hurt) {
      ctx.globalAlpha = 0.5 + Math.sin(now / 20) * 0.5;
    }
    drawSpriteCentered(ctx, img, cx, cy, size);
    ctx.restore();
    if (z.maxHp > 1) {
      const barW = r * 1.6;
      const barH = 4;
      const bx = cx - barW / 2;
      const by = cy - size / 2 - 8;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = CRT_GREEN;
      ctx.fillRect(bx, by, barW * (z.hp / z.maxHp), barH);
    }
  }
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function drawHud(
  g: Game,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const portrait = h > w;

  ctx.save();
  ctx.textBaseline = "top";

  if (!portrait) {
    ctx.font = `32px ${CRT_FONT}`;

    ctx.fillStyle = "rgba(0,4,0,0.55)";
    ctx.fillRect(0, 0, 320, 52);
    ctx.fillStyle = CRT_GREEN;
    ctx.textAlign = "left";
    ctx.fillText(`SCORE ${String(g.score).padStart(6, "0")}`, 16, 12);
    ctx.fillStyle = CRT_AMBER;
    ctx.textAlign = "right";
    ctx.fillText(formatTime(g.elapsed), 308, 12);

    ctx.fillStyle = "rgba(0,4,0,0.55)";
    ctx.fillRect(w - 280, 0, 280, 52);
    ctx.textAlign = "right";
    ctx.fillStyle = CRT_GREEN;
    ctx.font = `24px ${CRT_FONT}`;
    ctx.fillText(`HIGH ${String(g.highScore).padStart(6, "0")}`, w - 16, 6);
    ctx.fillStyle = CRT_RED;
    ctx.fillText(`HOSTILES: ${g.zombies.length}`, w - 16, 30);

    ctx.fillStyle = "rgba(0,4,0,0.45)";
    ctx.fillRect(0, h - 36, w, 36);
    ctx.font = `22px ${CRT_FONT}`;
    ctx.textAlign = "left";
    ctx.fillStyle = CRT_GREEN;
    ctx.globalAlpha = 0.6;
    ctx.fillText(`[${g.difficulty.toUpperCase()}] ${g.nickname}`, 16, h - 30);
    ctx.textAlign = "right";
    ctx.fillText(`ELAPSED ${formatTime(g.elapsed)}`, w - 16, h - 30);
    ctx.globalAlpha = 1;
  } else {
    const minDim = Math.min(w, h);
    const scale = Math.max(0.72, Math.min(minDim / 720, 0.9));
    const pad = 16 * scale;
    const topPanelH = 72 * scale;
    const bottomPanelH = 48 * scale;
    const scoreFont = 32 * scale;
    const infoFont = 24 * scale;
    const footerFont = 22 * scale;

    ctx.fillStyle = "rgba(0,4,0,0.58)";
    ctx.fillRect(0, 0, w, topPanelH);

    ctx.font = `${scoreFont}px ${CRT_FONT}`;
    ctx.fillStyle = CRT_GREEN;
    ctx.textAlign = "left";
    ctx.fillText(`SCORE ${String(g.score).padStart(6, "0")}`, pad, 10 * scale);
    ctx.fillStyle = CRT_AMBER;
    ctx.textAlign = "right";
    ctx.fillText(formatTime(g.elapsed), w - pad, 10 * scale);

    ctx.font = `${infoFont}px ${CRT_FONT}`;
    ctx.textAlign = "left";
    ctx.fillStyle = CRT_GREEN;
    ctx.fillText(`HIGH ${String(g.highScore).padStart(6, "0")}`, pad, 38 * scale);
    ctx.fillStyle = CRT_RED;
    ctx.textAlign = "right";
    ctx.fillText(`HOSTILES ${g.zombies.length}`, w - pad, 38 * scale);

    ctx.fillStyle = "rgba(0,4,0,0.45)";
    ctx.fillRect(0, h - bottomPanelH, w, bottomPanelH);
    ctx.font = `${footerFont}px ${CRT_FONT}`;
    ctx.textAlign = "left";
    ctx.fillStyle = CRT_GREEN;
    ctx.globalAlpha = 0.72;
    ctx.fillText(`[${g.difficulty.toUpperCase()}] ${g.nickname}`, pad, h - bottomPanelH + 6 * scale);
    ctx.textAlign = "right";
    ctx.fillText(`ELAPSED ${formatTime(g.elapsed)}`, w - pad, h - bottomPanelH + 6 * scale);
    ctx.globalAlpha = 1;
  }

  // subtle scanlines
  ctx.fillStyle = "rgba(0,0,0,0.04)";
  for (let y = 0; y < h; y += 4) {
    ctx.fillRect(0, y, w, 2);
  }

  // game over
  if (g.over) {
    const scale = portrait
      ? Math.max(0.72, Math.min(Math.min(w, h) / 720, 0.9))
      : 1;
    ctx.fillStyle = "rgba(0,4,0,0.82)";
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = "center";
    ctx.fillStyle = CRT_RED;
    ctx.font = `${96 * scale}px ${CRT_FONT}`;
    ctx.fillText("TERMINATED", w / 2, h * 0.1);

    ctx.fillStyle = CRT_GREEN;
    ctx.font = `${48 * scale}px ${CRT_FONT}`;
    ctx.fillText(`SCORE: ${String(g.score).padStart(6, "0")}`, w / 2, h * 0.1 + 100 * scale);
    ctx.font = `${32 * scale}px ${CRT_FONT}`;
    ctx.fillStyle = CRT_AMBER;
    ctx.fillText(
      `SURVIVED ${formatTime(g.elapsed)} // HIGH ${String(g.highScore).padStart(6, "0")}`,
      w / 2,
      h * 0.1 + 150 * scale,
    );

    // removed — using HTML button instead
  }
  ctx.restore();
}
