let appData = null;
let isDayLoaded = false;
let month = new Date().toLocaleString("default", { month: "short" });
let today = new Date().toISOString().split("T")[0];
let dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));

document.getElementById("daily-stats-limits").textContent = `📵 ${Math.floor((new Date() - new Date(2026, 2, 22)) / (1000 * 60 * 60 * 24))}`;
// document.getElementById("daily-stats-perfect").textContent = `✨ ${appData.perfectDays || 0}`;

/* =========================
   DROPBOX
========================= */

// const REDIRECT_URI = `${window.location.origin}/Tracker/`; //"http://localhost:8000/";
const REDIRECT_URI = "http://localhost:8000/"; //"http://localhost:8000/";
const CLIENT_ID = "7ctgzhwolmiq6kc"; // <-- your client id
let dbxAuth = new Dropbox.DropboxAuth({ clientId: CLIENT_ID });
dbx = new Dropbox.Dropbox({ auth: dbxAuth });

function getCodeFromUrl() {
  return new URLSearchParams(window.location.search).get("code");
}

function hasRedirectedFromAuth() {
  return !!getCodeFromUrl();
}

function doAuth() {
  dbxAuth = new Dropbox.DropboxAuth({ clientId: CLIENT_ID });

  dbxAuth
    .getAuthenticationUrl(REDIRECT_URI, undefined, "code", "offline", undefined, undefined, true)
    .then((authUrl) => {
      window.sessionStorage.clear();
      window.sessionStorage.setItem("codeVerifier", dbxAuth.codeVerifier);
      window.location.href = authUrl;
    })
    .catch(console.error);
}

const fileCache = {};

async function fetchFile(file) {
  const pathToFetch = `/${file}`; // All files are at app folder root
  console.log("Fetching file:", file, "-> path:", pathToFetch);

  try {
    // List all files in the app folder for debugging
    const filesList = await dbx.filesListFolder({ path: "" });
    console.log(
      "Files in app folder:",
      filesList.result.entries.map((f) => f.name),
    );

    const response = await dbx.filesGetTemporaryLink({ path: pathToFetch });
    console.log("Temporary link response:", response);

    const text = await (await fetch(response.result.link)).text();
    console.log(`Loaded ${file}, length:`, text.length);
    console.log("Content preview:", text.substring(0, 100));

    return text;
  } catch (err) {
    console.error("Error fetching file:", file, err);
    return "";
  }
}

async function saveFileToDropbox(filePath, content) {
  try {
    const uploadPath = filePath.startsWith("/") ? filePath : "/" + filePath;

    await dbx.filesUpload({
      path: uploadPath,
      mode: "overwrite",
      contents: content,
    });
    console.log("✅ Saved " + uploadPath + " to Dropbox!");
  } catch (err) {
    console.error("❌ Dropbox save failed for " + filePath, err);
  }
}

/* =========================
  UTILS
========================= */

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
/* =========================
   INIT APP
========================= */

window.onload = async function () {
  dbxAuth = new Dropbox.DropboxAuth({ clientId: CLIENT_ID });

  if (!hasRedirectedFromAuth()) {
    doAuth();
    return;
  }

  try {
    dbxAuth.setCodeVerifier(window.sessionStorage.getItem("codeVerifier"));

    const tokenResponse = await dbxAuth.getAccessTokenFromCode(REDIRECT_URI, getCodeFromUrl());

    dbxAuth.setAccessToken(tokenResponse.result.access_token);

    dbx = new Dropbox.Dropbox({ auth: dbxAuth });

    await loadApp();
    await loadPlan();
    document.getElementById("save-plan").addEventListener("click", savePlan);

    // document.getElementById("load-save-day").click();
  } catch (error) {
    console.error("Auth error:", error);
  }
};

