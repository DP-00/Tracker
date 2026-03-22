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

function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

/* =========================
   APP LOADER
========================= */

function loadApp() {
  loadMorningTask();
  loadMainTask();
  loadEveningTasks();
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

/* =========================
   MORNING
========================= */

async function loadMorningTask() {
  const text = await fetchFile("MorningTasks.md");
  const tasks = text.split("\n").filter((line) => line.trim());

  const task = getRandomItem(tasks);
  const container = document.getElementById("morning-task");

  container.innerHTML = "";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  // checkbox.addEventListener("change", checkMorningComplete);
  checkbox.addEventListener("change", (e) => {
    const row = e.target.closest(".task-row");
    row.classList.toggle("checked", e.target.checked);

    checkMorningComplete();
  });

  // container.appendChild(checkbox);
  // container.appendChild(document.createTextNode(" " + task));
  const wrapper = document.createElement("div");
  wrapper.className = "task-row";

  const text2 = document.createElement("span");
  text2.textContent = task;

  wrapper.appendChild(text2);
  wrapper.appendChild(checkbox);

  container.appendChild(wrapper);
}

async function checkMorningComplete() {
  const taskDiv = document.getElementById("morning-task");
  const doneDiv = document.getElementById("morning-done");
  const checkbox = taskDiv.querySelector('input[type="checkbox"]');

  if (checkbox.checked) {
    taskDiv.style.display = "none";

    const comicUrl = await getRandomComic();

    if (comicUrl) {
      doneDiv.innerHTML = `<img src="${comicUrl}" style="width:100%; border-radius:8px;">`;
    } else {
      doneDiv.textContent = "No comic available";
    }

    doneDiv.style.display = "block";
  } else {
    taskDiv.style.display = "block";
    doneDiv.style.display = "none";
  }
}

/* =========================
   MAIN
========================= */

async function loadMainTask() {
  const text = await fetchFile("MonthlyTasks.md");
  const lines = text.split("\n");

  const currentMonth = new Date().toLocaleString("default", {
    month: "long",
  });

  let task = "";
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

  const container = document.getElementById("main-task");
  container.innerHTML = "";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  // checkbox.addEventListener("change", checkMainComplete);
  checkbox.addEventListener("change", (e) => {
    const row = e.target.closest(".task-row");
    row.classList.toggle("checked", e.target.checked);

    checkMainComplete();
  });

  // container.appendChild(checkbox);
  // container.appendChild(document.createTextNode(" " + task));
  const wrapper = document.createElement("div");
  wrapper.className = "task-row";

  const text2 = document.createElement("span");
  text2.textContent = task;

  wrapper.appendChild(text2);
  wrapper.appendChild(checkbox);

  container.appendChild(wrapper);
}

async function checkMainComplete() {
  const taskDiv = document.getElementById("main-task");
  const doneDiv = document.getElementById("main-done");
  const checkbox = taskDiv.querySelector('input[type="checkbox"]');

  if (checkbox.checked) {
    taskDiv.style.display = "none";

    const done = await getRandomCitation();
    doneDiv.textContent = done;
    doneDiv.style.display = "block";
  } else {
    taskDiv.style.display = "block";
    doneDiv.style.display = "none";
  }
}

/* =========================
   EVENING
========================= */

async function loadEveningTasks() {
  const text = await fetchFile("EveningTasks.md");
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
      // const li = document.createElement("li");

      // const checkbox = document.createElement("input");
      // checkbox.type = "checkbox";
      // checkbox.addEventListener("change", checkEveningComplete);

      // li.appendChild(checkbox);
      // li.appendChild(document.createTextNode(task.replace(/^-+\s*/, "")));

      // list.appendChild(li);

      const li = document.createElement("li");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      // checkbox.addEventListener("change", () => checkEveningComplete());
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

    const done = await getRandomCitation();
    doneDiv.textContent = done;
    doneDiv.style.display = "block";
  } else {
    list.style.display = "block";
    doneDiv.style.display = "none";
  }
}

/* =========================
   CITATIONS
========================= */

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
