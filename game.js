// Party Game Prototype - 外圈 + 內圈路徑（照文字路線）：
// 起點右下角 → 向上8 → 向左8 → 向下8 → 向右6 → 向上6 → 向左4 → 向下4 → 向右2 → 向上2（終點）
// A/B/C 比例：25% / 45% / 30%
// 特別格：A 2 個、B 3 個、C 1 個，位置每局隨機，以金色星星表示
// 指令區：放大字體 + 「完成指令」與「喝一杯」按鈕；連續喝一杯超過 2 次後，只剩完成指令可選，完成指令後重置喝一杯次數
// 棋子：每位玩家有自己的顏色，圓點上疊加 M/F 字樣表示性別

const BOARD_SIZE = 9; // 9x9 棋盤

let pairCount = 1;
let players = [];
let currentPlayerIndex = 0;
let gameOver = false;
let isRolling = false;

// 喝一杯次數（連續）
let drinkCount = 0;
let waitingForChoice = false;

const COLORS = [
  "#ef4444",
  "#22c55e",
  "#3b82f6",
  "#eab308",
  "#ec4899",
  "#06b6d4",
  "#a855f7",
  "#f97316",
];

// ===== 指令資料庫存取（localStorage） =====
const COMMAND_STORAGE_KEY = "partyGameCommandDB";

function normalizeNormalItem(item) {
  if (typeof item === "string") {
    return { text: item, kind: "self", level: "A" };
  }
  const text = String(item.text || "");
  const kind = item.kind === "interaction" ? "interaction" : "self";
  const level = item.level === "B" || item.level === "C" ? item.level : "A";
  return { text, kind, level };
}

function normalizeSpecialItem(item) {
  if (typeof item === "string") {
    return { text: item, level: "A" };
  }
  const text = String(item.text || "");
  const level = item.level === "B" || item.level === "C" ? item.level : "A";
  return { text, level };
}

function loadCommandDB() {
  try {
    const raw = localStorage.getItem(COMMAND_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);

    const normalRaw = Array.isArray(data.normal) ? data.normal : [];
    const normal = normalRaw.map(normalizeNormalItem);

    const specialRaw = Array.isArray(data.special) ? data.special : [];
    const special = specialRaw.map(normalizeSpecialItem);

    return { normal, special };
  } catch (e) {
    console.error("loadCommandDB error", e);
    return null;
  }
}

let commandDB = loadCommandDB();

// ===== 棋盤路徑：照你指定的文字路線建立 PATH =====
// PATH: { r, c, type }，type: normal | special | start | end
const PATH = [];

(function buildPathFromSteps() {
  // 起點在右下角外圈： (8,8)
  let r = BOARD_SIZE - 1;
  let c = BOARD_SIZE - 1;
  PATH.push({ r, c, type: "normal" });

  function step(dr, dc, count) {
    for (let i = 0; i < count; i++) {
      r += dr;
      c += dc;
      PATH.push({ r, c, type: "normal" });
    }
  }

  // 向上 8 格
  step(-1, 0, 8); // (0,8)
  // 向左 8 格
  step(0, -1, 8); // (0,0)
  // 向下 8 格
  step(1, 0, 8); // (8,0)
  // 向右 6 格
  step(0, 1, 6); // (8,6)
  // 向上 6 格
  step(-1, 0, 6); // (2,6)
  // 向左 4 格
  step(0, -1, 4); // (2,2)
  // 向下 4 格
  step(1, 0, 4); // (6,2)
  // 向右 2 格
  step(0, 1, 2); // (6,4)
  // 向上 2 格（終點）
  step(-1, 0, 2); // (4,4)

  // 標記起點與終點
  if (PATH.length > 0) PATH[0].type = "start"; // 起點：右下角
  if (PATH.length > 0) PATH[PATH.length - 1].type = "end"; // 終點：中心 (4,4)
})();