async function loadApp() {
  if (!isDayLoaded) {
    /* =========================
         1. TRY LOCAL STORAGE FIRST
      ========================= */

    const cached = localStorage.getItem("tracker_today");

    if (cached) {
      const parsed = JSON.parse(cached);
      appData = parsed;
      prepareTodayDefaults();

      if (parsed.lastUpdated === today) {
        console.log("⚡ Using local cache ONLY (no Dropbox)");

        renderQuest("morning", "comic");
        renderQuest("main", "citation");
        renderQuest("evening", "citation");

        loadCleanUpTasks();
        loadMoodCheckIn();
        loadCheckIn("foodPlan", "comic");
        loadCheckIn("water", "citation");
        loadCheckIn("limits", "citation");
        initActivityPicker();
        renderDailyStats();

        isDayLoaded = true;
        document.getElementById("save-day").textContent = "Save the Day";

        updateAllRingsFromData();

        return; // 🚨 STOP HERE → no Dropbox
      }
    }

    /* =========================
         2. FALLBACK TO DROPBOX
      ========================= */

    console.log("☁️ Fetching from Dropbox...");
    appData = JSON.parse(await fetchFile("data.json"));
    prepareTodayDefaults();

    if (appData.lastUpdated === today && appData.today.morningQ) {
      console.log("♻️ Reusing Dropbox day");

      renderQuest("morning", "comic");
      renderQuest("main", "citation");
      renderQuest("evening", "citation");

      loadCleanUpTasks();
      loadMoodCheckIn();
      loadCheckIn("foodPlan", "comic");
      loadCheckIn("water", "citation");
      loadCheckIn("limits", "citation");
      initActivityPicker();
      renderDailyStats();
    } else {
      console.log("🎲 Generating new day");

      appData.today = {
        morningQ: "",
        morningQReward: "",
        ifMorningQ: false,

        mainQuest: "",
        mainQReward: "",
        ifMainQ: false,

        eveningQ: "",
        eveningQReward: "",
        ifEveningQ: false,

        cleanUpReward: "",
        ifCleanUp: false,

        checkInReward: "",
        ifCheckIn: false,
        moodScore: 0,
        moodNote: "",

        foodPlanReward: "",
        ifFoodPlan: false,
        waterReward: "",
        ifWater: false,
        limitsReward: "",
        ifLimits: false,

        activityMinutes: 15,
        ifActivityMinutes: false,
      };

      await loadQuest("morning", "MorningTasks.md", "comic");
      await loadQuest("main", "MonthlyTasks.md", "citation");
      await loadQuest("evening", "EveningTasks.md", "citation");

      loadCleanUpTasks();
      loadMoodCheckIn();
      loadCheckIn("foodPlan", "comic");
      loadCheckIn("water", "citation");
      loadCheckIn("limits", "citation");
      initActivityPicker();

      appData.lastUpdated = today;

      await saveFileToDropbox("data.json", JSON.stringify(appData, null, 2));
    }

    /* =========================
         3. CACHE RESULT
      ========================= */

    localStorage.setItem("tracker_today", JSON.stringify(appData));

    isDayLoaded = true;
    document.getElementById("save-day").textContent = "Save the Day";

    updateAllRingsFromData();
  }
}

document.getElementById("save-day").onclick = async () => {
  const t = appData.today;
  const m = appData.monthly[month];

  if (t.ifMorningQ) m.morningQ++;
  if (t.ifMainQ) m.mainQ++;
  if (t.ifEveningQ) m.eveningQ++;
  if (t.ifCleanUp) m.cleanUp++;
  if (t.ifCheckIn) m.checkIn++;

  console.log("📊 Saved stats");

  await saveFileToDropbox("data.json", JSON.stringify(appData, null, 2));

  localStorage.setItem("tracker_today", JSON.stringify(appData));

  isDayLoaded = false;
  document.getElementById("save-day").textContent = "Load the Day";
};

