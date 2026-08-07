import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(".");
const artifacts = resolve("qa-artifacts");
const db = resolve("qa-artifacts/unified-clock-qa.db");
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const apiPort = 8792;
const cdpPort = 9342;
const apiBase = `http://127.0.0.1:${apiPort}`;
const browserProfile = mkdtempSync(join(tmpdir(), "humanos-unified-clock-"));
mkdirSync(artifacts, { recursive: true });

const baseEnv = {
  ...process.env,
  HUMANOS_TEST_MODE: "1",
  HUMANOS_TEST_NOW: "2026-08-03T08:45:00+08:00",
  HUMANOS_TEST_TIME_SCALE: "0",
  HUMANOS_DB_PATH: db,
  PORT: String(apiPort),
};
const seed = spawnSync("python", ["scripts/seed_unified_clock_qa.py"], { cwd: root, env: baseEnv, encoding: "utf8" });
if (seed.status !== 0) throw new Error(seed.stderr || seed.stdout || "Seed failed");
const seedInfo = JSON.parse(seed.stdout.trim().split(/\r?\n/).at(-1));
copyFileSync(db, resolve("qa-artifacts/unified-clock-before.db"));

const backend = spawn("python", ["backend/humanos_server.py"], { cwd: root, env: baseEnv, stdio: "ignore" });
const pageUrl = `${pathToFileURL(resolve("data-foundry-share/humanos-data-foundry-syy7.html")).href}?api=${encodeURIComponent(apiBase)}`;
const browser = spawn(chrome, [
  "--headless=new", "--disable-gpu", "--no-first-run",
  `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${browserProfile}`,
  "--window-size=1440,900", "about:blank",
], { stdio: "ignore" });
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
async function waitJson(url) {
  for (let i = 0; i < 100; i += 1) {
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
async function waitFor(expression, attempts = 160) {
  for (let i = 0; i < attempts; i += 1) {
    if (await evaluate(expression)) return;
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}
async function shot(name) {
  const result = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
  writeFileSync(join(artifacts, name), Buffer.from(result.data, "base64"));
}

const timeline = [];
async function checkpoint(label, assertion, extra = {}) {
  const state = await evaluate(`(() => {
    const session = currentExecutionState?.session || {};
    const task = currentExecutionState?.task || tasks.find(item => String(item.id) === String(session.task_id)) || {};
    return {
      simulated_at: window.HumanOSTestClock?.state().now || null,
      week_id: weekStartLabel(),
      plan_id: confirmedSchedulePlan?.plan_id || pendingSchedulePlan?.plan_id || null,
      plan_revision: confirmedSchedulePlan?.plan_revision || pendingSchedulePlan?.plan_revision || null,
      plan_status: confirmedSchedulePlan?.plan_status || pendingSchedulePlan?.plan_status || null,
      task_id: session.task_id || task.id || null,
      slot_id: session.block_id || null,
      execution_session_id: session.execution_session_id || null,
      ui_mode: currentExecutionState?.mode || 'empty',
      planned_start_at: session.planned_start_at || null,
      planned_end_at: session.planned_end_at || null,
      actual_start_at: session.actual_start_at || null,
      actual_end_at: session.actual_end_at || null,
      active_minutes: executionElapsedMinutes(session),
      session_remaining_minutes: Math.max(Number(session.planned_work_minutes || 0) - executionElapsedMinutes(session), 0),
      task_remaining_minutes: task.id ? taskWorkRemainingMinutes(task) : null,
      visible_text: nowCard?.innerText || '',
      daily_checkin_open: Boolean(dailyCheckInDialog?.open),
      week_rollover_open: Boolean(weekRolloverDialog?.open)
    };
  })()`);
  timeline.push({ label, ...state, ...extra, assertion_result: assertion(state) ? "passed" : "failed" });
  if (timeline.at(-1).assertion_result !== "passed") throw new Error(`Assertion failed at ${label}: ${JSON.stringify(state)}`);
  return state;
}

try {
  await waitJson(`${apiBase}/api/health`);
  await waitJson(`http://127.0.0.1:${cdpPort}/json/version`);
  const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" }).then((response) => response.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveSocket, rejectSocket) => {
    socket.addEventListener("open", resolveSocket, { once: true });
    socket.addEventListener("error", rejectSocket, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    message.error ? waiter.rejectCommand(message.error) : waiter.resolveCommand(message.result);
  });
  await command("Page.enable");
  await command("Runtime.enable");
  await waitFor("document.readyState === 'complete'");
  await evaluate(`authEmail.value='${seedInfo.email}';authPassword.value='${seedInfo.password}';authForm.requestSubmit()`);
  await waitFor("!appRoot.classList.contains('hidden') && Boolean(window.HumanOSTestClock)");
  await waitFor("dailyCheckInDialog?.open === true");
  await shot("unified-clock-01-daily-checkin.png");
  await evaluate("dailyFocus.value='7';dailyEnergy.value='6';dailyStress.value='3';dailyEmotion.value='positive';dailyCheckInForm.requestSubmit()");
  await waitFor("dailyCheckInDialog?.open === false");

  await checkpoint("Monday 08:45 Up Next", (s) => s.ui_mode === "up_next" && /Starts in 15 min/.test(s.visible_text));
  await shot("unified-clock-02-up-next-0845.png");
  await evaluate("window.HumanOSTestClock.setTime('2026-08-03T08:59:00+08:00')");
  await checkpoint("Monday 08:59 countdown", (s) => s.ui_mode === "up_next" && /Starts in 1 min/.test(s.visible_text));
  await shot("unified-clock-03-up-next-0859.png");
  await evaluate("window.HumanOSTestClock.setTime('2026-08-03T09:00:00+08:00')");
  const ready = await checkpoint("Monday 09:00 explicit start gate", (s) => s.ui_mode === "ready_to_start" && /Ready to start/i.test(s.visible_text));
  await shot("unified-clock-04-ready-0900.png");
  await evaluate("nowCard.querySelector('[data-execution-action=\"start\"]')?.click()");
  await waitFor("currentExecutionState?.mode === 'now'");
  const running = await checkpoint("Explicit Start", (s) => s.ui_mode === "now" && s.actual_start_at && s.execution_session_id === ready.execution_session_id);
  await shot("unified-clock-05-running.png");

  await evaluate("window.HumanOSTestClock.advanceMinutes(20)");
  await checkpoint("20 active minutes", (s) => s.ui_mode === "now" && s.active_minutes === 20 && s.session_remaining_minutes === 25);
  await evaluate("nowCard.querySelector('[data-execution-action=\"pause\"]')?.click()");
  await waitFor("currentExecutionState?.mode === 'paused' && pauseDialog?.open");
  await evaluate(`document.querySelector('input[name="stopReason"][value="interrupted"]').checked=true;pauseProgress.value='Implemented the first integration boundary.';pauseNextStep.value='Continue with the test-clock API adapter.';pauseActualMinutes.value='20';pauseCalendarAction.value='keep';pauseForm.requestSubmit()`);
  await waitFor("pauseDialog?.open === false");
  const paused = await checkpoint("Paused with context dump", (s) => s.ui_mode === "paused" && s.session_remaining_minutes === 25 && s.execution_session_id === running.execution_session_id);
  await shot("unified-clock-06-paused.png");
  await evaluate("window.HumanOSTestClock.advanceMinutes(15)");
  await checkpoint("Paused clock is frozen", (s) => s.ui_mode === "paused" && s.session_remaining_minutes === paused.session_remaining_minutes);
  await shot("unified-clock-07-paused-after-15.png");

  await evaluate("document.querySelector('[data-return-now]')?.click();nowCard.querySelector('[data-execution-action=\"start\"]')?.click()");
  await waitFor("currentExecutionState?.mode === 'now'");
  await checkpoint("Resume same execution session", (s) => s.execution_session_id === running.execution_session_id && s.ui_mode === "now");
  await shot("unified-clock-08-resumed.png");
  await evaluate("window.HumanOSTestClock.advanceMinutes(25)");
  await checkpoint("Session reached planned work", (s) => s.session_remaining_minutes === 0 && /Session ended/i.test(s.visible_text));
  await shot("unified-clock-09-session-ended.png");
  await evaluate("nowCard.querySelector('[data-feedback-outcome=\"partial\"]')?.click()");
  await waitFor("feedbackDialog?.open === true");
  await evaluate("feedbackCompletion.value='partial';feedbackActualMinutes.value='45';feedbackDifficulty.value='5';feedbackRecommendation.value='helpful';feedbackForm.requestSubmit()");
  await waitFor("feedbackDialog?.open === false");
  await shot("unified-clock-10-feedback-saved.png");

  // A hard refresh must restore the server-backed execution/feedback state.
  await command("Page.reload", { ignoreCache: true });
  await waitFor("document.readyState === 'complete'");
  await evaluate(`authEmail.value='${seedInfo.email}';authPassword.value='${seedInfo.password}';authForm.requestSubmit()`);
  await waitFor("!appRoot.classList.contains('hidden') && Boolean(window.HumanOSTestClock)");
  await checkpoint("Refresh restores state", (s) => s.execution_session_id !== running.execution_session_id && !s.daily_checkin_open);

  // Record the two remaining feedback branches deterministically through the same public API.
  await evaluate(`(async()=>{
    const sessions=(await api('/api/execution-sessions?user_id=${seedInfo.user_id}')).execution_sessions;
    const completed=sessions.find(s=>s.block_id==='T4-TUE-1');
    const notStarted=sessions.find(s=>s.block_id==='T2-SAT-1');
    await api('/api/execution-feedback',{method:'POST',body:JSON.stringify({user_id:'${seedInfo.user_id}',task_id:'T4',execution_session_id:completed.execution_session_id,request_id:'qa-completed',task_evaluation:{completion:'completed',actual_minutes:30,perceived_difficulty:2},state_evaluation:{focus:5,energy:5,stress:3},recommendation_evaluation:{rating:'helpful'}})});
    await api('/api/execution-feedback',{method:'POST',body:JSON.stringify({user_id:'${seedInfo.user_id}',task_id:'T2',execution_session_id:notStarted.execution_session_id,request_id:'qa-not-started',task_evaluation:{completion:'not_started',actual_minutes:0,perceived_difficulty:6},state_evaluation:{focus:2,energy:2,stress:6},recommendation_evaluation:{rating:'not_helpful'}})});
    return true;
  })()`);

  await evaluate("window.HumanOSTestClock.setTime('2026-08-04T08:00:00+08:00')");
  await waitFor("dailyCheckInDialog?.open === true");
  await checkpoint("Tuesday first-entry check-in", (s) => s.daily_checkin_open);
  await shot("unified-clock-11-next-day-checkin.png");
  await evaluate("keepTodayPlanBtn.click()");
  await waitFor("dailyCheckInDialog?.open === false");
  await command("Page.reload", { ignoreCache: true });
  await waitFor("document.readyState === 'complete'");
  await evaluate(`authEmail.value='${seedInfo.email}';authPassword.value='${seedInfo.password}';authForm.requestSubmit()`);
  await waitFor("!appRoot.classList.contains('hidden')");
  await wait(300);
  await checkpoint("Tuesday refresh does not repeat check-in", (s) => !s.daily_checkin_open);

  await evaluate("window.HumanOSTestClock.setTime('2026-08-09T23:59:00+08:00')");
  await checkpoint("Sunday boundary", (s) => s.week_id === "2026-08-03");
  await evaluate("window.HumanOSTestClock.advanceMinutes(1)");
  await waitFor("weekRolloverDialog?.open === true");
  await checkpoint("Monday week rollover", (s) => s.week_id === "2026-08-10" && s.week_rollover_open);
  await shot("unified-clock-12-week-rollover.png");

  writeFileSync(resolve("qa-artifacts/unified-clock-timeline.json"), JSON.stringify(timeline, null, 2));
  const report = {
    passed: timeline.every((item) => item.assertion_result === "passed"),
    checkpoints: timeline.length,
    simulated_start: timeline[0]?.simulated_at,
    simulated_end: timeline.at(-1)?.simulated_at,
    screenshots: 12,
    tested: ["shared clock", "daily check-in", "up next", "ready", "explicit start", "pause", "resume", "session end", "three feedback outcomes", "refresh recovery", "week rollover"],
    planner_fixture: seedInfo.fixture_source,
  };
  writeFileSync(resolve("qa-artifacts/unified-clock-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  try { socket?.close(); } catch {}
  browser.kill();
  backend.kill();
  await wait(300);
  try { copyFileSync(db, resolve("qa-artifacts/unified-clock-after.db")); } catch {}
  spawnSync("python", ["scripts/export_unified_clock_qa.py"], { cwd: root, env: { ...baseEnv, HUMANOS_QA_EXPORT: resolve("qa-artifacts/unified-clock-database-export.json") }, stdio: "inherit" });
  try { rmSync(browserProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
}
