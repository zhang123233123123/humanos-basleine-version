import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9341;
const profile = mkdtempSync(join(tmpdir(), "humanos-execution-qa-"));
const artifacts = resolve("qa-artifacts");
mkdirSync(artifacts, { recursive: true });
const apiBase = String(process.argv[2] || "http://127.0.0.1:8790").replace(/\/$/, "");
const qaDb = resolve("qa-artifacts/execution-qa.db");
const backend = spawn("python", ["backend/humanos_server.py"], { cwd: resolve("."), env: { ...process.env, PORT: "8790", HUMANOS_DB_PATH: qaDb }, stdio: "ignore" });
const pageUrl = `${pathToFileURL(resolve("data-foundry-share/humanos-data-foundry-syy7.html")).href}?api=${encodeURIComponent(apiBase)}`;
const browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1366,768", "about:blank"], { stdio: "ignore" });
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

async function waitJson(url) { for (let i = 0; i < 80; i += 1) { try { const response = await fetch(url); if (response.ok) return response.json(); } catch {} await wait(100); } throw new Error(`Timed out: ${url}`); }
let sequence = 0; const pending = new Map(); let socket;
function command(method, params = {}) { const id = ++sequence; socket.send(JSON.stringify({ id, method, params })); return new Promise((resolveCommand, rejectCommand) => pending.set(id, { resolveCommand, rejectCommand })); }
async function evaluate(expression) { const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result?.value; }
async function waitFor(expression, attempts = 120) { for (let i = 0; i < attempts; i += 1) { if (await evaluate(expression)) return; await wait(100); } throw new Error(`Timed out waiting for ${expression}`); }
async function shot(name) { const result = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); writeFileSync(join(artifacts, name), Buffer.from(result.data, "base64")); }

try {
  await waitJson(`${apiBase}/api/health`);
  await waitJson(`http://127.0.0.1:${port}/json/version`);
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" }).then((response) => response.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveSocket, rejectSocket) => { socket.addEventListener("open", resolveSocket, { once: true }); socket.addEventListener("error", rejectSocket, { once: true }); });
  socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (!message.id || !pending.has(message.id)) return; const waiter = pending.get(message.id); pending.delete(message.id); message.error ? waiter.rejectCommand(message.error) : waiter.resolveCommand(message.result); });
  await command("Page.enable"); await command("Runtime.enable");
  await waitFor("document.readyState === 'complete'");
  await evaluate(`authEmail.value='execution-qa@example.com';authPassword.value='testing123';authForm.requestSubmit()`);
  await waitFor("!appRoot.classList.contains('hidden') && !executionRail.classList.contains('hidden')");
  await wait(400);
  await evaluate(`if (dailyCheckInDialog?.open) keepTodayPlanBtn?.click()`);
  await waitFor("!dailyCheckInDialog?.open");
  await shot("execution-rail-1366-up-next.png");
  await evaluate(`nowCard.querySelector('[data-execution-action="start"]')?.click()`);
  await waitFor("currentExecutionState?.mode === 'now' && nowCard.textContent.includes('in this session')");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await wait(200);
  await shot("execution-rail-1440-running.png");
  await evaluate(`document.querySelectorAll('.timeline-event.task-event')[1]?.click()`);
  await waitFor("document.querySelector('.compact-running-strip') !== null");
  await shot("execution-rail-running-selected-task.png");
  await evaluate(`document.querySelector('[data-return-now]')?.click();nowCard.querySelector('[data-execution-action="pause"]')?.click()`);
  await waitFor("currentExecutionState?.mode === 'paused'");
  await evaluate(`if (pauseDialog.open) pauseDialog.close(); rightRailMode='plan'; render()`);
  await shot("execution-rail-paused.png");
  await evaluate(`nowCard.querySelector('[data-execution-action="start"]')?.click()`);
  await waitFor("currentExecutionState?.mode === 'now'");
  await evaluate(`nowCard.querySelector('[data-execution-action="finish"]')?.click()`);
  await waitFor("currentExecutionState?.mode === 'session_ended' && feedbackDialog?.open");
  await evaluate(`feedbackDialog.close(); rightRailMode='plan'; render()`);
  await shot("execution-rail-session-ended.png");
  const audit = await evaluate(`({header:executionTodayLabel.textContent,state:executionPlanState.textContent,now:nowCard.textContent.trim(),afterCount:todayAfterList.children.length,summary:todayPlanSummary.textContent.trim(),railOverflow:getComputedStyle(executionRail).overflowY,calendarOverflow:getComputedStyle(calendar).overflowY,compactStrip:Boolean(document.querySelector('.compact-running-strip')),mainButtons:[...nowCard.querySelectorAll('button')].map(b=>({text:b.textContent.trim(),height:Math.round(b.getBoundingClientRect().height)}))})`);
  writeFileSync(join(artifacts, "execution-rail-audit.json"), JSON.stringify(audit, null, 2));
  console.log(JSON.stringify(audit));
} finally {
  try { socket?.close(); } catch {}
  browser.kill();
  backend.kill();
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
}