function prepareTodayDefaults() {
  const t = appData.today || {};

  if (t.morningQ === undefined) t.morningQ = "";
  if (t.morningQReward === undefined) t.morningQReward = "";
  if (t.ifMorningQ === undefined) t.ifMorningQ = false;
  if (t.mainQ === undefined) t.mainQ = "";
  if (t.mainQReward === undefined) t.mainQReward = "";
  if (t.ifMainQ === undefined) t.ifMainQ = false;
  if (t.eveningQ === undefined) t.eveningQ = "";
  if (t.eveningQReward === undefined) t.eveningQReward = "";
  if (t.ifEveningQ === undefined) t.ifEveningQ = false;
  if (t.cleanUpReward === undefined) t.cleanUpReward = "";
  if (t.ifCleanUp === undefined) t.ifCleanUp = false;
  if (t.checkInReward === undefined) t.checkInReward = "";
  if (t.ifCheckIn === undefined) t.ifCheckIn = false;
  if (t.moodScore === undefined) t.moodScore = 0;
  if (t.moodNote === undefined) t.moodNote = "";
  if (t.foodPlanReward === undefined) t.foodPlanReward = "";
  if (t.ifFoodPlan === undefined) t.ifFoodPlan = false;
  if (t.waterReward === undefined) t.waterReward = "";
  if (t.ifWater === undefined) t.ifWater = false;
  if (t.limitsReward === undefined) t.limitsReward = "";
  if (t.ifLimits === undefined) t.ifLimits = false;
  if (t.activityMinutes === undefined) t.activityMinutes = 15;
  if (t.ifActivityMinutes === undefined) t.ifActivityMinutes = false;

  appData.today = t;
}

function renderDailyStats() {
  const t = appData.today;

  // if (t.ifMorningQ) document.getElementById("daily-stats-morning").classList.add("complete");
  // if (t.ifMainQ) document.getElementById("daily-stats-main").classList.add("complete");
  // if (t.ifEveningQ) document.getElementById("daily-stats-evening").classList.add("complete");
  // if (t.ifCleanUp) document.getElementById("daily-stats-cleanUp").classList.add("complete");
  if (t.ifCheckIn) document.getElementById("daily-stats-checkIn").classList.add("complete");
  if (t.ifFoodPlan) document.getElementById("daily-stats-food").classList.add("complete");
  if (t.ifWater) document.getElementById("daily-stats-water").classList.add("complete");
  if (t.ifLimits) document.getElementById("daily-stats-limits").classList.add("complete");
}

// /* =========================
//    QUESTS
// ========================= */

// async function loadQuest(type, file) {
//   const text = await fetchFile(file);
//   const tasks = text.split("\n").filter((line) => line.trim());
//   const task = getRandomItem(tasks);
//   appData.today[`${type}Q`] = task;
// }

async function loadQuest(questType, fileName, rewardType) {
  appData.today[`if${capitalize(questType)}Q`] = false;
  const text = await fetchFile(fileName);

  let task = "";

  if (questType === "morning") {
    const tasks = text.split("\n").filter((line) => line.trim());
    task = getRandomItem(tasks);
  } else if (questType === "main") {
    const lines = text.split("\n");
    const currentMonth = new Date().toLocaleString("default", {
      month: "long",
    });

    let inSection = false;
    for (const line of lines) {
      if (line.startsWith("## " + currentMonth)) {
        inSection = true;
      } else if (line.startsWith("## ") && inSection) {
        break;
      } else if (inSection && line.trim()) {
        task = line.trim();
        break;
      }
    }
  } else if (questType === "evening") {
    const tasks = text.split("\n").filter((line) => line.trim());
    const day = new Date().toLocaleString("default", {
      weekday: "long",
    });

    for (const t of tasks) {
      const end = t.indexOf("]");
      const condition = t.substring(1, end);

      if (condition == day) {
        task = t.substring(end + 1).trim();
        break;
      }
    }
  }

  appData.today[`${questType}Q`] = task;
  document.getElementById(`${questType}-task`).textContent = task;

  document.getElementById(`${questType}-btn`).onclick = async () => {
    if (!appData.today[`if${capitalize(questType)}Q`]) {
      appData.today[`if${capitalize(questType)}Q`] = true;
      document.getElementById(`daily-stats-${questType}`).classList.add("complete");

      document.getElementById(`${questType}-btn`).textContent = "🎁";
      document.getElementById(`${questType}-task`).style.opacity = "33%";
      if (rewardType === "comic") {
        const url = await getRandomImg();
        appData.today[`${questType}QReward`] = `<img src="${url}" style="width:100%">`;
      } else if (rewardType === "citation") {
        appData.today[`${questType}QReward`] = await getRandomCitation();
      }
    }
    openReward(appData.today[`${questType}QReward`]);
  };
}

