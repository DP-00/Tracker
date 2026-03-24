/* =========================
   DROPBOX SETUP
========================= */

const REDIRECT_URI = `${window.location.origin}/Tracker/`; //"http://localhost:8000/";
// const REDIRECT_URI = "http://localhost:8000/"; //"http://localhost:8000/";
const CLIENT_ID = "7ctgzhwolmiq6kc"; // <-- your client id
let dbxAuth = new Dropbox.DropboxAuth({ clientId: CLIENT_ID });
dbx = new Dropbox.Dropbox({ auth: dbxAuth });

/* =========================
   AUTH HELPERS
========================= */

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
   FILE FETCHING (DROPBOX)
========================= */
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

/* =========================
   UTIL
========================= */

function loadApp() {
  loadQuest("morning", "MorningTasks.md", "comic");
  loadQuest("main", "MonthlyTasks.md", "citation");
  loadQuest("evening", "EveningTasks.md", "citation");
  loadCleanUpTasks();
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// /* =========================
//    QUESTS
// ========================= */

async function loadQuest(questType, fileName, rewardType) {
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

  document.getElementById(`${questType}-task`).textContent = task;

  document.getElementById(`${questType}-btn`).onclick = async () => {
    document.getElementById(`${questType}-btn`).textContent = "🎁";
    document.getElementById(`${questType}-task`).style.opacity = "33%";

    if (rewardType === "comic") {
      const url = await getRandomComic();
      openReward(`<img src="${url}" style="width:100%">`);
    } else if (rewardType === "citation") {
      const txt = await getRandomCitation();
      openReward(txt);
    }
  };
}

/* =========================
   CHECK-IN
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
    if (comicUrl) {
      doneDiv.innerHTML = `<img src="${comicUrl}" style="width:100%; border-radius:8px;">`;
    } else {
      doneDiv.textContent = "No comic available";
    }

    doneDiv.style.display = "block";
  } else {
    list.style.display = "block";
    doneDiv.style.display = "none";
  }
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
  circle.style.strokeDashoffset = offset;
}

function updateAllRings(mainValues, overlayValues) {
  mainValues.forEach((val, i) => {
    const ring = document.getElementById("ring" + (i + 1));
    const label = document.getElementById("p" + (i + 1));

    setRingProgress(ring, val);
    label.textContent = val + "%";
  });

  overlayValues.forEach((val, i) => {
    const ring = document.getElementById("overlay" + (i + 1));
    setOverlayProgress(ring, val);
  });
}

function setOverlayProgress(circle, percent) {
  const r = circle.getAttribute("r");
  const circumference = 2 * Math.PI * r;

  circle.style.strokeDasharray = circumference;

  const offset = circumference * (1 - percent / 100);
  circle.style.strokeDashoffset = offset;
}

/* DEMO */
// updateRings([72, 55, 38, 61, 27]);
updateAllRings(
  [72, 55, 38, 61, 27], // main (animated)
  [60, 70, 50, 80, 10], // overlay (static target)
);
