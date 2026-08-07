import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9347;
const profileDir = mkdtempSync(join(tmpdir(), "humanos-plan-decision-qa-"));
const artifacts = resolve("qa-artifacts");
mkdirSync(artifacts, { recursive: true });
const pageUrl = process.argv[2] || "http://127.0.0.1:8898/index.html?api=http%3A%2F%2F127.0.0.1%3A8897";
const browser = spawn(chrome, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, "--window-size=1366,768", "about:blank",
], { stdio: "ignore" });
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
async function waitJson(url) { for (let i = 0; i < 80; i += 1) { try { const response = await fetch(url); if (response.ok) return response.json(); } catch {} await wait(100); } throw new Error(`Timed out: ${url}`); }
let sequence = 0; const pending = new Map(); let socket;
function command(method, params = {}) { const id = ++sequence; socket.send(JSON.stringify({ id, method, params })); return new Promise((resolveCommand, rejectCommand) => pending.set(id, { resolveCommand, rejectCommand })); }
async function evaluate(expression) { const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result?.value; }
async function waitFor(expression, attempts = 100) { for (let i = 0; i < attempts; i += 1) { if (await evaluate(expression)) return; await wait(100); } throw new Error(`Timed out waiting for ${expression}`); }
async function shot(name) { const result = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true }); writeFileSync(join(artifacts, name), Buffer.from(result.data, "base64")); }

try {
  await waitJson(`http://127.0.0.1:${port}/json/version`);
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" }).then((response) => response.json());
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveSocket, rejectSocket) => { socket.addEventListener("open", resolveSocket, { once: true }); socket.addEventListener("error", rejectSocket, { once: true }); });
  socket.addEventListener("message", (event) => { const message = JSON.parse(event.data); if (!message.id || !pending.has(message.id)) return; const waiter = pending.get(message.id); pending.delete(message.id); message.error ? waiter.rejectCommand(message.error) : waiter.resolveCommand(message.result); });
  await command("Page.enable"); await command("Runtime.enable");
  await waitFor("document.readyState === 'complete' && typeof renderPendingSchedule === 'function'");
  await evaluate(`(() => {
    backendOnline=false;
    currentUser={id:'qa-plan-user',email:'qa-plan@example.com'};
    currentProfile={...createDefaultProfile(),weekly_context:{weekly_available_windows:'周三 08:00-18:00',keep_buffer:false,context_items:[{id:'ctx-lunch',type:'fixed_event',title:'Lunch',text:'Lunch',day:'周三',days:[2],start:12,end:13,duration_minutes:60,confirmed:true}]}};
    tasks=[normalizeBackendTask({id:'experiment',title:'Experiment design',due:'周三 17:00',duration:120,priority:'High',status:'queued',task_type:'flexible_task',execution:{remaining_duration_minutes:120}})];
    pendingSchedulePlan={plan_id:'qa-plan',plan_revision:1,selected_candidate_id:'valid',candidate_plans:[{id:'valid',label:'Energy fit',metrics:{}}],plan_patch:[{block_id:'experiment-valid-1',task_id:'experiment',day_index:2,start:9,end:11,session_minutes:120,planned_work_minutes:120,color:'blue'}],unscheduled_tasks:[],validation:{valid:true,violations:[]},parallel_suggestions:[]};
    confirmedSchedulePlan=null;rightRailMode='plan';calendarView='week';
    authScreen.classList.add('hidden');profileScreen.classList.add('hidden');appRoot.classList.remove('hidden');render();
  })()`);
  await waitFor("planReviewTitle.textContent === 'Your plan is ready'");
  const readyAudit = await evaluate(`({title:planReviewTitle.textContent,count:planReviewCount.textContent,confirmDisabled:confirmScheduleBtn.disabled,technical:document.body.innerText.includes('Python constraint validation failed')||document.body.innerText.includes('Draft needs changes')})`);
  if (readyAudit.confirmDisabled || readyAudit.technical) throw new Error(`Ready-state audit failed: ${JSON.stringify(readyAudit)}`);
  await shot("plan-ready-user-view.png");

  await evaluate(`pendingSchedulePlan={...pendingSchedulePlan,plan_patch:[{...pendingSchedulePlan.plan_patch[0],start:11,end:13}],validation:{valid:false,violations:[{type:'hard_constraint_conflict',task_id:'experiment',block_ids:['experiment-valid-1'],constraint:'Lunch',conflicting_item_id:'ctx-lunch',conflicting_label:'Lunch',day_index:2,start:12,end:13}]}};render()`);
  await waitFor("planReviewTitle.textContent === 'HumanOS needs one decision'");
  const decisionAudit = await evaluate(`({title:planReviewTitle.textContent,count:planReviewCount.textContent,message:pendingScheduleText.textContent,confirmDisabled:confirmScheduleBtn.disabled,marked:Boolean(document.querySelector('.task-event.constraint-conflict'))})`);
  if (!decisionAudit.confirmDisabled || !decisionAudit.marked || !decisionAudit.message.includes("Experiment design") || !decisionAudit.message.includes("Lunch")) throw new Error(`Decision-state audit failed: ${JSON.stringify(decisionAudit)}`);
  await shot("plan-needs-one-decision.png");

  await evaluate(`window.__failedEditEvents=[];recordPlanEditEvent=async(event)=>{window.__failedEditEvents.push(event);return event};pendingSchedulePlan={...pendingSchedulePlan,plan_patch:[{...pendingSchedulePlan.plan_patch[0],start:9,end:11}],validation:{valid:true,violations:[]}};render();moveCalendarSession('experiment','experiment-valid-1',2,11)`);
  await waitFor("document.getElementById('productToast')?.classList.contains('show')");
  const dragAudit = await evaluate(`({start:pendingSchedulePlan.plan_patch[0].start,toast:document.getElementById('productToast').textContent,planValid:pendingSchedulePlan.validation.valid,hasConflictCard:Boolean(document.getElementById('calendarConflictPrompt')),confirmDisabled:confirmScheduleBtn.disabled,events:window.__failedEditEvents.map(event=>({type:event.eventType,effective:event.effective}))})`);
  if (dragAudit.start !== 9 || !dragAudit.planValid || dragAudit.hasConflictCard || dragAudit.confirmDisabled || dragAudit.toast !== "Couldn’t move — overlaps Lunch 12:00–13:00." || dragAudit.events.length !== 1 || dragAudit.events[0].type !== "failed_edit_attempt" || dragAudit.events[0].effective !== false) throw new Error(`Drag-conflict audit failed: ${JSON.stringify(dragAudit)}`);
  await shot("calendar-local-drag-conflict-toast.png");
  writeFileSync(join(artifacts, "plan-decision-ui-audit.json"), JSON.stringify({ readyAudit, decisionAudit, dragAudit }, null, 2));
  console.log(JSON.stringify({ readyAudit, decisionAudit, dragAudit }));
} finally {
  try { socket?.close(); } catch {}
  browser.kill();
  try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch {}
}
