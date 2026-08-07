import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(".");
const artifacts = resolve("qa-artifacts/time-controller");
const qaRoot = resolve("qa-local-browser");
const scenarioDir = join(qaRoot, "scenarios");
const db = join(qaRoot, "humanos-qa.db");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const apiPort = 8798;
const webPort = 8777;
const cdpPort = 9344;
const apiBase = `http://127.0.0.1:${apiPort}`;
const profile = mkdtempSync(join(tmpdir(), "humanos-qa-controller-"));
mkdirSync(artifacts, { recursive: true });
rmSync(qaRoot, { recursive: true, force: true });
mkdirSync(scenarioDir, { recursive: true });

const env = {
  ...process.env,
  HUMANOS_TEST_MODE: "1",
  HUMANOS_QA_DB: "1",
  HUMANOS_TEST_NOW: "2026-08-03T08:45:00+08:00",
  HUMANOS_TEST_TIME_SCALE: "0",
  HUMANOS_DB_PATH: db,
  HUMANOS_QA_SCENARIO_DIR: scenarioDir,
  PORT: String(apiPort),
};
const generated = spawnSync("python", ["scripts/generate_qa_scenarios.py"], { cwd: root, env, encoding: "utf8" });
if (generated.status !== 0) throw new Error(generated.stderr || generated.stdout || "Scenario generation failed");
const backend = spawn("python", ["backend/humanos_server.py"], { cwd: root, env, stdio: "ignore" });
const frontend = spawn("python", ["-m", "http.server", String(webPort), "--bind", "127.0.0.1"], { cwd: resolve("frontend"), stdio: "ignore" });
const browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, "--window-size=1440,1000", "about:blank"], { stdio: "ignore" });
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
async function waitJson(url) {
  for (let i = 0; i < 120; i += 1) {
    try { const response = await fetch(url); if (response.ok) return response.json(); } catch {}
    await wait(100);
  }
  throw new Error(`Timed out: ${url}`);
}

