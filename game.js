// Party Game Prototype - 外圈 + 內圈路徑（照文字路線）：
// 起點右下角 → 向上8 → 向左8 → 向下8 → 向右6 → 向上6 → 向左4 → 向下4 → 向右2 → 向上2（終點）
// A/B/C 比例：25% / 45% / 30%
// 特別格：A 2 個、B 3 個、C 1 個，位置每局隨機，以金色星星表示
// 指令區：放大字體 + 「完成指令」與「喝一杯」按鈕；連續喝一杯超過 2 次後，只剩完成指令可選，完成指令後重置喝一杯次數
// 棋子：每位玩家有自己的顏色，圓點上疊加 M/F 字樣表示性別

const BASE_BOARD_SIZE = 9; // 9x9 棋盤
let currentBoardSize = BASE_BOARD_SIZE;

let pairCount = 1;
let players = [];
let currentPlayerIndex = 0;
let gameOver = false;
let isRolling = false;

// 喝一杯次數（連續）
let drinkCount = 0;
let waitingForChoice = false;
let pendingInteractionPair = null;
let rerollsUsedThisTurn = 0;
let interactionMode = "partner";
const commandDecks = new Map();

let remoteConfigVersion = 0;
let remoteConfigTimer = null;
const runtimeRules = {
  firstPairFemaleMultiplier: 0.6,
  firstPairMaleMultiplier: 1.3,
  maxRerollsPerTurn: 1,
  maxConsecutiveDrinks: 2,
  diceRollDurationMs: 2000,
  moveStepDelayMs: 500,
  pollIntervalSeconds: 3,
  voiceDefaultEnabled: true,
  specialTileCounts: { A: 2, B: 3, C: 1 },
};

const interactionStats = new Map();

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

// 啟用的指令等級（A/B/C），預設 A+B
let enabledLevels = new Set(["A", "B"]);
let currentLevelMode = "AB";
const PLAYER_COUNT_BOARD_SIZE = {
  2: 8,
  4: 7,
  6: 6,
  8: 5,
};

// ===== 嵌入版指令資料庫（直接寫在程式裡） =====
// 結構：{ normal: { text, kind, level }[], special: { text, level }[] }
// 題庫已移至 commands.js；語音與音效已移至 speech.js。

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

let commandDB = null;

// 直接從嵌入的 EMBEDDED_COMMAND_DB 初始化指令資料庫（不再讀取 commands.json / localStorage）
(function initEmbeddedCommandDB() {
  try {
    const embedded = window.EMBEDDED_COMMAND_DB || {};
    const normalRaw = Array.isArray(embedded.normal)
      ? embedded.normal
      : [];
    const specialRaw = Array.isArray(embedded.special)
      ? embedded.special
      : [];

    const normal = normalRaw.map(normalizeNormalItem);
    const special = specialRaw.map(normalizeSpecialItem);

    commandDB = { normal, special };
    console.log("Command DB loaded from EMBEDDED_COMMAND_DB", {
      normalCount: normal.length,
      specialCount: special.length,
    });
  } catch (e) {
    console.warn("Failed to init embedded command DB, use defaults", e);
    commandDB = null;
  }
})();

// ===== 棋盤路徑：照你指定的文字路線建立 PATH =====
// PATH: { r, c, type }，type: normal | special | start | end
const BASE_PATH = [];
let PATH = [];