function renderQuest(type, rewardType) {
  const task = appData.today[`${type}Q`];
  const done = appData.today[`if${capitalize(type)}Q`];

  const taskEl = document.getElementById(`${type}-task`);
  const btn = document.getElementById(`${type}-btn`);

  taskEl.textContent = task;

  if (done) {
    btn.textContent = "🎁";
    taskEl.style.opacity = "33%";
    // document.getElementById(`daily-stats-${type}`).classList.add("complete");
  }

  btn.onclick = async () => {
    if (!appData.today[`if${capitalize(type)}Q`]) {
      appData.today[`if${capitalize(type)}Q`] = true;

      if (!appData.today[`${type}QReward`]) {
        if (rewardType === "comic") {
          const link = await getRandomImg();
          appData.today[`${type}QReward`] = link ? `<img src="${link}" style="max-width:100%;">` : "No comic available";
        } else if (rewardType === "citation") {
          appData.today[`${type}QReward`] = await getRandomCitation();
        }
      }

      // document.getElementById(`daily-stats-${type}`).classList.add("complete");
      btn.textContent = "🎁";
      taskEl.style.opacity = "33%";
    }

    openReward(appData.today[`${type}QReward`]);
  };
}

/* =========================
   CLEAN-UP
========================= */

async function loadCleanUpTasks() {
  const text = await fetchFile("CleanUpTasks.md");
  const lines = text.split("\n");

  const day = new Date().toLocaleString("default", {
    weekday: "long",
  });

  const list = document.getElementById("evening-list");
  list.innerHTML = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let task = trimmed;
    let applicable = true;

    if (trimmed.startsWith("[") && trimmed.includes("]")) {
      const end = trimmed.indexOf("]");
      const condition = trimmed.substring(1, end);
      task = trimmed.substring(end + 1).trim();

      if (condition !== day) applicable = false;
    }

    if (applicable) {
      const li = document.createElement("li");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.addEventListener("change", (e) => {
        const row = e.target.closest(".task-row");
        row.classList.toggle("checked", e.target.checked);

        checkEveningComplete();
      });

      const text = document.createElement("span");
      text.textContent = task.replace(/^-+\s*/, "");

      const wrapper = document.createElement("div");
      wrapper.className = "task-row";

      wrapper.appendChild(text);
      wrapper.appendChild(checkbox);

      li.appendChild(wrapper);

      list.appendChild(li);
    }
  }
}

async function checkEveningComplete() {
  const list = document.getElementById("evening-list");
  const doneDiv = document.getElementById("evening-done");
  const checkboxes = list.querySelectorAll('input[type="checkbox"]');
  const allChecked = Array.from(checkboxes).every((cb) => cb.checked);

  if (allChecked) {
    list.style.display = "none";
    const comicUrl = await getRandomImg();
    doneDiv.innerHTML = `<img src="${comicUrl}" style="width:100%; border-radius:8px;">`;
    doneDiv.style.display = "block";
    appData.today[`ifCleanUp`] = true;
    document.getElementById("daily-stats-cleanUp").classList.add("complete");
  }
}

// /* =========================
//    CHECK-IN
// ========================= */

async function loadCheckIn(checkInType, rewardType) {
  appData.today[`if${capitalize(checkInType)}`] = false;
  document.getElementById(`${checkInType}-btn`).onclick = async () => {
    // if (!appData.today[`if${capitalize(checkInType)}`]) {
    appData.today[`if${capitalize(checkInType)}`] = true;
    // document.getElementById(`daily-stats-${checkInType}`).classList.add("complete");
    document.getElementById(`${checkInType}-btn`).textContent = "🎁";
    document.getElementById(`${checkInType}-task`).style.opacity = "33%";
    if (rewardType === "comic") {
      const url = await getRandomImg("/mems");
      appData.today[`${checkInType}Reward`] = `<img src="${url}" style="width:100%">`;
    } else if (rewardType === "citation") {
      appData.today[`${checkInType}Reward`] = await getRandomCitation();
    }
    // }
    openReward(appData.today[`${checkInType}Reward`]);
  };
}

function loadMoodCheckIn() {
  const buttons = document.querySelectorAll(".mood-btn");
  buttons.forEach((button) => {
    button.onclick = () => {
      const score = Number(button.dataset.score);
      appData.today.moodScore = score;
      appData.today.ifCheckIn = true;
      updateMoodButtons();
      document.getElementById("daily-stats-checkIn").classList.add("complete");

      const content = `
        <div class="mood-popup">
          <h3>Mood ${score}/5</h3>
          <textarea id="mood-note-input">${appData.today.moodNote || ""}</textarea>
          <button id="mood-note-save" class="action-btn">💾</button>
        </div>
      `;

      openReward(content);
      const textarea = document.getElementById("mood-note-input");
      if (textarea) textarea.focus();

      const saveButton = document.getElementById("mood-note-save");
      if (saveButton) {
        saveButton.onclick = () => {
          appData.today.moodNote = document.getElementById("mood-note-input").value.trim();
          closeReward();
        };
      }
    };
  });

  updateMoodButtons();
}

function updateMoodButtons() {
  document.querySelectorAll(".mood-btn").forEach((button) => {
    const score = Number(button.dataset.score);
    button.classList.toggle("active", appData.today.moodScore === score);
  });
}

function changeActivityMinutes(delta) {
  appData.today.activityMinutes = Math.max(0, Math.min(120, appData.today.activityMinutes + delta));
  appData.today.ifActivityMinutes = true;
  updateActivityMinutesDisplay();
}

function updateActivityMinutesDisplay() {
  const display = document.getElementById("activity-minutes");
  if (!display) return;
  display.textContent = appData.today.activityMinutes;
}

function initActivityPicker() {
  const display = document.getElementById("activity-minutes");
  const picker = document.getElementById("activity-picker");
  const decrease = document.getElementById("activity-decrease");
  const increase = document.getElementById("activity-increase");

  if (!appData.today.activityMinutes && appData.today.activityMinutes !== 0) {
    appData.today.activityMinutes = 15;
  }

  updateActivityMinutesDisplay();

  if (picker) {
    picker.addEventListener("wheel", (event) => {
      event.preventDefault();
      changeActivityMinutes(event.deltaY < 0 ? 15 : -15);
    });
  }

  if (decrease) decrease.onclick = () => changeActivityMinutes(-15);
  if (increase) increase.onclick = () => changeActivityMinutes(15);
}

/* =========================
    REWARDS
========================= */

function openReward(content) {
  const popup = document.getElementById("reward-popup");
  const box = document.getElementById("reward-content");

  box.innerHTML = content;
  box.onclick = (e) => e.stopPropagation();
  popup.classList.add("active");
}

function closeReward() {
  document.getElementById("reward-popup").classList.remove("active");
}

async function getRandomCitation() {
  const text = await fetchFile("Cytaty.md");
  const lines = text.split("\n");
  const citations = lines.filter((line) => line.trim().startsWith("-")).map((line) => line.trim().substring(1).trim());
  return getRandomItem(citations);
}

async function getRandomImg(path = "/comics") {
  try {
    const response = await dbx.filesListFolder({
      path: path,
    });

    const files = response.result.entries.filter((f) => f[".tag"] === "file");

    if (files.length === 0) {
      console.warn("No comics found!");
      return null;
    }

    const randomFile = files[Math.floor(Math.random() * files.length)];
    const linkResponse = await dbx.filesGetTemporaryLink({
      path: path + "/" + randomFile.name,
    });

    return linkResponse.result.link;
  } catch (err) {
    console.error("Error fetching comic:", err);
    return null;
  }
}

/* =========================
   STATS
========================= */

function setRingProgress(circle, percent) {
  const r = circle.getAttribute("r");
  const circumference = 2 * Math.PI * r;
  circle.style.strokeDasharray = circumference;
  const offset = circumference * (1 - percent / 100);
  circle.style.strokeDashoffset = offset.toFixed(0);
}

function setHalfRing(id, percent) {
  const el = document.getElementById(id);
  const length = el.getTotalLength();
  el.style.strokeDasharray = length;
  el.style.strokeDashoffset = length;
  const offset = length * (1 - percent / 100);
  el.style.strokeDashoffset = offset;
}