// 隨機挑選特別格：A 2 個、B 3 個、C 1 個
function assignRandomSpecialTiles() {
  // 先清掉舊的 special（保留 start/end）
  for (const cell of PATH) {
    if (cell.type === "special") cell.type = "normal";
  }

  const aIdx = [];
  const bIdx = [];
  const cIdx = [];

  for (let i = 0; i < PATH.length; i++) {
    const cell = PATH[i];
    if (cell.type === "start" || cell.type === "end") continue;
    const lv = getLevelForIndex(i);
    if (lv === "A") aIdx.push(i);
    else if (lv === "B") bIdx.push(i);
    else if (lv === "C") cIdx.push(i);
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  shuffle(aIdx);
  shuffle(bIdx);
  shuffle(cIdx);

  const pick = (arr, count) => arr.slice(0, Math.min(count, arr.length));

  const chosen = [
    ...pick(aIdx, 2),
    ...pick(bIdx, 2),
    ...pick(cIdx, 1),
  ];

  for (const i of chosen) {
    if (PATH[i].type === "normal") PATH[i].type = "special";
  }
}

// ===== 指令預設值 =====
const defaultSpecialCommands = [
  { text: "幸運格：你往前多走 1 格，並指定任一人喝一口", level: "A" },
  { text: "互動格：你跟左邊的人擊掌 5 次", level: "A" },
  { text: "全體格：所有人一起拍一張大合照", level: "B" },
  { text: "特權格：你可以決定下一輪要從誰開始", level: "B" },
  { text: "懲罰格：你退後 1 格並說出一件今天最糗的事", level: "C" },
  { text: "互動格：你選一個人，對他說一個真心誇獎", level: "C" },
];

const defaultNormalCommands = [
  { text: "[A] 跟 [B] 握手 10 秒", kind: "interaction", level: "A" },
  { text: "[A] 對 [B] 說一個真心誇獎", kind: "interaction", level: "A" },
  { text: "[A] 站起來自我介紹 10 秒", kind: "self", level: "A" },
  { text: "[A] 說一件今天最開心的事", kind: "self", level: "A" },
  { text: "說一句祝福的話給在場所有人", kind: "self", level: "B" },
];

// DOM refs
const stepPairs = document.getElementById("step-pairs");
const stepNames = document.getElementById("step-names");
const stepConfirm = document.getElementById("step-confirm");
const stepGame = document.getElementById("step-game");

const pairCountSelect = document.getElementById("pair-count");
const btnStartNames = document.getElementById("btn-start-names");
const nameInstruction = document.getElementById("name-instruction");
const nameLabel = document.getElementById("name-label");
const nameInput = document.getElementById("name-input");
const btnNextName = document.getElementById("btn-next-name");

const playerListDiv = document.getElementById("player-list");
const btnStartGame = document.getElementById("btn-start-game");

const turnStatus = document.getElementById("turn-status");
const diceFace = document.getElementById("dice-face");
const boardTrack = document.getElementById("board-track");
const commandBox = document.getElementById("command-box");
const commandTextDiv = document.getElementById("command-text");
const btnConfirmTask = document.getElementById("btn-confirm-task");
const btnDrink = document.getElementById("btn-drink");
const board = document.getElementById("board");
const legendDiv = document.getElementById("legend");

// 綁定指令按鈕事件
btnConfirmTask.addEventListener("click", () => {
  if (!waitingForChoice || gameOver) return;
  drinkCount = 0; // 完成指令 → 重置喝一杯次數
  waitingForChoice = false;
  btnConfirmTask.disabled = true;
  btnDrink.disabled = true;
  goToNextPlayer(true);
});

btnDrink.addEventListener("click", () => {
  if (!waitingForChoice || gameOver) return;
  drinkCount += 1;
  waitingForChoice = false;
  btnConfirmTask.disabled = true;
  btnDrink.disabled = true;
  goToNextPlayer(true);
});

// Step 1: 選擇對數
btnStartNames.addEventListener("click", () => {
  pairCount = parseInt(pairCountSelect.value, 10);
  startNameInputFlow();
});

// 名字輸入流程狀態
let expectedPlayerTotal = 0;
let currentNameIndex = 0; // 0 ~ total-1

function startNameInputFlow() {
  expectedPlayerTotal = pairCount * 2;
  currentNameIndex = 0;
  players = [];

  stepPairs.classList.add("hidden");
  stepNames.classList.remove("hidden");
  stepConfirm.classList.add("hidden");
  stepGame.classList.add("hidden");

  updateNamePrompt();
  nameInput.value = "";
  nameInput.focus();
}

function updateNamePrompt() {
  const pairNum = Math.floor(currentNameIndex / 2) + 1;
  const gender = currentNameIndex % 2 === 0 ? "男" : "女";
  nameInstruction.textContent = `第 ${pairNum} 對：請輸入「${gender}」名字`;
  nameLabel.textContent = "輸入名字：";
}

btnNextName.addEventListener("click", () => {
  const name = nameInput.value.trim();
  if (!name) return;

  const pair = Math.floor(currentNameIndex / 2) + 1;
  const gender = currentNameIndex % 2 === 0 ? "M" : "F";
  const color = COLORS[currentNameIndex % COLORS.length];

  players.push({
    id: currentNameIndex + 1,
    name,
    pair,
    gender,
    positionIndex: 0,
    color,
  });

  currentNameIndex += 1;
  nameInput.value = "";

  if (currentNameIndex >= expectedPlayerTotal) {
    showConfirmStep();
  } else {
    updateNamePrompt();
    nameInput.focus();
  }
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    btnNextName.click();
  }
});

