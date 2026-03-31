let appData = null;
let isDayLoaded = false;
let month = new Date().toLocaleString("default", { month: "short" });

/* =========================
   DROPBOX
========================= */

const REDIRECT_URI = `${window.location.origin}/Tracker/`; //"http://localhost:8000/";
// const REDIRECT_URI = "http://localhost:8000/"; //"http://localhost:8000/";
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
  const pathToFetch = `/${file}`; // App folder root
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

async function saveDataToDropbox(data) {
  try {
    const jsonString = JSON.stringify(data, null, 2);

    console.log("Uploading JSON to Dropbox...");
    console.log("Size:", jsonString.length);

    await dbx.filesUpload({
      path: "/data.json", // root of your app folder
      mode: "overwrite",
      contents: jsonString,
    });

    console.log("✅ Saved to Dropbox successfully");
  } catch (err) {
    console.error("❌ Error saving to Dropbox:", err);
  }
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

    // ✅ START APP ONLY AFTER AUTH
    loadApp();
  } catch (error) {
    console.error("Auth error:", error);
  }
};

/* =========================
   APP LOGIC
========================= */

function loadApp() {
  document.getElementById("load-save-day").onclick = async () => {
    const todayKey = "tracker_" + new Date().toISOString().split("T")[0];

    if (!isDayLoaded) {
      const cached = localStorage.getItem(todayKey);
      if (cached) {
        console.log("Loaded from localStorage");
        appData = JSON.parse(cached);
      } else {
        appData = JSON.parse(await fetchFile("data.json"));
        console.log("Loaded app data:", appData.today);
      }
      loadQuest("morning", "MorningTasks.md", "comic");
      loadQuest("main", "MonthlyTasks.md", "citation");
      loadQuest("evening", "EveningTasks.md", "citation");
      loadCleanUpTasks();
      loadCheckIn("checkIn", "citation");
      loadCheckIn("foodPlan", "comics");
      loadCheckIn("limits", "citation");
      await saveDataToDropbox(appData);
      isDayLoaded = true;
      localStorage.setItem(todayKey, JSON.stringify(appData));

      document.getElementById("load-save-day").textContent = isDayLoaded ? "Save the Day" : "Load the Day";

      // let month = new Date().toLocaleString("default", { month: "short" });
      updateAllRings(
        [appData.monthly[month].morningQ / 30, appData.monthly[month].mainQ / 30, appData.monthly[month].eveningQ / 30, appData.monthly[month].cleanUp / 30, appData.monthly[month].checkIn / 30], // overlay (static target)
        [appData.yearly.morningQ, appData.yearly.mainQ, appData.yearly.eveningQ, appData.yearly.cleanUp, appData.yearly.checkIn], // main (animated)
      );
    } else {
      const t = appData.today;
      const m = appData.monthly[month];

      if (t.ifMorningQ) m.morningQ++;
      if (t.ifMainQ) m.mainQ++;
      if (t.ifEveningQ) m.eveningQ++;
      if (t.ifCleanUp) m.cleanUp++;
      if (t.ifCheckIn) m.checkIn++;

      console.log("Saved stats:", appData);

      const todayKey = "tracker_" + new Date().toISOString().split("T")[0];

      localStorage.setItem(todayKey, JSON.stringify(appData));
      isDayLoaded = false;

      await saveDataToDropbox(appData);

      document.getElementById("load-save-day").textContent = isDayLoaded ? "Save the Day" : "Load the Day";
    }
  };
}

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
// /* =========================
//    QUESTS
// ========================= */

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
        const url = await getRandomComic();
        appData.today[`${questType}QReward`] = `<img src="${url}" style="width:100%">`;
      } else if (rewardType === "citation") {
        appData.today[`${questType}QReward`] = await getRandomCitation();
      }
    }
    openReward(appData.today[`${questType}QReward`]);
  };
}

// // /* =========================
// //    QUESTS
// // ========================= */

// async function loadQuest(questType, fileName, rewardType) {
//   appData.today[`if${capitalize(questType)}Q`] = false;
//   const text = await fetchFile(fileName);

//   let task = "";

