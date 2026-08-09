import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = 9337;
const profile = mkdtempSync(join(tmpdir(), "humanos-qa-"));
const artifactDir = resolve("qa-artifacts");
mkdirSync(artifactDir, { recursive: true });
const apiBase = String(process.env.HUMANOS_QA_API || process.argv[2] || "").replace(/\/$/, "");
const fileUrl = pathToFileURL(resolve("data-foundry-share/humanos-data-foundry-syy7.html")).href;
const pageUrl = apiBase ? `${fileUrl}?api=${encodeURIComponent(apiBase)}` : fileUrl;
const artifactPrefix = apiBase ? "backend-simulation" : "week";
const qaEmail = `timeline-qa-${Date.now()}@example.com`;
const appWaitAttempts = apiBase ? 900 : 120;

const browser = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--window-size=1366,768",
  "about:blank"
], { stdio: "ignore" });

const wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));

async function waitForJson(url, attempts = 50) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

let sequence = 0;
const pending = new Map();
let socket;

function command(method, params = {}) {
  sequence += 1;
  const id = sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolveCommand, rejectCommand) => pending.set(id, { resolveCommand, rejectCommand }));
}

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}

async function waitFor(expression, attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    if (await evaluate(expression)) return;
    await wait(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

try {
  await waitForJson(`http://127.0.0.1:${port}/json/version`);
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" }).then((response) => response.json());
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
    if (message.error) waiter.rejectCommand(new Error(message.error.message));
    else waiter.resolveCommand(message.result);
  });
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await waitFor("document.readyState === 'complete'");

  await evaluate(`(() => {
    document.getElementById('registerModeBtn').click();
    document.getElementById('authName').value = 'Timeline QA';
    document.getElementById('authEmail').value = '${qaEmail}';
    document.getElementById('authPassword').value = 'timeline-qa-password';
    document.getElementById('authForm').requestSubmit();
    return true;
  })()`);
  await waitFor("!document.getElementById('profileScreen').classList.contains('hidden')");
  const profileStepScreenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
  writeFileSync(join(artifactDir, `${artifactPrefix}-syy7-onboarding-1-profile.png`), Buffer.from(profileStepScreenshot.data, "base64"));
  await evaluate("document.getElementById('wizardNextBtn').click(); true");
  await waitFor("!document.querySelector('[data-wizard-page=rhythm]').classList.contains('hidden')");
  const rhythmStepScreenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
  writeFileSync(join(artifactDir, `${artifactPrefix}-syy7-onboarding-2-rhythm.png`), Buffer.from(rhythmStepScreenshot.data, "base64"));
  await evaluate("document.getElementById('wizardNextBtnRhythm').click(); true");
  await waitFor("!document.querySelector('[data-wizard-page=context]').classList.contains('hidden')");

  await evaluate(`(() => {
    availableWindowRows.innerHTML = '';
    fixedEventRows.innerHTML = '';
    temporaryConstraintRows.innerHTML = '';
    addAvailableWindowRow({day:'工作日', start:'08:00', end:'21:00'});
    addAvailableWindowRow({day:'周六', start:'09:00', end:'18:00'});
    addFixedEventRow({type:'fixed_event', title:'research meeting', day:'周五', start:'10:00', end:'11:00'});
    addFixedEventRow({type:'recurring_routine', title:'Lunch', day:'每天', start:'12:00', end:'13:00'});
    // Regression: arbitrary whole-minute activity durations (such as 40) must not block form submission.
    addFixedEventRow({type:'flexible_activity', title:'Do the laundry', day:'周五', duration:40});
    addFixedEventRow({type:'flexible_activity', title:'Listen to an English podcast', day:'周五', duration:30});
    addTemporaryConstraintRow({title:'Out of office', day:'周四', start:'14:00', end:'17:00'});
    document.getElementById('wizardGoal').value = 'Complete the system build and experiment design';
    syncStructuredContextFields();
    updateWizardWeekPreview();
    return true;
  })()`);
  await wait(200);
  const contextScreenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
  writeFileSync(join(artifactDir, `${artifactPrefix}-weekly-context-input.png`), Buffer.from(contextScreenshot.data, "base64"));
  await evaluate("document.getElementById('wizardNextBtnContext').click(); true");
  await waitFor("!document.querySelector('[data-wizard-page=tasks]').classList.contains('hidden')");
  await evaluate(`(() => {
    weeklyTaskList.innerHTML = '';
    addWeeklyTaskRow({title:'System implementation', due:'周五 18:00', duration:300, priority:'高', expected_difficulty:6});
    addWeeklyTaskRow({title:'Experiment design', due:'周六 16:00', duration:120, priority:'中', expected_difficulty:6});
    addWeeklyTaskRow({title:'Literature review', due:'周六 17:00', duration:200, priority:'中', expected_difficulty:4});
    saveOnboardingDraft();
    weeklyTaskList.innerHTML = '';
    availableWindowRows.innerHTML = '';
    fixedEventRows.innerHTML = '';
    syncWizardForm();
    const restoredDraft = JSON.parse(localStorage.getItem(onboardingDraftStorageKey()) || 'null');
    if (weeklyTaskList.querySelectorAll('.weekly-task-row').length !== 3
      || Number(restoredDraft?.context_items?.find((item) => item.title === 'Do the laundry')?.duration) !== 40) {
      throw new Error('Onboarding draft restore regression');
    }
    updateWizardWeekPreview();
    return true;
  })()`);
  const taskStepScreenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
  writeFileSync(join(artifactDir, `${artifactPrefix}-syy7-onboarding-4-tasks.png`), Buffer.from(taskStepScreenshot.data, "base64"));
  await evaluate("document.getElementById('profileWizard').requestSubmit(); true");
  await waitFor("!document.getElementById('appRoot').classList.contains('hidden')", appWaitAttempts);
  await waitFor("document.querySelectorAll('.timeline-event').length > 5", appWaitAttempts);
  await evaluate(`(() => {
    localStorage.removeItem(dailyCheckInDateKey());
    maybeShowDailyCheckIn();
    window.__dailyCheckInAudit = { opened: Boolean(dailyCheckInDialog?.open) };
    dailyFocus.value = '6';
    dailyEnergy.value = '5';
    dailyStress.value = '3';
    dailyCheckInForm.requestSubmit();
    return true;
  })()`);
  await waitFor("!document.getElementById('dailyCheckInDialog').open");
  await evaluate("document.getElementById('weekViewBtn').click(); window.scrollTo(0, 0); true");
  await wait(500);

  const audit = await evaluate(`(() => {
    const taskEvents = [...document.querySelectorAll('.task-event')];
    const contextEvents = [...document.querySelectorAll('.context-event')];
    const firstTask = tasks[0];
    const partialProbe = { id:'partial-probe', title:'Partial Probe', due:'周五 18:00', duration:120, status:'queued', slot:{sessions:[{block_id:'partial-probe-1', day_index:2, start:9, end:10}]} };
    refreshTaskScheduleStatus(partialProbe);
    const conflictProbe = calendarBlockViolations({ task:firstTask, task_id:firstTask.id, block_id:'conflict-probe', source:'pending', day_index:0, start:10, end:11 });
    const parserProbe = localFallbackTasksFromText('明天下午三点开组会，持续1小时；周三前写完论文，预计3小时。');
    const editableContext = contextEvents.find((item) => item.dataset.contextId);
    if (editableContext) editableContext.click();
    const contextDialogAudit = {
      editableCount: document.querySelectorAll('.context-event.editable-context').length,
      structuredIds: (currentProfile.weekly_context?.context_items || []).map((item) => item.id),
      dialogOpened: Boolean(document.getElementById('contextEventDialog')?.open),
      dialogTime: document.getElementById('contextEventDialog')?.open ? [document.getElementById('contextEventDay').value, document.getElementById('contextEventStart').value + '–' + document.getElementById('contextEventEnd').value].join(' ') : ''
    };
    if (document.getElementById('contextEventDialog')?.open) document.getElementById('contextEventDialog').close();
    return {
      timeAxisLabels: document.querySelectorAll('.timeline-axis span').length,
      calendarBounds: calendarBounds(),
      taskSessions: taskEvents.length,
      contextEvents: contextEvents.length,
      fixedEvents: document.querySelectorAll('.context-event.fixed_event').length,
      recurringRoutines: document.querySelectorAll('.context-event.recurring_routine').length,
      temporaryConstraints: document.querySelectorAll('.context-event.temporary_constraint').length,
      taskDurations: Object.fromEntries(tasks.map((task) => [task.title, Number(task.duration)])),
      selectedPlanWork: (pendingSchedulePlan?.plan_patch || []).reduce((sum, block) => sum + Number(block.planned_work_minutes ?? block.session_minutes ?? Math.round((block.end - block.start) * 60)), 0),
      selectedPlanCapacity: (pendingSchedulePlan?.plan_patch || []).reduce((sum, block) => sum + Number(block.session_minutes ?? Math.round((block.end - block.start) * 60)), 0),
      candidateSignatures: (pendingSchedulePlan?.candidate_plans || []).map((candidate) => JSON.stringify((candidate.plan_patch || []).map((block) => [block.task_id, block.day_index, block.start, block.end]))),
      flexibleActivities: document.querySelectorAll('.context-event.flexible_activity').length,
      flexibleDurations: [...new Set(buildSchedulingContext(currentProfile).flexible_activity_blocks.map((block) => Math.round((block.end - block.start) * 60)))],
      buffers: document.querySelectorAll('.context-event.buffer').length,
      distinctTaskHeights: [...new Set(taskEvents.map((item) => Math.round(item.getBoundingClientRect().height)))],
      momentaryValues: ['focusValue','energyValue','stressValue'].map((id) => document.getElementById(id)?.textContent),
      dailyCheckIn: { ...(window.__dailyCheckInAudit || {}), savedForToday: Boolean(localStorage.getItem(dailyCheckInDateKey())) },
      partialStatusProbe: partialProbe.status,
      constraintRevalidationViolations: conflictProbe,
      parserProbe: parserProbe.map((task) => ({title:task.title, due:task.due, duration:task.duration, task_type:task.task_type})),
      singleSchedulerSource: backendOnline ? 'backend/humanos_graph.py' : 'blocked_offline',
      decisionTraceCards: document.querySelectorAll('#decisionTrace .trace-card').length,
      pendingText: document.getElementById('pendingScheduleText')?.textContent || '',
      pendingContainsObjectObject: (document.getElementById('pendingScheduleText')?.textContent || '').includes('[object Object]'),
      taskCardsAreCompact: taskEvents.every((item) => !item.querySelector('small')),
      rawIsoVisible: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(document.body.innerText),
      calendarLegendItems: document.querySelectorAll('.calendar-legend .legend-swatch').length,
      legendExplainsTaskColors: document.querySelector('.calendar-legend')?.textContent.includes('do not encode priority') || false,
      contextDialogAudit,
      apiBase: ${JSON.stringify(apiBase)},
      userId: currentUser?.id || null,
      engineLabel: document.getElementById('engineLabel')?.textContent || '',
      provider: pendingSchedulePlan?.ai_provenance?.provider || pendingSchedulePlan?.provenance?.provider || '',
      model: pendingSchedulePlan?.ai_provenance?.model || pendingSchedulePlan?.provenance?.model || '',
      planStatus: pendingSchedulePlan?.status || '',
      validation: pendingSchedulePlan?.validation || null,
      unscheduled: pendingSchedulePlan?.unscheduled || []
    };
  })()`);
  if (audit.taskDurations['Experiment design'] !== 120 || audit.taskDurations['Literature review'] !== 200) {
    throw new Error(`Exact task duration was not preserved: ${JSON.stringify(audit.taskDurations)}`);
  }
  if (audit.temporaryConstraints < 1) {
    throw new Error(`Temporary constraint is missing from the calendar: ${JSON.stringify(audit)}`);
  }
  if (new Set(audit.candidateSignatures).size !== audit.candidateSignatures.length) {
    throw new Error(`Duplicate candidate plans were exposed: ${JSON.stringify(audit.candidateSignatures)}`);
  }
  audit.contextParallelFeature = {
    source: "DeepSeek parallel-compatibility-v2",
    acceptanceFlow: "full-plan replan followed by Python validation",
    coveredBy: "test_flexible_activity_parallel_pair_is_semantic_model_output"
  };
  const parallelAudit = await evaluate(`(async () => {
    const savedTasks = tasks;
    const savedPending = pendingSchedulePlan;
    window.__parallelQaSaved = {tasks:savedTasks, pending:savedPending};
    const laundry = normalizeBackendTask({id:'qa-laundry', title:'Laundry', due:'周五 18:00', duration:60, priority:'低', status:'queued', task_type:'flexible_task', context:'QA', slot:null, checkpoints:[]});
    const podcast = normalizeBackendTask({id:'qa-podcast', title:'English podcast', due:'周五 18:00', duration:30, priority:'低', status:'queued', task_type:'flexible_task', context:'QA', slot:null, checkpoints:[]});
    tasks = [...savedTasks, laundry, podcast];
    pendingSchedulePlan = {
      selected_candidate_id:'qa-base', explanation:'QA parallel suggestion', validation:{valid:true, violations:[]}, unscheduled_tasks:[],
      plan_patch:[
        {block_id:'qa-laundry-1', task_id:'qa-laundry', kind:'task_session', day_index:3, start:18, end:19, session_minutes:60, color:'green'},
        {block_id:'qa-podcast-1', task_id:'qa-podcast', kind:'task_session', day_index:4, start:9, end:9.5, session_minutes:30, color:'blue'}
      ],
      parallel_suggestions:[{
        id:'qa-parallel', status:'pending', primary_task_id:'qa-laundry', secondary_task_id:'qa-podcast',
        primary_block_id:'qa-laundry-1', secondary_block_id:'qa-podcast-1', parallel_group_id:'qa-group',
        day_index:3, start:18, end:18.5, suggested_overlap_minutes:30, resource_basis:['manual','auditory'],
        confidence_level:'high', evidence:['QA low-conflict pair'], requires_user_confirmation:true
      }]
    };
    render();
    const suggestionVisibleBefore = Boolean(document.querySelector('[data-accept-parallel="qa-parallel"]'));
    const originalScheduleRequest = requestTentativeSchedule;
    requestTentativeSchedule = async () => {
      const accepted = {...pendingSchedulePlan.parallel_suggestions[0], status:'accepted'};
      const groupFields = {parallel_group_id:'qa-group', parallel_user_confirmed:true, parallel_task_ids:['qa-laundry','qa-podcast'], allowed_overlap_minutes:30, parallel_evidence:['QA validated low-conflict pair']};
      pendingSchedulePlan = {...pendingSchedulePlan, parallel_suggestions:[accepted], plan_patch:[
        {...pendingSchedulePlan.plan_patch[0], ...groupFields, parallel_role:'primary'},
        {...pendingSchedulePlan.plan_patch[1], day_index:3, start:18, end:18.5, ...groupFields, parallel_role:'secondary'}
      ]};
      return pendingSchedulePlan;
    };
    await acceptParallelSuggestion('qa-parallel');
    requestTentativeSchedule = originalScheduleRequest;
    const groupBlocks = pendingSchedulePlan.plan_patch.filter((block) => block.parallel_group_id === 'qa-group');
    const overlapErrors = groupBlocks.flatMap((block) => calendarBlockViolations({...block, task:tasks.find((task) => task.id === block.task_id), source:'pending'}, block.block_id)).filter((message) => message.includes('重叠'));
    const parallelElements = [...document.querySelectorAll('[data-parallel-group="qa-group"]')];
    const parallelRects = parallelElements.map((element) => element.getBoundingClientRect());
    const podcastTitle = parallelElements.find((element) => element.textContent.includes('English podcast'))?.querySelector('strong');
    const podcastTime = parallelElements.find((element) => element.textContent.includes('English podcast'))?.querySelector('.compact-time');
    const result = {
      suggestionVisibleBefore,
      ordinaryDraftHasNoDecision: document.querySelectorAll('.timeline-event.task-event.pending, .timeline-event.task-event.pending-static').length > 0 && document.querySelectorAll('.plan-decision-card').length === 0,
      optionalSuggestionDoesNotBlock: !document.getElementById('confirmScheduleBtn').disabled,
      visibleMainPlanActions: [...document.querySelectorAll('#appRoot .primary')].filter((element) => {
        const style = getComputedStyle(element);
        return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && style.display !== 'none' && style.visibility !== 'hidden' && !element.closest('.parallel-suggestion-actions');
      }).map((element) => element.textContent.trim()),
      acceptedStatus: pendingSchedulePlan.parallel_suggestions[0].status,
      linkedSessionCount: groupBlocks.length,
      distinctTaskCount: new Set(groupBlocks.map((block) => block.task_id)).size,
      sameGroup: groupBlocks.every((block) => block.parallel_group_id === 'qa-group' && block.parallel_user_confirmed),
      overlapErrors,
      parallelCardsVisible: document.querySelectorAll('.task-event.parallel-session').length,
      sameTimelineRow: parallelRects.length === 2 && Math.abs(parallelRects[0].top - parallelRects[1].top) < 2,
      leftRightColumns: parallelRects.length === 2 && Math.abs(parallelRects[0].left - parallelRects[1].left) > 10 && Math.abs(parallelRects[0].width - parallelRects[1].width) < 3,
      podcastTitleVisible: Boolean(podcastTitle && podcastTitle.getBoundingClientRect().width > 0 && podcastTitle.scrollHeight <= podcastTitle.clientHeight + 1),
      compactTaskTimeVisible: Boolean(podcastTime && getComputedStyle(podcastTime).display !== 'none' && /18:00–18:30/.test(podcastTime.textContent))
    };
    return result;
  })()`);
  const parallelScreenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
  writeFileSync(join(artifactDir, `${artifactPrefix}-parallel-suggestion-accepted-pending.png`), Buffer.from(parallelScreenshot.data, "base64"));
  if (apiBase) {
    await evaluate(`(() => { tasks = window.__parallelQaSaved.tasks; pendingSchedulePlan = window.__parallelQaSaved.pending; delete window.__parallelQaSaved; render(); return true; })()`);
    parallelAudit.backendPersistenceProbe = "kept separate from the live schedule test";
  } else {
    await evaluate("render(); document.getElementById('confirmScheduleBtn').click(); true");
    await waitFor("pendingSchedulePlan === null");
    const persistedParallelAudit = await evaluate(`(() => {
      const groupSessions = tasks.flatMap((task) => taskSlotSessions(task).map((session) => ({...session, task_id:task.id}))).filter((session) => session.parallel_group_id === 'qa-group');
      const confirmedSummaryVisible = /Plan confirmed/.test(document.getElementById('pendingScheduleText')?.textContent || '');
      const emptyReview = document.getElementById('planReviewEmpty');
      const staleNoPlanVisible = document.getElementById('planReviewCount')?.textContent === 'No plan yet' || (emptyReview && !emptyReview.classList.contains('hidden'));
      const selectionClearedAfterConfirmation = activeId === null && activeSelectionMode === 'none';
      selectTask('qa-laundry', 'manual'); render();
      document.querySelector('[data-action="complete-active-task"]')?.click();
      const feedbackVisible = !document.getElementById('parallelFeedbackField').classList.contains('hidden');
      if (document.getElementById('feedbackDialog').open) document.getElementById('feedbackDialog').close();
      return {
        persistedLinkedSessions: groupSessions.length,
        persistedDistinctTasks: new Set(groupSessions.map((session) => session.task_id)).size,
        confirmedSummaryVisible,
        staleNoPlanVisible,
        selectionClearedAfterConfirmation,
        cancelButtonVisible: Boolean(document.querySelector('[data-action="cancel-parallel"]')),
        feedbackVisible
      };
    })()`);
    Object.assign(parallelAudit, persistedParallelAudit);
    const mandatoryDecisionAudit = await evaluate(`(() => {
      const saved = pendingSchedulePlan;
      const task = tasks.find((item) => item.id === 'qa-laundry');
      pendingSchedulePlan = {
        selected_candidate_id:'qa-mandatory',
        explanation:'A hard conflict still needs a choice.',
        plan_patch:[{block_id:'qa-mandatory-block', task_id:'qa-laundry', kind:'task_session', day_index:3, start:18, end:19, session_minutes:60}],
        validation:{valid:false, violations:[{type:'hard_constraint_conflict', task_id:'qa-laundry', message:'60 minutes cannot fit before Friday 17:00.'}]},
        unscheduled_tasks:[]
      };
      render();
      const card = document.querySelector('.plan-decision-card');
      const result = {
        cardCount: document.querySelectorAll('.plan-decision-card').length,
        concreteReasonVisible: Boolean(card?.textContent.includes('60 minutes cannot fit before Friday 17:00.')),
        actions: [...(card?.querySelectorAll('button') || [])].map((button) => button.textContent.trim()),
        finalConfirmationBlocked: document.getElementById('confirmScheduleBtn').disabled,
        decisionCardHasNestedScroll: card ? ['auto','scroll'].includes(getComputedStyle(card).overflowY) : false
      };
      pendingSchedulePlan = saved;
      render();
      return result;
    })()`);
    parallelAudit.mandatoryDecision = mandatoryDecisionAudit;
    const confirmedParallelScreenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
    writeFileSync(join(artifactDir, `${artifactPrefix}-parallel-sessions-confirmed.png`), Buffer.from(confirmedParallelScreenshot.data, "base64"));
    await evaluate("cancelParallelGroup('qa-group').then(() => true)");
    parallelAudit.remainingGroupSessionsAfterCancel = await evaluate("tasks.flatMap((task) => taskSlotSessions(task)).filter((session) => session.parallel_group_id === 'qa-group').length");
    await evaluate(`(() => { tasks = window.__parallelQaSaved.tasks; pendingSchedulePlan = window.__parallelQaSaved.pending; delete window.__parallelQaSaved; render(); return true; })()`);
  }
  audit.parallelFeature = parallelAudit;
  if (!parallelAudit.ordinaryDraftHasNoDecision || !parallelAudit.optionalSuggestionDoesNotBlock) {
    throw new Error(`Draft/optional-decision acceptance failed: ${JSON.stringify(parallelAudit)}`);
  }
  if ((parallelAudit.visibleMainPlanActions || []).filter((label) => label === 'Add plan to calendar').length !== 1 || (parallelAudit.visibleMainPlanActions || []).includes('New task')) {
    throw new Error(`Draft state exposes more than one primary plan action: ${JSON.stringify(parallelAudit.visibleMainPlanActions)}`);
  }
  if (!apiBase && (!parallelAudit.mandatoryDecision?.concreteReasonVisible || !parallelAudit.mandatoryDecision?.finalConfirmationBlocked || parallelAudit.mandatoryDecision?.decisionCardHasNestedScroll)) {
    throw new Error(`Mandatory-decision acceptance failed: ${JSON.stringify(parallelAudit.mandatoryDecision)}`);
  }
  const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
  writeFileSync(join(artifactDir, `${artifactPrefix}-timeline.png`), Buffer.from(screenshot.data, "base64"));
  writeFileSync(join(artifactDir, `${artifactPrefix}-timeline-audit.json`), JSON.stringify(audit, null, 2));

  let interruptionAudit = null;
  let chatAudit = null;
  let meetingUpdateAudit = null;
  if (apiBase) {
    await evaluate("render(); document.getElementById('confirmScheduleBtn').click(); true");
    await waitFor("pendingSchedulePlan === null || Boolean(document.getElementById('planRationaleDialog')?.open)", appWaitAttempts);
    if (await evaluate("Boolean(document.getElementById('planRationaleDialog')?.open)")) {
      await evaluate(`(() => {
        const rationale = document.getElementById('planRationaleText');
        const scope = document.getElementById('planRationaleScope');
        if (rationale) rationale.value = 'QA confirmation after reviewing the proposed plan.';
        if (scope) scope.value = 'only_this_week';
        submitPlanRationale('answered');
        return true;
      })()`);
    }
    await waitFor("pendingSchedulePlan === null", appWaitAttempts);
    await evaluate(`handleChatTurn('My research meeting tomorrow has moved to 14:00–15:00.').then(() => true)`);
    await waitFor("!document.getElementById('chatSendBtn').disabled", appWaitAttempts);
    await waitFor("currentProfile.weekly_context.context_items.some((item) => item.title === 'research meeting' && Number(item.start) === 14 && Number(item.end) === 15)", appWaitAttempts);
    await waitFor("pendingSchedulePlan?.plan_patch?.length > 0", appWaitAttempts);
    meetingUpdateAudit = await evaluate(`(() => {
      const item = currentProfile.weekly_context.context_items.find((candidate) => candidate.title === 'research meeting');
      return {
        day: item?.day,
        start: item?.start,
        end: item?.end,
        visibleContextBlocks: visibleCalendarBlocks().filter((block) => block.context_id === item?.id).map((block) => ({day_index:block.day_index,start:block.start,end:block.end,kind:block.kind})),
        draftBlockCount: document.querySelectorAll('.timeline-event.task-event.pending, .timeline-event.task-event.pending-static').length,
        taskContextPollution: tasks.filter((task) => /时间补充|My research meeting tomorrow has moved/i.test(String(task.context || ''))).map((task) => task.title),
        assistantTail: chatMessages.slice(-4).map((message) => ({role:message.role,title:message.title,text:message.text})),
        selectedPlanOnly: document.querySelectorAll('.candidate-tab, .alternative-plans').length === 0,
        parallelSuggestionVisible: /parallel suggestion/i.test(document.getElementById('pendingScheduleText')?.textContent || '')
      };
    })()`);
    if (meetingUpdateAudit.start !== 14 || meetingUpdateAudit.end !== 15 || meetingUpdateAudit.taskContextPollution.length || !meetingUpdateAudit.selectedPlanOnly) {
      throw new Error(`Chat meeting update failed: ${JSON.stringify(meetingUpdateAudit)}`);
    }
    const meetingScreenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
    writeFileSync(join(artifactDir, "backend-chat-meeting-updated-draft.png"), Buffer.from(meetingScreenshot.data, "base64"));
    writeFileSync(join(artifactDir, "backend-chat-meeting-updated-audit.json"), JSON.stringify(meetingUpdateAudit, null, 2));
    await evaluate("render(); document.getElementById('confirmScheduleBtn').click(); true");
    await waitFor("pendingSchedulePlan === null", appWaitAttempts);
    meetingUpdateAudit.confirmedSolidBlockCount = await evaluate("document.querySelectorAll('.timeline-event.task-event:not(.pending):not(.pending-static)').length");
    meetingUpdateAudit.remainingDraftBlockCount = await evaluate("document.querySelectorAll('.timeline-event.task-event.pending, .timeline-event.task-event.pending-static').length");
    if (meetingUpdateAudit.remainingDraftBlockCount !== 0) throw new Error(`Confirmed calendar still contains Draft blocks: ${JSON.stringify(meetingUpdateAudit)}`);
    const confirmedMeetingScreenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
    writeFileSync(join(artifactDir, "backend-chat-meeting-confirmed-solid.png"), Buffer.from(confirmedMeetingScreenshot.data, "base64"));
    const interruptedTaskId = await evaluate(`(async () => {
      const candidate = visibleCalendarBlocks()
        .filter((block) => block.kind === 'task_session' && block.task && block.task.task_type !== 'fixed_event' && !['completed', 'terminated'].includes(block.task.status))
        .sort((left, right) => Number(left.day_index) - Number(right.day_index) || Number(left.start) - Number(right.start))[0];
      if (!candidate) throw new Error('No flexible task session available for interruption QA');
      const sessionDate = weekDateForDay(Number(candidate.day_index));
      sessionDate.setHours(Math.floor(Number(candidate.start)), Math.round((Number(candidate.start) % 1) * 60), 0, 0);
      await controlTestClock({ simulated_now: sessionDate.toISOString(), time_scale: 0 });
      await loadBackendState();
      if (!currentExecutionState?.session) throw new Error('Execution session was not available at the planned start');
      await startCurrentExecution();
      await controlTestClock({ advance_minutes: 20, time_scale: 0 });
      await pauseCurrentExecution();
      const task = tasks.find((item) => String(item.id) === String(currentExecutionState?.session?.task_id));
      if (!task) throw new Error('Running task was not found after advancing the QA clock');
      document.querySelector('input[name="stopReason"][value="interrupted"]').checked = true;
      document.getElementById('pauseContextNote').value = 'Completed the API interface skeleton. Next: Continue connecting the scheduling endpoint';
      document.getElementById('pauseResumeChoice').value = 'reschedule';
      document.getElementById('pauseForm').requestSubmit();
      return task.id;
    })()`);
    const taskIdLiteral = JSON.stringify(interruptedTaskId);
    await waitFor(`tasks.find((item) => String(item.id) === String(${taskIdLiteral}))?.status === 'paused'`, appWaitAttempts);
    await waitFor("pendingSchedulePlan?.plan_patch?.length > 0", appWaitAttempts);
    const pausedAudit = await evaluate(`(() => {
      const task = tasks.find((item) => String(item.id) === String(${taskIdLiteral}));
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        originalMinutes: task.execution?.original_estimate_minutes,
        actualMinutes: task.execution?.accumulated_actual_minutes,
        remainingMinutes: task.execution?.remaining_duration_minutes,
        progressPercent: task.execution?.progress_percent,
        retainedSessions: taskSlotSessions(task).length,
        releasedSessions: task.contextWindow?.interruption?.released_session_count,
        checkpoints: task.checkpoints,
        pendingIncludesInterruptedTask: (pendingSchedulePlan?.plan_patch || []).some((block) => String(block.task_id) === String(task.id)),
        resumeButtonVisible: Boolean(document.querySelector('[data-action="resume-active-task"]'))
      };
    })()`);
    if (pausedAudit.actualMinutes !== 20 || pausedAudit.remainingMinutes !== pausedAudit.originalMinutes - 20) {
      throw new Error(`Interruption accounting failed: ${JSON.stringify(pausedAudit)}`);
    }
    if (pausedAudit.pendingIncludesInterruptedTask || !pausedAudit.resumeButtonVisible) {
      throw new Error(`Interrupted task was not released correctly: ${JSON.stringify(pausedAudit)}`);
    }
    await evaluate("document.querySelector('[data-action=\"resume-active-task\"]')?.click(); true");
    await waitFor(`tasks.find((item) => String(item.id) === String(${taskIdLiteral}))?.status === 'queued'`, appWaitAttempts);
    await waitFor(`(pendingSchedulePlan?.plan_patch || []).some((block) => String(block.task_id) === String(${taskIdLiteral}))`, appWaitAttempts);
    const resumedAudit = await evaluate(`(() => {
      const task = tasks.find((item) => String(item.id) === String(${taskIdLiteral}));
      const blocks = (pendingSchedulePlan?.plan_patch || []).filter((block) => String(block.task_id) === String(task.id));
      return {
        status: task.status,
        remainingMinutes: task.execution?.remaining_duration_minutes,
        lastReentry: task.contextWindow?.lastReentry || null,
        recoveryCue: task.contextWindow?.recoveryCue || '',
        pendingIncludesInterruptedTask: (pendingSchedulePlan?.plan_patch || []).some((block) => String(block.task_id) === String(task.id)),
        scheduledWorkMinutes: blocks.reduce((sum, block) => sum + Number(block.planned_work_minutes ?? block.session_minutes ?? Math.round((block.end - block.start) * 60)), 0),
        scheduledCapacityMinutes: blocks.reduce((sum, block) => sum + Number(block.session_minutes ?? Math.round((block.end - block.start) * 60)), 0),
        pendingStatus: pendingSchedulePlan?.status || '',
        provider: pendingSchedulePlan?.ai_provenance?.provider || pendingSchedulePlan?.provenance?.provider || '',
        model: pendingSchedulePlan?.ai_provenance?.model || pendingSchedulePlan?.provenance?.model || '',
        assistantTail: chatMessages.slice(-8).map((message) => ({role: message.role, text: message.text}))
      };
    })()`);
    if (!resumedAudit.pendingIncludesInterruptedTask || !resumedAudit.lastReentry) {
      throw new Error(`Re-entry did not produce a confirmable replan: ${JSON.stringify(resumedAudit)}`);
    }
    if (resumedAudit.scheduledWorkMinutes !== resumedAudit.remainingMinutes || resumedAudit.scheduledCapacityMinutes < resumedAudit.scheduledWorkMinutes || resumedAudit.scheduledCapacityMinutes - resumedAudit.scheduledWorkMinutes >= 15) {
      throw new Error(`Re-entry work/capacity accounting failed: ${JSON.stringify(resumedAudit)}`);
    }
    interruptionAudit = { paused: pausedAudit, resumed: resumedAudit };
    const interruptionScreenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
    writeFileSync(join(artifactDir, "backend-interruption-simulation.png"), Buffer.from(interruptionScreenshot.data, "base64"));
    writeFileSync(join(artifactDir, "backend-interruption-simulation-audit.json"), JSON.stringify(interruptionAudit, null, 2));

    await evaluate("pendingSchedulePlan = null; render(); true");
    const taskCountBeforePreview = await evaluate("tasks.length");
    await evaluate(`handleChatTurn('明天下午三点开组会，持续1小时；周三前写完论文，预计3小时。').then(() => true)`);
    await waitFor("!document.getElementById('chatSendBtn').disabled", appWaitAttempts);
    await waitFor("pendingTaskPreview.length === 2 && document.getElementById('taskPreviewDialog').open", appWaitAttempts);
    const previewAudit = await evaluate(`(() => ({
      taskCountBefore: ${Number.isFinite(taskCountBeforePreview) ? taskCountBeforePreview : 0},
      taskCountDuringPreview: tasks.length,
      previews: pendingTaskPreview.map((task) => ({title:task.title, due:task.due, duration:task.duration, task_type:task.task_type, evidence:task.source_spans, confidence:task.confidence})),
      dialogOpen: document.getElementById('taskPreviewDialog').open
    }))()`);
    if (previewAudit.taskCountDuringPreview !== previewAudit.taskCountBefore || !previewAudit.dialogOpen) {
      throw new Error(`Parse preview created tasks too early: ${JSON.stringify(previewAudit)}`);
    }
    await evaluate("document.getElementById('taskPreviewForm').requestSubmit(); true");
    await waitFor("!document.getElementById('taskPreviewDialog').open", appWaitAttempts);
    await waitFor("tasks.some((task) => String(task.title || '').includes('开组会')) && tasks.some((task) => String(task.title || '').includes('写完论文'))", appWaitAttempts);
    await waitFor("pendingSchedulePlan?.candidate_plans?.length >= 1 && (pendingSchedulePlan.plan_patch || []).some((block) => tasks.some((task) => String(task.id) === String(block.task_id) && (String(task.title || '').includes('开组会') || String(task.title || '').includes('写完论文'))))", appWaitAttempts);
    await wait(500);
    chatAudit = await evaluate(`(() => {
      const matchingTasks = tasks.filter((task) => ['开组会', '写完论文'].some((name) => String(task.title || '').includes(name)));
      const matchingIds = new Set(matchingTasks.map((task) => String(task.id)));
      const matchingBlocks = (pendingSchedulePlan?.plan_patch || []).filter((block) => matchingIds.has(String(block.task_id)));
      return {
        tasks: matchingTasks.map((task) => ({
          id: task.id,
          title: task.title,
          due: task.due,
          deadline_time: task.deadline_time || '',
          duration: task.duration,
          task_type: task.task_type,
          status: task.status
        })),
        blocks: matchingBlocks.map((block) => ({
          title: block.title,
          kind: block.kind,
          day_index: block.day_index,
          start: block.start,
          end: block.end,
          conflict: Boolean(block.constraint_conflict),
          violations: block.violations || []
        })),
        needsClarification: pendingSchedulePlan?.needs_clarification || [],
        provider: pendingSchedulePlan?.ai_provenance?.provider || pendingSchedulePlan?.provenance?.provider || '',
        model: pendingSchedulePlan?.ai_provenance?.model || pendingSchedulePlan?.provenance?.model || '',
        decisionEvidenceItems: document.querySelectorAll('#decisionTrace .trace-card:nth-child(2) li').length,
        decisionTraceHeight: Math.round(document.getElementById('decisionTrace')?.getBoundingClientRect().height || 0),
        parsePreview: ${JSON.stringify(null)},
        candidateCount: pendingSchedulePlan?.candidate_plans?.length || 0,
        candidateTabs: document.querySelectorAll('.candidate-tab').length,
        assistantTail: chatMessages.slice(-8).map((message) => ({role: message.role, text: message.text}))
      };
    })()`);
    chatAudit.parsePreview = previewAudit;
    const chatScreenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
    writeFileSync(join(artifactDir, "backend-chat-simulation.png"), Buffer.from(chatScreenshot.data, "base64"));
    writeFileSync(join(artifactDir, "backend-chat-simulation-audit.json"), JSON.stringify(chatAudit, null, 2));
  }
  // A saved account must not silently restore behind the visible auth card.
  // Reloading should require an explicit login while preserving backend data.
  await command("Page.reload", { ignoreCache: true });
  await waitFor("document.readyState === 'complete'");
  await waitFor("!document.getElementById('authScreen').classList.contains('hidden')");
  const explicitLoginAudit = await evaluate(`(() => ({
    authVisible: !document.getElementById('authScreen').classList.contains('hidden'),
    profileHidden: document.getElementById('profileScreen').classList.contains('hidden'),
    appHidden: document.getElementById('appRoot').classList.contains('hidden'),
    storedSessionCleared: !localStorage.getItem('humanosSyy7User')
  }))()`);
  if (!explicitLoginAudit.authVisible || !explicitLoginAudit.profileHidden || !explicitLoginAudit.appHidden || !explicitLoginAudit.storedSessionCleared) {
    throw new Error(`Page reload silently restored a previous session: ${JSON.stringify(explicitLoginAudit)}`);
  }
  console.log(JSON.stringify({ schedule: audit, meetingUpdate: meetingUpdateAudit, interruption: interruptionAudit, chat: chatAudit, parallel: parallelAudit, explicitLogin: explicitLoginAudit }));
} finally {
  try { socket?.close(); } catch {}
  browser.kill();
  await wait(200);
  rmSync(profile, { recursive: true, force: true });
}