function showConfirmStep() {
  stepNames.classList.add("hidden");
  stepConfirm.classList.remove("hidden");

  const grouped = new Map();
  for (const p of players) {
    if (!grouped.has(p.pair)) grouped.set(p.pair, []);
    grouped.get(p.pair).push(p);
  }

  const lines = [];
  Array.from(grouped.keys())
    .sort((a, b) => a - b)
    .forEach((pairId) => {
      const pairPlayers = grouped.get(pairId);
      const male = pairPlayers.find((p) => p.gender === "M");
      const female = pairPlayers.find((p) => p.gender === "F");
      const maleName = male ? male.name : "(男)";
      const femaleName = female ? female.name : "(女)";
      lines.push(`第 ${pairId} 對：${maleName}（男）、${femaleName}（女）`);
    });

  playerListDiv.textContent = lines.join("\n");
}

btnStartGame.addEventListener("click", () => {
  startGame();
});

// 遊戲開始
function startGame() {
  currentPlayerIndex = 0;
  gameOver = false;
  isRolling = false;
  drinkCount = 0;
  waitingForChoice = false;
  btnConfirmTask.disabled = true;
  btnDrink.disabled = true;

  commandDB = loadCommandDB();

  players = players.map((p) => ({ ...p, positionIndex: 0 }));

  // 每局重新隨機特別格
  assignRandomSpecialTiles();

  stepConfirm.classList.add("hidden");
  stepGame.classList.remove("hidden");

  renderBoard();
  renderLegend();
  updateTurnStatus();
  commandTextDiv.textContent = "指令會出現在這裡";
  renderDiceFace(0);
}

// 直接點骰子圖示擲骰子
diceFace.addEventListener("click", () => {
  if (gameOver || isRolling || waitingForChoice) return;

  isRolling = true;
  board.classList.add("board-zoom");

  let ticks = 0;
  const totalDuration = 2000;
  const intervalMs = 100;
  const maxTicks = Math.floor(totalDuration / intervalMs);

  const interval = setInterval(() => {
    ticks++;
    const tempRoll = Math.floor(Math.random() * 6) + 1;
    renderDiceFace(tempRoll, true);

    if (ticks >= maxTicks) {
      clearInterval(interval);
      const finalRoll = Math.floor(Math.random() * 6) + 1;
      renderDiceFace(finalRoll, false);
      stepMove(finalRoll, () => {
        isRolling = false;
        if (!gameOver) {
          board.classList.remove("board-zoom");
        }
      });
    }
  }, intervalMs);
});

// 逐格移動
function stepMove(roll, done) {
  const current = players[currentPlayerIndex];
  const endIndex = PATH.length - 1;
  const remainingToEnd = endIndex - current.positionIndex;
  const steps = Math.max(0, Math.min(roll, remainingToEnd));

  if (steps === 0) {
    handleLanding(current);
    done();
    return;
  }

  let moved = 0;

  const moveOne = () => {
    if (moved >= steps) {
      handleLanding(current);
      done();
      return;
    }
    current.positionIndex += 1;
    moved += 1;
    renderBoard();
    setTimeout(moveOne, 500);
  };

  moveOne();
}

