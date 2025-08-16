// server.js
// Run: npm init -y && npm i express socket.io && node server.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.static("public"));

/** ---- Game Constants ---- */
const CANVAS_W = 400;
const CANVAS_H = 400;
const BOX = 20;
const ROWS = CANVAS_H / BOX;
const COLS = CANVAS_W / BOX;

const START_SPEED_MS = 100;
const MIN_SPEED_MS = 50;

const FOOD_TYPES = [
  { type: "normal", color: "red", score: 1, weight: 0.7 },
  { type: "golden", color: "yellow", score: 3, weight: 0.2, lifetimeMs: 5000 },
  { type: "poison", color: "purple", score: -2, weight: 0.1 },
];

/** ---- Game State ---- */
let snakes = {}; // id -> { id,color,body:[{x,y}],dir,pendingDir,score,extraGrowth,milestone }
let obstacles = []; // [{x,y}]
let food = null; // {x,y,type,color,score,expiresAt?}
let speedMs = START_SPEED_MS;
let loop = null;

// helper: random color palette for players
const COLORS = ["#22c55e", "#3b82f6", "#eab308", "#ef4444", "#a855f7", "#14b8a6"];

/** ---- Utility Functions ---- */
function randInt(n) {
  return Math.floor(Math.random() * n);
}

function cellToXY(x, y) {
  return { x: x * BOX, y: y * BOX };
}

function xyToCell(xy) {
  return { cx: xy.x / BOX, cy: xy.y / BOX };
}

function posEq(a, b) {
  return a.x === b.x && a.y === b.y;
}

function listOccupiedCells() {
  const occ = new Set();
  for (const id in snakes) {
    for (const seg of snakes[id].body) {
      occ.add(`${seg.x},${seg.y}`);
    }
  }
  for (const o of obstacles) {
    occ.add(`${o.x},${o.y}`);
  }
  if (food) occ.add(`${food.x},${food.y}`);
  return occ;
}

function randomFreeCell() {
  const occupied = listOccupiedCells();
  let tries = 0;
  while (tries < 2000) {
    const x = randInt(COLS) * BOX;
    const y = randInt(ROWS) * BOX;
    if (!occupied.has(`${x},${y}`)) return { x, y };
    tries++;
  }
  // Fallback (very unlikely)
  return { x: 0, y: 0 };
}

function weightedFoodType() {
  const r = Math.random();
  let acc = 0;
  for (const ft of FOOD_TYPES) {
    acc += ft.weight;
    if (r < acc) return ft;
  }
  return FOOD_TYPES[0];
}

function spawnFood() {
  const ft = weightedFoodType();
  const pos = randomFreeCell();
  const f = {
    x: pos.x,
    y: pos.y,
    type: ft.type,
    color: ft.color,
    score: ft.score,
  };
  if (ft.type === "golden") {
    f.expiresAt = Date.now() + (ft.lifetimeMs || 5000);
  }
  return f;
}

function addObstacle() {
  const pos = randomFreeCell();
  obstacles.push({ x: pos.x, y: pos.y });
}

function startPosForNewSnake(index = 0) {
  // spawn near corners / edges to avoid overlap
  const spots = [
    cellToXY(2, 2),
    cellToXY(COLS - 3, ROWS - 3),
    cellToXY(2, ROWS - 3),
    cellToXY(COLS - 3, 2),
    cellToXY(Math.floor(COLS / 2), 2),
    cellToXY(Math.floor(COLS / 2), ROWS - 3),
  ];
  const p = spots[index % spots.length];
  return { x: p.x, y: p.y };
}

/** ---- Game Logic ---- */
function resetSnake(id) {
  const idx = Object.keys(snakes).sort().indexOf(id);
  const pos = randomFreeCell() || startPosForNewSnake(idx);
  snakes[id].body = [{ x: pos.x, y: pos.y }];
  snakes[id].dir = "RIGHT";
  snakes[id].pendingDir = "RIGHT";
  snakes[id].extraGrowth = 0;
  snakes[id].score = 0;
  snakes[id].milestone = 0;
}

function createSnake(id) {
  const index = Object.keys(snakes).length;
  const color = COLORS[index % COLORS.length];
  const pos = startPosForNewSnake(index);
  snakes[id] = {
    id,
    color,
    body: [{ x: pos.x, y: pos.y }],
    dir: "RIGHT",
    pendingDir: "RIGHT",
    score: 0,
    extraGrowth: 0,
    milestone: 0, // track 5-point steps for obstacle/speed
  };
}

function isOpposite(a, b) {
  return (
    (a === "UP" && b === "DOWN") ||
    (a === "DOWN" && b === "UP") ||
    (a === "LEFT" && b === "RIGHT") ||
    (a === "RIGHT" && b === "LEFT")
  );
}

function nextHead(head, dir) {
  let { x, y } = head;
  if (dir === "LEFT") x -= BOX;
  if (dir === "RIGHT") x += BOX;
  if (dir === "UP") y -= BOX;
  if (dir === "DOWN") y += BOX;
  return { x, y };
}