//   if (questType === "morning") {
//     const tasks = text.split("\n").filter((line) => line.trim());
//     task = getRandomItem(tasks);
//   } else if (questType === "main") {
//     const lines = text.split("\n");
//     const currentMonth = new Date().toLocaleString("default", {
//       month: "long",
//     });

//     let inSection = false;
//     for (const line of lines) {
//       if (line.startsWith("## " + currentMonth)) {
//         inSection = true;
//       } else if (line.startsWith("## ") && inSection) {
//         break;
//       } else if (inSection && line.trim()) {
//         task = line.trim();
//         break;
//       }
//     }
//   } else if (questType === "evening") {
//     const tasks = text.split("\n").filter((line) => line.trim());
//     const day = new Date().toLocaleString("default", {
//       weekday: "long",
//     });

//     for (const t of tasks) {
//       const end = t.indexOf("]");
//       const condition = t.substring(1, end);

//       if (condition == day) {
//         task = t.substring(end + 1).trim();
//         break;
//       }
//     }
//   }

//   appData.today[`${questType}Q`] = task;
//   document.getElementById(`${questType}-task`).textContent = task;
//   await saveDataToDropbox(appData);
//   document.getElementById(`${questType}-btn`).onclick = async () => {
//     if (!appData.today[`if${capitalize(questType)}Q`]) {
//       appData.today[`if${capitalize(questType)}Q`] = true;
//       document.getElementById(`daily-stats-${questType}`).classList.add("complete");

//       document.getElementById(`${questType}-btn`).textContent = "🎁";
//       document.getElementById(`${questType}-task`).style.opacity = "33%";
//       if (rewardType === "comic") {
//         const url = await getRandomComic();
//         appData.today[`${questType}QReward`] = `<img src="${url}" style="width:100%">`;
//       } else if (rewardType === "citation") {
//         appData.today[`${questType}QReward`] = await getRandomCitation();
//       }
//     }
//     openReward(appData.today[`${questType}QReward`]);
//   };
// }
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
    const comicUrl = await getRandomComic();
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
    if (!appData.today[`if${capitalize(checkInType)}`]) {
      appData.today[`if${capitalize(checkInType)}`] = true;
      document.getElementById(`daily-stats-${checkInType}`).classList.add("complete");
      document.getElementById(`${checkInType}-btn`).textContent = "🎁";
      document.getElementById(`${checkInType}-task`).style.opacity = "33%";
      if (rewardType === "comic") {
        const url = await getRandomComic();
        appData.today[`${checkInType}Reward`] = `<img src="${url}" style="width:100%">`;
      } else if (rewardType === "citation") {
        appData.today[`${checkInType}Reward`] = await getRandomCitation();
      }
    }
    openReward(appData.today[`${checkInType}Reward`]);
  };
}

/* =========================
    REWARDS
========================= */

function openReward(content) {
  const popup = document.getElementById("reward-popup");
  const box = document.getElementById("reward-content");

  box.innerHTML = content;
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

async function getRandomComic() {
  try {
    console.log("Fetching comics list...");

    const response = await dbx.filesListFolder({
      path: "/comics", // folder inside your App folder
    });

    const files = response.result.entries.filter((f) => f[".tag"] === "file");

    console.log(
      "Comics found:",
      files.map((f) => f.name),
    );

    if (files.length === 0) {
      console.warn("No comics found!");
      return null;
    }

    const randomFile = files[Math.floor(Math.random() * files.length)];
    console.log("Selected comic:", randomFile.name);

    const linkResponse = await dbx.filesGetTemporaryLink({
      path: "/comics/" + randomFile.name,
    });

    return linkResponse.result.link;
  } catch (err) {
    console.error("Error fetching comic:", err);
    return null;
  }
}

// /* =========================
// STATS
// /* ========================= */
function setRingProgress(circle, percent) {
  const r = circle.getAttribute("r");
  const circumference = 2 * Math.PI * r;

  circle.style.strokeDasharray = circumference;

  const offset = circumference * (1 - percent / 100);
  circle.style.strokeDashoffset = offset.toFixed(0);
}

function updateAllRings(mainValues, overlayValues) {
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
}