function handleLanding(current) {
  renderBoard();
  const cell = PATH[current.positionIndex];
  if (!cell) return;

  const level = getLevelForIndex(current.positionIndex);

  let msg = "";

  if (cell.type === "end") {
    msg = handleWin(current);
    commandTextDiv.textContent = msg;
    btnConfirmTask.disabled = true;
    btnDrink.disabled = true;
    waitingForChoice = false;
    return;
  } else if (cell.type === "special") {
    msg = generateSpecialCommand(current, level);
  } else {
    msg = generateNormalCommand(current, level);
  }

  const sameSpotPlayers = players.filter(
    (p) => p.positionIndex === current.positionIndex
  );
  let collisionText = "";
  if (sameSpotPlayers.length >= 2) {
    const names = sameSpotPlayers.map((p) => p.name).join("、");
    collisionText = `${names} 靠太近，各罰喝一杯！`;
  }

  if (collisionText) {
    commandTextDiv.innerHTML = `${msg}<br><span class="collision">${collisionText}</span>`;
  } else {
    commandTextDiv.textContent = msg;
  }

  waitingForChoice = true;
  btnConfirmTask.disabled = false;
  btnDrink.disabled = drinkCount >= 2;
}

function getLevelForIndex(index) {
  // 25% A、45% B、30% C
  const maxIndex = PATH.length - 1;
  const ratio = index / maxIndex;
  if (ratio <= 0.25) return "A";
  if (ratio <= 0.7) return "B";
  return "C";
}

function goToNextPlayer(updateBoard = true) {
  if (gameOver) return;
  currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
  updateTurnStatus();
  if (updateBoard) renderBoard();
}

function updateTurnStatus() {
  const current = players[currentPlayerIndex];
  if (!current) {
    turnStatus.textContent = "";
    return;
  }
  turnStatus.innerHTML = `現在輪到：<span class="status-name">${current.name}</span>`;
}

function renderBoard() {
  boardTrack.innerHTML = "";

  const currentPosIndex = players[currentPlayerIndex]?.positionIndex ?? -1;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cellDiv = document.createElement("div");
      cellDiv.className = "cell";

      const pathIndex = PATH.findIndex((p) => p.r === r && p.c === c);
      if (pathIndex !== -1) {
        const info = PATH[pathIndex];
        const level = getLevelForIndex(pathIndex);
        cellDiv.classList.add("cell-path");
        if (info.type === "start") {
          cellDiv.classList.add(`cell-level-${level}`);
        } else if (info.type === "end") {
          cellDiv.classList.add("cell-center");
          cellDiv.style.transform = "scale(1.12)";
        } else if (info.type === "special") {
          cellDiv.classList.add(`cell-level-${level}`);
          cellDiv.classList.add("cell-special");
          if (pathIndex === currentPosIndex) {
            cellDiv.classList.add("cell-special-active");
          }
        } else {
          cellDiv.classList.add(`cell-level-${level}`);
        }
      }

      const inner = document.createElement("div");
      inner.className = "cell-inner";

      if (pathIndex !== -1 && PATH[pathIndex].type === "special") {
        const star = document.createElement("div");
        star.className = "cell-star";
        star.textContent = "★";
        inner.appendChild(star);
      }

      const tokensContainer = document.createElement("div");
      tokensContainer.className = "tokens";

      const herePlayers = players.filter((p) => {
        const pos = PATH[p.positionIndex];
        return pos && pos.r === r && pos.c === c;
      });

      for (const p of herePlayers) {
        const token = document.createElement("div");
        token.className = "token";
        token.style.backgroundColor = p.color; // 每位玩家自己的顏色
        token.textContent = p.gender === "M" ? "M" : "F"; // 疊加性別字樣
        if (p.id === players[currentPlayerIndex].id) {
          token.classList.add("token-current");
        }
        tokensContainer.appendChild(token);
      }

      inner.appendChild(tokensContainer);
      cellDiv.appendChild(inner);
      boardTrack.appendChild(cellDiv);
    }
  }
}

