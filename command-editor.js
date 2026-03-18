const STORAGE_KEY = "partyGameCommandDB";

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

function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { normal: [], special: [] };
    const data = JSON.parse(raw);

    const normalRaw = Array.isArray(data.normal) ? data.normal : [];
    const normal = normalRaw.map(normalizeNormalItem);

    const specialRaw = Array.isArray(data.special) ? data.special : [];
    const special = specialRaw.map(normalizeSpecialItem);

    return { normal, special };
  } catch (e) {
    console.error("loadDB error", e);
    return { normal: [], special: [] };
  }
}

function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

const normalInput = document.getElementById("normal-input");
const normalTypeSelect = document.getElementById("normal-type");
const normalLevelSelect = document.getElementById("normal-level");
const specialInput = document.getElementById("special-input");
const specialLevelSelect = document.getElementById("special-level");
const normalList = document.getElementById("normal-list");
const specialList = document.getElementById("special-list");
const jsonArea = document.getElementById("json-area");

const btnAddNormal = document.getElementById("btn-add-normal");
const btnAddSpecial = document.getElementById("btn-add-special");
const btnExport = document.getElementById("btn-export");
const btnImport = document.getElementById("btn-import");
const btnClear = document.getElementById("btn-clear");

let db = loadDB();

const levelOrder = { A: 0, B: 1, C: 2 };