let socket;
let sequence = 0;
const pending = new Map();
function command(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveCommand, rejectCommand) => pending.set(id, { resolveCommand, rejectCommand }));
}
async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function waitFor(expression, attempts = 180) {
  for (let i = 0; i < attempts; i += 1) {
    try { if (await evaluate(expression)) return; } catch {}
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}
async function shot(name) {
  const result = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  writeFileSync(join(artifacts, name), Buffer.from(result.data, "base64"));
}
async function loadScenario(id) {
  await evaluate(`loadQaScenario(${JSON.stringify(id)})`);
  await waitFor(`qaActiveScenarioId === ${JSON.stringify(id)}`);
  return fetch(`${apiBase}/api/execution-sessions/current?user_id=${manifest.qa_user.id}`).then((response) => response.json());
}

const checks = [];
function check(name, passed, detail = "") {
  checks.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`Failed: ${name} ${detail}`);
}
let manifest;
try {
  await waitJson(`${apiBase}/api/health`);
  manifest = await waitJson(`${apiBase}/api/qa-scenarios`);
  await waitJson(`http://127.0.0.1:${cdpPort}/json/version`);
  const pageUrl = `http://127.0.0.1:${webPort}/index.html?api=${encodeURIComponent(apiBase)}`;
  const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" }).then((response) => response.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveSocket, rejectSocket) => { socket.addEventListener("open", resolveSocket, { once: true }); socket.addEventListener("error", rejectSocket, { once: true }); });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id); pending.delete(message.id);
    message.error ? waiter.rejectCommand(message.error) : waiter.resolveCommand(message.result);
  });
  await command("Page.enable"); await command("Runtime.enable");
  await waitFor("document.readyState === 'complete' && document.getElementById('qaTimeController') && !document.getElementById('qaTimeController').classList.contains('hidden')");
  await evaluate("qaTimeController.open=true");
  check("QA controller is visible only because qa_mode is enabled", await evaluate("!qaTimeController.classList.contains('hidden')"));
  await shot("qa-time-controller-01-login.png");

  await evaluate(`authEmail.value=${JSON.stringify(manifest.qa_user.email)};authPassword.value=${JSON.stringify(manifest.qa_user.password)};authForm.requestSubmit()`);
  await waitFor("!appRoot.classList.contains('hidden')");
  if (await evaluate("Boolean(dailyCheckInDialog?.open)")) await evaluate("keepTodayPlanBtn.click()");

  const beforeSessions = await fetch(`${apiBase}/api/execution-sessions?user_id=${manifest.qa_user.id}`).then((response) => response.json());
  await evaluate("document.querySelector('[data-qa-minutes=\"15\"]').click()");
  await waitFor("sharedTestClock.simulated_now.includes('09:00:00')");
  const afterSessions = await fetch(`${apiBase}/api/execution-sessions?user_id=${manifest.qa_user.id}`).then((response) => response.json());
  check("Time-only advance does not fabricate execution actions", beforeSessions.execution_sessions.every((item, index) => item.status === afterSessions.execution_sessions[index].status));

  await evaluate("document.getElementById('qaCustomTime').value='2026-08-03T09:30';document.getElementById('qaApplyCustomTime').click()");
  await wait(500);
  const customState = await evaluate("({now:sharedTestClock.simulated_now,status:qaControllerStatus.innerText,value:document.getElementById('qaCustomTime').value})");
  check("Custom forward time uses the Unified Clock", Date.parse(customState.now) === Date.parse("2026-08-03T09:30:00+08:00"), JSON.stringify(customState));

  let current = await loadScenario("running_20");
  check("Running 20 snapshot", current.mode === "now" && current.session.status === "running", JSON.stringify(current));
  current = await loadScenario("paused");
  check("Paused snapshot", current.mode === "paused" && current.session.status === "paused", JSON.stringify(current));
  await wait(350);
  if (await evaluate("Boolean(dailyCheckInDialog?.open)")) {
    await evaluate("keepTodayPlanBtn.click()");
    await waitFor("dailyCheckInDialog?.open === false");
  }
  await evaluate("qaTimeController.open=true;render()");
  await wait(150);
  await shot("qa-time-controller-02-paused.png");

  current = await loadScenario("before_15");
  check("Backward jump restored independent history", current.mode === "up_next" && current.session.status === "ready", JSON.stringify(current));
  current = await loadScenario("ended");
  check("Ended pending feedback snapshot", current.mode === "awaiting_feedback" || current.session.status === "ended", JSON.stringify(current));
  await loadScenario("partial_feedback");
  const feedback = await fetch(`${apiBase}/api/execution-sessions?user_id=${manifest.qa_user.id}`).then((response) => response.json());
  check("Partial feedback snapshot persisted feedback outcome", feedback.execution_sessions.some((item) => item.completion_outcome === "partial"));

  await loadScenario("plan_v2");
  const activePlan = await fetch(`${apiBase}/api/plans/active?user_id=${manifest.qa_user.id}&week_id=2026-08-03`).then((response) => response.json());
  check("Plan v2 confirmed snapshot", activePlan.plan.plan_revision === 2 && activePlan.plan.plan_status === "confirmed");

  await loadScenario("sunday_2359");
  check("Sunday 23:59 preset", (await evaluate("window.HumanOSTestClock.state().week_id")) === "2026-08-03");
  await loadScenario("new_week");
  check("New week preset refreshes rollover", (await evaluate("window.HumanOSTestClock.state().week_id")) === "2026-08-10");
  await shot("qa-time-controller-03-new-week.png");

  await evaluate("document.getElementById('qaAutoPlayRate').value='15';document.getElementById('qaAutoPlayBtn').click()");
  const autoBefore = Date.parse(await evaluate("window.HumanOSTestClock.state().now"));
  await wait(1200);
  const autoAfter = Date.parse(await evaluate("window.HumanOSTestClock.state().now"));
  check("Auto-play advances the shared clock", autoAfter - autoBefore >= 10 * 60 * 1000, `${autoAfter - autoBefore}ms`);
  await evaluate("document.getElementById('qaAutoPlayBtn').click()");

  await evaluate("window.confirm=()=>true;document.getElementById('qaResetBtn').click();document.getElementById('qaResetConfirmCheck').click();document.getElementById('qaResetConfirmBtn').click()");
  await waitFor("qaActiveScenarioId === 'base'");
  const resetState = await fetch(`${apiBase}/api/execution-sessions/current?user_id=${manifest.qa_user.id}`).then((response) => response.json());
  check("Double-confirm reset restores baseline", resetState.mode === "up_next" && resetState.session.status === "ready");

  const report = { passed: checks.every((item) => item.passed), checks, screenshots: 3, api_base: apiBase };
  writeFileSync(join(artifacts, "qa-time-controller-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  try { socket?.close(); } catch {}
  browser.kill(); backend.kill(); frontend.kill();
  await wait(300);
  rmSync(profile, { recursive: true, force: true });
}