(function buildBasePath() {
  // 起點在右下角外圈： (8,8)
  let r = BASE_BOARD_SIZE - 1;
  let c = BASE_BOARD_SIZE - 1;
  BASE_PATH.push({ r, c, type: "normal" });

  function step(dr, dc, count) {
    for (let i = 0; i < count; i++) {
      r += dr;
      c += dc;
      BASE_PATH.push({ r, c, type: "normal" });
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
  if (BASE_PATH.length > 0) BASE_PATH[0].type = "start"; // 起點：右下角
  if (BASE_PATH.length > 0) BASE_PATH[BASE_PATH.length - 1].type = "end"; // 終點：中心 (4,4)
})();

function cloneBasePath() {
  return BASE_PATH.map((cell) => ({ ...cell }));
}

function buildPathForSize(targetSize) {
  if (targetSize === BASE_BOARD_SIZE) {
    return cloneBasePath();
  }

  const base = BASE_PATH;
  if (base.length === 0) return [];

  const maxBase = BASE_BOARD_SIZE - 1;
  const maxTarget = targetSize - 1;
  const result = [];
  let lastKey = null;

  for (const cell of base) {
    let r = cell.r;
    let c = cell.c;
    if (maxTarget > 0 && maxBase > 0) {
      r = Math.round((cell.r / maxBase) * maxTarget);
      c = Math.round((cell.c / maxBase) * maxTarget);
    } else {
      r = 0;
      c = 0;
    }
    const key = `${r},${c}`;
    if (key === lastKey) continue;
    result.push({ r, c, type: "normal" });
    lastKey = key;
  }

  if (result.length > 0) {
    result[0].type = "start";
    result[result.length - 1].type = "end";
  }
  return result;
}

PATH = cloneBasePath();

function getLevelForIndex(index) {
  // 25% A、45% B、30% C
  const maxIndex = PATH.length - 1;
  const ratio = index / maxIndex;
  if (ratio <= 0.25) return "A";
  if (ratio <= 0.7) return "B";
  return "C";
}

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
    ...pick(aIdx, runtimeRules.specialTileCounts.A),
    ...pick(bIdx, runtimeRules.specialTileCounts.B),
    ...pick(cIdx, runtimeRules.specialTileCounts.C),
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
const stepSettings = document.getElementById("step-settings");
const stepNames = document.getElementById("step-names");
const stepConfirm = document.getElementById("step-confirm");
const stepGame = document.getElementById("step-game");

const pairCountSelect = document.getElementById("pair-count");
const btnStartNames = document.getElementById("btn-start-names");
const levelModeSelect = document.getElementById("level-mode");
const interactionModeSelect = document.getElementById("interaction-mode");
const btnConfirmSettings = document.getElementById("btn-confirm-settings");
const nameInstruction = document.getElementById("name-instruction");
const nameLabel = document.getElementById("name-label");
const nameInput = document.getElementById("name-input");
const btnNextName = document.getElementById("btn-next-name");

const playerListDiv = document.getElementById("player-list");
const btnStartGame = document.getElementById("btn-start-game");

const turnStatus = document.getElementById("turn-status");
const diceFace = document.getElementById("dice-face");
const rollResult = document.getElementById("roll-result");
const turnProgress = document.getElementById("turn-progress");
const progressList = document.getElementById("progress-list");
const boardTrack = document.getElementById("board-track");
const commandBox = document.getElementById("command-box");
const commandMeta = document.getElementById("command-meta");
const commandKindBadge = document.getElementById("command-kind-badge");
const commandLevelBadge = document.getElementById("command-level-badge");
const commandTextDiv = document.getElementById("command-text");
const btnConfirmTask = document.getElementById("btn-confirm-task");
const btnReroll = document.getElementById("btn-reroll");
const rerollStatus = document.getElementById("reroll-status");
const btnDrink = document.getElementById("btn-drink");
const board = document.getElementById("board");
const legendDiv = document.getElementById("legend");

// 綁定指令按鈕事件
btnConfirmTask.addEventListener("click", () => {
  if (!waitingForChoice || gameOver) return;
  drinkCount = 0; // 完成指令 → 重置喝一杯次數
  waitingForChoice = false;
  if (pendingInteractionPair) {
    recordInteractionPair(pendingInteractionPair.fromId, pendingInteractionPair.toId);
    pendingInteractionPair = null;
  }
  btnConfirmTask.disabled = true;
  btnDrink.disabled = true;
  if (btnReroll) btnReroll.disabled = true;
  goToNextPlayer(true);
});

btnDrink.addEventListener("click", () => {
  if (!waitingForChoice || gameOver) return;
  drinkCount += 1;
  waitingForChoice = false;
  pendingInteractionPair = null;
  btnConfirmTask.disabled = true;
  btnDrink.disabled = true;
  if (btnReroll) btnReroll.disabled = true;
  goToNextPlayer(true);
});

if (btnReroll) {
  btnReroll.addEventListener("click", () => {
    if (!waitingForChoice || gameOver) return;
    const current = players[currentPlayerIndex];
    if (!current || rerollsUsedThisTurn >= runtimeRules.maxRerollsPerTurn) return;
    rerollsUsedThisTurn += 1;
    updateRerollStatus();
    handleLanding(current);
  });
}

// Step 1: 選擇對數
btnStartNames.addEventListener("click", () => {
  pairCount = parseInt(pairCountSelect.value, 10);
  const participants = pairCount * 2;
  currentBoardSize = PLAYER_COUNT_BOARD_SIZE[participants] ?? BASE_BOARD_SIZE;

  // 先進入指令強度設定畫面
  stepPairs.classList.add("hidden");
  stepSettings.classList.remove("hidden");
});

// 指令強度設定確認
btnConfirmSettings.addEventListener("click", () => {
  const mode = levelModeSelect.value;
  if (mode === "A") {
    enabledLevels = new Set(["A"]);
  } else if (mode === "AB") {
    enabledLevels = new Set(["A", "B"]);
  } else {
    // 親密玩樂：只用 B + C
    enabledLevels = new Set(["B", "C"]);
  }

  interactionMode = interactionModeSelect?.value === "cross" ? "cross" : "partner";
  currentLevelMode = mode;

  stepSettings.classList.add("hidden");
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
  if (players.some((player) => player.name.toLowerCase() === name.toLowerCase())) {
    alert("玩家名稱不可重複，請輸入不同名字。");
    nameInput.focus();
    return;
  }

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
  // 指令資料在載入 script 時就已經從 EMBEDDED_COMMAND_DB 初始化完成
  // 先在使用者直接點擊的事件中解鎖手機語音，再開始遊戲。
  if (speechEnabled) unlockSpeech();
  startGame();
});

// 遊戲開始
function startGame() {
  currentPlayerIndex = 0;
  gameOver = false;
  isRolling = false;
  drinkCount = 0;
  waitingForChoice = false;
  interactionStats.clear();
  commandDecks.clear();
  pendingInteractionPair = null;
  rerollsUsedThisTurn = 0;
  btnConfirmTask.disabled = true;
  btnDrink.disabled = true;
  if (btnReroll) btnReroll.disabled = true;

  PATH = buildPathForSize(currentBoardSize);

  // commandDB 已由 commands.js 的嵌入題庫完成初始化。
  players = players.map((p) => ({ ...p, positionIndex: 0 }));

  // 每局重新隨機特別格
  assignRandomSpecialTiles();

  stepConfirm.classList.add("hidden");
  stepGame.classList.remove("hidden");

  renderBoard();
  renderLegend();
  renderProgress();
  updateTurnStatus();
  commandTextDiv.textContent = "指令會出現在這裡";
  rollResult.textContent = "準備擲骰";
  rollResult.classList.remove("roll-result-strong");
  updateRerollStatus();
  renderDiceFace(0);
  diceFace.disabled = false;
}

// 直接點骰子圖示擲骰子
diceFace.addEventListener("click", () => {
  unlockAudio();
  if (gameOver || isRolling || waitingForChoice) return;

  isRolling = true;
  diceFace.disabled = true;
  board.classList.add("board-zoom");
  rollResult.textContent = "骰子轉動中…";
  rollResult.classList.remove("roll-result-strong");

  let ticks = 0;
  const totalDuration = runtimeRules.diceRollDurationMs;
  const intervalMs = Math.max(50, Math.min(150, Math.round(totalDuration / 20)));
  const maxTicks = Math.floor(totalDuration / intervalMs);

  const interval = setInterval(() => {
    ticks++;
    const tempRoll = Math.floor(Math.random() * 6) + 1;
    renderDiceFace(tempRoll, true);

    if (ticks >= maxTicks) {
      clearInterval(interval);
      const finalRoll = Math.floor(Math.random() * 6) + 1;
      renderDiceFace(finalRoll, false);
      rollResult.textContent = `擲出 ${finalRoll} 點`;
      rollResult.classList.add("roll-result-strong");
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
    renderProgress();
    updateTurnProgress();
    setTimeout(moveOne, runtimeRules.moveStepDelayMs);
  };

  moveOne();
}

function getDisplayLevelForIndex(index) {
  let level = getLevelForIndex(index);
  const maxIndex = PATH.length - 1;

  if (
    currentLevelMode === "AB" &&
    enabledLevels.has("A") &&
    enabledLevels.has("B") &&
    maxIndex > 0
  ) {
    const ratio = index / maxIndex;
    level = ratio < 0.5 ? "A" : "B";
  } else {
    // 根據 enabledLevels 調整顯示與抽指令用的等級：
    // - 只 A：所有格子都用 A
    // - A+B：C 區顯示為 B
    // - B+C：A 區顯示為 B
    if (!enabledLevels.has("B") && !enabledLevels.has("C")) {
      level = "A";
    } else if (!enabledLevels.has("C") && level === "C") {
      level = "B";
    } else if (!enabledLevels.has("A") && level === "A") {
      level = "B";
    }
  }

  return level;
}

function handleLanding(current) {
  renderBoard();
  const cell = PATH[current.positionIndex];
  if (!cell) return;

  const levelByPos = getDisplayLevelForIndex(current.positionIndex);

  // 每次落點先重置樣式 / 標籤
  commandBox.classList.remove(
    "command-box-interaction",
    "command-box-special",
    "command-box-level-C"
  );
  if (commandMeta) commandMeta.classList.add("hidden");
  if (commandKindBadge) commandKindBadge.classList.add("hidden");
  if (commandLevelBadge) commandLevelBadge.classList.add("hidden");

  let result = null;

  if (cell.type === "end") {
    handleWin(current);
    btnConfirmTask.disabled = true;
    btnDrink.disabled = true;
    if (btnReroll) btnReroll.disabled = true;
    waitingForChoice = false;
    return;
  } else if (cell.type === "special") {
    result = generateSpecialCommand(current, levelByPos);
  } else {
    result = generateNormalCommand(current, levelByPos);
  }

  const msg = result.text;
  const kind = result.kind;        // "self" | "interaction" | "special"
  const lv = result.level;         // "A" | "B" | "C"
  const isSpecial = !!result.isSpecial;

  if (kind === "interaction" && result.partnerId && result.partnerId !== current.id) {
    pendingInteractionPair = { fromId: current.id, toId: result.partnerId };
  } else {
    pendingInteractionPair = null;
  }

  // 顯示指令文字
  commandTextDiv.textContent = msg;

  // 決定樣式 / 標籤
  let showMeta = false;

  // 互動：藍綠底 + 「互動指令」
  if (kind === "interaction" && commandKindBadge) {
    showMeta = true;
    commandKindBadge.classList.remove("hidden");
    commandBox.classList.add("command-box-interaction");
  }

  // C 級：🔥 高強度 + 紅橙邊框
  if (lv === "C" && commandLevelBadge) {
    showMeta = true;
    commandLevelBadge.classList.remove("hidden");
    commandBox.classList.add("command-box-level-C");
  }

  // 特別格：紅底 + 提示音效
  if (isSpecial) {
    commandBox.classList.add("command-box-special");
    playSpecialChime();
  }

  if (commandMeta) {
    if (showMeta) {
      commandMeta.classList.remove("hidden");
    } else {
      commandMeta.classList.add("hidden");
    }
  }

  speakCommand(msg);

  waitingForChoice = true;
  btnConfirmTask.disabled = false;
  btnDrink.disabled = drinkCount >= runtimeRules.maxConsecutiveDrinks;
  if (btnReroll) btnReroll.disabled = rerollsUsedThisTurn >= runtimeRules.maxRerollsPerTurn;
  diceFace.disabled = true;
  updateRerollStatus();
}

function goToNextPlayer(updateBoard = true) {
  if (gameOver) return;
  currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
  rerollsUsedThisTurn = 0;
  updateTurnStatus();
  updateRerollStatus();
  rollResult.textContent = "準備擲骰";
  rollResult.classList.remove("roll-result-strong");
  diceFace.disabled = false;
  if (updateBoard) renderBoard();
  renderProgress();
}

function updateRerollStatus() {
  if (!rerollStatus) return;
  const remaining = Math.max(0, runtimeRules.maxRerollsPerTurn - rerollsUsedThisTurn);
  rerollStatus.textContent = remaining > 0
    ? `本回合還可重抽 ${remaining} 次`
    : "本回合已無重抽機會";
}

function updateTurnStatus() {
  const current = players[currentPlayerIndex];
  if (!current) {
    turnStatus.textContent = "";
    return;
  }
  turnStatus.innerHTML = `<span class="status-name">${escapeHtml(current.name)}</span>`;
  updateTurnProgress();
}

function updateTurnProgress() {
  if (!turnProgress) return;
  const current = players[currentPlayerIndex];
  if (!current || PATH.length === 0) {
    turnProgress.textContent = "";
    return;
  }
  const endIndex = PATH.length - 1;
  const remaining = Math.max(0, endIndex - current.positionIndex);
  const percent = endIndex > 0
    ? Math.round((current.positionIndex / endIndex) * 100)
    : 100;
  turnProgress.textContent = `進度 ${percent}% · 距離終點 ${remaining} 格`;
}

function renderProgress() {
  if (!progressList || PATH.length === 0) return;
  progressList.innerHTML = "";
  const endIndex = PATH.length - 1;

  players.forEach((player, index) => {
    const percent = endIndex > 0
      ? Math.min(100, Math.round((player.positionIndex / endIndex) * 100))
      : 100;
    const item = document.createElement("div");
    item.className = "progress-item";
    if (index === currentPlayerIndex) item.classList.add("progress-item-current");

    const name = document.createElement("div");
    name.className = "progress-name";
    name.textContent = player.name;

    const track = document.createElement("div");
    track.className = "progress-track";
    const fill = document.createElement("div");
    fill.className = "progress-fill";
    fill.style.width = `${percent}%`;
    fill.style.backgroundColor = player.color;
    track.appendChild(fill);

    const value = document.createElement("div");
    value.className = "progress-value";
    value.textContent = `${percent}%`;

    item.appendChild(name);
    item.appendChild(track);
    item.appendChild(value);
    progressList.appendChild(item);
  });
}

function renderBoard() {
  boardTrack.innerHTML = "";

  const currentPosIndex = players[currentPlayerIndex]?.positionIndex ?? -1;

  const size = currentBoardSize;
  boardTrack.style.gridTemplateColumns = `repeat(${size}, minmax(0, 1fr))`;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cellDiv = document.createElement("div");
      cellDiv.className = "cell";

      const pathIndex = PATH.findIndex((p) => p.r === r && p.c === c);
      if (pathIndex !== -1) {
        const info = PATH[pathIndex];
        const level = getDisplayLevelForIndex(pathIndex);

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
  diceFace.classList.remove("dice-ready");
  if (rolling) {
    diceFace.classList.add("dice-rolling");
  } else {
    diceFace.classList.remove("dice-rolling");
  }

  if (value <= 0) {
    diceFace.classList.add("dice-ready");
    diceFace.textContent = "擲";
    return;
  }

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

function shuffleCopy(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 每個「一般／特別＋等級」各是一副獨立牌組。
// 抽過的題目會從牌組移除，整副用完後才重新洗牌。
function drawCommandFromDeck(items, deckType, level) {
  const matching = items.filter((item) => (item.level || "A") === level);
  const source = matching.length > 0 ? matching : items;
  const deckKey = deckType + ":" + level;

  let deck = commandDecks.get(deckKey);
  if (!deck || deck.length === 0) {
    deck = shuffleCopy(source);
    commandDecks.set(deckKey, deck);
  }

  return deck.pop() || null;
}

function applyInteractionScope(text) {
  if (interactionMode !== "partner") return text;

  return text
    .replace(/所有人找離你最近的異性/g, "你跟自己的伴侶")
    .replace(/找離你最近的異性/g, "找你的伴侶")
    .replace(/跟全場異性/g, "跟你的伴侶")
    .replace(/摸全場異性/g, "摸你的伴侶")
    .replace(/全場異性/g, "你的伴侶")
    .replace(/所有異性/g, "你的伴侶")
    .replace(/其它異性/g, "你的伴侶")
    .replace(/指定任何一位異性跟你/g, "跟你的伴侶")
    .replace(/指定一位異性脫一件/g, "請你的伴侶脫一件")
    .replace(/指定某人脫一件/g, "請你的伴侶脫一件")
    .replace(/指定一個人跟你/g, "請你的伴侶跟你")
    .replace(/指定一個人用手/g, "請你的伴侶用手")
    .replace(/你之外所有人脫一件/g, "你的伴侶脫一件")
    .replace(/跟\[B\]旁邊的異性換位置/g, "跟[B]換位置");
}

function selectInteractionPartner(currentPlayer) {
  const ownPartner = players.find(
    (player) => player.id !== currentPlayer.id && player.pair === currentPlayer.pair
  );

  if (interactionMode === "partner") {
    return ownPartner || players.find((player) => player.id !== currentPlayer.id) || currentPlayer;
  }

  const crossGroupOppositeGender = players.filter(
    (player) =>
      player.id !== currentPlayer.id &&
      player.pair !== currentPlayer.pair &&
      player.gender !== currentPlayer.gender
  );
  const crossGroupAny = players.filter(
    (player) => player.id !== currentPlayer.id && player.pair !== currentPlayer.pair
  );

  return (
    pickCrossGroupPartner(crossGroupOppositeGender, currentPlayer) ||
    pickCrossGroupPartner(crossGroupAny, currentPlayer) ||
    ownPartner ||
    players.find((player) => player.id !== currentPlayer.id) ||
    currentPlayer
  );
}

// 跨組互動時，精確調整第一組玩家「被選中」的機率：
// - 其他組男生選女生：第一組女生機率為平均值的 60%（下降 40%）
// - 其他組女生選男生：第一組男生機率為平均值的 130%（上升 30%）
// 第一組玩家自己選人時，因同組伴侶已被排除，不套用此調整。
function pickCrossGroupPartner(candidates, currentPlayer) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  let firstPairTargetGender = null;
  let probabilityMultiplier = 1;

  if (currentPlayer.gender === "M") {
    firstPairTargetGender = "F";
    probabilityMultiplier = runtimeRules.firstPairFemaleMultiplier;
  } else if (currentPlayer.gender === "F") {
    firstPairTargetGender = "M";
    probabilityMultiplier = runtimeRules.firstPairMaleMultiplier;
  }

  const adjustedTarget = candidates.find(
    (player) => player.pair === 1 && player.gender === firstPairTargetGender
  );

  if (!adjustedTarget) return randomPick(candidates);

  const normalProbability = 1 / candidates.length;
  const adjustedProbability = Math.min(1, normalProbability * probabilityMultiplier);

  if (Math.random() < adjustedProbability) return adjustedTarget;

  const otherCandidates = candidates.filter((player) => player.id !== adjustedTarget.id);
  return randomPick(otherCandidates) || adjustedTarget;
}

function generateSpecialCommand(currentPlayer, level) {
  const db = commandDB;
  const rawList =
    db && Array.isArray(db.special) && db.special.length > 0
      ? db.special
      : defaultSpecialCommands;

  const item = drawCommandFromDeck(rawList, "special", level) || {
    text: "抽一張特別卡，照卡片上的指示做",
    level
  };
  const base = applyInteractionScope(
    item.text || "抽一張特別卡，照卡片上的指示做"
  );

  return {
    text: currentPlayer.name + " 抽到特別格：" + base,
    kind: "special",
    level: item.level || level || "A",
    isSpecial: true
  };
}

function generateNormalCommand(currentPlayer, level) {
  const db = commandDB;
  const rawList =
    db && Array.isArray(db.normal) && db.normal.length > 0
      ? db.normal
      : defaultNormalCommands;

  let allowedList = rawList.filter((item) => enabledLevels.has(item.level || "A"));
  if (allowedList.length === 0) allowedList = rawList;

  const item = drawCommandFromDeck(allowedList, "normal", level) || {
    text: "[A] 說一句祝福的話給在場所有人",
    kind: "self",
    level
  };

  const text = applyInteractionScope(item.text || "");
  const kind = item.kind === "interaction" ? "interaction" : "self";
  const commandLevel = item.level || level || "A";
  let finalText = "";
  let partnerId = null;

  if (kind === "interaction") {
    const other = selectInteractionPartner(currentPlayer);
    partnerId = other?.id || null;

    if (text.includes("[A]") || text.includes("[B]")) {
      finalText = text
        .replace(/\[A\]/g, currentPlayer.name)
        .replace(/\[B\]/g, other.name);
    } else {
      finalText = currentPlayer.name + " 跟 " + other.name + "：" + text;
    }
  } else if (text.includes("[A]")) {
    finalText = text.replace(/\[A\]/g, currentPlayer.name);
  } else {
    finalText = currentPlayer.name + "：" + text;
  }

  return {
    text: finalText,
    kind,
    level: commandLevel,
    isSpecial: false,
    partnerId
  };
}


function handleWin(player) {
  gameOver = true;
  pendingInteractionPair = null;
  waitingForChoice = false;
  if (btnReroll) btnReroll.disabled = true;
  updateRerollStatus();

  const cards =
    Array.isArray(window.ULTIMATE_PRIVILEGE_CARDS) &&
    window.ULTIMATE_PRIVILEGE_CARDS.length > 0
      ? window.ULTIMATE_PRIVILEGE_CARDS
      : [{ title: "終極特權卡", text: "冠軍可指定下一輪的遊戲規則。" }];
  const card = randomPick(cards);
  const msg =
    "🎉 " + player.name + " 抵達終點，抽到「" + card.title + "」：" + card.text;

  turnStatus.textContent = "🎉 冠軍：" + player.name;
  const summaryHtml = buildInteractionSummaryHtml();
  commandTextDiv.innerHTML = "<p>" + escapeHtml(msg) + "</p>" + (summaryHtml || "");
  speakCommand(msg);
  return msg;
}

function recordInteractionPair(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return;
  const key = createInteractionKey(fromId, toId);
  const base = interactionStats.get(key) || {
    aId: Math.min(fromId, toId),
    bId: Math.max(fromId, toId),
    count: 0
  };
  base.count += 1;
  interactionStats.set(key, base);
}

function createInteractionKey(aId, bId) {
  return [aId, bId].sort((a, b) => a - b).join("-");
}

function getPlayerNameById(id) {
  const player = players.find((p) => p.id === id);
  return player ? player.name : `玩家${id}`;
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildInteractionSummaryHtml() {
  if (interactionStats.size === 0) return "";
  const entries = Array.from(interactionStats.values())
    .map((entry) => ({
      count: entry.count,
      aName: getPlayerNameById(entry.aId),
      bName: getPlayerNameById(entry.bId)
    }))
    .sort((a, b) => b.count - a.count);
  const items = entries
    .map(({ aName, bName, count }) =>
      `<li><span>${escapeHtml(aName)} ＆ ${escapeHtml(bName)}</span><span>${count} 次</span></li>`
    )
    .join("");
  return `<div class="interaction-summary"><h4>玩家互動紀錄</h4><ul>${items}</ul></div>`;
}

function randomPick(arr) {
  if (!arr || arr.length === 0) return null;
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

function boundedNumber(value, fallback, min, max, integer = false) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const bounded = Math.min(max, Math.max(min, parsed));
  return integer ? Math.round(bounded) : bounded;
}

function applyRemoteGameConfig(payload) {
  const config = payload?.config;
  const version = Number(payload?.version || 0);
  if (!config || !config.rules || version <= remoteConfigVersion) return;

  const rules = config.rules;
  let specialLayoutChanged = false;
  runtimeRules.firstPairFemaleMultiplier = boundedNumber(
    rules.firstPairFemaleMultiplier,
    runtimeRules.firstPairFemaleMultiplier,
    0,
    3
  );
  runtimeRules.firstPairMaleMultiplier = boundedNumber(
    rules.firstPairMaleMultiplier,
    runtimeRules.firstPairMaleMultiplier,
    0,
    3
  );
  runtimeRules.maxRerollsPerTurn = boundedNumber(
    rules.maxRerollsPerTurn,
    runtimeRules.maxRerollsPerTurn,
    0,
    10,
    true
  );
  runtimeRules.maxConsecutiveDrinks = boundedNumber(
    rules.maxConsecutiveDrinks,
    runtimeRules.maxConsecutiveDrinks,
    0,
    10,
    true
  );
  runtimeRules.diceRollDurationMs = boundedNumber(
    rules.diceRollDurationMs,
    runtimeRules.diceRollDurationMs,
    200,
    10000,
    true
  );
  runtimeRules.moveStepDelayMs = boundedNumber(
    rules.moveStepDelayMs,
    runtimeRules.moveStepDelayMs,
    50,
    3000,
    true
  );
  runtimeRules.pollIntervalSeconds = boundedNumber(
    rules.pollIntervalSeconds,
    runtimeRules.pollIntervalSeconds,
    1,
    60,
    true
  );

  for (const level of ["A", "B", "C"]) {
    const nextCount = boundedNumber(
      rules.specialTileCounts?.[level],
      runtimeRules.specialTileCounts[level],
      0,
      20,
      true
    );
    if (nextCount !== runtimeRules.specialTileCounts[level]) specialLayoutChanged = true;
    runtimeRules.specialTileCounts[level] = nextCount;
  }

  for (const participantCount of [2, 4, 6, 8]) {
    PLAYER_COUNT_BOARD_SIZE[participantCount] = boundedNumber(
      rules.boardSizes?.[participantCount],
      PLAYER_COUNT_BOARD_SIZE[participantCount],
      3,
      15,
      true
    );
  }

  if (Array.isArray(config.normalCommands) && config.normalCommands.length > 0) {
    const normal = config.normalCommands.map(normalizeNormalItem);
    const special = Array.isArray(config.specialCommands)
      ? config.specialCommands.map(normalizeSpecialItem)
      : commandDB?.special || [];
    commandDB = { normal, special };
    commandDecks.clear();
  }

  if (Array.isArray(config.ultimateCards) && config.ultimateCards.length > 0) {
    window.ULTIMATE_PRIVILEGE_CARDS = config.ultimateCards.map((card) => ({
      title: String(card.title || "終極特權卡"),
      text: String(card.text || "")
    }));
  }

  if (typeof window.applyRemoteVoiceDefault === "function") {
    window.applyRemoteVoiceDefault(Boolean(rules.voiceDefaultEnabled));
  }

  // 遊戲進行中也立即套用棋盤尺寸與特別格數量。
  if (players.length > 0 && !gameOver) {
    const nextSize = PLAYER_COUNT_BOARD_SIZE[players.length] ?? currentBoardSize;
    let boardLayoutChanged = false;
    if (nextSize !== currentBoardSize) {
      const oldEnd = Math.max(1, PATH.length - 1);
      const ratios = players.map((player) => player.positionIndex / oldEnd);
      currentBoardSize = nextSize;
      PATH = buildPathForSize(currentBoardSize);
      const newEnd = Math.max(0, PATH.length - 1);
      players.forEach((player, index) => {
        player.positionIndex = Math.min(newEnd, Math.round(ratios[index] * newEnd));
      });
      boardLayoutChanged = true;
    }
    if (specialLayoutChanged || boardLayoutChanged) {
      assignRandomSpecialTiles();
      renderBoard();
      renderProgress();
      updateTurnProgress();
    }
  }

  if (waitingForChoice) {
    btnDrink.disabled = drinkCount >= runtimeRules.maxConsecutiveDrinks;
    if (btnReroll) {
      btnReroll.disabled = rerollsUsedThisTurn >= runtimeRules.maxRerollsPerTurn;
    }
  }
  updateRerollStatus();
  remoteConfigVersion = version;
  console.log(`Remote game config applied: version ${version}`);
}

async function syncRemoteGameConfig() {
  const url = window.PARTY_GAME_CONFIG_URL;
  if (!url) return;

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    applyRemoteGameConfig(await response.json());
  } catch (error) {
    console.warn("後台設定暫時無法同步，繼續使用目前設定", error);
  } finally {
    clearTimeout(remoteConfigTimer);
    remoteConfigTimer = setTimeout(
      syncRemoteGameConfig,
      runtimeRules.pollIntervalSeconds * 1000
    );
  }
}

window.addEventListener("pagehide", () => clearTimeout(remoteConfigTimer));
void syncRemoteGameConfig();
