import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9341;
const profile = mkdtempSync(join(tmpdir(), "humanos-execution-qa-"));
const artifacts = resolve("qa-artifacts");
mkdirSync(artifacts, { recursive: true });
const apiBase = String(process.argv[2] || "http://127.0.0.1:8792").replace(/\/$/, "");
const qaDb = resolve("qa-artifacts/execution-qa.db");
rmSync(qaDb, { force: true });
const seeded = spawnSync("python", ["scripts/seed_execution_qa.py"], { cwd: resolve("."), env: { ...process.env, HUMANOS_DB_PATH: qaDb }, encoding: "utf8" });
if (seeded.status !== 0) throw new Error(`Execution QA seed failed: ${seeded.stderr}`);
const backend = spawn("python", ["backend/humanos_server.py"], { cwd: resolve("."), env: { ...process.env, PORT: "8792", HUMANOS_DB_PATH: qaDb, HUMANOS_TEST_MODE: "1", HUMANOS_QA_DB: "1", HUMANOS_TEST_NOW: "2026-08-07T09:00:00+08:00" }, stdio: "ignore" });
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
  const timerSeed = spawnSync("python", ["-c", `import sqlite3;c=sqlite3.connect(r'${qaDb.replaceAll("\\", "\\\\")}');c.execute(\"update execution_sessions set actual_start_at='2026-08-07T09:00:00+08:00',resumed_at='2026-08-07T09:00:00+08:00' where status='running'\");c.commit();c.close()`], { cwd: resolve("."), encoding: "utf8" });
  if (timerSeed.status !== 0) throw new Error(`Timer seed failed: ${timerSeed.stderr}`);
  await evaluate(`fetch(API_BASE+'/api/test-clock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user_id:currentUserId(),set_time:'2026-08-07T09:20:00+08:00'})}).then(r=>r.json()).then(syncSharedTestClock)`);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await wait(200);
  await shot("execution-rail-1440-running.png");
  await evaluate(`{const other=tasks.find(item=>String(item.id)!==String(currentExecutionState?.session?.task_id));if(other){selectTask(other.id,'manual');rightRailMode='task';render();}}`);
  await waitFor("document.querySelector('.compact-running-strip') !== null");
  await shot("execution-rail-running-selected-task.png");
  await evaluate(`document.querySelector('[data-return-now]')?.click();nowCard.querySelector('[data-execution-action="pause"]')?.click()`);
  await waitFor("currentExecutionState?.mode === 'paused' && pauseDialog?.open && pauseTrackedTime.textContent.includes('Active time this session')");
  await shot("execution-rail-pause-dialog-tracked-time.png");
  const pauseAudit = await evaluate(`({tracked:pauseTrackedTime.textContent,hasManualMinutes:Boolean(document.getElementById('pauseAdjustedMinutes')),choices:[...pauseResumeChoice.options].map(o=>o.textContent.trim()),hasCombinedNote:Boolean(pauseContextNote)})`);
  if (pauseAudit.hasManualMinutes || !pauseAudit.hasCombinedNote || !pauseAudit.choices.includes("In 10 min")) throw new Error(`Pause UI audit failed: ${JSON.stringify(pauseAudit)}`);
  await evaluate(`{
    pauseContextNote.value='Reviewed the first two interview notes. Next: Resume with the third interview.';
    pauseResumeChoice.value='in_10';
    pauseForm.requestSubmit();
  }`);
  await waitFor("!pauseDialog.open && rightRailMode === 'plan'");
  const pauseSavedAudit = await evaluate(`({mode:rightRailMode,toast:productToast.textContent,sessionId:currentExecutionState.session.execution_session_id,taskStatus:tasks.find(t=>t.id===currentExecutionState.session.task_id)?.status,caption:document.querySelector('.execution-caption')?.textContent||'',scope:pendingSchedulePlan?.local_adjustment?.scope,changed:pendingSchedulePlan?.local_adjustment?.changed_block_ids?.length||0,confirmLabel:confirmScheduleBtn.textContent})`);
  if (pauseSavedAudit.taskStatus !== 'paused' || !pauseSavedAudit.caption.includes('Paused') || pauseSavedAudit.scope !== 'today_after_pause' || pauseSavedAudit.confirmLabel !== 'Update today') throw new Error(`Pause saved audit failed: ${JSON.stringify(pauseSavedAudit)}`);
  writeFileSync(join(artifacts, "pause-saved-audit.json"), JSON.stringify(pauseSavedAudit, null, 2));
  await shot("execution-rail-pause-saved-calendar.png");
  await evaluate(`confirmScheduleBtn.click()`);
  await waitFor("pendingSchedulePlan === null && currentExecutionState?.mode === 'paused'");
  const pausedAfterUpdate = await evaluate(`({sessionId:currentExecutionState.session.execution_session_id,mode:currentExecutionState.mode})`);
  if (pausedAfterUpdate.sessionId !== pauseSavedAudit.sessionId) throw new Error(`Local update replaced the paused execution session: ${JSON.stringify(pausedAfterUpdate)}`);
  await evaluate(`nowCard.querySelector('[data-execution-action="start"]')?.click()`);
  await waitFor("currentExecutionState?.mode === 'now'");
  const resumedAudit = await evaluate(`({sessionId:currentExecutionState.session.execution_session_id,toast:productToast.textContent,caption:document.querySelector('.execution-caption')?.textContent||''})`);
  if (resumedAudit.sessionId !== pauseSavedAudit.sessionId || !resumedAudit.toast.includes('Resumed')) throw new Error(`Resume audit failed: ${JSON.stringify(resumedAudit)}`);
  writeFileSync(join(artifacts, "resume-audit.json"), JSON.stringify(resumedAudit, null, 2));
  await shot("execution-rail-resumed.png");
  await evaluate(`nowCard.querySelector('[data-execution-action="finish"]')?.click()`);
  await waitFor("currentExecutionState?.mode === 'session_ended' && !feedbackDialog?.open && nowCard.textContent.includes('tracked automatically')");
  const endedAudit = await evaluate(`({text:nowCard.textContent,hasDidNotStart:Boolean(nowCard.querySelector('[data-feedback-outcome="not_started"]')),hasPause:Boolean(nowCard.querySelector('[data-execution-action="pause"]')),continueLabel:nowCard.querySelector('[data-execution-action="start"]')?.textContent.trim()||''})`);
  if (endedAudit.hasDidNotStart || endedAudit.hasPause || !endedAudit.text.includes('Worked, no progress')) throw new Error(`Ended-session outcome audit failed: ${JSON.stringify(endedAudit)}`);
  writeFileSync(join(artifacts, "execution-ended-outcomes-audit.json"), JSON.stringify(endedAudit, null, 2));
  await wait(2700);
  await shot("execution-rail-session-ended.png");
  await evaluate(`nowCard.querySelector('[data-feedback-outcome="partial"]')?.click()`);
  await waitFor("feedbackDialog?.open && !feedbackContextFields.classList.contains('hidden')");
  const contextAudit = await evaluate(`({progress:Boolean(feedbackProgress),nextStep:Boolean(feedbackNextStep),tracked:feedbackTrackedTime.textContent,oldOutcomeVisible:feedbackCompletion.closest('label')?.offsetParent!==null})`);
  if (!contextAudit.progress || !contextAudit.nextStep || contextAudit.oldOutcomeVisible) throw new Error(`Progress follow-up audit failed: ${JSON.stringify(contextAudit)}`);
  writeFileSync(join(artifacts, "execution-progress-followup-audit.json"), JSON.stringify(contextAudit, null, 2));
  await shot("execution-rail-progress-followup.png");
  await evaluate(`feedbackDialog.close(); rightRailMode='plan'; activeSelectionMode='auto'; render()`);
  await evaluate(`{
    const expiredStart = new Date(appNowMs() - 60 * 60000).toISOString();
    const expiredEnd = new Date(appNowMs() - 15 * 60000).toISOString();
    currentExecutionState = { ...currentExecutionState, mode:'session_ended', session:{...currentExecutionState.session,status:'ready',actual_start_at:null,resumed_at:null,accumulated_active_minutes:0,planned_start_at:expiredStart,planned_end_at:expiredEnd} };
    render();
  }`);
  await waitFor("nowCard.querySelector('[data-feedback-outcome=\"not_started\"]') && nowCard.querySelector('[data-execution-action=\"start\"]')?.textContent.includes('Start now')");
  const unstartedAudit = await evaluate(`({text:nowCard.textContent,outcomes:[...nowCard.querySelectorAll('[data-feedback-outcome]')].map(node=>node.dataset.feedbackOutcome),start:nowCard.querySelector('[data-execution-action="start"]')?.textContent.trim(),hasPause:Boolean(nowCard.querySelector('[data-execution-action="pause"]'))})`);
  if (unstartedAudit.outcomes.join(',') !== 'not_started' || unstartedAudit.start !== 'Start now' || unstartedAudit.hasPause) throw new Error(`Unstarted-session audit failed: ${JSON.stringify(unstartedAudit)}`);
  writeFileSync(join(artifacts, "execution-unstarted-expired-audit.json"), JSON.stringify(unstartedAudit, null, 2));
  await shot("execution-rail-unstarted-expired.png");
  const audit = await evaluate(`({header:executionTodayLabel.textContent,state:executionPlanState.textContent,now:nowCard.textContent.trim(),afterCount:todayAfterList.children.length,summary:todayPlanSummary.textContent.trim(),railOverflow:getComputedStyle(executionRail).overflowY,calendarOverflow:getComputedStyle(calendar).overflowY,compactStrip:Boolean(document.querySelector('.compact-running-strip')),mainButtons:[...nowCard.querySelectorAll('button')].map(b=>({text:b.textContent.trim(),height:Math.round(b.getBoundingClientRect().height)}))})`);
  writeFileSync(join(artifacts, "execution-rail-audit.json"), JSON.stringify(audit, null, 2));
  console.log(JSON.stringify(audit));
} finally {
  try { socket?.close(); } catch {}
  browser.kill();
  backend.kill();
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
}