function collideWalls(p) {
  return p.x < 0 || p.y < 0 || p.x >= CANVAS_W || p.y >= CANVAS_H;
}

function collideArray(p, arr) {
  return arr.some(seg => posEq(seg, p));
}

function tick() {
  // Golden food timeout
  if (food && food.type === "golden" && food.expiresAt && Date.now() > food.expiresAt) {
    food = spawnFood();
  }

  // 1) Apply pending directions (prevent 180° turns)
  for (const id in snakes) {
    const s = snakes[id];
    if (!isOpposite(s.dir, s.pendingDir)) s.dir = s.pendingDir;
  }

  // 2) Move snakes: compute new heads
  const newHeads = {};
  for (const id in snakes) {
    const s = snakes[id];
    newHeads[id] = nextHead(s.body[0], s.dir);
  }

  // 3) Head-to-head collision (same cell)
  const headCells = {};
  for (const id in newHeads) {
    const key = `${newHeads[id].x},${newHeads[id].y}`;
    headCells[key] = headCells[key] || [];
    headCells[key].push(id);
  }
  const resetIds = new Set();
  for (const key in headCells) {
    if (headCells[key].length > 1) {
      headCells[key].forEach(id => resetIds.add(id));
    }
  }

  // 4) Resolve each snake movement & collisions
  for (const id in snakes) {
    if (resetIds.has(id)) continue; // reset later

    const s = snakes[id];
    const head = newHeads[id];

    // Walls
    if (collideWalls(head)) {
      resetIds.add(id);
      continue;
    }

    // Obstacles
    if (collideArray(head, obstacles)) {
      resetIds.add(id);
      continue;
    }

    // Other snakes bodies
    for (const otherId in snakes) {
      const other = snakes[otherId];
      const bodyToCheck =
        otherId === id ? other.body.slice(0) : other.body; // include full body for others
      if (collideArray(head, bodyToCheck)) {
        resetIds.add(id);
        break;
      }
    }
    if (resetIds.has(id)) continue;

    // Move/grow
    s.body.unshift(head);

    let ate = false;
    if (food && posEq(head, food)) {
      ate = true;
      // handle food effects
      if (food.type === "normal") {
        s.score += food.score; // +1
      } else if (food.type === "golden") {
        s.score += food.score; // +3
        s.extraGrowth += 2; // extra growth over next moves
      } else if (food.type === "poison") {
        s.score += food.score; // -2
        if (s.score < 0) s.score = 0;
        // shrink by 2 safely
        if (s.body.length > 1) s.body.pop();
        if (s.body.length > 1) s.body.pop();
      }
      // new food (server controls timer via expiresAt)
      food = spawnFood();
    }

    // Tail logic (no pop if we have pending extraGrowth or we just ate)
    if (!ate) {
      if (s.extraGrowth > 0) {
        s.extraGrowth--;
      } else {
        s.body.pop();
      }
    }

    // Milestones: every 5 points -> add obstacle & speed up (once per threshold per player)
    const currentMilestone = Math.floor(s.score / 5);
    if (s.score > 0 && currentMilestone > s.milestone) {
      s.milestone = currentMilestone;
      addObstacle();
      speedMs = Math.max(MIN_SPEED_MS, speedMs - 10);
      restartLoop();
    }
  }

  // 5) Reset any collided snakes
  if (resetIds.size > 0) {
    resetIds.forEach(id => resetSnake(id));
  }

  // 6) Broadcast state
  const payload = {
    w: CANVAS_W,
    h: CANVAS_H,
    box: BOX,
    speedMs,
    food,
    obstacles,
    snakes: Object.values(snakes).map(s => {
        return {
      id: s.id,
      color: s.color,
      body: s.body,
      score: s.score,
      name: s.name ?? '',
    }
    }),
  };
  io.emit("state", payload);
}

function startLoop() {
  if (loop) clearInterval(loop);
  loop = setInterval(tick, speedMs);
}

function restartLoop() {
  if (loop) clearInterval(loop);
  loop = setInterval(tick, speedMs);
}

/** ---- Socket Handlers ---- */
io.on("connection", (socket) => {
  createSnake(socket.id);

  // spawn food at first connection if missing
  if (!food) food = spawnFood();

  socket.on("newPlayer", (name) => {
    console.log('name', name)
    snakes[socket.id] = {
        ...snakes[socket.id],
        name: name || socket.id, 
    };
  });

  // Send a small init (client can infer everything from state updates too)
  socket.emit("init", {
    id: socket.id,
    w: CANVAS_W,
    h: CANVAS_H,
    box: BOX,
  });
  socket.on("move", (dir) => {
    const s = snakes[socket.id];
    if (!s) return;
    // Save as pending; validated on tick to prevent 180° turn
    s.pendingDir = dir;
  });

  socket.on("disconnect", () => {
    delete snakes[socket.id];
    // If everyone left, reset game entities
    if (Object.keys(snakes).length === 0) {
      obstacles = [];
      food = null;
      speedMs = START_SPEED_MS;
      restartLoop();
    }
  });
});

startLoop();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
