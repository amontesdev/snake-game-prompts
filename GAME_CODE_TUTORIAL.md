# Complete Snake Game Code Tutorial

This tutorial explains every part of your multiplayer Snake game code. The game is built with Node.js, Express, Socket.IO for real-time multiplayer functionality, and HTML5 Canvas for rendering.

## Table of Contents
1. [Project Structure](#project-structure)
2. [Server-Side Code (server.js)](#server-side-code)
3. [Client-Side Code (client.js)](#client-side-code)
4. [HTML Structure (index.html)](#html-structure)
5. [Styling (styles.css)](#styling)
6. [Game Flow](#game-flow)

---

## Project Structure

```
snake-game-prompts/
├── package.json          # Dependencies and scripts
├── server.js            # Backend game logic and server
└── public/              # Frontend files served to clients
    ├── index.html       # Game UI structure
    ├── client.js        # Frontend game logic
    └── styles.css       # Game styling
```

---

## Server-Side Code (server.js)

### 1. Dependencies and Setup

```javascript
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.static("public"));
```

**What this does:**
- Creates an Express web server
- Sets up Socket.IO for real-time communication
- Enables CORS for cross-origin requests
- Serves static files from the `public` folder

### 2. Game Constants

```javascript
const CANVAS_W = 400;
const CANVAS_H = 400;
const BOX = 20;
const ROWS = CANVAS_H / BOX;  // 20 rows
const COLS = CANVAS_W / BOX;  // 20 columns

const START_SPEED_MS = 150;
const MIN_SPEED_MS = 50;

const FOOD_TYPES = [
  { type: "normal", color: "red", score: 1, weight: 0.7 },
  { type: "golden", color: "yellow", score: 3, weight: 0.2, lifetimeMs: 5000 },
  { type: "poison", color: "purple", score: -2, weight: 0.1 },
];
```

**What this does:**
- Defines the game board size (400x400 pixels)
- Sets grid cell size (20x20 pixels)
- Defines game speed (starts at 150ms, speeds up to minimum 50ms)
- Creates three food types with different effects and spawn probabilities

### 3. Game State Variables

```javascript
let snakes = {}; // id -> { id,color,body:[{x,y}],dir,pendingDir,score,extraGrowth,milestone }
let obstacles = []; // [{x,y}]
let food = null; // {x,y,type,color,score,expiresAt?}
let speedMs = START_SPEED_MS;
let loop = null;

const COLORS = ["#22c55e", "#3b82f6", "#eab308", "#ef4444", "#a855f7", "#14b8a6"];
```

**What this does:**
- `snakes`: Stores all player snakes with their properties
- `obstacles`: Array of obstacle positions that block movement
- `food`: Current food item on the board
- `speedMs`: Current game tick speed
- `loop`: Reference to the game loop timer
- `COLORS`: Predefined colors assigned to players

### 4. Utility Functions

#### Random Number Generator
```javascript
function randInt(n) {
  return Math.floor(Math.random() * n);
}
```

#### Coordinate Conversion
```javascript
function cellToXY(x, y) {
  return { x: x * BOX, y: y * BOX };
}

function xyToCell(xy) {
  return { x: Math.floor(xy.x / BOX), y: Math.floor(xy.y / BOX) };
}
```
**What this does:** Converts between grid coordinates (0-19) and pixel coordinates (0-380)

#### Position Comparison
```javascript
function posEq(a, b) {
  return a.x === b.x && a.y === b.y;
}
```
**What this does:** Checks if two positions are the same

### 5. Game Board Management

#### Finding Occupied Cells
```javascript
function listOccupiedCells() {
  const occupied = new Set();
  
  // Add all snake body parts
  for (const id in snakes) {
    snakes[id].body.forEach(seg => {
      occupied.add(`${seg.x},${seg.y}`);
    });
  }
  
  // Add obstacles
  obstacles.forEach(obs => {
    occupied.add(`${obs.x},${obs.y}`);
  });
  
  return occupied;
}
```
**What this does:** Creates a set of all occupied positions (snake bodies + obstacles)

#### Finding Free Positions
```javascript
function randomFreeCell() {
  const occupied = listOccupiedCells();
  const free = [];
  
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const key = `${x * BOX},${y * BOX}`;
      if (!occupied.has(key)) {
        free.push({ x: x * BOX, y: y * BOX });
      }
    }
  }
  
  return free.length > 0 ? free[randInt(free.length)] : null;
}
```
**What this does:** Finds all empty cells and returns a random one for spawning food/obstacles

### 6. Food System

#### Weighted Food Selection
```javascript
function weightedFoodType() {
  const rand = Math.random();
  let cumulative = 0;
  for (const foodType of FOOD_TYPES) {
    cumulative += foodType.weight;
    if (rand <= cumulative) return foodType;
  }
  return FOOD_TYPES[0]; // fallback
}
```
**What this does:** Randomly selects food type based on weights (70% normal, 20% golden, 10% poison)

#### Food Spawning
```javascript
function spawnFood() {
  const pos = randomFreeCell();
  if (!pos) return null;
  
  const foodType = weightedFoodType();
  const newFood = {
    x: pos.x,
    y: pos.y,
    type: foodType.type,
    color: foodType.color,
    score: foodType.score,
  };
  
  // Golden food expires after 5 seconds
  if (foodType.lifetimeMs) {
    newFood.expiresAt = Date.now() + foodType.lifetimeMs;
  }
  
  return newFood;
}
```
**What this does:** Creates new food at random free position with expiration for golden food

### 7. Snake Management

#### Creating New Snakes
```javascript
function createSnake(id) {
  const colorIndex = Object.keys(snakes).length % COLORS.length;
  const startPos = startPosForNewSnake(colorIndex);
  
  snakes[id] = {
    id,
    color: COLORS[colorIndex],
    body: [startPos],
    dir: "RIGHT",
    pendingDir: "RIGHT",
    score: 0,
    extraGrowth: 0,
    milestone: 0,
    name: id,
  };
}
```
**What this does:** Creates a new snake with unique color, starting position, and initial properties

#### Snake Reset (After Collision)
```javascript
function resetSnake(id) {
  if (!snakes[id]) return;
  const colorIndex = Object.values(snakes).indexOf(snakes[id]);
  const startPos = startPosForNewSnake(colorIndex);
  
  snakes[id].body = [startPos];
  snakes[id].dir = "RIGHT";
  snakes[id].pendingDir = "RIGHT";
  snakes[id].score = 0;
  snakes[id].extraGrowth = 0;
  snakes[id].milestone = 0;
}
```
**What this does:** Resets snake to starting state after collision

### 8. Movement and Collision Detection

#### Direction Validation
```javascript
function isOpposite(a, b) {
  return (
    (a === "UP" && b === "DOWN") ||
    (a === "DOWN" && b === "UP") ||
    (a === "LEFT" && b === "RIGHT") ||
    (a === "RIGHT" && b === "LEFT")
  );
}
```
**What this does:** Prevents 180-degree turns that would cause immediate self-collision

#### Next Position Calculation
```javascript
function nextHead(head, dir) {
  switch (dir) {
    case "UP": return { x: head.x, y: head.y - BOX };
    case "DOWN": return { x: head.x, y: head.y + BOX };
    case "LEFT": return { x: head.x - BOX, y: head.y };
    case "RIGHT": return { x: head.x + BOX, y: head.y };
    default: return head;
  }
}
```
**What this does:** Calculates where the snake's head will be next based on direction

#### Collision Detection
```javascript
function collideWalls(p) {
  return p.x < 0 || p.x >= CANVAS_W || p.y < 0 || p.y >= CANVAS_H;
}

function collideArray(p, arr) {
  return arr.some(item => posEq(p, item));
}
```
**What this does:** Checks for wall collisions and collisions with arrays (obstacles, snake bodies)

### 9. Main Game Loop

```javascript
function tick() {
  // 1. Handle golden food expiration
  if (food && food.type === "golden" && food.expiresAt && Date.now() > food.expiresAt) {
    food = spawnFood();
  }

  // 2. Apply pending directions (prevent 180° turns)
  for (const id in snakes) {
    const s = snakes[id];
    if (!isOpposite(s.dir, s.pendingDir)) s.dir = s.pendingDir;
  }

  // 3. Calculate new head positions
  const newHeads = {};
  for (const id in snakes) {
    const s = snakes[id];
    newHeads[id] = nextHead(s.body[0], s.dir);
  }

  // 4. Detect head-to-head collisions
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

  // 5. Process each snake's movement
  for (const id in snakes) {
    if (resetIds.has(id)) continue;

    const s = snakes[id];
    const head = newHeads[id];

    // Check various collision types
    if (collideWalls(head) || 
        collideArray(head, obstacles) || 
        /* check snake body collisions */) {
      resetIds.add(id);
      continue;
    }

    // Move snake
    s.body.unshift(head);

    // Handle food consumption
    let ate = false;
    if (food && posEq(head, food)) {
      ate = true;
      // Apply food effects based on type
      if (food.type === "normal") {
        s.score += food.score;
      } else if (food.type === "golden") {
        s.score += food.score;
        s.extraGrowth += 2;
      } else if (food.type === "poison") {
        s.score += food.score;
        if (s.score < 0) s.score = 0;
        // Shrink snake
        if (s.body.length > 1) s.body.pop();
        if (s.body.length > 1) s.body.pop();
      }
      food = spawnFood();
    }

    // Handle tail (growth logic)
    if (!ate) {
      if (s.extraGrowth > 0) {
        s.extraGrowth--;
      } else {
        s.body.pop();
      }
    }

    // Milestone system (every 5 points)
    const currentMilestone = Math.floor(s.score / 5);
    if (s.score > 0 && currentMilestone > s.milestone) {
      s.milestone = currentMilestone;
      addObstacle();
      speedMs = Math.max(MIN_SPEED_MS, speedMs - 10);
      restartLoop();
    }
  }

  // 6. Reset collided snakes
  if (resetIds.size > 0) {
    resetIds.forEach(id => resetSnake(id));
  }

  // 7. Broadcast game state to all clients
  const payload = {
    w: CANVAS_W,
    h: CANVAS_H,
    box: BOX,
    speedMs,
    food,
    obstacles,
    snakes: Object.values(snakes).map(s => ({
      id: s.id,
      color: s.color,
      body: s.body,
      score: s.score,
      name: s.name ?? '',
    })),
  };
  io.emit("state", payload);
}
```

**What this does:** The main game loop that runs every `speedMs` milliseconds:
1. Handles food expiration
2. Validates and applies direction changes
3. Calculates new positions
4. Detects collisions
5. Moves snakes and handles food consumption
6. Resets collided snakes
7. Sends updated game state to all clients

### 10. Socket.IO Event Handling

```javascript
io.on("connection", (socket) => {
  createSnake(socket.id);
  
  if (!food) food = spawnFood();

  socket.on("newPlayer", (name) => {
    snakes[socket.id] = {
      ...snakes[socket.id],
      name: name || socket.id, 
    };
  });

  socket.emit("init", {
    id: socket.id,
    w: CANVAS_W,
    h: CANVAS_H,
    box: BOX,
  });
  
  socket.on("move", (dir) => {
    const s = snakes[socket.id];
    if (!s) return;
    s.pendingDir = dir;
  });

  socket.on("disconnect", () => {
    delete snakes[socket.id];
    if (Object.keys(snakes).length === 0) {
      obstacles = [];
      food = null;
      speedMs = START_SPEED_MS;
      restartLoop();
    }
  });
});
```

**What this does:**
- Creates a new snake when a player connects
- Handles player name setting
- Sends initial game configuration to new players
- Processes movement commands
- Cleans up when players disconnect

---

## Client-Side Code (client.js)

### 1. DOM Elements and Setup

```javascript
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const scoresEl = document.getElementById("scores");
const statusEl = document.getElementById("status");

const nameModal = document.getElementById("nameModal");
const startBtn = document.getElementById("startGame");

const socket = io();
let myId = null;
let state = null;
let playerName = ""
```

**What this does:** Gets references to HTML elements and sets up Socket.IO connection

### 2. Player Name Handling

```javascript
startBtn.addEventListener("click", () => {
  playerName = document.getElementById("playerName").value.trim();
  if (playerName) {
    socket.emit("newPlayer", playerName);
    nameModal.style.display = "none";
  }
});
```

**What this does:** Sends player name to server and hides the name input modal

### 3. Mobile Controls with Throttling

```javascript
let lastMoveTime = 0;
const MOVE_THROTTLE_MS = 100;

function throttledMove(direction, buttonElement) {
  const now = Date.now();
  if (now - lastMoveTime >= MOVE_THROTTLE_MS) {
    socket.emit("move", direction);
    lastMoveTime = now;
    
    // Visual feedback
    if (buttonElement) {
      buttonElement.style.transform = 'scale(0.9)';
      buttonElement.style.opacity = '0.7';
      setTimeout(() => {
        buttonElement.style.transform = '';
        buttonElement.style.opacity = '';
      }, 150);
    }
  }
}
```

**What this does:** Prevents rapid-fire mobile inputs and provides visual feedback

### 4. Input Handling

```javascript
const KEY_TO_DIR = {
  ArrowUp: "UP", ArrowDown: "DOWN", ArrowLeft: "LEFT", ArrowRight: "RIGHT",
  w: "UP", s: "DOWN", a: "LEFT", d: "RIGHT",
  W: "UP", S: "DOWN", A: "LEFT", D: "RIGHT",
};

document.addEventListener("keydown", (e) => {
  const dir = KEY_TO_DIR[e.key];
  if (dir) socket.emit("move", dir);
});
```

**What this does:** Maps keyboard keys to movement directions and sends to server

### 5. Socket Event Listeners

```javascript
socket.on("connect", () => {
  statusEl.textContent = "Connected";
});

socket.on("init", (payload) => {
  myId = payload.id;
  canvas.width = payload.w;
  canvas.height = payload.h;
});

socket.on("state", (s) => {
  state = s;
  draw();
  renderScores();
  statusEl.textContent = `Players: ${s.snakes.length} • Tick: ${s.speedMs}ms`;
});
```

**What this does:** Handles server messages for connection, initialization, and game state updates

### 6. Rendering Functions

#### Main Draw Function
```javascript
function draw() {
  if (!state) return;
  const { w, h, box, food, obstacles, snakes } = state;

  ctx.clearRect(0, 0, w, h);

  // Draw obstacles
  ctx.fillStyle = "gray";
  obstacles.forEach(o => drawCell(o.x, o.y, box));

  // Draw food with special effects for golden food
  if (food) {
    ctx.fillStyle = food.color;
    drawCell(food.x, food.y, box);

    // Golden food countdown ring
    if (food.type === "golden" && typeof food.expiresAt === "number") {
      const now = Date.now();
      const total = 5000;
      const remaining = Math.max(0, food.expiresAt - now);
      const pct = remaining / total;
      const cx = food.x + box / 2;
      const cy = food.y + box / 2;
      const rMax = box * 0.6;
      const r = rMax * (0.25 + 0.75 * pct);

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.stroke();
    }
  }

  // Draw snakes
  snakes.forEach(s => {
    s.body.forEach((seg, idx) => {
      ctx.fillStyle = idx === 0 ? s.color : shade(s.color, -20);
      drawCell(seg.x, seg.y, box);
      ctx.strokeStyle = "#000";
      ctx.strokeRect(seg.x, seg.y, box, box);
    });
  });
}
```

**What this does:** Renders the entire game state including obstacles, food, and snakes

#### Scoreboard Rendering
```javascript
function renderScores() {
  if (!state) return;
  const me = myId;
  scoresEl.innerHTML = "";
  state.snakes
    .slice()
    .sort((a,b) => b.score - a.score)
    .forEach(s => {
      const pill = document.createElement("div");
      pill.className = "pill" + (s.id === me ? " me" : "");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = s.color;
      const label = document.createElement("span");
      label.textContent = `${s.name} · ${s.score}`;
      pill.appendChild(dot);
      pill.appendChild(label);
      scoresEl.appendChild(pill);
    });
}
```

**What this does:** Creates a sorted scoreboard showing all players with their colors and scores

---

## HTML Structure (index.html)

### Key Elements

```html
<canvas id="c" width="400" height="400"></canvas>
<div class="hud">
  <div class="scores" id="scores"></div>
  <div class="controls">
    <div>Player 1: Arrow Keys</div>
    <div>Others: your own keys; server-authoritative</div>
  </div>
  <div class="status" id="status">Connecting…</div>
</div>

<div id="mobile-controls">
  <div class="control-row">
    <button id="btn-up" class="btn y">Y</button>
  </div>
  <div class="control-row">
    <button id="btn-left" class="btn x">X</button>
    <button id="btn-down" class="btn a">A</button>
    <button id="btn-right" class="btn b">B</button>
  </div>
</div>

<div id="nameModal">
  <div style="background: white; padding: 20px; border-radius: 8px; text-align: center;">
    <h2>Enter your name</h2>
    <input type="text" id="playerName" placeholder="Your name" />
    <button id="startGame">Play</button>
  </div>
</div>
```

**What this does:**
- Canvas for game rendering
- HUD showing scores and game info
- Mobile control buttons
- Name input modal

---

## Styling (styles.css)

### Key Styles

```css
:root { 
  --bg:#111; --fg:#eee; --panel:#1b1b1b; --accent:#10b981; 
}

canvas {
  border: 2px solid #fff; 
  background: #000; 
  border-radius: 12px;
}

.btn {
  width: 60px; height: 60px;
  border-radius: 50%;
  font-size: 20px;
  color: white;
  cursor: pointer;
  transition: transform 0.1s;
}

.btn:active {
  transform: scale(0.9);
}
```

**What this does:** Creates a dark theme with modern styling for the game interface

---

## Game Flow

### 1. Server Startup
1. Express server starts
2. Socket.IO initializes
3. Game loop begins

### 2. Player Connection
1. Client connects to server
2. Server creates new snake
3. Client receives initialization data
4. Player enters name
5. Game state synchronization begins

### 3. Gameplay Loop
1. Players send movement commands
2. Server validates and queues moves
3. Game tick processes all snakes
4. Collisions and food consumption handled
5. Updated state sent to all clients
6. Clients render new state

### 4. Game Events
- **Food Consumption**: Score increases, snake grows
- **Collisions**: Snake resets to starting position
- **Milestones**: Every 5 points adds obstacle and increases speed
- **Golden Food**: Expires after 5 seconds, gives extra growth
- **Poison Food**: Reduces score and shrinks snake

This architecture ensures fair, server-authoritative gameplay while providing smooth real-time multiplayer experience!