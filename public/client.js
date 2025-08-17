
    const canvas = document.getElementById("c");
    const ctx = canvas.getContext("2d");
    const scoresEl = document.getElementById("scores");
    const statusEl = document.getElementById("status");

    // modal elements
    const nameModal = document.getElementById("nameModal");
    const startBtn = document.getElementById("startGame");

    const socket = io(); // same origin
    let myId = null;

    // latest state from server
    let state = null;

    let playerName = ""

    startBtn.addEventListener("click", () => {
    playerName = document.getElementById("playerName").value.trim();
    if (playerName) {
        socket.emit("newPlayer", playerName); // send to server
        nameModal.style.display = "none"; // hide modal
    }
    });

    // Handle mobile buttons
document.getElementById("btn-up").addEventListener("click", () => {
  socket.emit("move", "UP");
});
document.getElementById("btn-down").addEventListener("click", () => {
  socket.emit("move", "DOWN");
});
document.getElementById("btn-left").addEventListener("click", () => {
  socket.emit("move", "LEFT");
});
document.getElementById("btn-right").addEventListener("click", () => {
  socket.emit("move", "RIGHT");
});

    // Input
    const ARROWS = new Set(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"]);
    const KEY_TO_DIR = {
      ArrowUp: "UP",
      ArrowDown: "DOWN",
      ArrowLeft: "LEFT",
      ArrowRight: "RIGHT",
      // you can add WASD if you want multiple people on one keyboard:
      w: "UP", s: "DOWN", a: "LEFT", d: "RIGHT",
      W: "UP", S: "DOWN", A: "LEFT", D: "RIGHT",
    };

    document.addEventListener("keydown", (e) => {
      const dir = KEY_TO_DIR[e.key];
      if (dir) socket.emit("move", dir);
    });

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


    function drawCell(x, y, size) {
      ctx.fillRect(x, y, size, size);
    }

    function draw() {
      if (!state) return;
      const { w, h, box, food, obstacles, snakes } = state;

      ctx.clearRect(0, 0, w, h);

      // Obstacles
      ctx.fillStyle = "gray";
      obstacles.forEach(o => drawCell(o.x, o.y, box));

      // Food
      if (food) {
        ctx.fillStyle = food.color;
        drawCell(food.x, food.y, box);

        // If golden, draw a subtle countdown ring
        if (food.type === "golden" && typeof food.expiresAt === "number") {
          const now = Date.now();
          const total = 5000;
          const remaining = Math.max(0, food.expiresAt - now);
          const pct = remaining / total; // 1 -> 0
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

      // Snakes
      snakes.forEach(s => {
        s.body.forEach((seg, idx) => {
          ctx.fillStyle = idx === 0 ? s.color : shade(s.color, -20);
          drawCell(seg.x, seg.y, box);
          ctx.strokeStyle = "#000";
          ctx.strokeRect(seg.x, seg.y, box, box);
        });
      });
    }

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

    // quick color shade helper
    function shade(hex, amt) {
      // hex like #rrggbb -> adjust rgb by amt
      let c = hex.replace("#", "");
      if (c.length === 3) c = c.split("").map(x => x + x).join("");
      const n = parseInt(c, 16);
      let r = (n >> 16) + amt;
      let g = ((n >> 8) & 0xff) + amt;
      let b = (n & 0xff) + amt;
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));
      return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }