import { getCodeFromUrl, hasRedirectedFromAuth, doAuth, fetchFile, saveFileToDropbox } from "./dropbox.js";
import { initActionPlan } from "./action-plan.js";

const REDIRECT_URI = `${window.location.origin}/Tracker/`; //"http://localhost:8000/";
// const REDIRECT_URI = "http://localhost:8000/"; //"http://localhost:8000/";
const CLIENT_ID = "7ctgzhwolmiq6kc"; // <-- your client id
let dbxAuth = new Dropbox.DropboxAuth({ clientId: CLIENT_ID });
let dbx = new Dropbox.Dropbox({ auth: dbxAuth });

let appData = null;
let rewardLockedUntil = 0;
let randomTools = [];

function trackerDate(now = new Date()) {
  const d = new Date(now);
  d.setHours(d.getHours() - 3);
  return d;
}

const today = trackerDate().toISOString().split("T")[0];
const dayOfWeek = trackerDate().toLocaleString("default", { weekday: "long" });
const dayOfMonth = trackerDate().getDate();
const dayOfYear = Math.floor((trackerDate() - new Date(trackerDate().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
const month = trackerDate().toLocaleString("default", { month: "short" });

/* =========================
   INIT APP
========================= */

window.onload = async function () {
  let el = document.getElementById("progress-header");
  el.style.cssText += ";filter:drop-shadow(0 0 10px #fff)";
  setTimeout(() => (el.style.filter = ""), 1000);

  if (!hasRedirectedFromAuth()) {
    await doAuth(dbxAuth, REDIRECT_URI);
    return;
  }

  try {
    dbxAuth.setCodeVerifier(window.sessionStorage.getItem("codeVerifier"));
    const tokenResponse = await dbxAuth.getAccessTokenFromCode(REDIRECT_URI, getCodeFromUrl());
    dbxAuth.setAccessToken(tokenResponse.result.access_token);
    // clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
    await loadData();
    await loadApp();
    initTabs("action-plan");
    initTabs("stats");
  } catch (error) {
    console.error("Auth error:", error);
  }
};

async function loadData() {
  appData = JSON.parse(await fetchFile(dbx, "data.json"));

  if (appData.lastUpdated != today) {
    await saveAndResetDay(appData.lastUpdated);
    await generateQuests();
  }

  // ensurer as sometimes they were missing
  if (!appData.today?.morningQ?.trim() || !appData.today?.mainQ?.trim() || !appData.today?.eveningQ?.trim()) await generateQuests();
}

async function loadApp() {
  console.log("Loading app for date:", today);
  loadQuests();
  loadCleanUpTasks();
  loadCheckIn();
  renderDailyStats();
  renderRingsStats();
  renderMoodChart();
  await Promise.all([loadPlan(), loadTools()]);
  await initActionPlan(appData, dbx);
}

async function saveChanges() {
  await saveFileToDropbox(dbx, "data.json", JSON.stringify(appData, null, 2));
}

async function saveAndResetDay(archiveDate = today) {
  console.log("Saving and resetting day:", archiveDate);
  const t = appData.today;
  const w = appData.weekly;
  const m = appData.monthly;
  const y = appData.yearly;
  // update yearly stats
  if (t.ifMorningQ && t.ifMainQ && t.ifEveningQ && t.ifCleanUp && t.ifActivityMinutes && t.ifCheckIn && t.ifFoodPlan && t.ifWater && t.ifLimits) y.perfectDays++;
  if (t.ifMorningQ && t.ifMainQ && t.ifEveningQ) y.routine++;
  if (t.ifCleanUp) y.cleanUp++;
  if (t.ifCheckIn) y.checkIn++;
  if (t.ifFoodPlan && t.ifWater && t.ifLimits) y.foodPlan++;
  if (t.ifActivityMinutes) y.activityMinutes = y.activityMinutes + t.activityMinutes;

  // update monthly stats
  if (t.ifMorningQ && t.ifMainQ && t.ifEveningQ) m.routine++;
  if (t.ifCleanUp) m.cleanUp++;
  if (t.ifCheckIn) m.checkIn++;
  if (t.ifFoodPlan && t.ifWater && t.ifLimits) m.foodPlan++;
  if (t.ifActivityMinutes) m.activityMinutes = m.activityMinutes + t.activityMinutes;

  if (t.ifEveningQ) {
    let weeklyTask = t.eveningQ;
    if (weeklyTask.includes("Passive Fun")) {
      w.ifWt_passiveFun = true;
    } else if (weeklyTask.includes("German")) {
      w.ifWt_german = true;
    } else if (weeklyTask.includes("Sport")) {
      w.ifWt_sport = true;
    } else if (weeklyTask.includes("Psychology")) {
      w.ifWt_psychology = true;
    } else if (weeklyTask.includes("Monthly Goals")) {
      w.ifWt_monthlyGoals = true;
    } else if (weeklyTask.includes("Active Fun")) {
      w.ifWt_activeFun = true;
    } else if (weeklyTask.includes("Volo")) {
      w.ifwt_volo = true;
    }
  }

  delete appData.today.worryBox;
  appData.daily[archiveDate] = { ...appData.today };

  const week = (d) => {
    d = new Date(d);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const isNewWeek = week(appData.lastUpdated) !== week(today);

  if (isNewWeek) {
    appData.weekly = {
      activityMinutes: 0,
      ifWt_passiveFun: false,
      ifWt_german: false,
      ifWt_sport: false,
      ifWt_psychology: false,
      ifWt_monthlyGoals: false,
      ifWt_activeFun: false,
      ifwt_volo: false,
    };
  }

  if (appData.lastUpdated?.slice(0, 7) !== today.slice(0, 7)) {
    appData.monthly = {
      routine: 0,
      cleanUp: 0,
      checkIn: 0,
      foodPlan: 0,
      activityMinutes: 0,
    };
  }

  appData.today = {
    morningQ: "",
    ifMorningQ: false,
    mainQ: "",
    ifMainQ: false,
    eveningQ: "",
    ifEveningQ: false,
    ifCleanUp: false,
    ifCheckIn: false,
    moodScore: 0,
    moodNote: "",
    moodNoteO: false,
    moodNoteCH: false,
    moodNoteA: false,
    ifFoodPlan: false,
    ifWater: false,
    ifLimits: false,
    ifActivityMinutes: false,
    activityMinutes: 0,
  };

  appData.lastUpdated = today;

  await saveFileToDropbox(dbx, "data.json", JSON.stringify(appData, null, 2));
}

// /* =========================
//    QUESTS & TASKS
// ========================= */

async function loadTask(taskType, rewardType) {
  // console.log(appData.today[`${taskType}`]);
  // console.log(appData);
  // console.log(taskType, document.getElementById(`${taskType}-btn`));
  if (appData.today[`${taskType}`]) {
    const taskElement = document.getElementById(`${taskType}-task`);
    const taskText = appData.today[`${taskType}`];
    if (taskText.includes("[")) {
      renderLinkTask(taskElement, taskText);
    } else {
      taskElement.textContent = taskText;
    }
  }

  if (appData.today[`if${capitalize(taskType)}`]) {
    completeTask(taskType);
  }

  document.getElementById(`${taskType}-btn`).onclick = async () => {
    // console.log("Clicked", taskType, "rewardType:", rewardType);
    completeTask(taskType);
    await generateReward(taskType, rewardType);
    await saveChanges();
  };
}

function renderLinkTask(element, text) {
  const match = text.match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/);
  if (!match) {
    element.textContent = text;
    return;
  }

  const beforeLink = text.slice(0, match.index);
  const afterLink = text.slice(match.index + match[0].length);
  const link = document.createElement("a");
  link.href = match[2];
  link.textContent = match[1];
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.addEventListener("click", (event) => event.stopPropagation());
  element.replaceChildren(document.createTextNode(beforeLink), link, document.createTextNode(afterLink));
}

function completeTask(taskType) {
  appData.today[`if${capitalize(taskType)}`] = true;
  document.getElementById(`${taskType}-btn`).disabled = true;
  document.getElementById(`${taskType}-btn`).style.opacity = "33%";
  document.getElementById(`${taskType}-task`).style.opacity = "33%";
  renderDailyStats();
}

async function generateQuests() {
  await generateMorningQuest();
  await generateMainQuest();
  await generateEveningQuest();
  await saveChanges();
}

async function loadQuests() {
  loadTask("morningQ", "comic");
  loadTask("mainQ", "citation");
  loadTask("eveningQ", "citation");
}

async function generateMorningQuest() {
  const text = await fetchFile(dbx, "MorningTasks.md");
  const tasks = text.split("\n").filter((line) => line.trim());
  appData.today[`morningQ`] = getRandomItem(tasks);
}

async function generateMainQuest() {
  const assignedTask = appData.plan?.monthlyAssignments?.[dayOfWeek];
  if (assignedTask) {
    appData.today.mainQ = assignedTask;
    return;
  }

  const text = await fetchFile(dbx, "MonthlyTasks.md");
  const lines = text.split("\n");
  const currentMonth = trackerDate().toLocaleString("default", {
    month: "long",
  });

  let inSection = false;
  for (const line of lines) {
    if (line.startsWith("## " + currentMonth)) {
      inSection = true;
    } else if (line.startsWith("## ") && inSection) {
      break;
    } else if (inSection && line.trim()) {
      appData.today[`mainQ`] = line.trim();
      break;
    }
  }
}

async function generateEveningQuest() {
  const text = await fetchFile(dbx, "EveningTasks.md");
  const tasks = text.split("\n").filter((line) => line.trim());

  for (const t of tasks) {
    const end = t.indexOf("]");
    const condition = t.substring(1, end);

    if (condition == dayOfWeek) {
      appData.today[`eveningQ`] = t.substring(end + 1).trim();
      break;
    }
  }
}

/* =========================
   CLEAN-UP
========================= */

async function loadCleanUpTasks() {
  const text = await fetchFile(dbx, "CleanUpTasks.md");
  const lines = text.split("\n");

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

      if (condition !== dayOfWeek) applicable = false;
    }

    if (applicable) {
      const li = document.createElement("li");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.addEventListener("change", (e) => {
        const row = e.target.closest(".task-row");
        row.classList.toggle("checked", e.target.checked);

        checkCleanUpTasks();
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

async function checkCleanUpTasks() {
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
    renderDailyStats();
    await saveChanges();
  }
}

// /* =========================
//    CHECK-IN
// ========================= */

async function loadCheckIn() {
  loadMoodCheckIn();
  loadTask("foodPlan", "comic");
  loadTask("water", "citation");
  loadTask("limits", "citation");
  initActivityPicker();
}

function loadMoodCheckIn() {
  const buttons = document.querySelectorAll(".mood-btn");
  buttons.forEach((button) => {
    button.onclick = async () => {
      const score = Number(button.dataset.score);
      appData.today.moodScore = score;
      appData.today.ifCheckIn = true;
      let ifO = appData.today.moodNoteO || false;
      let ifCH = appData.today.moodNoteCH || false;
      let ifA = appData.today.moodNoteA || false;
      await saveChanges();
      updateMoodButtons();
      renderDailyStats();

      const content = `
        <div class="mood-popup">
          <h3>Mood ${score}/5</h3>
            <div style="display:flex;gap:8px;padding:1.5rem 0;">
              <label><input type="checkbox" id="tracker_O" ${ifO ? "checked" : ""}> O</label>
              <label><input type="checkbox" id="tracker_CH" ${ifCH ? "checked" : ""}> CH</label>
              <label><input type="checkbox" id="tracker_A" ${ifA ? "checked" : ""}> A</label>
            </div>
          <textarea id="mood-note-input">${appData.today.moodNote || ""}</textarea>
          <button id="mood-note-save" class="action-btn">💾</button>
        </div>
      `;

      openReward(content);
      const textarea = document.getElementById("mood-note-input");
      if (textarea) textarea.focus();

      const saveButton = document.getElementById("mood-note-save");
      if (saveButton) {
        saveButton.onclick = async () => {
          appData.today.moodNote = document.getElementById("mood-note-input").value.trim();
          appData.today.moodNoteO = document.getElementById("tracker_O").checked;
          appData.today.moodNoteCH = document.getElementById("tracker_CH").checked;
          appData.today.moodNoteA = document.getElementById("tracker_A").checked;
          await saveChanges();
          renderMoodChart();
          closeReward();

          if (score === 1 || score === 2) {
            showScreen("action-plan");
            const tab = score === 1 ? "tools" : "action";
            document.querySelector(`#action-plan .tab-btn[data-tab="${tab}"]`).click();
            if (score === 1) openRandomTool();
          }
        };
      }
    };
  });

  updateMoodButtons();
  renderMoodChart();
}

function updateMoodButtons() {
  document.querySelectorAll(".mood-btn").forEach((button) => {
    const score = Number(button.dataset.score);
    button.classList.toggle("active", appData.today.moodScore === score);
  });
}

function changeActivityMinutes(delta) {
  appData.today.activityMinutes = Math.max(0, Math.min(1000, appData.today.activityMinutes + delta));
  appData.weekly.activityMinutes = Math.max(0, Math.min(1000, appData.weekly.activityMinutes + delta));
  appData.today.ifActivityMinutes = true;
  renderDailyStats();
  document.getElementById("activity-minutes").textContent = appData.weekly.activityMinutes;
}

function initActivityPicker() {
  document.getElementById("activity-minutes").textContent = appData.weekly.activityMinutes;
  document.getElementById("activity-decrease").onclick = async () => {
    changeActivityMinutes(-15);
    await saveChanges();
  };
  document.getElementById("activity-increase").onclick = async () => {
    changeActivityMinutes(15);
    await saveChanges();
  };
}

/* =========================
    REWARDS
========================= */

// async function generateReward(rewardName, rewardType) {
//   if (rewardType === "comic") {
//     const url = await getRandomImg("/mems");
//     appData.today[`${rewardName}Reward`] = `<img src="${url}" style="width:100%">`;
//   } else if (rewardType === "citation") {
//     appData.today[`${rewardName}Reward`] = await getRandomCitation();
//   }
//   openReward(appData.today[`${rewardName}Reward`]);
// }

async function generateReward(rewardName, rewardType) {
  let content = "";
  if (rewardType === "comic") {
    const url = await getRandomImg("/mems");
    content = `<img src="${url}" style="width:100%">`;
  } else if (rewardType === "citation") {
    content = await getRandomCitation();
  } else if (rewardType === "random-img") {
    content = `<img src="https://loremflickr.com/320/240/animal,otter/all" style="width:100%">`;
  }
  openReward(content);
}

async function getRandomCitation() {
  const text = await fetchFile(dbx, "Cytaty.md");
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
      console.warn("No img found!");
      return null;
    }

    const randomFile = files[Math.floor(Math.random() * files.length)];
    const linkResponse = await dbx.filesGetTemporaryLink({
      path: path + "/" + randomFile.name,
    });

    return linkResponse.result.link;
  } catch (err) {
    console.error("Error fetching img:", err);
    return null;
  }
}

function openReward(content) {
  const popup = document.getElementById("reward-popup");
  const box = document.getElementById("reward-content");

  box.innerHTML = content;
  box.onclick = (e) => e.stopPropagation();
  popup.classList.add("active");
}

function closeReward() {
  if (Date.now() < rewardLockedUntil) return;
  document.getElementById("reward-popup").classList.remove("active");
}

window.closeReward = closeReward;

/* =========================
   STATS
========================= */
function renderDailyStats() {
  const t = appData.today;
  const w = appData.weekly;

  if (t.ifMorningQ && t.ifMainQ && t.ifEveningQ && t.ifCleanUp && t.ifCheckIn && t.ifActivityMinutes && t.ifFoodPlan && t.ifWater && t.ifLimits) document.getElementById("daily-stats-perfect").classList.add("complete");
  if (t.ifMorningQ && t.ifMainQ && t.ifEveningQ) document.getElementById("daily-stats-quests").classList.add("complete");
  if (t.ifCleanUp) document.getElementById("daily-stats-cleanUp").classList.add("complete");
  if (t.ifCheckIn) document.getElementById("daily-stats-mood").classList.add("complete");
  if (t.ifActivityMinutes) document.getElementById("daily-stats-activityMinutes").classList.add("complete");
  if (t.ifFoodPlan && t.ifWater && t.ifLimits) document.getElementById("daily-stats-food").classList.add("complete");

  if (w.ifWt_passiveFun) document.getElementById("daily-stats-wt_passiveFun").classList.add("complete");
  if (w.ifWt_german) document.getElementById("daily-stats-wt_german").classList.add("complete");
  if (w.ifWt_sport) document.getElementById("daily-stats-wt_sport").classList.add("complete");
  if (w.ifWt_psychology) document.getElementById("daily-stats-wt_psychology").classList.add("complete");
  if (w.ifWt_monthlyGoals) document.getElementById("daily-stats-wt_monthlyGoals").classList.add("complete");
  if (w.ifWt_activeFun) document.getElementById("daily-stats-wt_activeFun").classList.add("complete");
  if (w.ifWt_volo) document.getElementById("daily-stats-wt_volo").classList.add("complete");

  document.getElementById("daily-stats-perfect").textContent = `   ✨ ${appData.yearly.perfectDays || 0}`;
}

function setRingProgress(circle, percent) {
  percent = Math.max(0, Math.min(100, percent));

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

function updateAllRings(monthlyValues, yearlyValues, rainbowValues) {
  monthlyValues.forEach((val, i) => {
    const ring = document.getElementById("ring" + (i + 1));
    setRingProgress(ring, val * 100);
  });

  yearlyValues.forEach((val, i) => {
    const ring = document.getElementById("overlay" + (i + 1));
    const label = document.getElementById("p" + (i + 1));
    // console.log(`Updating overlay${i}: val=${val}, percent=${(val * 100).toFixed(0)}%`);

    if (i != 4) label.textContent = (val * 100).toFixed(0) + "%";
    setRingProgress(ring, val * 100);
  });

  rainbowValues.forEach((val, i) => {
    setHalfRing("r" + (i + 1), val * 100);
  });
}

// TODO: correct value computing
function renderRingsStats() {
  let m = appData.monthly;
  let y = appData.yearly;

  updateAllRings(
    [m.routine / dayOfMonth, m.cleanUp / dayOfMonth, m.foodPlan / dayOfMonth, m.activityMinutes / ((dayOfMonth * 333) / 7)],

    [y?.routine / dayOfYear, y?.cleanUp / dayOfYear, y?.foodPlan / dayOfYear, y?.activityMinutes / ((dayOfYear * 333) / 7), y.cele12 / 12],

    [(y?.wt_volo * 7) / dayOfYear, (y?.wt_activeFun * 7) / dayOfYear, (y?.wt_monthlyGoals * 7) / dayOfYear, (y?.wt_psychology * 7) / dayOfYear, (y?.wt_sport * 7) / dayOfYear, (y?.wt_german * 7) / dayOfYear, (y?.wt_passiveFun * 7) / dayOfYear],
  );
}

function renderMoodChart() {
  const container = document.getElementById("mood-chart");
  if (!container) return;

  const dailyData = { ...(appData.daily || {}) };
  if (appData.today && Number(appData.today.moodScore) > 0) {
    dailyData[today] = { ...appData.today };
  }

  const allDates = Object.keys(dailyData).map((d) => new Date(d));
  if (!allDates.length) {
    container.innerHTML = "";
    return;
  }

  const latestDate = new Date(Math.max(...allDates));
  const earliestDate = new Date(Math.min(...allDates));

  const mondayOfLatest = new Date(latestDate);
  mondayOfLatest.setDate(mondayOfLatest.getDate() - ((mondayOfLatest.getDay() + 6) % 7));

  const mondayOfEarliest = new Date(earliestDate);
  mondayOfEarliest.setDate(mondayOfEarliest.getDate() - ((mondayOfEarliest.getDay() + 6) % 7));

  const weeks = [];
  for (let weekStart = new Date(mondayOfLatest); weekStart >= mondayOfEarliest; weekStart.setDate(weekStart.getDate() - 7)) {
    weeks.push(new Date(weekStart));
  }

  container.innerHTML = "";

  for (const weekStart of weeks) {
    for (let offset = 0; offset < 7; offset++) {
      const cellDate = new Date(weekStart);
      cellDate.setDate(cellDate.getDate() + offset);
      const dateKey = cellDate.toISOString().split("T")[0];
      const data = dailyData[dateKey];
      const score = data?.moodScore;
      const ifO = Number(data?.moodNoteO) || 0;
      const ifCH = Number(data?.moodNoteCH) || 0;
      const ifA = Number(data?.moodNoteA) || 0;
      const month = cellDate.toLocaleString("default", { month: "short" });
      const day = cellDate.getDate();
      const cell = document.createElement("div");
      cell.className = "mood-day-cell";
      if (score) {
        cell.classList.add(`score-${score}`);
      } else {
        cell.classList.add("empty");
      }

      if (ifO || ifCH || ifA) {
        cell.classList.add("additional");
      }

      if (day === 1) {
        cell.classList.add("month-start");
        cell.dataset.month = month;
      }

      cell.dataset.score = score;
      cell.dataset.date = dateKey;
      cell.textContent = String(day);

      const note = data?.moodNote ? data.moodNote.trim() : "";
      const label = note ? `<p>${note}</p>` : "<p>No note saved.</p>";
      cell.onclick = () => {
        openReward(`
          <div style="max-width:360px; word-break:break-word;">
            <h3>${dateKey}</h3>
            <div style="display:flex;gap:8px;padding:1.5rem 0;">
              <label><input type="checkbox" disabled ${ifO ? "checked" : ""}> O</label>
              <label><input type="checkbox" disabled ${ifCH ? "checked" : ""}> CH</label>
              <label><input type="checkbox" disabled ${ifA ? "checked" : ""}> A</label>
            </div>
            <p>Mood ${score || "?"}/5</p>
            ${label}
          </div>
        `);
      };

      container.appendChild(cell);
    }
  }
}

/* =========================
   PLAN
========================= */

async function loadPlan() {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  // Load weekly options and assignments
  const [eveningText, monthlyText] = await Promise.all([fetchFile(dbx, "EveningTasks.md"), fetchFile(dbx, "MonthlyTasks.md")]);
  const eveningLines = eveningText.split("\n").filter((line) => line.trim());
  const eveningTasks = eveningLines.map((line) => {
    const match = line.match(/\[.*?\]\s*(.*)/);
    return match ? match[1] : line;
  });

  const weeklyAssignments = {};
  days.forEach((day) => {
    const currentLine = eveningLines.find((line) => line.startsWith(`[${day}]`));
    const match = currentLine?.match(/\[.*?\]\s*(.*)/);
    if (match && match[1] !== "None") weeklyAssignments[day] = match[1];
  });

  // Load monthly options
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const currentMonth = monthNames[trackerDate().getMonth()];
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

  const createDaySelectors = (container, tasks, assignments, planType) => {
    const daysContainer = document.createElement("div");
    daysContainer.className = "plan-days";
    container.appendChild(daysContainer);
    days.forEach((day) => {
      const dayDiv = document.createElement("div");
      dayDiv.className = "plan-day";
      const taskControl = planType === "monthly" ? `<input class="task-input" type="text" data-day="${day}" aria-label="${day} task">` : `<select class="task-select" data-day="${day}"></select>`;
      dayDiv.innerHTML = `<span>${day.slice(0, 3)}</span>${taskControl}`;
      daysContainer.appendChild(dayDiv);
      if (planType === "monthly") {
        dayDiv.querySelector(".task-input").value = assignments[day] || tasks[0] || "";
        return;
      }
      const select = dayDiv.querySelector(".task-select");
      select.innerHTML = '<option value="">None</option>';
      tasks.forEach((task) => {
        const option = document.createElement("option");
        option.value = task;
        option.textContent = task;
        select.appendChild(option);
      });
      select.value = assignments[day] || "";
    });
    const saveButton = document.createElement("button");
    saveButton.className = "load-btn";
    saveButton.textContent = "Save Plan";
    saveButton.onclick = () => savePlan(planType);
    container.appendChild(saveButton);
  };

  const mainQuestTask = document.getElementById("mainQ-task");
  const weeklyQuestTask = document.getElementById("eveningQ-task");
  mainQuestTask.onclick = () => openQuestPlan("monthly", "Main Quest", monthlyTasks, appData.plan?.monthlyAssignments || {}, createDaySelectors);
  weeklyQuestTask.onclick = () => openQuestPlan("weekly", "Weekly Quest", eveningTasks, weeklyAssignments, createDaySelectors);
  [mainQuestTask, weeklyQuestTask].forEach((task) => {
    task.onkeydown = (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        task.click();
      }
    };
  });
}

async function loadTools() {
  const toolsList = document.getElementById("tools-list");
  const randomButton = document.getElementById("random-tool");
  let tools = [];
  try {
    const entries = (await dbx.filesListFolder({ path: "/tools" })).result.entries.filter((entry) => entry[".tag"] === "file");
    tools = entries.filter((entry) => /\.(png|jpe?g|svg|mp3|mp4)$/i.test(entry.name)).slice(0, 12);
  } catch (error) {
    console.error("Error loading tools:", error);
  }

  document.getElementById("mood-lifter-tool").onclick = openMoodLifter;
  document.getElementById("worry-tool").onclick = openWorryBox;
  document.getElementById("seven-minute-tool").onclick = openSevenMinuteBreathing;
  document.getElementById("breathing-tool").onclick = openBreathing;

  randomTools = tools.filter((tool) => tool.name.toLowerCase() !== "seven-minute-tool");

  tools.forEach((tool) => {
    const button = document.createElement("button");
    button.className = "tool-btn";
    button.type = "button";
    button.textContent = tool.name.replace(/\.[^.]+$/, "");
    button.onclick = () => openTool(tool);
    toolsList.appendChild(button);
  });

  randomButton.onclick = openRandomTool;
  randomButton.disabled = !randomTools.length;
}

function openRandomTool() {
  if (randomTools.length) openTool(randomTools[Math.floor(Math.random() * randomTools.length)]);
}

async function openMoodLifter() {
  const text = await fetchFile(dbx, "actionPlan/ml.md");
  const tasks = text
    .split(/\r?\n/)
    .map((line) => {
      const match = line.trim().match(/^-\s*([123])(INT|IN|OUT)([-+=])\s+(.+)$/);
      return match ? { energy: match[1], location: match[2], people: match[3], text: match[4].trim() } : null;
    })
    .filter(Boolean);

  if (!tasks.length) {
    openReward('<div class="tool-modal"><h3>Mood Lifter</h3><p>No Mood Lifter tasks found.</p><button id="tool-close" class="action-btn modal-close-btn" type="button">✔︎</button></div>');
    document.getElementById("tool-close").onclick = closeReward;
    return;
  }

  const filterValues = { energy: ["1", "2", "3"], location: ["IN", "OUT"], people: ["-", "+"] };
  const selected = { energy: new Set(filterValues.energy), location: new Set(filterValues.location), people: new Set(filterValues.people) };
  let taskCount = "1";

  const render = () => {
    const matchesLocation = (task) => (task.location === "INT" ? selected.location.size > 0 : selected.location.has(task.location));
    const matchesPeople = (task) => (task.people === "=" ? selected.people.size > 0 : selected.people.has(task.people));
    const matchingTasks = tasks.filter((task) => selected.energy.has(task.energy) && matchesLocation(task) && matchesPeople(task));
    const count = taskCount === "all" ? matchingTasks.length : Math.min(Number(taskCount), matchingTasks.length);
    const remainingTasks = [...matchingTasks];
    const displayedTasks =
      taskCount === "all"
        ? matchingTasks
        : Array.from({ length: count }, () => {
            const task = getRandomItem(remainingTasks);
            remainingTasks.splice(remainingTasks.indexOf(task), 1);
            return task;
          });
    const taskList = displayedTasks.length ? displayedTasks.map((task) => `<li>${task.text}</li>`).join("") : "<li>No matching tasks.</li>";
    const content = document.getElementById("reward-content");
    const options = (dimension, values, type = "checkbox") => values.map(([value, label] = [values, values]) => `<label><input type="${type}" name="mood-${dimension}" data-dimension="${dimension}" data-filter="${value}">${label}</label>`).join("");
    content.innerHTML = `<div class="tool-modal mood-lifter-modal"><h3>Mood Lifter</h3><div class="mood-lifter-filters"><fieldset><legend>⚡ Energy</legend>${options(
      "energy",
      filterValues.energy.map((value) => [value, value]),
    )}</fieldset><fieldset><legend>📍</legend>${options(
      "location",
      filterValues.location.map((value) => [value, value]),
    )}</fieldset><fieldset><legend>👥</legend>${options(
      "people",
      filterValues.people.map((value) => [value, value]),
    )}</fieldset><fieldset><legend>Tasks</legend>${options(
      "taskCount",
      [
        ["1", "1"],
        ["3", "3"],
        ["all", "All"],
      ],
      "radio",
    )}</fieldset></div><ul class="mood-lifter-list">${taskList}</ul><div class="mood-lifter-actions"><button id="mood-lifter-random" class="action-btn" type="button">🎲</button><button id="tool-close" class="action-btn modal-close-btn" type="button">✔︎</button></div></div>`;
    content.querySelectorAll("input[data-filter]").forEach((input) => {
      input.checked = input.dataset.dimension === "taskCount" ? input.dataset.filter === taskCount : selected[input.dataset.dimension].has(input.dataset.filter);
      input.onchange = () => {
        if (input.dataset.dimension === "taskCount") taskCount = input.dataset.filter;
        else if (input.checked) selected[input.dataset.dimension].add(input.dataset.filter);
        else selected[input.dataset.dimension].delete(input.dataset.filter);
        render();
      };
    });
    document.getElementById("mood-lifter-random").onclick = render;
    document.getElementById("tool-close").onclick = closeReward;
  };

  openReward('<div class="tool-modal mood-lifter-modal"><h3>Loading Mood Lifter...</h3></div>');
  render();
}

async function openTool(tool) {
  const response = await dbx.filesGetTemporaryLink({ path: tool.path_display });
  const extension = tool.name.split(".").pop().toLowerCase();
  const mediaTag = extension === "mp3" ? "audio" : extension === "mp4" ? "video" : "img";
  openReward(`
    <div class="tool-modal">
      <h3>${tool.name.replace(/\.[^.]+$/, "")}</h3>
      <${mediaTag} id="tool-media" src="${response.result.link}" controls autoplay></${mediaTag}>
      <button id="tool-close" class="action-btn modal-close-btn" type="button">✔︎</button>
    </div>
  `);
  document.getElementById("tool-close").onclick = closeReward;
}

async function openSevenMinuteBreathing() {
  const response = await dbx.filesGetTemporaryLink({ path: "/tools/NoiseWave15.mp3" });
  const duration = 7 * 60;
  rewardLockedUntil = Date.now() + duration * 1000;
  openReward(`
    <div class="tool-modal breathing-modal">
      <h3>7m</h3>
      <div class="breathing-ring" aria-label="Breathing animation"><span></span><span></span><span></span></div>
      <audio id="breathing-audio" src="${response.result.link}" autoplay loop></audio>
      <button id="breathing-close" class="action-btn modal-close-btn" type="button" disabled>07:00</button>
    </div>
  `);

  const closeButton = document.getElementById("breathing-close");
  const timer = closeButton;
  const updateTimer = () => {
    const remaining = Math.max(0, Math.ceil((rewardLockedUntil - Date.now()) / 1000));
    timer.textContent = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
    if (!remaining) {
      rewardLockedUntil = 0;
      document.getElementById("breathing-audio").pause();
      document.getElementById("breathing-audio").currentTime = 0;
      closeButton.disabled = false;
      closeButton.textContent = "✔︎";
      closeButton.onclick = closeReward;
      return;
    }
    window.setTimeout(updateTimer, 1000);
  };
  updateTimer();
  document
    .getElementById("breathing-audio")
    .play()
    .catch(() => {});
}

function openBreathing() {
  const duration = 15 * 60;
  const endTime = Date.now() + duration * 1000;
  openReward(`
    <div class="tool-modal breathing-modal silent-breathing-modal">
      <h3>Breathing</h3>
      <div class="single-breathing-ring" aria-label="Breathing animation">
        <span id="silent-breathing-time">15:00</span>
      </div>
      <button id="silent-breathing-close" class="action-btn modal-close-btn" type="button">✔︎</button>
    </div>
  `);

  const timer = document.getElementById("silent-breathing-time");
  const updateTimer = () => {
    const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    timer.textContent = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
    if (remaining) window.setTimeout(updateTimer, 1000);
  };
  updateTimer();
  document.getElementById("silent-breathing-close").onclick = closeReward;
}

function openWorryBox() {
  openReward(`
    <div class="tool-modal worry-modal">
      <h3>Worry Box</h3>
      <textarea id="worry-box-input" placeholder="Write it down...">${appData.today.worryBox || ""}</textarea>
      <button id="worry-box-save" class="action-btn modal-close-btn" type="button">✔︎</button>
    </div>
  `);
  const input = document.getElementById("worry-box-input");
  input.focus();
  document.getElementById("worry-box-save").onclick = async () => {
    appData.today.worryBox = input.value.trim();
    await saveChanges();
    closeReward();
  };
}

function openQuestPlan(planType, title, tasks, assignments, createDaySelectors) {
  openReward(`<div id="quest-plan-modal" data-plan-type="${planType}"><h3>${title}</h3></div>`);
  createDaySelectors(document.getElementById("quest-plan-modal"), tasks, assignments, planType);
}

async function savePlan(planType) {
  const assignments = {};
  const controlSelector = planType === "monthly" ? ".task-input" : ".task-select";
  document.querySelectorAll(`#quest-plan-modal ${controlSelector}`).forEach((control) => {
    assignments[control.dataset.day] = control.value.trim();
  });

  if (planType === "weekly") {
    let newEveningText = "";
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
      newEveningText += `[${day}] ${assignments[day] || "None"}\n`;
    }
    await saveFileToDropbox(dbx, "EveningTasks.md", newEveningText);
    appData.today.eveningQ = assignments[dayOfWeek] || "";
    updateQuestText("eveningQ", appData.today.eveningQ);
  } else {
    appData.plan = { ...(appData.plan || {}), monthlyAssignments: assignments };
    appData.today.mainQ = assignments[dayOfWeek] || "";
    updateQuestText("mainQ", appData.today.mainQ);
  }
  await saveChanges();
  closeReward();
}

function updateQuestText(taskType, text) {
  const taskElement = document.getElementById(`${taskType}-task`);
  if (text.includes("[")) renderLinkTask(taskElement, text);
  else taskElement.textContent = text;
}

/* =========================
  UTILS
========================= */
document.getElementById(`daily-stats`).onclick = async () => {
  generateDayilyReport(appData);
};

function generateDayilyReport(data) {
  const t = data.today;
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB").replace(/\//g, "/").slice(0, 10);

  const check = (val) => (val ? "✓" : "✗");
  const foodParts = [];
  if (t.ifFoodPlan) foodParts.push("plan");
  if (t.ifWater) foodParts.push("h2o");
  if (t.ifLimits) foodParts.push("lim");
  const foodLine = foodParts.join(", ");

  const text = `${dateStr}
🎯 ${check(t.ifMorningQ)} ${check(t.ifMainQ)} ${check(t.ifEveningQ)}
🌙 ${check(t.ifCleanUp)}
😶 ${check(t.ifCheckIn)}
🍽 ${foodLine}
🏃 ${data.weekly.activityMinutes}`;

  navigator.clipboard
    .writeText(text)
    .then(() => generateReward("", "random-img"))
    .catch((err) => console.error("Clipboard error:", err));

  return;
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

window.showScreen = showScreen;

function initTabs(sectionId) {
  const section = document.getElementById(sectionId);
  if (!section) return;

  const buttons = section.querySelectorAll(".tab-btn[data-tab]");
  buttons.forEach((button) => {
    button.onclick = () => {
      // console.log(`Tab click: ${button.dataset.tab} in section ${sectionId}`);
      const tab = button.dataset.tab;
      buttons.forEach((btn) => btn.classList.toggle("active", btn === button));
      section.querySelectorAll(".tab-content").forEach((content) => {
        content.classList.toggle("active", content.dataset.tab === tab);
      });
    };
  });
}

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