function updateAllRings(mainValues, overlayValues, rainbowValues) {
  mainValues.forEach((val, i) => {
    const ring = document.getElementById("ring" + (i + 1));
    setRingProgress(ring, val * 100);
  });

  overlayValues.forEach((val, i) => {
    const ring = document.getElementById("overlay" + (i + 1));
    const label = document.getElementById("p" + (i + 1));

    label.textContent = val + "%";
    setRingProgress(ring, val);
  });

  rainbowValues.forEach((val, i) => {
    setHalfRing("r" + (i + 1), val);
  });
}

function updateAllRingsFromData() {
  updateAllRings(
    [appData.monthly[month].morningQ / 30, appData.monthly[month].mainQ / 30, appData.monthly[month].eveningQ / 30, appData.monthly[month].cleanUp / 30],
    [appData.yearly?.morningQ || 0, appData.yearly?.mainQ || 0, appData.yearly?.eveningQ || 0, appData.yearly?.cleanUp || 0],
    [90, 75, 60, 80, 50, 65, 40],
  );
}

/* =========================
   PLAN
========================= */

async function loadPlan() {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  // Load weekly options and assignments
  const eveningText = await fetchFile("EveningTasks.md");
  const eveningLines = eveningText.split("\n").filter((line) => line.trim());
  const eveningTasks = eveningLines.map((line) => {
    const match = line.match(/\[.*?\]\s*(.*)/);
    return match ? match[1] : line;
  });

  // Populate weekly selects
  document.querySelectorAll("#weekly-tab .task-select").forEach((select) => {
    select.innerHTML = '<option value="">None</option>';
    eveningTasks.forEach((task) => {
      const option = document.createElement("option");
      option.value = task;
      option.textContent = task;
      select.appendChild(option);
    });

    // Set current assignment
    const day = select.dataset.day;
    const currentLine = eveningLines.find((line) => line.startsWith(`[${day}]`));
    if (currentLine) {
      const match = currentLine.match(/\[.*?\]\s*(.*)/);
      if (match) select.value = match[1];
    }
  });

  // Load monthly options
  const monthlyText = await fetchFile("MonthlyTasks.md");
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const currentMonth = monthNames[new Date().getMonth()];
  const monthlyLines = monthlyText.split("\n");
  let inMonth = false;
  const monthlyTasks = [];
  for (const line of monthlyLines) {
    if (line.startsWith("## " + currentMonth)) {
      inMonth = true;
    } else if (line.startsWith("## ")) {
      inMonth = false;
    } else if (inMonth && line.trim() && !line.startsWith("[")) {
      monthlyTasks.push(line.trim());
    }
  }

  // Populate monthly and food days with weekdays
  const containers = ["#monthly-tab .plan-days", "#food-tab .plan-days"];
  containers.forEach((selector) => {
    const container = document.querySelector(selector);
    container.innerHTML = "";
    days.forEach((day) => {
      const dayDiv = document.createElement("div");
      dayDiv.className = "plan-day";
      dayDiv.innerHTML = `<span>${day.slice(0, 3)}</span><select class="task-select" data-day="${day}"></select>`;
      container.appendChild(dayDiv);

      const select = dayDiv.querySelector(".task-select");
      select.innerHTML = '<option value="">None</option>';
      if (selector === "#monthly-tab .plan-days") {
        monthlyTasks.forEach((task) => {
          const option = document.createElement("option");
          option.value = task;
          option.textContent = task;
          select.appendChild(option);
        });
      }
      // For food, no additional options
    });
  });
}

async function savePlan() {
  // Save weekly
  const weeklyAssignments = {};
  document.querySelectorAll("#weekly-tab .task-select").forEach((select) => {
    const day = select.dataset.day;
    weeklyAssignments[day] = select.value;
  });

  let newEveningText = "";
  for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
    const task = weeklyAssignments[day] || "None";
    newEveningText += `[${day}] ${task}\n`;
  }
  await saveFileToDropbox("EveningTasks.md", newEveningText);

  // For monthly and food, perhaps save to data.json or separate file, but for now, only weekly
  alert("Plan saved!");
}