function renderLegend() {
  legendDiv.innerHTML = "";
  players.forEach((p) => {
    const item = document.createElement("div");
    item.className = "legend-item";

    const dot = document.createElement("div");
    dot.className = "legend-dot";
    dot.style.backgroundColor = p.color;

    const nameSpan = document.createElement("span");
    nameSpan.textContent = p.name;

    item.appendChild(dot);
    item.appendChild(nameSpan);
    legendDiv.appendChild(item);
  });
}

// 骰子渲染
function renderDiceFace(value, rolling = false) {
  diceFace.innerHTML = "";
  if (rolling) {
    diceFace.classList.add("dice-rolling");
  } else {
    diceFace.classList.remove("dice-rolling");
  }

  if (value <= 0) return;

  const pattern = getDicePattern(value);
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    if (pattern[i]) {
      const dot = document.createElement("div");
      dot.className = "dice-dot";
      cell.appendChild(dot);
    }
    diceFace.appendChild(cell);
  }
}

function getDicePattern(value) {
  switch (value) {
    case 1:
      return [0, 0, 0, 0, 1, 0, 0, 0, 0];
    case 2:
      return [1, 0, 0, 0, 0, 0, 0, 0, 1];
    case 3:
      return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    case 4:
      return [1, 0, 1, 0, 0, 0, 1, 0, 1];
    case 5:
      return [1, 0, 1, 0, 1, 0, 1, 0, 1];
    case 6:
      return [1, 0, 1, 1, 0, 1, 1, 0, 1];
    default:
      return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  }
}

function generateSpecialCommand(currentPlayer, level) {
  const db = commandDB;
  const rawList = db && Array.isArray(db.special) && db.special.length > 0
    ? db.special
    : defaultSpecialCommands;

  let list = rawList.filter((item) => (item.level || "A") === level);
  if (list.length === 0) list = rawList;

  const item = randomPick(list) || { text: "抽一張特別卡，照卡片上的指示做", level };
  const base = item.text || "抽一張特別卡，照卡片上的指示做";
  return `${currentPlayer.name} 抽到特別格：${base}`;
}

function generateNormalCommand(currentPlayer, level) {
  const db = commandDB;
  const rawList = db && Array.isArray(db.normal) && db.normal.length > 0
    ? db.normal
    : defaultNormalCommands;

  let list = rawList.filter((item) => (item.level || "A") === level);
  if (list.length === 0) {
    list = rawList;
  }

  const item = randomPick(list) || { text: "[A] 說一句祝福的話給在場所有人", kind: "self", level };
  const text = item.text || "";
  const kind = item.kind === "interaction" ? "interaction" : "self";

  if (kind === "interaction") {
    // 互動時，優先跟「其他隊伍的異性」互動
    const candidates = players.filter(
      (p) => p.id !== currentPlayer.id && p.gender !== currentPlayer.gender && p.pair !== currentPlayer.pair
    );
    const fallback = players.filter((p) => p.id !== currentPlayer.id);
    const other = (candidates.length > 0 ? randomPick(candidates) : randomPick(fallback)) || currentPlayer;

    if (text.includes("[A]") || text.includes("[B]")) {
      return text
        .replace(/\[A\]/g, currentPlayer.name)
        .replace(/\[B\]/g, other.name);
    }
    return `${currentPlayer.name} 跟 ${other.name}：${text}`;
  } else {
    if (text.includes("[A]")) {
      return text.replace(/\[A\]/g, currentPlayer.name);
    }
    return `${currentPlayer.name}：${text}`;
  }
}

function handleWin(player) {
  gameOver = true;
  const msg = `🎉 ${player.name} 準備告白！已到達終點。`;
  turnStatus.textContent = msg;

  const loser = players.reduce((acc, p) => {
    if (!acc) return p;
    return p.positionIndex < acc.positionIndex ? p : acc;
  }, null);

  let rewardText = "贏家可以指定任意兩個人做一個指令";
  if (loser && loser.id !== player.id) {
    rewardText = `${player.name} 獲勝！最後一名是 ${loser.name}，請他抽一張懲罰卡。`;
  }

  return `${msg}\n${rewardText}`;
}

function randomPick(arr) {
  if (!arr || arr.length === 0) return null;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}
