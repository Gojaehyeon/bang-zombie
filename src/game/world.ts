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

export type Game = {
  zombies: Zombie[];
  score: number;
  highScore: number;
  hp: number;
  maxHp: number;
  over: boolean;
  wave: number;
  waveToSpawn: number;
  waveSpawnTimer: number;
  waveIntermission: number;
  startedAt: number;
  onSound?: (name: SoundName) => void;
};

export type SoundName =
  | "hit"
  | "kill"
  | "wave-start"
  | "player-dead";

const PLAYER_HOME_X = 0.5;
const PLAYER_HOME_Y = 0.5;
const PLAYER_HURT_RADIUS = 0.045;
const HIT_PAD = 0.015;
const HIGH_SCORE_KEY = "bang-zombie.highscore";

const KIND_STATS: Record<
  ZombieKind,
  { hp: number; speed: number; radius: number; score: number }
> = {
  normal: { hp: 1, speed: 0.055, radius: 0.05, score: 10 },
  runner: { hp: 1, speed: 0.11, radius: 0.038, score: 20 },
  tank: { hp: 3, speed: 0.032, radius: 0.07, score: 50 },
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

function waveSize(wave: number): number {
  return 5 + wave * 3;
}

function waveKind(wave: number): ZombieKind {
  const r = Math.random();
  if (wave <= 1) return "normal";
  if (wave === 2) return r < 0.75 ? "normal" : "runner";
  if (wave === 3) return r < 0.5 ? "normal" : r < 0.85 ? "runner" : "tank";
  if (r < 0.4) return "normal";
  if (r < 0.75) return "runner";
  return "tank";
}

function waveInterval(wave: number): number {
  return Math.max(1.8 - wave * 0.12, 0.55);
}

export function createGame(now: number): Game {
  return {
    zombies: [],
    score: 0,
    highScore: loadHighScore(),
    hp: 1,
    maxHp: 1,
    over: false,
    wave: 0,
    waveToSpawn: 0,
    waveSpawnTimer: 0,
    waveIntermission: 1.2,
    startedAt: now,
  };
}

export function resetGame(g: Game, now: number): void {
  g.zombies.length = 0;
  g.score = 0;
  g.hp = g.maxHp;
  g.over = false;
  g.wave = 0;
  g.waveToSpawn = 0;
  g.waveSpawnTimer = 0;
  g.waveIntermission = 1.2;
  g.startedAt = now;
}

function spawnZombie(kind: ZombieKind, wave: number): Zombie {
  const side = Math.floor(Math.random() * 4);
  let x = 0.5;
  let y = 0.5;
  const m = -0.06;
  if (side === 0) {
    x = Math.random();
    y = m;
  } else if (side === 1) {
    x = Math.random();
    y = 1 - m;
  } else if (side === 2) {
    x = m;
    y = Math.random();
  } else {
    x = 1 - m;
    y = Math.random();
  }
  const stats = KIND_STATS[kind];
  const speedRamp = 1 + wave * 0.04;
  return {
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    speed: stats.speed * speedRamp * (0.9 + Math.random() * 0.2),
    radius: stats.radius,
    kind,
    alive: true,
    hurtAt: -Infinity,
  };
}

export function updateGame(g: Game, dt: number): void {
  if (g.over) return;

  if (g.waveToSpawn === 0 && g.zombies.length === 0) {
    g.waveIntermission -= dt;
    if (g.waveIntermission <= 0) {
      g.wave += 1;
      g.waveToSpawn = waveSize(g.wave);
      g.waveSpawnTimer = 0;
      g.waveIntermission = 0;
      g.onSound?.("wave-start");
    }
  }

  if (g.waveToSpawn > 0) {
    g.waveSpawnTimer -= dt;
    if (g.waveSpawnTimer <= 0) {
      g.zombies.push(spawnZombie(waveKind(g.wave), g.wave));
      g.waveToSpawn -= 1;
      g.waveSpawnTimer = waveInterval(g.wave);
      if (g.waveToSpawn === 0) {
        g.waveIntermission = 2.5;
      }
    }
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

const ZOMBIE_COLORS: Record<ZombieKind, { body: string; rim: string }> = {
  normal: { body: "#4a7c3c", rim: "#1b2e18" },
  runner: { body: "#c04040", rim: "#3a1212" },
  tank: { body: "#6a4a9c", rim: "#241838" },
};

export function drawGame(
  g: Game,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
): void {
  // player character at the center
  const phx = PLAYER_HOME_X * w;
  const phy = PLAYER_HOME_Y * h;
  const phr = PLAYER_HURT_RADIUS * Math.min(w, h);
  ctx.save();
  const bob = Math.sin(now / 320) * phr * 0.05;
  ctx.fillStyle = "#2b6cb0";
  ctx.beginPath();
  ctx.moveTo(phx - phr * 0.7, phy + phr * 1.05 + bob);
  ctx.lineTo(phx - phr * 0.5, phy - phr * 0.1 + bob);
  ctx.lineTo(phx + phr * 0.5, phy - phr * 0.1 + bob);
  ctx.lineTo(phx + phr * 0.7, phy + phr * 1.05 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#0f2540";
  ctx.lineWidth = 3;
  ctx.stroke();
  const headR = phr * 0.55;
  ctx.fillStyle = "#f5d0a9";
  ctx.beginPath();
  ctx.arc(phx, phy - phr * 0.4 + bob, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(phx - headR * 0.35, phy - phr * 0.45 + bob, headR * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(phx + headR * 0.35, phy - phr * 0.45 + bob, headR * 0.12, 0, Math.PI * 2);
  ctx.fill();
  const pulse = 0.5 + Math.sin(now / 200) * 0.5;
  ctx.strokeStyle = `rgba(255, 80, 80, ${0.2 + pulse * 0.25})`;
  ctx.setLineDash([4, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(phx, phy, phr * 1.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  for (const z of g.zombies) {
    if (!z.alive) continue;
    const cx = z.x * w;
    const cy = z.y * h;
    const r = z.radius * Math.min(w, h);
    const hurt = now - z.hurtAt < 120;
    const colors = ZOMBIE_COLORS[z.kind];
    ctx.fillStyle = hurt ? "#ffffff" : colors.body;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = colors.rim;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#ff3333";
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.15, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.35, cy - r * 0.15, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1b1b1b";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.4, cy + r * 0.35);
    ctx.lineTo(cx + r * 0.4, cy + r * 0.35);
    ctx.stroke();
    if (z.maxHp > 1) {
      const barW = r * 1.6;
      const barH = 5;
      const bx = cx - barW / 2;
      const by = cy - r - 12;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(bx, by, barW, barH);
      ctx.fillStyle = "#66ff88";
      ctx.fillRect(bx, by, barW * (z.hp / z.maxHp), barH);
    }
  }
}

export function drawHud(
  g: Game,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.font = "bold 26px -apple-system, system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(w - 260, 16, 244, 104);
  ctx.fillStyle = "#fff";
  ctx.fillText(`SCORE ${g.score}`, w - 28, 22);
  ctx.fillStyle = "#ffcc66";
  ctx.font = "bold 18px -apple-system, system-ui, sans-serif";
  ctx.fillText(`HIGH ${g.highScore}`, w - 28, 54);
  ctx.fillStyle = "#66ccff";
  ctx.fillText(`WAVE ${g.wave}`, w - 28, 78);

  // wave banner during intermission
  if (!g.over && g.waveToSpawn === 0 && g.zombies.length === 0 && g.waveIntermission > 0) {
    ctx.textAlign = "center";
    ctx.font = "bold 56px -apple-system, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(
      g.wave === 0 ? "GET READY" : `WAVE ${g.wave + 1}`,
      w / 2,
      h / 2 - 180,
    );
  }

  if (g.over) {
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 88px -apple-system, system-ui, sans-serif";
    ctx.fillText("GAME OVER", w / 2, h / 2 - 120);
    ctx.font = "bold 40px -apple-system, system-ui, sans-serif";
    ctx.fillText(`SCORE ${g.score}`, w / 2, h / 2 - 20);
    ctx.font = "bold 28px -apple-system, system-ui, sans-serif";
    ctx.fillStyle = "#ffcc66";
    ctx.fillText(`WAVE ${g.wave} · HIGH ${g.highScore}`, w / 2, h / 2 + 30);
    ctx.font = "bold 24px -apple-system, system-ui, sans-serif";
    ctx.fillStyle = "#bbb";
    ctx.fillText("Enter 키를 눌러 다시 시작", w / 2, h / 2 + 80);
  }
  ctx.restore();
}