function renderList() {
  normalList.innerHTML = "";
  // 依照 level A/B/C 排序，一樣的 level 保持原本順序
  const sortedNormal = [...db.normal].sort((a, b) => {
    const la = levelOrder[a.level] ?? 0;
    const lb = levelOrder[b.level] ?? 0;
    if (la !== lb) return la - lb;
    return 0;
  });

  sortedNormal.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "item";

    const main = document.createElement("div");
    main.className = "item-main";

    const badgeRow = document.createElement("div");
    badgeRow.className = "badge-row";

    const badgeKind = document.createElement("span");
    badgeKind.className = "badge";
    if (item.kind === "interaction") {
      badgeKind.classList.add("badge-interact");
      badgeKind.textContent = "互動";
    } else {
      badgeKind.classList.add("badge-self");
      badgeKind.textContent = "自行";
    }

    const badgeLevel = document.createElement("span");
    badgeLevel.className = "badge";
    const level = item.level || "A";
    if (level === "C") {
      badgeLevel.classList.add("badge-level-C");
    } else if (level === "B") {
      badgeLevel.classList.add("badge-level-B");
    } else {
      badgeLevel.classList.add("badge-level-A");
    }
    badgeLevel.textContent = `等級 ${level}`;

    badgeRow.appendChild(badgeKind);
    badgeRow.appendChild(badgeLevel);

    const textSpan = document.createElement("div");
    textSpan.className = "item-text";
    textSpan.textContent = item.text;

    main.appendChild(badgeRow);
    main.appendChild(textSpan);

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn-small btn-secondary";
    editBtn.textContent = "修改";
    editBtn.addEventListener("click", () => {
      // 在原始陣列中的 index
      const realIndex = db.normal.indexOf(item);
      openNormalEdit(row, realIndex === -1 ? idx : realIndex);
    });

    const delBtn = document.createElement("button");
    delBtn.className = "btn-small btn-danger";
    delBtn.textContent = "刪除";
    delBtn.addEventListener("click", () => {
      const realIndex = db.normal.indexOf(item);
      const indexToUse = realIndex === -1 ? idx : realIndex;
      db.normal.splice(indexToUse, 1);
      saveDB(db);
      renderList();
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    row.appendChild(main);
    row.appendChild(actions);
    normalList.appendChild(row);
  });

  specialList.innerHTML = "";
  const sortedSpecial = [...db.special].sort((a, b) => {
    const la = levelOrder[a.level] ?? 0;
    const lb = levelOrder[b.level] ?? 0;
    if (la !== lb) return la - lb;
    return 0;
  });

  sortedSpecial.forEach((item, idx) => {
    const row = document.createElement("div");
    row.className = "item";

    const main = document.createElement("div");
    main.className = "item-main";

    const badgeRow = document.createElement("div");
    badgeRow.className = "badge-row";

    const badgeLevel = document.createElement("span");
    badgeLevel.className = "badge";
    const level = item.level || "A";
    if (level === "C") {
      badgeLevel.classList.add("badge-level-C");
    } else if (level === "B") {
      badgeLevel.classList.add("badge-level-B");
    } else {
      badgeLevel.classList.add("badge-level-A");
    }
    badgeLevel.textContent = `等級 ${level}`;

    badgeRow.appendChild(badgeLevel);

    const textSpan = document.createElement("div");
    textSpan.className = "item-text";
    textSpan.textContent = item.text;

    main.appendChild(badgeRow);
    main.appendChild(textSpan);

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn-small btn-secondary";
    editBtn.textContent = "修改";
    editBtn.addEventListener("click", () => {
      const realIndex = db.special.indexOf(item);
      openSpecialEdit(row, realIndex === -1 ? idx : realIndex);
    });

    const delBtn = document.createElement("button");
    delBtn.className = "btn-small btn-danger";
    delBtn.textContent = "刪除";
    delBtn.addEventListener("click", () => {
      const realIndex = db.special.indexOf(item);
      const indexToUse = realIndex === -1 ? idx : realIndex;
      db.special.splice(indexToUse, 1);
      saveDB(db);
      renderList();
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    row.appendChild(main);
    row.appendChild(actions);
    specialList.appendChild(row);
  });
}

function openNormalEdit(row, index) {
  const item = db.normal[index];
  if (!item) return;

  row.innerHTML = "";

  const main = document.createElement("div");
  main.className = "item-main";

  const input = document.createElement("textarea");
  input.className = "edit-input";
  input.rows = 2;
  input.value = item.text;

  const editRow = document.createElement("div");
  editRow.className = "edit-row";

  const kindLabel = document.createElement("span");
  kindLabel.className = "edit-label";
  kindLabel.textContent = "類型:";

  const kindSelect = document.createElement("select");
  kindSelect.innerHTML = `
    <option value="self">自行</option>
    <option value="interaction">互動</option>
  `;
  kindSelect.value = item.kind === "interaction" ? "interaction" : "self";

  const levelLabel = document.createElement("span");
  levelLabel.className = "edit-label";
  levelLabel.textContent = "等級:";

  const levelSelect = document.createElement("select");
  levelSelect.innerHTML = `
    <option value="A">A</option>
    <option value="B">B</option>
    <option value="C">C</option>
  `;
  levelSelect.value = ["A", "B", "C"].includes(item.level) ? item.level : "A";

  editRow.appendChild(kindLabel);
  editRow.appendChild(kindSelect);
  editRow.appendChild(levelLabel);
  editRow.appendChild(levelSelect);

  main.appendChild(input);
  main.appendChild(editRow);

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn-small";
  saveBtn.textContent = "儲存";
  saveBtn.addEventListener("click", () => {
    db.normal[index] = {
      text: input.value.trim(),
      kind: kindSelect.value === "interaction" ? "interaction" : "self",
      level: ["A", "B", "C"].includes(levelSelect.value) ? levelSelect.value : "A",
    };
    saveDB(db);
    renderList();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn-small btn-secondary";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", () => {
    renderList();
  });

  const delBtn = document.createElement("button");
  delBtn.className = "btn-small btn-danger";
  delBtn.textContent = "刪除";
  delBtn.addEventListener("click", () => {
    db.normal.splice(index, 1);
    saveDB(db);
    renderList();
  });

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  actions.appendChild(delBtn);

  row.appendChild(main);
  row.appendChild(actions);
}

function openSpecialEdit(row, index) {
  const item = db.special[index];
  if (!item) return;

  row.innerHTML = "";

  const main = document.createElement("div");
  main.className = "item-main";

  const input = document.createElement("textarea");
  input.className = "edit-input";
  input.rows = 2;
  input.value = item.text;

  const editRow = document.createElement("div");
  editRow.className = "edit-row";

  const levelLabel = document.createElement("span");
  levelLabel.className = "edit-label";
  levelLabel.textContent = "等級:";

  const levelSelect = document.createElement("select");
  levelSelect.innerHTML = `
    <option value="A">A</option>
    <option value="B">B</option>
    <option value="C">C</option>
  `;
  levelSelect.value = ["A", "B", "C"].includes(item.level) ? item.level : "A";

  editRow.appendChild(levelLabel);
  editRow.appendChild(levelSelect);

  main.appendChild(input);
  main.appendChild(editRow);

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn-small";
  saveBtn.textContent = "儲存";
  saveBtn.addEventListener("click", () => {
    db.special[index] = {
      text: input.value.trim(),
      level: ["A", "B", "C"].includes(levelSelect.value) ? levelSelect.value : "A",
    };
    saveDB(db);
    renderList();
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn-small btn-secondary";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", () => {
    renderList();
  });

  const delBtn = document.createElement("button");
  delBtn.className = "btn-small btn-danger";
  delBtn.textContent = "刪除";
  delBtn.addEventListener("click", () => {
    db.special.splice(index, 1);
    saveDB(db);
    renderList();
  });

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  actions.appendChild(delBtn);

  row.appendChild(main);
  row.appendChild(actions);
}

btnAddNormal.addEventListener("click", () => {
  const text = normalInput.value.trim();
  if (!text) return;
  const kind = normalTypeSelect.value === "interaction" ? "interaction" : "self";
  const level = ["A", "B", "C"].includes(normalLevelSelect.value)
    ? normalLevelSelect.value
    : "A";
  db.normal.push({ text, kind, level });
  saveDB(db);
  normalInput.value = "";
  renderList();
});

btnAddSpecial.addEventListener("click", () => {
  const text = specialInput.value.trim();
  if (!text) return;
  const level = ["A", "B", "C"].includes(specialLevelSelect.value)
    ? specialLevelSelect.value
    : "A";
  db.special.push({ text, level });
  saveDB(db);
  specialInput.value = "";
  renderList();
});

btnExport.addEventListener("click", () => {
  jsonArea.value = JSON.stringify(db, null, 2);
});

btnImport.addEventListener("click", () => {
  try {
    const parsed = JSON.parse(jsonArea.value);
    const normalRaw = Array.isArray(parsed.normal) ? parsed.normal : [];
    const normal = normalRaw.map(normalizeNormalItem);

    const specialRaw = Array.isArray(parsed.special) ? parsed.special : [];
    const special = specialRaw.map(normalizeSpecialItem);

    db = { normal, special };
    saveDB(db);
    renderList();
    alert("匯入成功，已更新資料庫");
  } catch (e) {
    alert("JSON 格式錯誤，請確認後再試");
  }
});

btnClear.addEventListener("click", () => {
  if (!confirm("確定要清空全部指令嗎？")) return;
  db = { normal: [], special: [] };
  saveDB(db);
  renderList();
});

renderList();
