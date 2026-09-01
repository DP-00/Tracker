const CATEGORIES = [
  ["overstim", "🫠", "🧠", "😵‍💫", "#21172a"],
  ["bodyBat", "😴", "⚡", "🫨", "#3a0e0b"],
  ["socialBat", "👤", "🎭", "👥", "#6c3424"],
  ["temp", "❆", "🌡", "🔥", "#6c4c25"],
  ["food", "🥣", "🍽︎", "🍜", "#122820"],
  ["water", "🥤", "💧", "🚽", "#183f4a"],
];

export async function initActionPlan(appData, dbx) {
  const container = document.getElementById("action-plan-steps");
  const stepCount = document.getElementById("action-plan-step-count");
  const previousButton = document.getElementById("action-plan-previous");
  const nextButton = document.getElementById("action-plan-next");
  const levels = {};
  const steps = [createThermometerStep(appData, levels), createImageStep("FW1.svg", "fw1"), createImageStep("FW2.svg", "fw2"), createImageStep("FW3.svg", "fw3"), createImageStep("tc.svg", "tc")];
  let currentStep = 0;

  container.replaceChildren(...steps);
  window.requestAnimationFrame(() => positionThermometers(steps[0]));
  const showStep = (step) => {
    steps.forEach((item, index) => (item.hidden = index !== step));
    if (step > 0) window.requestAnimationFrame(() => setupDrawingCanvas(steps[step]));
    stepCount.textContent = `${step + 1} / ${steps.length}`;
    previousButton.disabled = step === 0;
    nextButton.disabled = step === steps.length - 1;
  };
  previousButton.onclick = () => {
    if (currentStep > 0) showStep(--currentStep);
  };
  nextButton.onclick = () => {
    if (currentStep < steps.length - 1) showStep(++currentStep);
  };
  showStep(currentStep);

  await Promise.all(steps.slice(1).map((step) => loadActionPlanImage(step, dbx)));
}

function createThermometerStep(appData, levels) {
  const step = document.createElement("div");
  step.className = "action-plan-step thermometer-step";
  const grid = document.createElement("div");
  grid.className = "thermometer-grid";
  step.appendChild(grid);

  CATEGORIES.forEach(([name, lowIcon, neutralIcon, highIcon, color]) => {
    levels[name] = 0;
    const thermometer = document.createElement("div");
    thermometer.className = "thermometer";
    thermometer.style.setProperty("--thermometer-color", color);
    thermometer.innerHTML = `<span class="thermometer-max">${highIcon}</span><div class="thermometer-control"><span class="thermometer-value">${neutralIcon}</span><input class="thermometer-track" type="range" min="-3" max="3" step="1" value="0" aria-label="${name}"></div><span class="thermometer-min">${lowIcon}</span>`;
    const track = thermometer.querySelector(".thermometer-track");
    const value = thermometer.querySelector(".thermometer-value");
    const update = (level) => {
      levels[name] = level;
      value.textContent = neutralIcon;
      track.value = level;
      track.style.setProperty("--battery-level", `${((level + 3) / 6) * 100}%`);
      positionThermometerIcon(thermometer, level);
    };
    track.oninput = () => update(Number(track.value));
    grid.appendChild(thermometer);
    update(0);
  });
  appData.today.actionPlanLevels = levels;
  return step;
}

function positionThermometers(step) {
  step.querySelectorAll(".thermometer").forEach((thermometer) => {
    const track = thermometer.querySelector(".thermometer-track");
    positionThermometerIcon(thermometer, Number(track.value));
  });
}

function positionThermometerIcon(thermometer, level) {
  const value = thermometer.querySelector(".thermometer-value");
  value.style.top = `${((3 - level) / 6) * 100}%`;
}

function createImageStep(fileName, imageId) {
  const step = document.createElement("div");
  step.className = "action-plan-step image-step";
  step.innerHTML = `<div class="action-plan-image-wrap"><span id="${imageId}-loading">Loading...</span><img id="${imageId}" alt="Action Plan" draggable="false" hidden><canvas class="action-plan-drawing" hidden></canvas></div><div class="drawing-actions"><button class="draw-toggle-btn" type="button" aria-label="Draw" title="Draw" hidden>✎</button><button class="clear-drawing-btn" type="button" aria-label="Clear drawing" title="Clear drawing" hidden>⌫</button></div>`;
  step.dataset.fileName = fileName;
  step.dataset.imageId = imageId;
  return step;
}

async function loadActionPlanImage(step, dbx) {
  const image = step.querySelector("img");
  const loading = step.querySelector("span");
  image.onload = () => setupDrawingCanvas(step);
  try {
    const response = await dbx.filesGetTemporaryLink({ path: `/actionPlan/${step.dataset.fileName}` });
    image.src = response.result.link;
    image.hidden = false;
    loading.remove();
  } catch (error) {
    loading.textContent = `Unable to load ${step.dataset.fileName}`;
  }
}

function setupDrawingCanvas(step) {
  const image = step.querySelector("img");
  const canvas = step.querySelector("canvas");
  const drawButton = step.querySelector(".draw-toggle-btn");
  const clearButton = step.querySelector(".clear-drawing-btn");
  if (!image.complete || !image.clientWidth) return;
  image.draggable = false;
  const bounds = image.getBoundingClientRect();
  const wrapperBounds = image.parentElement.getBoundingClientRect();
  const alreadyInitialized = canvas.dataset.initialized === "true";
  if (!alreadyInitialized) {
    canvas.width = image.clientWidth;
    canvas.height = image.clientHeight;
    canvas.dataset.initialized = "true";
  }
  canvas.style.width = `${image.clientWidth}px`;
  canvas.style.height = `${image.clientHeight}px`;
  canvas.style.left = `${bounds.left - wrapperBounds.left}px`;
  canvas.style.top = `${bounds.top - wrapperBounds.top}px`;
  const drawingActive = canvas.dataset.active === "true";
  canvas.hidden = !drawingActive;
  canvas.style.display = drawingActive ? "block" : "none";
  canvas.style.pointerEvents = drawingActive ? "auto" : "none";
  drawButton.hidden = false;
  clearButton.hidden = false;

  const context = canvas.getContext("2d");
  let drawing = false;
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
  };
  canvas.onpointerdown = (event) => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const position = point(event);
    context.beginPath();
    context.moveTo(position.x, position.y);
  };
  canvas.onpointermove = (event) => {
    if (!drawing) return;
    const position = point(event);
    context.lineTo(position.x, position.y);
    context.stroke();
  };
  canvas.onpointerup = () => (drawing = false);
  canvas.onpointercancel = () => (drawing = false);
  context.strokeStyle = "#00000038";
  context.globalAlpha = 0.3;
  context.lineWidth = 15;
  context.lineCap = "round";
  drawButton.onclick = () => {
    canvas.hidden = !canvas.hidden;
    canvas.style.display = canvas.hidden ? "none" : "block";
    canvas.style.pointerEvents = canvas.hidden ? "none" : "auto";
    canvas.dataset.active = String(!canvas.hidden);
    drawButton.textContent = canvas.hidden ? "✎" : "■";
    drawButton.setAttribute("aria-label", canvas.hidden ? "Draw" : "Stop drawing");
    drawButton.title = canvas.hidden ? "Draw" : "Stop drawing";
  };
  clearButton.onclick = () => context.clearRect(0, 0, canvas.width, canvas.height);
}
