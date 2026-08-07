const seedTasks = [
  {
    id: "lit-review",
    title: "Review interruption and task-resumption literature",
    due: "Wednesday 18:00",
    duration: 90,
    priority: "高",
    status: "running",
    context: "Compare Adamczyk & Bailey, Iqbal & Bailey, TaskTracer, TaskSnap, and HumanOS.",
    slot: { start: 9, end: 10.5, color: "blue" },
    checkpoints: [
      {
        label: "Last progress",
        text: "Confirmed that interruption-timing research supports the minimal-disruption principle."
      },
      {
        label: "Open question",
        text: "Clarify the difference between Motion-style scheduling and HumanOS-style resumption."
      },
      {
        label: "Next action",
        text: "Write the related-work gap around resuming academic tasks after interruption."
      }
    ]
  },
  {
    id: "survey-frame",
    title: "Rewrite formative survey RQ",
    due: "Thursday 12:00",
    duration: 75,
    priority: "高",
    status: "scheduled",
    context: "Narrow the survey from general control to interruption, switching, recovery, and replanning.",
    slot: { start: 11, end: 12.25, color: "green" },
    checkpoints: []
  },
  {
    id: "prototype",
    title: "HumanOS prototype flow",
    due: "Friday 15:00",
    duration: 120,
    priority: "中",
    status: "scheduled",
    context: "Use calendar scheduling while adding interruption records and resumption cues.",
    slot: { start: 14, end: 16, color: "violet" },
    checkpoints: []
  },
  {
    id: "meeting",
    title: "Summarize supervisor meeting",
    due: "Tonight",
    duration: 45,
    priority: "低",
    status: "queued",
    context: "Summarize the main decisions and points of disagreement.",
    slot: null,
    checkpoints: []
  }
];

function cloneSeedTasks() {
  return JSON.parse(JSON.stringify(seedTasks));
}

let tasks = JSON.parse(localStorage.getItem("humanosSyy7MotionTasks") || "null");
if (!Array.isArray(tasks)) tasks = cloneSeedTasks();
tasks = tasks.map(normalizeBackendTask);
tasks = migrateLegacyParsedTasks(tasks);
let activeId = tasks[0]?.id || null;
let activeSelectionMode = "auto";
const API_HOST = window.location.hostname || "127.0.0.1";
const API_PROTOCOL = window.location.protocol === "https:" ? "https:" : "http:";
const API_QUERY_BASE = new URLSearchParams(window.location.search).get("api");
const API_BASE = window.HUMANOS_API_BASE || API_QUERY_BASE || `${API_PROTOCOL}//${API_HOST}:8787`;
const STATIC_SHARE_MODE = Boolean(window.HUMANOS_STATIC_SHARE);
let sharedTestClock = null;

function syncSharedTestClock(clock) {
  if (!clock?.enabled || !clock.simulated_now) {
    sharedTestClock = null;
    return;
  }
  sharedTestClock = {
    ...clock,
    simulatedBaseMs: new Date(clock.simulated_now).getTime(),
    realAnchorMs: Date.now()
  };
}

function appNowMs() {
  if (!sharedTestClock) return Date.now();
  const scale = Math.max(Number(sharedTestClock.time_scale || 0), 0);
  return sharedTestClock.simulatedBaseMs + (Date.now() - sharedTestClock.realAnchorMs) * scale * 60;
}

function appNow() {
  return new Date(appNowMs());
}
let currentUser = JSON.parse(localStorage.getItem("humanosSyy7User") || "null");
let authMode = "login";
let backendOnline = false;
let authPending = false;
let calendarView = "day";
let chatMessages = [];
let pendingSchedulePlan = null;
let confirmedSchedulePlan = null;
let scheduleRequestInFlight = null;
let scheduleConfirmationInFlight = false;
let pendingRationaleSubmission = null;
let qaRationalePreview = false;
let qaScenarioManifest = null;
let qaActiveScenarioId = null;
let qaAutoPlayTimer = null;
let currentExecutionState = null;
let executionClockTimer = null;
let executionActionInFlight = false;
let rightRailMode = "plan";
let previousRightRailMode = "plan";
let pendingReviewKey = "";
let pendingTaskPreview = [];
const promptedSlots = new Set(JSON.parse(localStorage.getItem("humanosSyy7PromptedSlots") || "[]"));
function createDefaultProfile() {
  return {
    role: "master_student",
    deep_work_window: "09:00-11:30",
    low_energy_window: "14:00-15:30",
    control_preference: "ai_proposed_user_editable",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    weekly_context: {},
    research_context: { planning_tools: [], primary_planning_tool: null, planning_tool_use_frequency: null, source: "user_self_report", captured_at: null, revision: 0 },
    learned_patterns: []
  };
}

function clientContextPayload() {
  const now = appNow();
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || currentProfile?.timezone || "UTC",
    now: now.toISOString(),
    local_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    utc_offset_minutes: -now.getTimezoneOffset()
  };
}

let currentProfile = JSON.parse(localStorage.getItem("humanosSyy7Profile") || "null") || createDefaultProfile();
confirmedSchedulePlan = currentProfile.weekly_context?.confirmed_plan_summary || null;
let lastDecision = null;
let editingTaskId = null;
let editingContextEventId = null;
let syncingWizardForm = false;
const HOUR_ROW_HEIGHT = 72;
const CALENDAR_STEP_MINUTES = 15;

const calendar = document.getElementById("calendar");
const chatThread = document.getElementById("chatThread");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");
const activeTask = document.getElementById("activeTask");
const contextWindow = document.getElementById("contextWindow");
const checkpointView = document.getElementById("checkpointView");
const checkpointCount = document.getElementById("checkpointCount");
const resumeBrief = document.getElementById("resumeBrief");
const decisionTrace = document.getElementById("decisionTrace");
const modePill = document.getElementById("modePill");
const enginePill = document.getElementById("enginePill");
const resumeSubtitle = document.getElementById("resumeSubtitle");
const dialog = document.getElementById("taskDialog");
const pauseDialog = document.getElementById("pauseDialog");
const pauseForm = document.getElementById("pauseForm");
const feedbackDialog = document.getElementById("feedbackDialog");
const feedbackForm = document.getElementById("feedbackForm");
const focusInput = document.getElementById("focusInput");
const energyInput = document.getElementById("energyInput");
const stressInput = document.getElementById("stressInput");
const emotionInput = document.getElementById("emotionInput");
const backendStatus = document.getElementById("backendStatus");
const profileRole = document.getElementById("profileRole");
const profileDeepWork = document.getElementById("profileDeepWork");
const profileControl = document.getElementById("profileControl");
const profilePlanningTools = document.getElementById("profilePlanningTools");
const profilePrimaryPlanningTool = document.getElementById("profilePrimaryPlanningTool");
const profilePlanningFrequency = document.getElementById("profilePlanningFrequency");
const openProfileWizardBtn = document.getElementById("openProfileWizardBtn");
const authScreen = document.getElementById("authScreen");
const authForm = document.getElementById("authForm");
const authName = document.getElementById("authName");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authNameLabel = document.getElementById("authNameLabel");
const authError = document.getElementById("authError");
const authHint = document.getElementById("authHint");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const loginModeBtn = document.getElementById("loginModeBtn");
const registerModeBtn = document.getElementById("registerModeBtn");
const userBadge = document.getElementById("userBadge");
const logoutBtn = document.getElementById("logoutBtn");
const workspaceNavBtn = document.getElementById("workspaceNavBtn");
const profileHomeBtn = document.getElementById("profileHomeBtn");
const workspaceView = document.getElementById("workspaceView");
const profileHomeView = document.getElementById("profileHomeView");
const dayViewBtn = document.getElementById("dayViewBtn");
const weekViewBtn = document.getElementById("weekViewBtn");
const taskForm = document.getElementById("taskForm");
const taskPreviewDialog = document.getElementById("taskPreviewDialog");
const taskPreviewForm = document.getElementById("taskPreviewForm");
const taskPreviewList = document.getElementById("taskPreviewList");
const closeTaskDialogBtn = document.getElementById("closeTaskDialogBtn");
const pendingSchedule = document.getElementById("pendingSchedule");
const pendingScheduleText = document.getElementById("pendingScheduleText");
const planConfidenceInput = document.getElementById("planConfidenceInput");
const confirmScheduleBtn = document.getElementById("confirmScheduleBtn");
const rejectScheduleBtn = document.getElementById("rejectScheduleBtn");
const planReviewCount = document.getElementById("planReviewCount");
const planReviewEmpty = document.getElementById("planReviewEmpty");
const planReviewTitle = document.getElementById("planReviewTitle");
const planReviewDescription = document.getElementById("planReviewDescription");
const planReviewPanel = document.getElementById("planReviewPanel");
const planReviewHead = document.getElementById("planReviewHead");
const planDecisionTrace = document.getElementById("planDecisionTrace");
const planReviewActions = document.getElementById("planReviewActions");
const nowCard = document.getElementById("nowCard");
const executionRail = document.getElementById("executionRail");
const executionTodayLabel = document.getElementById("executionTodayLabel");
const executionPlanState = document.getElementById("executionPlanState");
const todayAfterList = document.getElementById("todayAfterList");
const todayPlanSummary = document.getElementById("todayPlanSummary");
const weeklyBufferSummary = document.getElementById("weeklyBufferSummary");
const weeklyBufferDays = document.getElementById("weeklyBufferDays");
const executionWhyContent = document.getElementById("executionWhyContent");
const executionTechnicalDetails = document.getElementById("executionTechnicalDetails");
const executionViewWeekBtn = document.getElementById("executionViewWeekBtn");
const executionEditPlanBtn = document.getElementById("executionEditPlanBtn");
const viewFullDayBtn = document.getElementById("viewFullDayBtn");
const planRationaleDialog = document.getElementById("planRationaleDialog");
const planRationaleForm = document.getElementById("planRationaleForm");
const selectedTaskDetails = document.getElementById("selectedTaskDetails");
const closeTaskDetailsBtn = document.getElementById("closeTaskDetailsBtn");
const chatDrawer = document.getElementById("chatDrawer");
const conflictLegend = document.getElementById("conflictLegend");
const parallelLegend = document.getElementById("parallelLegend");
const todayBadge = document.getElementById("todayBadge");
const taskDialogTitle = document.getElementById("taskDialogTitle");
const saveTaskBtn = document.getElementById("saveTaskBtn");
const deleteTaskBtn = document.getElementById("deleteTaskBtn");
const appRoot = document.getElementById("appRoot");
const qaTimeController = document.getElementById("qaTimeController");
const qaClockSummary = document.getElementById("qaClockSummary");
const qaControllerStatus = document.getElementById("qaControllerStatus");
const qaResetDialog = document.getElementById("qaResetDialog");
const profileScreen = document.getElementById("profileScreen");
const profileWizard = document.getElementById("profileWizard");
const wizardRole = document.getElementById("wizardRole");
const wizardPlanningTools = document.getElementById("wizardPlanningTools");
const wizardPrimaryPlanningTool = document.getElementById("wizardPrimaryPlanningTool");
const wizardPlanningFrequency = document.getElementById("wizardPlanningFrequency");
const wizardDeepWork = document.getElementById("wizardDeepWork");
const wizardAvailableWindows = document.getElementById("wizardAvailableWindows");
const wizardLowEnergy = document.getElementById("wizardLowEnergy");
const wizardSessionLength = document.getElementById("wizardSessionLength");
const wizardRestLength = document.getElementById("wizardRestLength");
const wizardMorningEnergy = document.getElementById("wizardMorningEnergy");
const wizardAfternoonEnergy = document.getElementById("wizardAfternoonEnergy");
const wizardEveningEnergy = document.getElementById("wizardEveningEnergy");
const wizardLearningMode = document.getElementById("wizardLearningMode");
const wizardNearDeadlines = document.getElementById("wizardNearDeadlines");
const wizardFixedEvents = document.getElementById("wizardFixedEvents");
const wizardTemporaryConstraints = document.getElementById("wizardTemporaryConstraints");
const contextEventDialog = document.getElementById("contextEventDialog");
const contextEventForm = document.getElementById("contextEventForm");
const wizardWeeklyNote = document.getElementById("wizardWeeklyNote");
const wizardKeepBuffer = document.getElementById("wizardKeepBuffer");
const wizardGoal = document.getElementById("wizardGoal");
const wizardEmotion = document.getElementById("wizardEmotion");
const wizardFocus = document.getElementById("wizardFocus");
const wizardEnergy = document.getElementById("wizardEnergy");
const wizardStress = document.getElementById("wizardStress");
const wizardError = document.getElementById("wizardError");
const saveWizardBtn = document.getElementById("saveWizardBtn");
const wizardNextBtn = document.getElementById("wizardNextBtn");
const wizardBackBtn = document.getElementById("wizardBackBtn");
const wizardBackBtnRhythm = document.getElementById("wizardBackBtnRhythm");
const wizardNextBtnRhythm = document.getElementById("wizardNextBtnRhythm");
const wizardBackBtnContext = document.getElementById("wizardBackBtnContext");
const wizardNextBtnContext = document.getElementById("wizardNextBtnContext");
const addWeeklyTaskBtn = document.getElementById("addWeeklyTaskBtn");
const weeklyTaskList = document.getElementById("weeklyTaskList");
const weeklyTaskBlock = document.getElementById("weeklyTaskBlock");
const wizardWeekPreview = document.getElementById("wizardWeekPreview");
const wizardConstraintPreview = document.getElementById("wizardConstraintPreview");
const availableWindowRows = document.getElementById("availableWindowRows");
const fixedEventRows = document.getElementById("fixedEventRows");
const temporaryConstraintRows = document.getElementById("temporaryConstraintRows");
const addAvailableWindowBtn = document.getElementById("addAvailableWindowBtn");
const addFixedEventBtn = document.getElementById("addFixedEventBtn");
const addTemporaryConstraintBtn = document.getElementById("addTemporaryConstraintBtn");
const wizardStepEyebrow = document.getElementById("wizardStepEyebrow");
const wizardStepTitle = document.getElementById("wizardStepTitle");
const wizardStepDescription = document.getElementById("wizardStepDescription");
const profileSummary = document.getElementById("profileSummary");
const dailyCheckInDialog = document.getElementById("dailyCheckInDialog");
const dailyCheckInForm = document.getElementById("dailyCheckInForm");
const dailyEmotion = document.getElementById("dailyEmotion");
const dailyFocus = document.getElementById("dailyFocus");
const dailyEnergy = document.getElementById("dailyEnergy");
const dailyStress = document.getElementById("dailyStress");
const dailyChangeNote = document.getElementById("dailyChangeNote");
const skipDailyCheckInBtn = document.getElementById("skipDailyCheckInBtn");
const keepTodayPlanBtn = document.getElementById("keepTodayPlanBtn");
const weekRolloverDialog = document.getElementById("weekRolloverDialog");
const weekRolloverForm = document.getElementById("weekRolloverForm");
const weekRolloverTasks = document.getElementById("weekRolloverTasks");
const weekRolloverSummary = document.getElementById("weekRolloverSummary");
const startFreshWeekBtn = document.getElementById("startFreshWeekBtn");
let pendingWeekRollover = null;
let weeklyTaskRowCounter = 0;
let structuredContextRowCounter = 0;

function save() {
  localStorage.setItem("humanosSyy7MotionTasks", JSON.stringify(tasks));
  localStorage.setItem("humanosSyy7PromptedSlots", JSON.stringify(Array.from(promptedSlots)));
  localStorage.setItem("humanosSyy7Profile", JSON.stringify(currentProfile));
  if (STATIC_SHARE_MODE && currentUser?.email) {
    localStorage.setItem(`humanosSyy7StaticState:${currentUser.email.toLowerCase()}`, JSON.stringify({
      profile: currentProfile,
      tasks,
      prompted_slots: Array.from(promptedSlots)
    }));
  }
}

function priorityClass(priority) {
  return priority === "高" ? "high" : priority === "中" ? "medium" : "low";
}

function selectedTask() {
  return tasks.find((task) => task.id === activeId) || null;
}

function schedulingNodeForTask(task) {
  if (!task) {
    return {
      title: "Ready Queue",
      zh: "Candidate task pool",
      className: "green",
      product: "The task has not entered execution; HumanOS maintains it as an available candidate.",
      evidence: "OS ready queue: the task can run, but the scheduler still decides whether it fits current resources."
    };
  }
  if (task.status === "running") {
    return {
      title: "Running on CPU",
      zh: "In progress",
      className: "red",
      product: "The current task is using the primary cognitive resource; progress, blockers, and switching risk remain active.",
      evidence: "OS running state: calendar placement is not completion; execution produces new evidence."
    };
  }
  if (task.status === "paused") {
    return {
      title: "Context Switch",
      zh: "Context switch",
      className: "gold",
      product: "A paused task stores progress, open questions, and the first action for returning.",
      evidence: "OS context switch: switching has a cost, so state is saved to reduce context loss on return."
    };
  }
  if (task.status === "blocked") {
    return {
      title: "Waiting / Blocked",
      zh: "Waiting / Blocked",
      className: "blue",
      product: "The task depends on materials, a reply, approval, or another external condition and should not consume deep-work capacity.",
      evidence: "OS blocked state: a process waiting on I/O or an external event leaves the CPU and returns to the ready queue later."
    };
  }
  if (task.status === "completed") {
    return {
      title: "Terminated",
      zh: "Completed",
      className: "gray",
      product: "After completion, estimated and actual demand are compared to update future scheduling baselines.",
      evidence: "OS terminated state: resources are released and outcomes recorded; HumanOS then supports reflection and model updates."
    };
  }
  if (task.slot) {
    return {
      title: "Dispatcher",
      zh: "Dispatched to calendar",
      className: "coral",
      product: "The task has an execution window but remains confirmable, editable, draggable, and resizable.",
      evidence: "OS dispatcher: after scheduler selection, the dispatcher sends the task to its execution entry point."
    };
  }
  return {
    title: "Ready Queue",
    zh: "Waiting to be scheduled",
    className: "green",
    product: "The task is recorded but has no concrete session yet; it remains in the candidate pool.",
    evidence: "OS ready queue: runnable tasks wait before the scheduler selects one according to policy."
  };
}

function selectTask(taskId, mode = "manual") {
  if (!tasks.some((task) => task.id === taskId)) return;
  activeId = taskId;
  activeSelectionMode = mode;
  if (mode === "manual") rightRailMode = "task";
}

function syncRightRailMode() {
  const showingAgent = rightRailMode === "agent";
  const showingTask = rightRailMode === "task" && hasSelectedTask();
  const confirmed = Boolean(confirmedSchedulePlan?.plan_patch?.length && !pendingSchedulePlan?.plan_patch?.length);
  const executionRunning = currentExecutionState?.mode === "now" || currentExecutionState?.mode === "paused";
  executionRail?.classList.toggle("hidden", !confirmed || ((showingAgent || showingTask) && !executionRunning));
  executionRail?.classList.toggle("compact-now", confirmed && (showingTask || showingAgent) && executionRunning);
  planReviewPanel?.classList.toggle("hidden", showingAgent || (confirmed && !showingTask));
  const addTaskAction = document.getElementById("addTaskBtn");
  const draftIsOpen = Boolean(pendingSchedulePlan?.plan_patch?.length);
  addTaskAction?.classList.toggle("primary", !draftIsOpen);
  addTaskAction?.classList.toggle("ghost", draftIsOpen);
  [planReviewHead, planDecisionTrace, planReviewEmpty, pendingSchedule].forEach((element) => {
    element?.classList.toggle("rail-mode-hidden", showingTask);
  });
  selectedTaskDetails?.classList.toggle("hidden", !showingTask || showingAgent);
  if (!showingAgent && chatDrawer?.open) chatDrawer.open = false;
}

function hasSelectedTask() {
  return Boolean(selectedTask());
}

function currentUserId() {
  return currentUser?.id || null;
}

function todayLabel() {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(appNow());
}

function weekStartLabel(value = appNow()) {
  const date = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(...value.split("-").map((part, index) => Number(part) - (index === 1 ? 1 : 0)))
    : new Date(value);
  const day = date.getDay() || 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - day + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const calendarDay = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${calendarDay}`;
}

const WEEKLY_DAY_OPTIONS = ["任意一天", "每天", "工作日", "周末", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function dayDisplayLabel(value = "") {
  return {
    任意一天: "Any day this week", 工作日: "Weekdays", 每天: "Repeat every day", 周末: "Weekend",
    周一: "Monday", 周二: "Tuesday", 周三: "Wednesday", 周四: "Thursday",
    周五: "Friday", 周六: "Saturday", 周日: "Sunday"
  }[value] || value;
}

function localizeWeeklyContextText(value = "") {
  const replacements = [
    ["任意一天", "Any day this week"], ["工作日", "Weekdays"], ["每天", "Repeat every day"], ["每日", "Repeat every day"], ["周末", "Weekend"],
    ["周一", "Monday"], ["周二", "Tuesday"], ["周三", "Wednesday"], ["周四", "Thursday"],
    ["周五", "Friday"], ["周六", "Saturday"], ["周日", "Sunday"], ["周天", "Sunday"],
    ["系统建议，待确认", "AI suggestion; review needed"], ["可调整", "Adjustable"],
    ["时长", "duration "], ["分钟", " minutes"]
  ];
  return replacements.reduce((text, [source, target]) => text.split(source).join(target), String(value));
}

function structuredDayFromText(text = "") {
  if (/工作日/.test(text)) return "工作日";
  if (/每天|每日/.test(text)) return "每天";
  if (/周末/.test(text)) return "周末";
  const match = String(text).match(/(?:周|星期)([一二三四五六日天])/);
  return match ? `周${match[1].replace("天", "日")}` : "工作日";
}

function clockText(value) {
  const hour = Math.floor(Number(value));
  const minute = Math.round((Number(value) - hour) * 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function chineseClockNumber(value = "") {
  const direct = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return Number(text);
  if (direct[text] !== undefined) return direct[text];
  if (/^十[一二三四五六七八九]$/.test(text)) return 10 + direct[text[1]];
  if (/^二十[一二三]?$/.test(text)) return 20 + (text[2] ? direct[text[2]] : 0);
  return null;
}

function normalizeClockInputValue(value = "") {
  const raw = String(value).trim().replace(/：/g, ":");
  if (!raw) return "";
  const numeric = raw.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (numeric) {
    const hour = Number(numeric[1]);
    const minute = Number(numeric[2] || 0);
    return hour <= 23 && minute <= 59 ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : raw;
  }
  const match = raw.match(/^(早上|上午|中午|下午|晚上)?\s*([零一二两三四五六七八九十\d]{1,3})\s*(?:点|时)(?:\s*(半|[零一二两三四五六七八九十\d]{1,3})\s*分?)?$/);
  if (!match) return raw;
  let hour = chineseClockNumber(match[2]);
  let minute = match[3] === "半" ? 30 : (match[3] ? chineseClockNumber(match[3]) : 0);
  if (hour === null || minute === null) return raw;
  if (["下午", "晚上"].includes(match[1]) && hour < 12) hour += 12;
  if (match[1] === "中午" && hour < 11) hour += 12;
  return hour <= 23 && minute <= 59 ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : raw;
}

function snapDurationToQuarter(value, fallback = 15) {
  const minutes = Number(value);
  return Math.max(15, Math.round((Number.isFinite(minutes) ? minutes : fallback) / 15) * 15);
}

function normalizeTaskDurationMinutes(value, fallback = 60) {
  const minutes = Number(value);
  return Math.max(5, Math.round(Number.isFinite(minutes) ? minutes : fallback));
}

function explicitActivityDurationMinutes(text = "") {
  const match = String(text).match(/(?:时长|持续)\s*(\d+)\s*(分钟|min|小时|h)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return /小时|h/i.test(match[2]) ? amount * 60 : amount;
}

function normalizedContextActivityType(item = {}) {
  const value = String(item.type || item.category || "");
  if (["temporary_constraint", "blocked_time"].includes(value)) return "temporary_constraint";
  if (["recurring_routine", "routine", "habit_period"].includes(value)) return "recurring_routine";
  if (["flexible_activity", "ai_arranged"].includes(value)) return "flexible_activity";
  return "fixed_event";
}

function contextActivityLabel(type = "fixed_event") {
  return type === "recurring_routine" ? "Usually around this time" : type === "flexible_activity" ? "HumanOS may choose the time" : type === "temporary_constraint" ? "Unavailable this week" : "Cannot move";
}

function contextActivityPrefix(type = "fixed_event") {
  return type === "recurring_routine" ? "Routine" : type === "flexible_activity" ? "Flexible" : type === "temporary_constraint" ? "Blocked" : "Fixed";
}

function structuredSeedFromText(text = "") {
  const range = timeRangeFromText(text);
  const title = String(text)
    .replace(/(?:工作日|每天|每日|周末|(?:周|星期)[一二三四五六日天])/g, "")
    .replace(/((?:早上|上午|中午|下午|晚上)?\s*\d{1,2}(?:[:：]\d{2})?)\s*(?:至|到|[-–—])\s*((?:早上|上午|中午|下午|晚上)?\s*\d{1,2}(?:[:：]\d{2})?)/g, "")
    .replace(/(?:时长|持续)\s*\d+\s*(?:分钟|min|小时|h)/gi, "")
    .replace(/^\s*(?:固定时间|固定|习惯时段|日常|灵活活动|可移动|已占用|可灵活安排)\s*/g, "")
    .trim();
  const type = /^\s*(?:习惯时段|日常)/.test(String(text)) || /午饭|晚饭|早餐|通勤|睡眠|接送/.test(String(text))
    ? "recurring_routine"
    : /^\s*(?:灵活活动|可移动|可灵活安排)/.test(String(text)) || /健身|运动|洗衣|购物|打扫|散步/.test(String(text))
      ? "flexible_activity"
      : "fixed_event";
  return {
    day: type === "recurring_routine" && !/(?:工作日|每天|每日|周末|(?:周|星期)[一二三四五六日天])/.test(String(text)) ? "每天" : structuredDayFromText(text),
    start: range?.start !== undefined ? clockText(range.start) : "",
    end: range?.end !== null && range?.end !== undefined ? clockText(range.end) : "",
    title,
    duration: explicitActivityDurationMinutes(text),
    type
  };
}

function newContextItemId() {
  if (globalThis.crypto?.randomUUID) return `context-${globalThis.crypto.randomUUID()}`;
  return `context-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function structuredSeedFromItem(item = {}) {
  const legacyOnceThisWeek = normalizedContextActivityType(item) === "flexible_activity" && !item.occurrence_mode && item.day === "每天" && /laundry|washing|podcast|audio|listen|speech|洗衣|播客|音频|听力/i.test(`${item.title || ""} ${item.label || ""}`);
  const day = legacyOnceThisWeek ? "任意一天" : item.day || (Array.isArray(item.days) && item.days.length === 1
    ? `周${["一", "二", "三", "四", "五", "六", "日"][item.days[0]]}`
    : (normalizedContextActivityType(item) === "flexible_activity" && item.occurrence_mode === "once_this_week" ? "任意一天" : "周一"));
  return {
    id: item.id,
    type: normalizedContextActivityType(item),
    title: item.title || item.label || "",
    day,
    start: item.start !== undefined && item.start !== null ? clockText(Number(item.start)) : "",
    end: item.end !== undefined && item.end !== null ? clockText(Number(item.end)) : "",
    duration: item.duration_minutes || item.duration || ""
  };
}

function daySelectMarkup(value = "工作日") {
  return WEEKLY_DAY_OPTIONS.map((day) => `<option value="${day}" ${day === value ? "selected" : ""}>${dayDisplayLabel(day)}</option>`).join("");
}

function bindStructuredRow(row) {
  row.querySelectorAll("input, select").forEach((control) => {
    control.addEventListener("input", () => {
      syncStructuredContextFields();
      updateWizardWeekPreview();
    });
    control.addEventListener("change", () => {
      if (control.classList.contains("structured-type")) {
        const day = row.querySelector(".structured-day");
        if (control.value === "flexible_activity" && day?.value === "周一") day.value = "任意一天";
        updateActivityDurationField(row);
      }
      syncStructuredContextFields();
      updateWizardWeekPreview();
    });
  });
  row.querySelectorAll(".clock-input").forEach((input) => {
    input.addEventListener("blur", () => {
      input.value = normalizeClockInputValue(input.value);
      syncStructuredContextFields();
      updateWizardWeekPreview();
    });
  });
  row.querySelector(".structured-title")?.addEventListener("blur", () => {
    const title = row.querySelector(".structured-title")?.value || "";
    const typeSelect = row.querySelector(".structured-type");
    const defaults = inferredRoutineDefaults(title);
    if (!typeSelect || !defaults || typeSelect.value !== "fixed_event") return;
    typeSelect.value = "recurring_routine";
    const day = row.querySelector(".structured-day");
    const start = row.querySelector(".structured-start");
    const end = row.querySelector(".structured-end");
    if (day?.value === "周一") day.value = "每天";
    if (start && !start.value) start.value = clockText(defaults.start);
    if (end && !end.value) end.value = clockText(defaults.end);
    row.dataset.inferredRoutine = "true";
    updateActivityDurationField(row);
    syncStructuredContextFields();
    updateWizardWeekPreview();
  });
  row.querySelector(".remove-structured-row")?.addEventListener("click", () => {
    row.remove();
    syncStructuredContextFields();
    updateWizardWeekPreview();
  });
  updateActivityDurationField(row);
}

function updateActivityDurationField(row) {
  const field = row.querySelector(".flexible-duration-field");
  if (!field) return;
  const input = field.querySelector("input");
  const type = row.querySelector(".structured-type")?.value || "fixed_event";
  const isFlexible = type === "flexible_activity";
  const isRoutine = type === "recurring_routine";
  field.classList.toggle("hidden", !isFlexible);
  input.disabled = !isFlexible;
  input.required = false;
  row.classList.toggle("ai-arranged", isFlexible);
  row.classList.toggle("routine-period", isRoutine);
  const start = row.querySelector(".structured-start");
  const end = row.querySelector(".structured-end");
  if (start) start.placeholder = isFlexible ? "17:00" : isRoutine ? "12:00" : "14:00";
  if (end) end.placeholder = isFlexible ? "21:00" : isRoutine ? "13:00" : "15:00";
}

function addAvailableWindowRow(seed = {}) {
  structuredContextRowCounter += 1;
  const row = document.createElement("div");
  row.className = "structured-row available-row";
  row.dataset.rowId = String(structuredContextRowCounter);
  row.innerHTML = `
    <select class="structured-day" aria-label="Day">${daySelectMarkup(seed.day || "工作日")}</select>
    <input class="structured-start clock-input" type="text" value="${seed.start || ""}" placeholder="08:00" pattern="(?:[01]?\\d|2[0-3]):[0-5]\\d" title="Use 24-hour time, e.g. 08:00" aria-label="Start time">
    <span>to</span>
    <input class="structured-end clock-input" type="text" value="${seed.end || ""}" placeholder="18:30" pattern="(?:[01]?\\d|2[0-3]):[0-5]\\d" title="Use 24-hour time, e.g. 18:30" aria-label="End time">
    <button class="remove-structured-row" type="button" aria-label="Remove window">×</button>
  `;
  bindStructuredRow(row);
  availableWindowRows.appendChild(row);
  syncStructuredContextFields();
}

function addFixedEventRow(seed = {}) {
  structuredContextRowCounter += 1;
  const row = document.createElement("div");
  row.className = "structured-row fixed-row";
  row.dataset.rowId = String(structuredContextRowCounter);
  row.dataset.contextId = seed.id || newContextItemId();
  const suggestedDuration = Number(seed.duration || 0) || "";
  const seedType = normalizedContextActivityType(seed);
  row.innerHTML = `
    <select class="structured-type" aria-label="Context type">
      <option value="fixed_event" ${seedType === "fixed_event" ? "selected" : ""}>Cannot move</option>
      <option value="recurring_routine" ${seedType === "recurring_routine" ? "selected" : ""}>Usually around this time</option>
      <option value="flexible_activity" ${seedType === "flexible_activity" ? "selected" : ""}>HumanOS may choose the time</option>
    </select>
    <input class="structured-title" type="text" value="${escapeHtml(seed.title || "")}" placeholder="Lab meeting / lunch / exercise" aria-label="Item name">
    <select class="structured-day" aria-label="Frequency or allowed day">${daySelectMarkup(seed.day || (seedType === "flexible_activity" ? "任意一天" : "周一"))}</select>
    <input class="structured-start clock-input" type="text" value="${seed.start || ""}" placeholder="14:00" pattern="(?:[01]?\\d|2[0-3]):[0-5]\\d" title="Exact time for fixed events; preferred time for routines; possible range for flexible activities" aria-label="Start time or range start">
    <span>to</span>
    <input class="structured-end clock-input" type="text" value="${seed.end || ""}" placeholder="15:00" pattern="(?:[01]?\\d|2[0-3]):[0-5]\\d" title="Exact time for fixed events; preferred time for routines; possible range for flexible activities" aria-label="End time or range end">
    <label class="flexible-duration-field"><span>About</span><input class="structured-duration" type="number" min="5" step="1" value="${suggestedDuration ? Math.max(5, Math.round(suggestedDuration)) : ""}" placeholder="AI" title="Enter any whole-minute estimate, or leave blank for a HumanOS estimate" aria-label="Estimated duration"><span>min</span></label>
    <button class="remove-structured-row" type="button" aria-label="Remove item">×</button>
  `;
  bindStructuredRow(row);
  fixedEventRows.appendChild(row);
  syncStructuredContextFields();
}

function collectStructuredContextItems() {
  const activityItems = Array.from(fixedEventRows?.querySelectorAll(".fixed-row") || []).map((row) => {
    const type = row.querySelector(".structured-type").value;
    const title = row.querySelector(".structured-title").value.trim();
    const day = row.querySelector(".structured-day").value;
    const startText = normalizeClockInputValue(row.querySelector(".structured-start").value);
    const endText = normalizeClockInputValue(row.querySelector(".structured-end").value);
    let start = startText ? parseClockToken(startText) : null;
    let end = endText ? parseClockToken(endText) : null;
    const duration = Number(row.querySelector(".structured-duration")?.value || 0);
    const estimatedFlexibleDuration = type === "flexible_activity" ? (duration || flexibleActivityDurationMinutes(title)) : null;
    const inferredDefault = type === "recurring_routine" && (start === null || end === null || row.dataset.inferredRoutine === "true") ? inferredRoutineDefaults(title) : null;
    if (inferredDefault) {
      start = inferredDefault.start;
      end = inferredDefault.end;
    }
    return {
      id: row.dataset.contextId || newContextItemId(),
      type,
      category: type,
      title,
      day,
      days: dayIndicesFromText(day),
      occurrence_mode: type === "flexible_activity" ? (day === "任意一天" ? "once_this_week" : "repeat_each_selected_day") : null,
      start,
      end,
      duration_minutes: type === "flexible_activity" ? estimatedFlexibleDuration : (start !== null && end !== null ? Math.round((end - start) * 60) : null),
      shift_minutes: type === "recurring_routine" ? 30 : 0,
      confirmed: Boolean(title && dayIndicesFromText(day).length && (type === "flexible_activity" ? estimatedFlexibleDuration : start !== null && end !== null && end > start)),
      confidence: inferredDefault || (type === "flexible_activity" && !duration) ? "low" : "high",
      source: inferredDefault || (type === "flexible_activity" && !duration) ? "ai_default_suggestion" : "user",
      evidence: inferredDefault ? [inferredDefault.label, "Common routine estimate; editable in the calendar"] : type === "flexible_activity" && !duration ? [`AI initial duration estimate: ${estimatedFlexibleDuration} minutes`] : ["Provided by the user"]
    };
  });
  const temporaryItems = Array.from(temporaryConstraintRows?.querySelectorAll(".constraint-row") || []).map((row) => {
    const title = row.querySelector(".structured-title").value.trim();
    const day = row.querySelector(".structured-day").value;
    const startText = normalizeClockInputValue(row.querySelector(".structured-start").value);
    const endText = normalizeClockInputValue(row.querySelector(".structured-end").value);
    const start = startText ? parseClockToken(startText) : null;
    const end = endText ? parseClockToken(endText) : null;
    return {
      id: row.dataset.contextId || newContextItemId(),
      type: "temporary_constraint",
      category: "temporary_constraint",
      title,
      day,
      days: dayIndicesFromText(day),
      start,
      end,
      duration_minutes: start !== null && end !== null ? Math.round((end - start) * 60) : null,
      confirmed: Boolean(title && dayIndicesFromText(day).length && start !== null && end !== null && end > start),
      confidence: "high",
      source: "user",
      evidence: ["User-entered blocked time"]
    };
  });
  return [...activityItems, ...temporaryItems].filter((item) => item.title);
}

function addTemporaryConstraintRow(seed = {}) {
  structuredContextRowCounter += 1;
  const row = document.createElement("div");
  row.className = "structured-row constraint-row";
  row.dataset.rowId = String(structuredContextRowCounter);
  row.dataset.contextId = seed.id || newContextItemId();
  row.innerHTML = `
    <input class="structured-title" type="text" value="${escapeHtml(seed.title || "")}" placeholder="Out / lab closed" aria-label="Blocked-time name">
    <select class="structured-day" aria-label="Day">${daySelectMarkup(seed.day || "周五")}</select>
    <input class="structured-start clock-input" type="text" value="${seed.start || ""}" placeholder="14:00" pattern="(?:[01]?\\d|2[0-3]):[0-5]\\d" title="Use 24-hour time, e.g. 14:00" aria-label="Blocked-time start">
    <span>to</span>
    <input class="structured-end clock-input" type="text" value="${seed.end || ""}" placeholder="17:00" pattern="(?:[01]?\\d|2[0-3]):[0-5]\\d" title="Use 24-hour time, e.g. 17:00" aria-label="Blocked-time end">
    <button class="remove-structured-row" type="button" aria-label="Remove blocked time">×</button>
  `;
  bindStructuredRow(row);
  temporaryConstraintRows.appendChild(row);
  syncStructuredContextFields();
}

function syncStructuredContextFields() {
  const windows = Array.from(availableWindowRows?.querySelectorAll(".available-row") || []).map((row) => {
    const day = row.querySelector(".structured-day").value;
    const start = row.querySelector(".structured-start").value;
    const end = row.querySelector(".structured-end").value;
    return start && end ? `${day} ${start}-${end}` : "";
  }).filter(Boolean);
  const fixed = Array.from(fixedEventRows?.querySelectorAll(".fixed-row") || []).map((row) => {
    const type = row.querySelector(".structured-type").value;
    const prefix = contextActivityPrefix(type);
    const title = row.querySelector(".structured-title").value.trim();
    const day = row.querySelector(".structured-day").value;
    const start = row.querySelector(".structured-start").value;
    const end = row.querySelector(".structured-end").value;
    const duration = Number(row.querySelector(".structured-duration")?.value || 0);
    const durationText = type === "flexible_activity" && duration ? ` duration ${duration} minutes` : "";
    return title ? `${prefix} ${day}${start && end ? ` ${start}-${end}` : ""} ${title}${durationText}` : "";
  }).filter(Boolean);
  const temporary = Array.from(temporaryConstraintRows?.querySelectorAll(".constraint-row") || []).map((row) => {
    const title = row.querySelector(".structured-title").value.trim();
    const day = row.querySelector(".structured-day").value;
    const start = row.querySelector(".structured-start").value;
    const end = row.querySelector(".structured-end").value;
    return title && start && end ? `${day} ${start}-${end} ${title}` : "";
  }).filter(Boolean);
  wizardAvailableWindows.value = windows.join("；");
  wizardFixedEvents.value = fixed.join("，");
  wizardTemporaryConstraints.value = temporary.join("；");
  saveOnboardingDraft();
}

function populateStructuredContextRows() {
  availableWindowRows.innerHTML = "";
  fixedEventRows.innerHTML = "";
  temporaryConstraintRows.innerHTML = "";
  const windows = String(wizardAvailableWindows.value || "").split(/[；;\n]/).map((item) => item.trim()).filter(Boolean);
  const storedItems = valueList(currentProfile.weekly_context?.context_items).filter((item) => item && typeof item === "object");
  const fixed = commaList(wizardFixedEvents.value || "");
  const constraints = commaList(wizardTemporaryConstraints.value || "");
  (windows.length ? windows.map(structuredSeedFromText) : [{}]).forEach(addAvailableWindowRow);
  if (storedItems.length) {
    storedItems.filter((item) => normalizedContextActivityType(item) !== "temporary_constraint").map(structuredSeedFromItem).forEach(addFixedEventRow);
    storedItems.filter((item) => normalizedContextActivityType(item) === "temporary_constraint").map(structuredSeedFromItem).forEach(addTemporaryConstraintRow);
  }
  else fixed.map(structuredSeedFromText).forEach(addFixedEventRow);
  if (!storedItems.some((item) => normalizedContextActivityType(item) === "temporary_constraint")) {
    constraints.map((text) => structuredSeedFromText(text)).forEach(addTemporaryConstraintRow);
  }
  syncStructuredContextFields();
}

function setWizardStep(step) {
  const steps = ["profile", "rhythm", "context", "tasks"];
  const index = Math.max(0, steps.indexOf(step));
  const isWide = step === "context" || step === "tasks";
  const meta = {
    profile: ["Start with what stays true", "A few stable preferences help HumanOS make a useful first plan."],
    rhythm: ["Describe your working rhythm", "These are scheduling preferences, not predictions about every day."],
    context: ["When can HumanOS schedule work, and what time should it avoid?", "Add available time and the activities HumanOS should protect or place flexibly."],
    tasks: ["Add this week's work", "HumanOS proposes sessions only inside the times you just provided."]
  }[step] || ["Set up HumanOS", "Review each page before continuing."];
  document.querySelectorAll("[data-wizard-page]").forEach((page) => {
    page.classList.toggle("hidden", page.dataset.wizardPage !== step);
  });
  profileWizard.classList.toggle("weekly-mode", isWide);
  wizardStepEyebrow.textContent = `Step ${index + 1} of ${steps.length}`;
  wizardStepTitle.textContent = meta[0];
  wizardStepDescription.textContent = meta[1];
  document.querySelectorAll(".step-progress span").forEach((dot, index) => {
    dot.classList.toggle("active", index <= steps.indexOf(step));
  });
  if (step === "tasks" && !weeklyTaskList.children.length) {
    addWeeklyTaskRow({ due: "周五", duration: 60, priority: "中" });
  }
  updateWizardWeekPreview();
  profileScreen.scrollTo({ top: 0, behavior: "smooth" });
}

function addWeeklyTaskRow(seed = {}) {
  weeklyTaskRowCounter += 1;
  const row = document.createElement("div");
  row.className = "weekly-task-row";
  row.dataset.rowId = String(weeklyTaskRowCounter);
  // Keep the backend task identity stable while the user edits its title,
  // deadline, duration, priority, or difficulty. Without this ID, changing a
  // deadline made the same task look like a new task and left the old calendar
  // sessions behind.
  row.dataset.taskId = seed.id || "";
  const deadlineDay = (String(seed.due || "").match(/(?:周|星期)([一二三四五六日天])/) || [null, "三"])[1].replace("天", "日");
  const parsedDeadlineHour = parseDueStartHour(seed.due || "");
  const deadlineTime = parsedDeadlineHour === null ? "" : clockText(parsedDeadlineHour);
  row.innerHTML = `
    <input class="weekly-task-title" type="text" value="${escapeHtml(seed.title || "")}" placeholder="Task name" aria-label="Task name">
    <select class="weekly-task-due" aria-label="Deadline day">
      ${["一", "二", "三", "四", "五", "六", "日"].map((day, index) => `<option value="周${day}" ${deadlineDay === day ? "selected" : ""}>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}</option>`).join("")}
    </select>
    <label class="weekly-duration-input">
      <input class="weekly-task-duration" type="number" min="15" step="15" required value="${normalizeTaskDurationMinutes(seed.duration || 60)}" aria-label="Total work in minutes">
      <span>min</span>
    </label>
    <details class="weekly-task-more">
      <summary>HumanOS estimate · ${seed.priority === "高" ? "High" : seed.priority === "低" ? "Low" : "Medium"} priority · ${difficultyLabelFromTask(seed) === "hard" ? "Demanding" : difficultyLabelFromTask(seed) === "light" ? "Light" : "Moderate"}</summary>
      <div class="weekly-task-more-grid">
        <label>Deadline time (optional)<input class="weekly-task-due-time clock-input" type="text" value="${deadlineTime}" placeholder="18:00" pattern="(?:[01]?\\d|2[0-3]):[0-5]\\d" title="Only fill this when there is a specific submission time" aria-label="Optional deadline time"><small>HumanOS chooses the task’s start time.</small></label>
        <label>Priority<select class="weekly-task-priority" aria-label="Priority">${[["高", "High priority"], ["中", "Medium priority"], ["低", "Low priority"]].map(([priority, label]) => `<option value="${priority}" ${(seed.priority || "中") === priority ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label>Expected difficulty<select class="weekly-task-difficulty" aria-label="Expected difficulty">${[["light", "Light effort"], ["medium", "Moderate effort"], ["hard", "Demanding effort"]].map(([value, label]) => `<option value="${value}" ${difficultyLabelFromTask(seed) === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <label class="weekly-task-dependency-field">Depends on (optional)<input class="weekly-task-dependency" type="text" value="${escapeHtml(seed.contextWindow?.dependency || seed.dependency || "")}" placeholder="e.g. Review supervisor comments"></label>
      </div>
    </details>
    <button class="remove-weekly-task" type="button" aria-label="Remove task">×</button>
  `;
  const schedulingDetails = row.querySelector(".weekly-task-more");
  if (schedulingDetails) {
    schedulingDetails.open = true;
    schedulingDetails.classList.add("always-open");
    const summary = schedulingDetails.querySelector("summary");
    if (summary) summary.textContent = "Scheduling details — review and edit";
    schedulingDetails.addEventListener("toggle", () => {
      if (!schedulingDetails.open) schedulingDetails.open = true;
    });
  }
  row.querySelectorAll("input, select").forEach((input) => input.addEventListener("input", updateWizardWeekPreview));
  row.querySelector(".weekly-task-duration")?.addEventListener("change", (event) => {
    event.target.value = String(normalizeTaskDurationMinutes(event.target.value, 60));
    updateWizardWeekPreview();
  });
  row.querySelector(".remove-weekly-task").addEventListener("click", () => {
    row.remove();
    if (!weeklyTaskList.children.length) addWeeklyTaskRow();
    updateWizardWeekPreview();
  });
  weeklyTaskList.appendChild(row);
  updateWizardWeekPreview();
}

function collectWeeklyTaskDrafts() {
  return Array.from(weeklyTaskList.querySelectorAll(".weekly-task-row")).map((row, index) => {
    const existing = tasks.find((task) => String(task.id) === String(row.dataset.taskId || ""));
    const difficulty = row.querySelector(".weekly-task-difficulty").value || "medium";
    const difficultyScore = { light: 2, medium: 4, hard: 6 }[difficulty];
    const dueDay = row.querySelector(".weekly-task-due").value.trim();
    const dueTime = row.querySelector(".weekly-task-due-time").value.trim();
    return {
      ...(row.dataset.taskId ? { id: row.dataset.taskId } : {}),
      title: row.querySelector(".weekly-task-title").value.trim(),
      due: `${dueDay}${dueTime ? ` ${dueTime}` : ""}前完成`,
    deadline_assumption: dueTime ? null : "Temporarily treated as the end of the final available window that day; editable",
      duration: normalizeTaskDurationMinutes(row.querySelector(".weekly-task-duration").value),
      priority: row.querySelector(".weekly-task-priority").value || "中",
      expected_difficulty: difficultyScore,
      cognitive_load: difficulty === "hard" ? "high" : difficulty === "light" ? "low" : "medium",
      task_demand: {
        estimated_cognitive_load: difficulty === "hard" ? "high" : difficulty === "light" ? "low" : "medium",
        expected_difficulty: difficultyScore,
        evidence: [`user difficulty=${difficulty}`],
        confidence_level: "high",
        source: "user_self_report",
        user_confirmed: true
      },
      dependency: row.querySelector(".weekly-task-dependency")?.value.trim() || null,
      contextWindow: {
        ...(existing?.contextWindow || {}),
        dependency: row.querySelector(".weekly-task-dependency")?.value.trim() || null
      }
    };
  }).filter((task) => task.title);
}

function onboardingDraftStorageKey() {
  return `humanosSyy7OnboardingDraft:${currentUserId() || currentUser?.email || "anonymous"}`;
}

function checkedValues(container) {
  return Array.from(container?.querySelectorAll('input[type="checkbox"]:checked') || []).map((input) => input.value);
}

function setCheckedValues(container, values) {
  const selected = new Set(valueList(values));
  container?.querySelectorAll('input[type="checkbox"]').forEach((input) => { input.checked = selected.has(input.value); });
}

function researchContextFromWizard() {
  return {
    planning_tools: checkedValues(wizardPlanningTools),
    primary_planning_tool: wizardPrimaryPlanningTool?.value || null,
    planning_tool_use_frequency: wizardPlanningFrequency?.value || null,
    source: "user_self_report"
  };
}

function saveOnboardingDraft() {
  if (syncingWizardForm || !currentUser) return;
  const availableWindows = Array.from(availableWindowRows?.querySelectorAll(".available-row") || []).map((row) => ({
    day: row.querySelector(".structured-day")?.value || "周一",
    start: row.querySelector(".structured-start")?.value || "",
    end: row.querySelector(".structured-end")?.value || ""
  }));
  const contextItems = Array.from(fixedEventRows?.querySelectorAll(".fixed-row") || []).map((row) => ({
    id: row.dataset.contextId || newContextItemId(),
    type: row.querySelector(".structured-type")?.value || "fixed_event",
    title: row.querySelector(".structured-title")?.value || "",
    day: row.querySelector(".structured-day")?.value || "周一",
    start: row.querySelector(".structured-start")?.value || "",
    end: row.querySelector(".structured-end")?.value || "",
    duration: Number(row.querySelector(".structured-duration")?.value || 0) || ""
  }));
  const temporaryItems = Array.from(temporaryConstraintRows?.querySelectorAll(".constraint-row") || []).map((row) => ({
    id: row.dataset.contextId || newContextItemId(),
    title: row.querySelector(".structured-title")?.value || "",
    day: row.querySelector(".structured-day")?.value || "周一",
    start: row.querySelector(".structured-start")?.value || "",
    end: row.querySelector(".structured-end")?.value || ""
  }));
  const draft = {
    version: 1,
    saved_at: appNow().toISOString(),
    role: wizardRole?.value,
    learning_mode: wizardLearningMode?.value,
    deep_work_window: wizardDeepWork?.value,
    low_energy_window: wizardLowEnergy?.value,
    preferred_session_minutes: wizardSessionLength?.value,
    rest_between_tasks_minutes: wizardRestLength?.value,
    morning_energy: wizardMorningEnergy?.value,
    afternoon_energy: wizardAfternoonEnergy?.value,
    evening_energy: wizardEveningEnergy?.value,
    weekly_goal: wizardGoal?.value,
    weekly_note: wizardWeeklyNote?.value,
    keep_buffer: Boolean(wizardKeepBuffer?.checked),
    emotion: wizardEmotion?.value,
    focus: wizardFocus?.value,
    energy: wizardEnergy?.value,
    stress: wizardStress?.value,
    research_context: researchContextFromWizard(),
    available_windows: availableWindows,
    context_items: contextItems,
    temporary_items: temporaryItems,
    tasks: collectWeeklyTaskDrafts()
  };
  localStorage.setItem(onboardingDraftStorageKey(), JSON.stringify(draft));
}

function restoreOnboardingDraft() {
  if (currentProfile?.task_preferences?.onboarding_completed) return false;
  let draft = null;
  try {
    draft = JSON.parse(localStorage.getItem(onboardingDraftStorageKey()) || "null");
  } catch {
    draft = null;
  }
  if (!draft || draft.version !== 1) return false;
  wizardRole.value = draft.role || wizardRole.value;
  wizardLearningMode.value = draft.learning_mode || wizardLearningMode.value;
  wizardDeepWork.value = draft.deep_work_window || wizardDeepWork.value;
  wizardLowEnergy.value = draft.low_energy_window || wizardLowEnergy.value;
  wizardSessionLength.value = draft.preferred_session_minutes || wizardSessionLength.value;
  wizardRestLength.value = draft.rest_between_tasks_minutes || wizardRestLength.value;
  wizardMorningEnergy.value = draft.morning_energy || wizardMorningEnergy.value;
  wizardAfternoonEnergy.value = draft.afternoon_energy || wizardAfternoonEnergy.value;
  wizardEveningEnergy.value = draft.evening_energy || wizardEveningEnergy.value;
  wizardGoal.value = draft.weekly_goal || "";
  wizardWeeklyNote.value = draft.weekly_note || "";
  wizardKeepBuffer.checked = draft.keep_buffer !== false;
  wizardEmotion.value = draft.emotion || wizardEmotion.value;
  wizardFocus.value = draft.focus || wizardFocus.value;
  wizardEnergy.value = draft.energy || wizardEnergy.value;
  wizardStress.value = draft.stress || wizardStress.value;
  setCheckedValues(wizardPlanningTools, draft.research_context?.planning_tools);
  wizardPrimaryPlanningTool.value = draft.research_context?.primary_planning_tool || "";
  wizardPlanningFrequency.value = draft.research_context?.planning_tool_use_frequency || "";
  availableWindowRows.innerHTML = "";
  valueList(draft.available_windows).forEach((item) => addAvailableWindowRow(item));
  fixedEventRows.innerHTML = "";
  valueList(draft.context_items).forEach((item) => addFixedEventRow(item));
  temporaryConstraintRows.innerHTML = "";
  valueList(draft.temporary_items).forEach((item) => addTemporaryConstraintRow(item));
  weeklyTaskList.innerHTML = "";
  valueList(draft.tasks).forEach((task) => addWeeklyTaskRow(task));
  if (!availableWindowRows.children.length) addAvailableWindowRow();
  if (!weeklyTaskList.children.length) addWeeklyTaskRow();
  syncStructuredContextFields();
  updateWizardWeekPreview();
  updateMomentaryStateValues();
  return true;
}

function clearOnboardingDraft() {
  localStorage.removeItem(onboardingDraftStorageKey());
}

function difficultyLabelFromTask(task = {}) {
  const score = Number(task.expected_difficulty ?? task.task_demand?.expected_difficulty);
  if (score >= 6 || task.cognitive_load === "high") return "hard";
  if (score > 0 && score <= 2 || task.cognitive_load === "low") return "light";
  return "medium";
}

function updateWizardWeekPreview() {
  if (!wizardWeekPreview) return;
  updateAvailabilityGate();
  const days = ["一", "二", "三", "四", "五", "六", "日"];
  const drafts = collectWeeklyTaskDrafts();
  wizardWeekPreview.innerHTML = days.map((day, index) => {
    const cards = drafts.filter((task) => dayIndexFromDue(task.due) === index);
    return `<div class="preview-day"><span>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}</span>${cards.map((task) => `<article><strong>${escapeHtml(task.title)}</strong><small>AI will schedule · ${task.duration} min</small></article>`).join("")}</div>`;
  }).join("");
  if (wizardConstraintPreview) {
    const draftProfile = {
      ...currentProfile,
      weekly_context: {
        weekly_available_windows: wizardAvailableWindows.value.trim(),
        fixed_events: commaList(wizardFixedEvents.value),
        context_items: collectStructuredContextItems(),
        temporary_constraints: commaList(wizardTemporaryConstraints.value),
        other_commitments: [],
        keep_buffer: wizardKeepBuffer.checked
      }
    };
    const activities = parsedWeeklyActivities(draftProfile);
    const typeLabel = {
      fixed_event: "Cannot move",
      recurring_routine: "Usually around this time",
      flexible_activity: "HumanOS may choose the time",
      temporary_constraint: "Unavailable this week"
    };
    wizardConstraintPreview.innerHTML = `
      <div><span>Available windows</span><strong>${escapeHtml(localizeWeeklyContextText(wizardAvailableWindows.value.trim()) || "Not set")}</strong></div>
      <div><span>Protected and flexible time</span><strong>${activities.length ? activities.map((item) => {
        const flexibleDuration = item.type === "flexible_activity" ? ` (${flexibleActivityDurationMinutes(item.text)} min)` : item.type === "recurring_routine" ? " (preferred window, ±30 min)" : "";
        const missingRange = !item.range && item.type === "fixed_event"
          ? " (missing exact time; not added to calendar)"
          : !item.range && item.type === "recurring_routine" && !inferredRoutineDefaults(item.text)
            ? " (missing routine window)"
            : "";
        return `${escapeHtml(localizeWeeklyContextText(item.text))} → ${typeLabel[item.type] || "Context item"}${flexibleDuration}${missingRange}`;
      }).join("; ") : "None"}</strong></div>
      <div><span>Buffer</span><strong>${wizardKeepBuffer.checked ? "Reserve about 15% of daily availability" : "No additional buffer"}</strong></div>
    `;
  }
}

function updateAvailabilityGate() {
  const unlocked = Boolean(wizardAvailableWindows.value.trim());
  weeklyTaskBlock?.classList.toggle("is-locked", !unlocked);
  addWeeklyTaskBtn.disabled = !unlocked;
  weeklyTaskList.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = !unlocked;
  });
}

function showAuth() {
  authScreen.classList.remove("hidden");
  profileScreen.classList.add("hidden");
  appRoot.classList.add("hidden");
  userBadge.textContent = currentUser?.email || "Signed out";
}

function hideAuth() {
  authScreen.classList.add("hidden");
  userBadge.textContent = currentUser?.email || "Signed out";
}

function showProfileSetup() {
  hideAuth();
  profileScreen.classList.remove("hidden");
  appRoot.classList.add("hidden");
  syncWizardForm();
  setWizardStep("profile");
}

function dailyCheckInDateKey() {
  const now = appNow();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `humanosSyy7DailyCheck:${currentUserId() || "anonymous"}:${localDate}`;
}

function markDailyCheckInSeen() {
  localStorage.setItem(dailyCheckInDateKey(), "seen");
}

function updateDailyCheckInValues() {
  [[dailyFocus, "dailyFocusValue"], [dailyEnergy, "dailyEnergyValue"], [dailyStress, "dailyStressValue"]].forEach(([input, outputId]) => {
    const output = document.getElementById(outputId);
    if (input && output) output.textContent = `${input.value}/7`;
  });
}

function maybeShowDailyCheckIn() {
  if (!dailyCheckInDialog || !currentUser || !profileCompleted(currentProfile)) return;
  if (currentProfile.last_daily_checkin_date === appNow().toLocaleDateString("en-CA")) return;
  if (localStorage.getItem(dailyCheckInDateKey())) return;
  dailyEmotion.value = emotionInput.value;
  dailyFocus.value = focusInput.value;
  dailyEnergy.value = energyInput.value;
  dailyStress.value = stressInput.value;
  dailyChangeNote.value = "";
  updateDailyCheckInValues();
  if (!dailyCheckInDialog.open) dailyCheckInDialog.showModal();
}

function maybeShowWeekRollover() {
  if (!pendingWeekRollover?.new_week || !weekRolloverDialog) return;
  const unfinished = valueList(pendingWeekRollover.unfinished_tasks);
  weekRolloverSummary.textContent = `You have ${unfinished.length} unfinished task${unfinished.length === 1 ? "" : "s"}. Would you like to use last week as a starting point?`;
  weekRolloverTasks.innerHTML = unfinished.map((task) => `<label class="rollover-task"><input type="checkbox" value="${escapeHtml(task.id)}" checked><span><strong>${escapeHtml(task.title)}</strong><small>${taskWorkRemainingMinutes(task)} min remaining</small></span></label>`).join("") || "<p>No unfinished tasks need to be carried over.</p>";
  if (!weekRolloverDialog.open) weekRolloverDialog.showModal();
}

async function applyWeekRollover(useLastWeek) {
  const carryTaskIds = useLastWeek
    ? Array.from(weekRolloverTasks.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value)
    : [];
  const response = await api("/api/weeks/rollover", {
    method: "POST",
    body: JSON.stringify({ user_id: currentUserId(), week_id: weekStartLabel(), use_last_week: useLastWeek, carry_task_ids: carryTaskIds })
  });
  currentProfile = response.profile;
  tasks = valueList(response.tasks).map(normalizeBackendTask);
  pendingWeekRollover = null;
  weekRolloverDialog.close("completed");
  confirmedSchedulePlan = null;
  pendingSchedulePlan = null;
  showProfileSetup();
  setWizardStep("context");
  setBackendStatus("Review this week’s available time, protected activities, tasks, and goal", true);
}

function showApp() {
  hideAuth();
  profileScreen.classList.add("hidden");
  appRoot.classList.remove("hidden");
  showWorkspaceView();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  window.setTimeout(() => pendingWeekRollover?.new_week ? maybeShowWeekRollover() : maybeShowDailyCheckIn(), 450);
}

function showWorkspaceView() {
  workspaceView.classList.remove("hidden");
  profileHomeView.classList.add("hidden");
  workspaceNavBtn.classList.add("active");
  profileHomeBtn.classList.remove("active");
}

function showProfileHomeView() {
  workspaceView.classList.add("hidden");
  profileHomeView.classList.remove("hidden");
  workspaceNavBtn.classList.remove("active");
  profileHomeBtn.classList.add("active");
  renderProfileSummary();
}

function setAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === "register";
  authNameLabel.classList.toggle("hidden", !isRegister);
  loginModeBtn.classList.toggle("active", !isRegister);
  registerModeBtn.classList.toggle("active", isRegister);
  authSubmitBtn.textContent = isRegister ? "Create account" : "Log in";
  authPassword.autocomplete = isRegister ? "new-password" : "current-password";
  authError.textContent = "";
  if (authHint) {
    authHint.textContent = isRegister
      ? "After signup, you will set your long-term profile. Demo data stays in this browser."
      : "Use an account previously created in this browser.";
  }
}

function userFacingRole(role) {
  return {
    research_student: "Research student", master_student: "Master's student", undergraduate: "Undergraduate",
    independent_learner: "Independent learner", 硕士生: "Master's student", 本科生: "Undergraduate", 自由学习者: "Independent learner"
  }[role] || role;
}

function addChatMessage(sender, title, text, eventKey = "") {
  const normalizedKey = eventKey || `${sender}|${title}|${text}`;
  if (chatMessages.some((message) => message.eventKey === normalizedKey)) return;
  chatMessages.push({
    sender,
    title,
    text,
    eventKey: normalizedKey,
    createdAt: appNow().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  });
  if (chatMessages.length > 20) chatMessages = chatMessages.slice(-20);
}

function formatBackendTime(ms) {
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function chatMessagesFromTurns(turns = []) {
  return turns.flatMap((turn) => {
    const createdAt = formatBackendTime(turn.created_at);
    const featureText = turn.features?.blockers?.length
      ? `\nConstraints you mentioned: ${turn.features.blockers.join(" / ")}`
      : "";
    return [
      {
        sender: "user",
        title: "You",
        text: turn.user_text,
        createdAt
      },
      {
        sender: "ai",
        title: "HumanOS",
        text: `${turn.assistant_reply}${featureText}`,
        createdAt
      }
    ];
  }).slice(-20);
}

function missingTimeConfirmationFields(task) {
  const due = task?.due || "";
  const missing = [];
  const hasDate = /(今天|今晚|明天|后天|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}月\d{1,2}日?|\d{1,2}[/-]\d{1,2}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/.test(due);
  if (!hasDate) missing.push("completion deadline");
  if (hasDate && parseDueStartHour(due) === null && task?.task_type === "fixed_event") missing.push("fixed start time");
  if (!task?.duration || Number(task.duration) <= 0) missing.push("estimated duration");
  return missing;
}

function normalizeChineseClockText(value = "") {
  const numbers = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
  return String(value).replace(/(十二|十一|十|[一二两三四五六七八九])\s*(点|时)/g, (_, number, unit) => `${numbers[number]}${unit}`);
}

function localTaskActionPattern() {
  return /(会议|开会|组会|学习|复习|写|读|阅读|总结|整理|完善|完成|处理|准备|提交|看|做|备战|取|拿|办|买|发|\b(?:finish|complete|write|read|review|study|prepare|design|meet|meeting|submit|send|collect|buy)\b)/i;
}

function migrateLegacyParsedTasks(sourceTasks = []) {
  const seen = new Set();
  return sourceTasks.flatMap((task) => {
    const rawTitle = String(task?.title || "").trim();
    if (/^(?:持续|预计)\s*\d+\s*(?:小时|分钟)$/i.test(rawTitle)) return [];
    const title = rawTitle
      .replace(/^(?:今天|明天)?(?:我要|我需要|需要)/, "")
      .replace(/^(?:之前|以前|前)(?=完成|写|读|整理|准备|提交|做|开|发|取)/, "")
      .trim() || rawTitle;
    const key = `${title.replace(/\s+/g, " ").toLocaleLowerCase()}|${String(task.due || "").replace(/\s+/g, " ").trim().toLocaleLowerCase()}`;
    if (seen.has(key) && !["completed", "terminated"].includes(task.status)) return [];
    seen.add(key);
    return [{ ...task, title }];
  });
}

function localScheduleTaskType(title = "", due = "", context = "") {
  const text = `${title} ${due} ${context}`;
  const hasClock = /\d{1,2}\s*(?:点|时)(?!间)|\d{1,2}[:：]\d{2}|\d{1,2}(?::\d{2})?\s*(?:am|pm)/i.test(normalizeChineseClockText(text));
  const fixedWords = /(会议|开会|组会|上课|面试|考试|预约|appointment|meeting|class|exam)/i.test(text);
  const deadlineWords = /(截止|ddl|deadline|之前|以前|前完成|due|\bby\b|before)/i.test(text);
  return hasClock && (fixedWords || !deadlineWords) ? "fixed_event" : "flexible_task";
}

function localFallbackTasksFromText(text) {
  const clean = String(text || "").trim();
  const relativeDay = "(今天|今晚|明天|后天|周[一二三四五六日天]|星期[一二三四五六日天])";
  const timeWord = "(((早上|上午|中午|下午|晚上)\\s*)?(?:\\d{1,2}|十二|十一|十|[一二两三四五六七八九])\\s*(点|时)(?!间)|\\d{1,2}[:：]\\d{2})";
  const rawSegments = clean
    .split(/然后|最后|再|接着|之后|，|,|。|；|;/)
    .map((segment) => segment.replace(/^[，,。；;、\s]+|[，,。；;、\s]+$/g, ""))
    .filter(Boolean);
  const connectorSegments = [];
  rawSegments.forEach((segment) => {
    const durationOnly = inferDurationMinutesFromText(segment) && !localTaskActionPattern().test(segment) && !new RegExp(relativeDay).test(segment) && !new RegExp(timeWord).test(segment);
    if (durationOnly && connectorSegments.length) connectorSegments[connectorSegments.length - 1] += `，${segment}`;
    else connectorSegments.push(segment);
  });
  const pattern = new RegExp(`((?:${relativeDay})?\\s*(?:${timeWord})?[^，。；;、]*(?:会议|开会|组会|学习|复习|写|读|阅读|总结|整理|完善|完成|处理|准备|提交|看|做|取|拿|办|买|发)[^，。；;]*)`, "g");
  let segments = [];
  let match;
  while ((match = pattern.exec(clean))) {
    const segment = match[1].replace(/^[，,。；;、\s]+|[，,。；;、\s]+$/g, "");
    if (segment) segments.push(segment);
  }
  if (connectorSegments.length >= segments.length) segments = connectorSegments;
  const sourceSegments = segments.length ? segments : [clean];
  let lastDay = "";
  let lastPeriod = "";
  return sourceSegments.slice(0, 8).map((segment, index) => {
    const dayMatch = segment.match(new RegExp(relativeDay));
    if (dayMatch) lastDay = dayMatch[0];
    const periodMatch = segment.match(/早上|上午|中午|下午|晚上/);
    if (periodMatch) lastPeriod = periodMatch[0];
    const dueMatch = segment.match(new RegExp(`(${relativeDay}\\s*${timeWord}|${timeWord}|${relativeDay})`));
    let due = normalizeChineseClockText(dueMatch ? dueMatch[0] : "未设置");
    const separateTimeMatch = segment.match(new RegExp(timeWord));
    if (due !== "未设置" && dayMatch && separateTimeMatch && !new RegExp(timeWord).test(due)) {
      due = `${dayMatch[0]}${separateTimeMatch[0]}`;
    }
    if (due !== "未设置" && lastDay && !new RegExp(relativeDay).test(due)) due = `${lastDay}${due}`;
    if (due !== "未设置" && lastPeriod && /\d{1,2}\s*(点|时)/.test(due) && !/(早上|上午|中午|下午|晚上)/.test(due)) {
      due = due.replace(/(\d{1,2}\s*(点|时))/, `${lastPeriod}$1`);
    }
    if (due === "未设置" && lastDay && periodMatch) due = `${lastDay}${periodMatch[0]}`;
    const title = segment
      .replace(new RegExp(relativeDay, "g"), "")
      .replace(new RegExp(timeWord, "g"), "")
      .replace(/然后|最后|先|需要|进行|我们的|我们|这个|今天我要|明天我要|我要|的/g, "")
      .replace(/^(?:之前|以前|前)(?=完成|写|读|整理|准备|提交|做|开|发|取)/, "")
      .replace(/\d+\s*(?:个\s*)?(?:-|–|—)?\s*(?:分钟|minutes?|mins?|min|小时|hours?|hrs?|h)/gi, "")
      .replace(/大概|大约|预计|持续|左右/g, "")
      .replace(/\s+/g, "")
      .replace(/^[，,。；;、]+|[，,。；;、]+$/g, "")
      || segment;
    return {
      id: `task-${Date.now()}-${index}`,
      title: title.slice(0, 42),
      due,
      duration: inferDurationMinutesFromText(segment),
      task_type: localScheduleTaskType(title, due, segment),
      contextWindow: { taskType: localScheduleTaskType(title, due, segment), deadline: due },
      priority: /紧急|重要|ddl|deadline|优先级高|高优先级/.test(segment) ? "高" : null,
      status: "queued",
      context: segment,
      slot: null,
      checkpoints: [],
      is_preview: true,
      missing_fields: [
        ...(due === "未设置" ? ["deadline_at"] : []),
        ...(inferDurationMinutesFromText(segment) ? [] : ["duration_minutes"])
      ],
      source_spans: [segment],
      confidence: due === "未设置" ? 0.6 : 0.8
    };
  });
}

function parseDueStartHour(due = "") {
  const text = String(due);
  const colonMatch = text.match(/(\d{1,2})[:：](\d{2})/);
  if (colonMatch) {
    let hour = Number(colonMatch[1]);
    const minute = Number(colonMatch[2]);
    if (/(下午|晚上)/.test(text) && hour < 12) hour += 12;
    if (/中午/.test(text) && hour < 11) hour += 12;
    return hour + minute / 60;
  }
  const hourMatch = text.match(/(早上|上午|中午|下午|晚上)?\s*(\d{1,2})\s*(点|时)/);
  if (!hourMatch) return null;
  const period = hourMatch[1] || "";
  let hour = Number(hourMatch[2]);
  if ((period === "下午" || period === "晚上") && hour < 12) hour += 12;
  if (period === "中午" && hour < 11) hour += 12;
  return hour;
}

function dayIndexFromDue(due = "") {
  const text = String(due);
  if (/下周|next\s+week/i.test(text)) return null;
  const map = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 };
  const englishDayMap = { monday: 0, mon: 0, tuesday: 1, tue: 1, wednesday: 2, wed: 2, thursday: 3, thu: 3, friday: 4, fri: 4, saturday: 5, sat: 5, sunday: 6, sun: 6 };
  const absoluteMatch = text.match(/(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})|(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日?/);
  if (absoluteMatch) {
    const now = appNow();
    const year = Number(absoluteMatch[1] || absoluteMatch[4] || now.getFullYear());
    const month = Number(absoluteMatch[2] || absoluteMatch[5]);
    const day = Number(absoluteMatch[3] || absoluteMatch[6]);
    const target = new Date(year, month - 1, day);
    const todayIndex = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayIndex);
    const distance = Math.round((target - monday) / 86400000);
    return distance >= 0 && distance <= 6 ? distance : null;
  }
    const weekMatch = text.match(/(?:周|星期)([一二三四五六日天])/);
    if (weekMatch) return map[weekMatch[1]];
    const englishWeekMatch = text.match(/\b(monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)\b/i);
    if (englishWeekMatch) return englishDayMap[englishWeekMatch[1].toLowerCase()];
    if (/今天|今晚|\btoday\b|\btonight\b/i.test(text)) return (appNow().getDay() + 6) % 7;
    if (/明天|\btomorrow\b/i.test(text)) return new Date(appNowMs() + 86400000).getDay() === 0 ? 6 : new Date(appNowMs() + 86400000).getDay() - 1;
    if (/后天|day\s+after\s+tomorrow/i.test(text)) return new Date(appNowMs() + 2 * 86400000).getDay() === 0 ? 6 : new Date(appNowMs() + 2 * 86400000).getDay() - 1;
  return null;
}

function segmentCoversDay(segment, targetDay) {
  const dayMap = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 };
  const range = segment.match(/周([一二三四五六日天])\s*(?:至|到|-)\s*周?([一二三四五六日天])/);
  if (range) return targetDay >= dayMap[range[1]] && targetDay <= dayMap[range[2]];
  return Array.from(segment.matchAll(/(?:周|星期)([一二三四五六日天])/g)).some((match) => dayMap[match[1]] === targetDay);
}

function dayIndicesFromText(text = "") {
  const clean = String(text);
  const indices = new Set();
  if (/任意一天|每天|每日/.test(clean)) [0, 1, 2, 3, 4, 5, 6].forEach((day) => indices.add(day));
  if (/工作日/.test(clean)) [0, 1, 2, 3, 4].forEach((day) => indices.add(day));
  if (/周末/.test(clean)) [5, 6].forEach((day) => indices.add(day));
  for (const match of clean.matchAll(/周([一二三四五六日天])\s*(?:至|到|[-–—])\s*周?([一二三四五六日天])/g)) {
    const start = dayIndexFromDue(`周${match[1]}`);
    const end = dayIndexFromDue(`周${match[2]}`);
    if (start !== null && end !== null) {
      for (let day = start; day <= end; day += 1) indices.add(day);
    }
  }
  for (const match of clean.matchAll(/(?:周|星期)([一二三四五六日天])/g)) {
    const day = dayIndexFromDue(`周${match[1]}`);
    if (day !== null) indices.add(day);
  }
  return Array.from(indices).sort((a, b) => a - b);
}

function parseClockToken(token = "", context = "") {
  const match = String(token).match(/(\d{1,2})(?:[:：](\d{2}))?/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const tokenPeriod = String(token).match(/早上|上午|中午|下午|晚上/)?.[0];
  const fallbackPeriod = String(context).match(/早上|上午|中午|下午|晚上/)?.[0];
  const period = tokenPeriod || fallbackPeriod || "";
  if (/(下午|晚上)/.test(period) && hour < 12) hour += 12;
  if (period === "中午" && hour < 11) hour += 12;
  return hour + minute / 60;
}

function timeRangeFromText(text = "") {
  const clean = String(text);
  const range = clean.match(/((?:(?:早上|上午|中午|下午|晚上)\s*)?\d{1,2}(?:[:：]\d{2})?)\s*(?:至|到|[-–—])\s*((?:(?:早上|上午|中午|下午|晚上)\s*)?\d{1,2}(?:[:：]\d{2})?)/);
  if (range) {
    const startPeriod = range[1].match(/早上|上午|中午|下午|晚上/)?.[0] || "";
    const start = parseClockToken(range[1]);
    const end = parseClockToken(range[2], startPeriod);
    if (start !== null && end !== null && end > start) return { start, end, explicitEnd: true };
  }
  if (/上午|早上/.test(clean)) return { start: 8, end: 12, explicitEnd: true };
  if (/中午/.test(clean)) return { start: 11.5, end: 13.5, explicitEnd: true };
  if (/下午/.test(clean)) return { start: 12, end: 18, explicitEnd: true };
  if (/晚上/.test(clean)) return { start: 18, end: 23, explicitEnd: true };
  const single = parseDueStartHour(clean);
  return single === null ? null : { start: single, end: null, explicitEnd: false };
}

function classifyWeeklyActivity(text = "") {
  const clean = String(text);
  if (/^\s*日常/.test(clean)) return "recurring_routine";
  if (/^\s*(?:可移动|可灵活安排)/.test(clean)) return "flexible_activity";
  if (/^\s*(?:固定|已占用)/.test(clean)) return "fixed_event";
  if (/午饭|晚饭|早餐|通勤|睡眠|接送|日常/.test(clean)) return "recurring_routine";
  if (/健身|运动|洗衣|购物|打扫|散步/.test(clean)) return "flexible_activity";
  return "fixed_event";
}

function inferredRoutineDefaults(text = "") {
  const clean = String(text);
  if (/早餐/.test(clean)) return { start: 7.5, end: 8.25, label: "建议 07:30-08:15", confidence: "low" };
  if (/午饭/.test(clean)) return { start: 12, end: 13, label: "建议 12:00-13:00", confidence: "low" };
  if (/晚饭/.test(clean)) return { start: 18, end: 19, label: "建议 18:00-19:00", confidence: "low" };
  return null;
}

function parseAvailableWindows(profile = currentProfile) {
  const raw = String(profile.weekly_context?.weekly_available_windows || "");
  const windows = [];
  for (const segment of raw.split(/[；;\n]/).map((item) => item.trim()).filter(Boolean)) {
    const days = dayIndicesFromText(segment);
    const range = timeRangeFromText(segment);
    if (!days.length || !range?.explicitEnd) continue;
    days.forEach((day) => windows.push({ day_index: day, start: range.start, end: range.end, source: segment }));
  }
  return windows;
}

function ensureStructuredWeeklyContext(profile = currentProfile) {
  const weekly = profile.weekly_context || (profile.weekly_context = {});
  if (valueList(weekly.context_items).some((item) => item && typeof item === "object")) return;
  const legacy = [
    ...(Array.isArray(weekly.fixed_events) ? weekly.fixed_events : commaList(String(weekly.fixed_events || ""))),
    ...(Array.isArray(weekly.temporary_constraints) ? weekly.temporary_constraints : commaList(String(weekly.temporary_constraints || "")))
  ].filter((item) => typeof item === "string" && item.trim());
  if (!legacy.length) return;
  weekly.context_items = legacy.map((text) => {
    const seed = structuredSeedFromText(text);
    const start = seed.start ? parseClockToken(seed.start) : null;
    const end = seed.end ? parseClockToken(seed.end) : null;
    return {
      id: newContextItemId(),
      type: seed.type,
      category: seed.type,
      title: seed.title || text,
      day: seed.day,
      days: dayIndicesFromText(seed.day),
      start,
      end,
      duration_minutes: seed.type === "flexible_activity" ? (seed.duration || null) : (start !== null && end !== null ? Math.round((end - start) * 60) : null),
      shift_minutes: seed.type === "recurring_routine" ? 30 : 0,
      confirmed: Boolean(start !== null && end !== null && end > start),
      confidence: start !== null && end !== null ? "high" : "low",
      source: "legacy_migration"
    };
  });
  weekly.temporary_constraints = [];
  if (profile === currentProfile) save();
}

function parsedWeeklyActivities(profile = currentProfile) {
  ensureStructuredWeeklyContext(profile);
  const weekly = profile.weekly_context || {};
  const structured = valueList(weekly.context_items).filter((item) => item && typeof item === "object");
  if (structured.length) {
    return structured.map((item) => {
      const type = normalizedContextActivityType(item);
      const days = Array.isArray(item.days) && item.days.length ? item.days.map(Number) : dayIndicesFromText(item.day || "");
      const hasRange = Number.isFinite(Number(item.start)) && Number.isFinite(Number(item.end)) && Number(item.end) > Number(item.start);
      const text = `${contextActivityPrefix(type)} ${item.day || ""}${hasRange ? ` ${clockText(Number(item.start))}-${clockText(Number(item.end))}` : ""} ${item.title || ""}${type === "flexible_activity" && item.duration_minutes ? ` 时长${item.duration_minutes}分钟` : ""}`.trim();
      return {
        id: item.id,
        text,
        title: item.title || "",
        type,
        days,
        range: hasRange ? { start: Number(item.start), end: Number(item.end), explicitEnd: true } : null,
        duration_minutes: Number(item.duration_minutes || 0) || null,
        occurrence_mode: item.occurrence_mode || (item.day === "任意一天" || (item.day === "每天" && /laundry|washing|podcast|audio|listen|speech|洗衣|播客|音频|听力/i.test(`${item.title || ""} ${item.text || ""}`)) ? "once_this_week" : "repeat_each_selected_day"),
        shift_minutes: item.shift_minutes === null || item.shift_minutes === undefined ? null : Number(item.shift_minutes),
        routine_exceptions: item.routine_exceptions || {},
        confirmed: item.confirmed !== false && (type === "flexible_activity" ? Boolean(days.length && Number(item.duration_minutes || 0)) : hasRange),
        confidence: item.confidence || "high",
        source: item.source || "user",
        evidence: valueList(item.evidence)
      };
    });
  }
  const fixed = Array.isArray(weekly.fixed_events) ? weekly.fixed_events : commaList(String(weekly.fixed_events || ""));
  return fixed.map((text) => ({ id: null, text, title: text, type: classifyWeeklyActivity(text), days: dayIndicesFromText(text), range: timeRangeFromText(text), confirmed: Boolean(timeRangeFromText(text)), confidence: "legacy" }));
}

function hardConstraintIntervals(profile = currentProfile) {
  const weekly = profile.weekly_context || {};
  const items = [];
  const structuredActivities = parsedWeeklyActivities(profile);
  structuredActivities
    .filter((item) => ["fixed_event", "temporary_constraint"].includes(item.type))
    .forEach((item) => items.push({ ...item, source_type: item.type }));
  const temporary = Array.isArray(weekly.temporary_constraints) ? weekly.temporary_constraints : commaList(String(weekly.temporary_constraints || ""));
  if (!structuredActivities.some((item) => item.type === "temporary_constraint")) {
    temporary.forEach((text) => items.push({ text, type: "temporary_constraint", source_type: "temporary_constraint", days: dayIndicesFromText(text), range: timeRangeFromText(text) }));
  }
  const commitments = Array.isArray(weekly.other_commitments)
    ? weekly.other_commitments
    : Array.isArray(weekly.important_deadlines) ? weekly.important_deadlines : [];
  commitments.forEach((text) => items.push({ text, type: "other_commitment", source_type: "other_commitment", days: dayIndicesFromText(text), range: timeRangeFromText(text) }));

  const intervals = [];
  const uncertain = [];
  items.forEach((item) => {
    const days = item.days || [];
    const range = item.range;
    if (!days.length || !range) {
      uncertain.push(`${item.text}（缺少用户确认的日期或时间，不会自动放入日历）`);
      return;
    }
    if (range.end === null && !["recurring_routine", "other_commitment"].includes(item.type)) {
      uncertain.push(item.text);
      return;
    }
    days.forEach((day) => {
      let end = range.end;
      if (end === null) end = range.start + (item.type === "recurring_routine" ? 1 : 0.5);
      intervals.push({
        day_index: day,
        start: range.start,
        end: Math.min(end, 24),
        label: item.text,
        context_id: item.id || null,
        source_type: item.source_type,
        inferred: Boolean(range.end === null),
        confidence: item.confidence || (range.end === null ? "medium" : "high")
      });
    });
  });
  return { intervals, uncertain };
}

function flexibleActivityDurationMinutes(text = "") {
  const explicit = explicitActivityDurationMinutes(text);
  if (explicit) return explicit;
  if (/午饭|晚饭|早餐|吃饭|用餐/.test(text)) return 60;
  if (/通勤|接送/.test(text)) return 45;
  if (/健身|运动|购物/.test(text)) return 60;
  return 45;
}

function recurringRoutineIntervals(profile = currentProfile) {
  const intervals = [];
  const uncertain = [];
  parsedWeeklyActivities(profile).filter((item) => item.type === "recurring_routine").forEach((item) => {
    const defaults = inferredRoutineDefaults(item.text || item.title || "");
    const range = item.range || defaults;
    const days = item.days.length ? item.days : defaults ? [0, 1, 2, 3, 4, 5, 6] : [];
    if (!days.length || !range || range.end === null || range.end <= range.start) {
      uncertain.push(`${item.text}（请填写习惯时段）`);
      return;
    }
    const explicitShiftMinutes = item.shift_minutes === null || item.shift_minutes === undefined
      ? null
      : Math.max(0, Number(item.shift_minutes));
    const shiftHours = explicitShiftMinutes === null ? null : explicitShiftMinutes / 60;
    days.forEach((day) => {
      const exception = item.routine_exceptions?.[String(day)] || item.routine_exceptions?.[day];
      const blockStart = Number.isFinite(Number(exception?.start)) ? Number(exception.start) : range.start;
      const blockEnd = Number.isFinite(Number(exception?.end)) ? Number(exception.end) : range.end;
      intervals.push({
      day_index: day,
      start: blockStart,
      end: blockEnd,
      label: item.text,
      context_id: item.id || null,
      source_type: "recurring_routine",
      preferred_window: { start: range.start, end: range.end },
      availability_window: shiftHours === null
        ? (() => {
            const containingWindow = parseAvailableWindows(profile).find((window) => (
              Number(window.day_index) === Number(day)
              && Number(window.start) <= Number(range.start)
              && Number(window.end) >= Number(range.end)
            ));
            return containingWindow
              ? { start: Number(containingWindow.start), end: Number(containingWindow.end) }
              : { start: Number(range.start), end: Number(range.end) };
          })()
        : { start: Math.max(0, range.start - shiftHours), end: Math.min(24, range.end + shiftHours) },
      movable: true,
      shift_minutes: explicitShiftMinutes,
      inferred: item.source === "ai_default_suggestion" || !item.range,
      confidence: item.confidence || (defaults ? "low" : "high"),
      evidence: exception?.reason || (item.evidence?.length
        ? item.evidence.join("; ")
        : explicitShiftMinutes === null
          ? "This is a preferred routine time. HumanOS may move it within the user's available time when necessary."
          : `This preferred routine may move by up to ${explicitShiftMinutes} minutes.`)
    });
    });
  });
  return { intervals, uncertain };
}

function flexibleActivityIntervals(profile = currentProfile) {
  const intervals = [];
  const uncertain = [];
  const availableWindows = parseAvailableWindows(profile);
  parsedWeeklyActivities(profile).filter((item) => item.type === "flexible_activity").forEach((item) => {
    if (!item.days.length) {
      uncertain.push(`${item.text}（请选择可以发生的日期；具体时间由 AI 尝试判断）`);
      return;
    }
    const requestedMinutes = item.duration_minutes || flexibleActivityDurationMinutes(item.text);
    const candidateIntervals = [];
    item.days.forEach((day) => {
      let windowStart;
      let windowEnd;
      let evidence;
      if (item.range?.explicitEnd) {
        windowStart = item.range.start;
        windowEnd = item.range.end;
        evidence = "用户提供的可发生范围；AI 只在范围内选择具体时间";
      } else {
        const candidates = availableWindows.filter((window) => window.day_index === day && (window.end - window.start) * 60 >= requestedMinutes);
        const preferred = /健身|运动|散步|购物/.test(item.text) ? 17 : /早餐/.test(item.text) ? 8 : /午饭/.test(item.text) ? 12 : /晚饭/.test(item.text) ? 18 : 9;
        const selected = [...candidates].sort((a, b) => Math.abs(a.start - preferred) - Math.abs(b.start - preferred) || (b.end - b.start) - (a.end - a.start))[0];
        if (!selected) {
          uncertain.push(`${item.text}（当天可用时间不足，暂未安排）`);
          return;
        }
        windowStart = selected.start;
        windowEnd = selected.end;
        evidence = "未要求具体时刻；AI 根据可用时间与正常作息选择候选位置";
      }
      const durationMinutes = Math.min(requestedMinutes, Math.max(Math.round((windowEnd - windowStart) * 60), 15));
      const preferredStart = /午饭|吃午饭/.test(item.text) ? 12 : /晚饭/.test(item.text) ? 18 : /早餐/.test(item.text) ? 8 : windowStart;
      const selectedStart = Math.max(windowStart, Math.min(preferredStart, windowEnd - durationMinutes / 60));
      candidateIntervals.push({
        day_index: day,
        start: selectedStart,
        end: selectedStart + durationMinutes / 60,
        label: item.text,
        context_id: item.id || null,
        source_type: "flexible_activity",
        availability_window: { start: windowStart, end: windowEnd },
        inferred: true,
        confidence: "medium",
        evidence
      });
    });
    const placeWithoutUnconfirmedOverlap = (candidate) => {
      const durationHours = Number(candidate.end) - Number(candidate.start);
      const range = candidate.availability_window || { start: candidate.start, end: candidate.end };
      const possibleStarts = [];
      for (let start = Math.ceil(Number(range.start) * 4) / 4; start + durationHours <= Number(range.end) + 0.001; start += 0.25) possibleStarts.push(start);
      possibleStarts.sort((a, b) => Math.abs(a - candidate.start) - Math.abs(b - candidate.start));
      const start = possibleStarts.find((value) => !intervals.some((other) => other.day_index === candidate.day_index && value < other.end && other.start < value + durationHours));
      return start === undefined ? null : { ...candidate, start, end: start + durationHours };
    };
    if (item.occurrence_mode === "once_this_week") {
      for (const candidate of candidateIntervals.sort((a, b) => a.day_index - b.day_index || a.start - b.start)) {
        const chosen = placeWithoutUnconfirmedOverlap(candidate);
        if (chosen) {
          intervals.push(chosen);
          break;
        }
      }
    } else {
      candidateIntervals.forEach((candidate) => {
        const chosen = placeWithoutUnconfirmedOverlap(candidate);
        if (chosen) intervals.push(chosen);
      });
    }
  });
  return { intervals, uncertain };
}

function subtractInterval(window, busy) {
  if (busy.end <= window.start || busy.start >= window.end) return [window];
  const parts = [];
  if (busy.start > window.start) parts.push({ ...window, end: Math.min(busy.start, window.end) });
  if (busy.end < window.end) parts.push({ ...window, start: Math.max(busy.end, window.start) });
  return parts.filter((part) => part.end - part.start >= 0.25);
}

function buildSchedulingContext(profile = currentProfile) {
  const weekly = profile.weekly_context || {};
  const restMinutes = Math.max(15, Math.round(Number(profile.task_preferences?.rest_between_tasks_minutes || 15) / 15) * 15);
  const parsed = hardConstraintIntervals(profile);
  const routines = recurringRoutineIntervals(profile);
  const flexible = flexibleActivityIntervals(profile);
  const recoveryTransitions = parsed.intervals
    .filter((item) => item.source_type === "fixed_event" && item.end < 24)
    .map((item) => ({
      day_index: item.day_index,
      start: item.end,
      end: Math.min(item.end + restMinutes / 60, 24),
      label: "Transition break",
      source_type: "recovery_transition",
      inferred: true,
      confidence: "medium",
      evidence: `${restMinutes} minutes are protected after a fixed event before another task starts.`
    }));
  flexible.intervals.push(...routines.intervals, ...recoveryTransitions);
  let windows = parseAvailableWindows(profile);
  [...parsed.intervals, ...flexible.intervals].forEach((busy) => {
    windows = windows.flatMap((window) => window.day_index === busy.day_index ? subtractInterval(window, busy) : [window]);
  });
  const bufferBlocks = [];
  if (weekly.keep_buffer !== false) {
    const buffered = [];
    for (let day = 0; day < 7; day += 1) {
      const dayWindows = windows.filter((window) => window.day_index === day).sort((a, b) => a.start - b.start).map((window) => ({ ...window, reserved_buffer_minutes: 0 }));
      const totalMinutes = dayWindows.reduce((sum, window) => sum + (window.end - window.start) * 60, 0);
      let reserveLeft = totalMinutes ? Math.max(restMinutes, Math.round(totalMinutes * 0.15)) : 0;
      [...dayWindows].reverse().forEach((window) => {
        const available = Math.max((window.end - window.start) * 60 - 15, 0);
        const take = Math.min(reserveLeft, available);
        if (take <= 0) return;
        const bufferStart = Math.floor((window.end - take / 60 + 1e-9) * 4) / 4;
        bufferBlocks.push({
          id: `buffer-${day}-${bufferStart}`,
          kind: "context",
          context_type: "buffer",
          label: "可调整 Buffer",
          day_index: day,
          start: bufferStart,
          end: window.end,
          color: "buffer"
        });
        window.end = bufferStart;
        window.reserved_buffer_minutes += Math.round(take);
        reserveLeft -= take;
      });
      buffered.push(...dayWindows.filter((window) => window.end - window.start >= 0.25));
    }
    windows = buffered;
  }
  let movableRoutineWindows = parseAvailableWindows(profile);
  const nonRoutineBusy = [
    ...parsed.intervals,
    ...flexible.intervals.filter((item) => item.source_type !== "recurring_routine"),
    ...bufferBlocks
  ];
  nonRoutineBusy.forEach((busy) => {
    movableRoutineWindows = movableRoutineWindows.flatMap((window) => window.day_index === busy.day_index ? subtractInterval(window, busy) : [window]);
  });
  return {
    windows,
    movable_routine_windows: movableRoutineWindows,
    hard_constraints: parsed.intervals,
    flexible_activity_blocks: flexible.intervals,
    buffer_blocks: bufferBlocks,
    routine_blocks: routines.intervals,
    uncertain_constraints: [...parsed.uncertain, ...routines.uncertain, ...flexible.uncertain],
    keep_buffer: weekly.keep_buffer !== false,
    rest_minutes: restMinutes
  };
}

function contextBlocksFromSchedulingContext(context) {
  const constraints = [...(context.hard_constraints || []), ...(context.flexible_activity_blocks || [])].map((constraint, index) => ({
    id: constraint.context_id ? `${constraint.context_id}-${constraint.day_index}` : `context-${constraint.source_type}-${constraint.day_index}-${index}`,
    context_id: constraint.context_id || null,
    kind: "context",
    context_type: constraint.source_type,
    label: `${constraint.label}${constraint.inferred ? "（系统建议，待确认）" : ""}`,
    day_index: constraint.day_index,
    start: constraint.start,
    end: constraint.end,
    color: constraint.source_type === "temporary_constraint" ? "gold" : "context",
    inferred: Boolean(constraint.inferred),
    confidence: constraint.confidence || "high"
  }));
  return [...constraints, ...(context.buffer_blocks || [])];
}

function inferredTaskDemand(task = {}) {
  const expected = Number(task.expected_difficulty ?? task.task_demand?.expected_difficulty);
  if (expected) {
    return {
      level: expected >= 6 ? "high" : expected <= 2 ? "low" : "medium",
      expected_difficulty: expected,
      evidence: task.task_demand?.evidence || [`user expected_difficulty=${expected}/7`],
      confidence: task.task_demand?.confidence_level || "high"
    };
  }
  const text = `${task.title || ""} ${task.context || ""}`;
  const high = /论文|写作|编程|代码|分析|研究|设计|复杂|初稿|proposal/i.test(text);
  const low = /邮件|整理|预约|打印|提交|行政|纪要/i.test(text);
  return {
    level: high ? "high" : low ? "low" : "medium",
    expected_difficulty: null,
    evidence: [`AI 根据任务名称与描述初步估计：${high ? "费力" : low ? "轻松" : "一般"}`],
    confidence: "low"
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function valueList(value) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null || value === "" ? [] : [value];
}

function analysisDisplayText(item) {
  if (typeof item === "string") return localizeDisplayTime(item, true);
  if (!item || typeof item !== "object") return String(item ?? "");
  const before = item.before_task_id || item.predecessor_task_id;
  const after = item.after_task_id || item.successor_task_id;
  if (before || after) {
    const beforeTitle = tasks.find((task) => String(task.id) === String(before))?.title || before || "Predecessor";
    const afterTitle = tasks.find((task) => String(task.id) === String(after))?.title || after || "Following task";
    return `${beforeTitle} → ${afterTitle}: ${localizeDisplayTime(item.reason || "Task dependency requires confirmation", true)}`;
  }
  const evidence = valueList(item.evidence).map((value) => typeof value === "string" ? value : JSON.stringify(value)).join("; ");
  const summary = [item.title || item.task_id, item.level || item.type, item.reason || item.interpretation, evidence].filter(Boolean).join(": ");
  return localizeDisplayTime(summary || JSON.stringify(item), true);
}

function localizeDisplayTime(value, strictEnglish = false) {
  let text = String(value ?? "").replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})/g, (iso) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
    return `${day} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  });
  const replacements = [
    [/工作日/g, "weekdays"], [/每天/g, "every day"], [/周末/g, "weekend"],
    [/周一/g, "Monday"], [/周二/g, "Tuesday"], [/周三/g, "Wednesday"], [/周四/g, "Thursday"], [/周五/g, "Friday"], [/周六/g, "Saturday"], [/周日/g, "Sunday"],
    [/高优先级|优先级高/g, "high priority"], [/中优先级|优先级中/g, "medium priority"], [/低优先级|优先级低/g, "low priority"],
    [/可用窗口[：:]/g, "Available window: "], [/单次专注偏好[：:]/g, "Preferred session length: "], [/约束引擎/g, "constraint validator"],
    [/用户确认与低冲突任务并行/g, "User-confirmed low-conflict parallel session"], [/需要确认任务依赖/g, "Task dependency requires confirmation"],
    [/待确认/g, "To review"], [/部分安排/g, "Partially scheduled"], [/已安排/g, "Scheduled"], [/未排/g, "Unscheduled"],
    [/前完成/g, " deadline"], [/分钟/g, " min"], [/小时/g, " hours"]
  ];
  replacements.forEach(([pattern, replacement]) => { text = text.replace(pattern, replacement); });
  if (strictEnglish && /[\u3400-\u9fff]/.test(text)) {
    const timeReferences = [...text.matchAll(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*\d{1,2}:\d{2}(?:\s*[–-]\s*\d{1,2}:\d{2})?/g)]
      .map((match) => match[0].trim()).filter(Boolean);
    return `HumanOS used an internal scheduling note that is not available in English${timeReferences.length ? ` (${[...new Set(timeReferences)].join(", ")})` : ""}.`;
  }
  return text;
}

function profileCompleted(profile = currentProfile) {
  return Boolean(profile.task_preferences?.onboarding_completed);
}

async function staticPasswordDigest(value) {
  const bytes = new TextEncoder().encode(value);
  if (globalThis.crypto?.subtle) {
    const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  // Some browsers disable Web Crypto for pages opened directly with file://.
  // This fallback is only for the self-contained research demo's local account.
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `local-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function restoreStaticUserState(email) {
  const savedState = JSON.parse(localStorage.getItem(`humanosSyy7StaticState:${email.toLowerCase()}`) || "null");
  currentProfile = savedState?.profile || createDefaultProfile();
  tasks = Array.isArray(savedState?.tasks) ? savedState.tasks.map(normalizeBackendTask) : [];
  promptedSlots.clear();
  (savedState?.prompted_slots || []).forEach((slot) => promptedSlots.add(slot));
  activeSelectionMode = "auto";
  activeId = defaultActiveTaskId();
}

async function submitStaticAuth() {
  const email = authEmail.value.trim().toLowerCase();
  const password = authPassword.value;
  if (!email || !email.includes("@")) throw new Error("Enter a valid email address.");
  if (password.length < 6) throw new Error("The password must contain at least 6 characters.");
  const accounts = JSON.parse(localStorage.getItem("humanosSyy7StaticAccounts") || "{}");
  const passwordHash = await staticPasswordDigest(password);
  if (authMode === "register") {
    if (accounts[email]) throw new Error("This email is already registered. Sign in instead.");
    accounts[email] = {
      id: `static-${Date.now()}`,
      name: authName.value.trim() || email.split("@")[0],
      email,
      password_hash: passwordHash
    };
    localStorage.setItem("humanosSyy7StaticAccounts", JSON.stringify(accounts));
    currentUser = { id: accounts[email].id, name: accounts[email].name, email };
    currentProfile = createDefaultProfile();
    tasks = [];
    promptedSlots.clear();
  } else {
    if (!accounts[email] || accounts[email].password_hash !== passwordHash) {
      throw new Error("The email or password is incorrect. Register first if this is your first visit.");
    }
    currentUser = { id: accounts[email].id, name: accounts[email].name, email };
    restoreStaticUserState(email);
  }
  localStorage.setItem("humanosSyy7User", JSON.stringify(currentUser));
  setBackendStatus("Temporary demo", false);
  syncProfileForm();
  if (profileCompleted(currentProfile)) showApp();
  else showProfileSetup();
  render();
}

async function submitAuth() {
  if (authPending) return;
  const email = authEmail.value.trim();
  const password = authPassword.value;
  const name = authName.value.trim();
  if (authMode === "register" && !name) {
    authError.textContent = "Enter your name to create an account.";
    authName.focus();
    return;
  }
  if (!email || !email.includes("@")) {
    authError.textContent = "Enter a valid email address.";
    authEmail.focus();
    return;
  }
  if (password.length < 6) {
    authError.textContent = "Use a password with at least 6 characters.";
    authPassword.focus();
    return;
  }
  authPending = true;
  const pendingLabel = authMode === "register" ? "Creating account…" : "Logging in…";
  const idleLabel = authMode === "register" ? "Create account" : "Log in";
  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = pendingLabel;
  authError.textContent = "";
  let authenticationCompleted = false;
  try {
    if (STATIC_SHARE_MODE) {
      await submitStaticAuth();
      return;
    }
    setBackendStatus("Signing in", false);
    const result = await api(`/api/auth/${authMode}`, {
      method: "POST",
      body: JSON.stringify({
        name,
        email,
        password
      })
    });
    authenticationCompleted = true;
    currentUser = result.user;
    currentProfile = result.profile;
    localStorage.setItem("humanosSyy7User", JSON.stringify(currentUser));
    localStorage.removeItem("humanosSyy7MotionTasks");
    tasks = [];
    syncProfileForm();
    hideAuth();
    await loadBackendState();
    setBackendStatus(authMode === "register" ? "Registration complete — set your preferences" : "Signed in", true);
  } catch (error) {
    if (!STATIC_SHARE_MODE && !authenticationCompleted) {
      currentUser = null;
      localStorage.removeItem("humanosSyy7User");
      showAuth();
    }
    const message = STATIC_SHARE_MODE
      ? error.message
      : error.status === 409 || error.message.includes("409")
        ? "This email is already registered. Sign in instead."
        : error.status === 401 || error.message.includes("401")
          ? "The email or password is incorrect."
          : authenticationCompleted
            ? "Your account was created, but some workspace data could not be loaded. You can continue with setup."
            : "HumanOS could not reach the backend service. Check the backend link and try again.";
    authError.textContent = message;
    if (authenticationCompleted) {
      syncProfileForm();
      if (profileCompleted(currentProfile)) showApp();
      else showProfileSetup();
      render();
    }
    setBackendStatus("Authentication failed", false);
  } finally {
    authPending = false;
    authSubmitBtn.disabled = false;
    authSubmitBtn.textContent = idleLabel;
  }
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const error = await response.text();
    const requestError = new Error(`${response.status}: ${error}`);
    requestError.status = response.status;
    requestError.path = path;
    throw requestError;
  }
  return response.json();
}

async function optionalApi(path, fallback) {
  try {
    return await api(path);
  } catch (error) {
    if (error.status === 404) return fallback;
    throw error;
  }
}

async function controlTestClock(payload = {}) {
  const clock = await api("/api/test-clock", {
    method: "POST",
    body: JSON.stringify({ ...payload, user_id: currentUserId() })
  });
  syncSharedTestClock(clock);
  if (currentUser) {
    const profileResponse = await api(`/api/profile?user_id=${currentUserId()}`);
    currentProfile = profileResponse.profile;
    currentExecutionState = confirmedSchedulePlan
      ? await optionalApi(`/api/execution-sessions/current?user_id=${currentUserId()}`, null)
      : null;
    pendingWeekRollover = await optionalApi(
      `/api/weeks/status?user_id=${currentUserId()}&week_id=${weekStartLabel()}`,
      null
    );
  }
  render();
  updateQaControllerDisplay();
  if (currentUser && profileCompleted(currentProfile)) {
    window.setTimeout(() => pendingWeekRollover?.new_week ? maybeShowWeekRollover() : maybeShowDailyCheckIn(), 0);
  }
  return clock;
}

function updateQaControllerDisplay() {
  if (!qaTimeController || qaTimeController.classList.contains("hidden") || !sharedTestClock) return;
  const now = appNow();
  const timezone = qaScenarioManifest?.timezone || "Asia/Singapore";
  const dateLabel = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: timezone }).format(now);
  const timeLabel = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: timezone }).format(now);
  document.getElementById("qaClockDate").textContent = dateLabel;
  document.getElementById("qaClockTime").textContent = timeLabel;
  document.getElementById("qaClockTimezone").textContent = timezone;
  document.getElementById("qaClockWeek").textContent = sharedTestClock.week_id || weekStartLabel(now);
  qaClockSummary.textContent = `${dateLabel} · ${timeLabel} · ${sharedTestClock.week_id || ""}`;
}

async function reloadAfterQaJump() {
  if (currentUser) await loadBackendState();
  else render();
  updateQaControllerDisplay();
}

function showQaStatus(message, isError = false) {
  if (!qaControllerStatus) return;
  qaControllerStatus.textContent = message;
  qaControllerStatus.style.color = isError ? "#ffb3b6" : "#b9f3e7";
}

async function loadQaScenario(scenarioId) {
  try {
    showQaStatus("Restoring an independent QA snapshot…");
    const result = await api("/api/qa-scenarios/load", {
      method: "POST",
      body: JSON.stringify({ scenario_id: scenarioId })
    });
    qaActiveScenarioId = scenarioId;
    syncSharedTestClock(result.clock);
    await reloadAfterQaJump();
    document.querySelectorAll("[data-qa-scenario]").forEach((button) => button.classList.toggle("active", button.dataset.qaScenario === scenarioId));
    await applyQaUiHint(result.scenario?.ui_hint);
    showQaStatus(`${result.scenario?.label || scenarioId} loaded. Calendar and execution state were re-read from the backend.`);
  } catch (error) {
    showQaStatus(error.message, true);
  }
}

async function applyQaUiHint(hint) {
  if (!hint || !currentUser) return;
  if (hint.type === "open_task") {
    const task = tasks.find((item) => String(item.id) === String(hint.task_id));
    if (task) openTaskDialog(task);
  }
  if (hint.type === "rationale_prompt") {
    qaRationalePreview = true;
    const summary = hint.summary || {};
    document.getElementById("planRationaleDiff").textContent = `You changed ${Number(summary.moved || 0)} time block(s), resized ${Number(summary.resized || 0)}, added ${Number(summary.added || 0)}, and removed ${Number(summary.removed || 0)}.`;
    if (!planRationaleDialog.open) planRationaleDialog.showModal();
  }
}

async function initializeQaTimeController(health) {
  if (!qaTimeController) return;
  if (!health?.qa_mode) {
    qaTimeController.classList.add("hidden");
    return;
  }
  qaTimeController.classList.remove("hidden");
  try {
    qaScenarioManifest = await api("/api/qa-scenarios");
    const container = document.getElementById("qaScenarioButtons");
    container.replaceChildren(...qaScenarioManifest.scenarios
      .filter((item) => item.id !== "base")
      .map((scenario) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.qaScenario = scenario.id;
        button.textContent = scenario.label;
        button.title = scenario.description;
        button.addEventListener("click", () => loadQaScenario(scenario.id));
        return button;
      }));
    showQaStatus(`Isolated QA user: ${qaScenarioManifest.qa_user?.email || "ready"}`);
  } catch (error) {
    showQaStatus(`Snapshots unavailable: ${error.message}`, true);
  }
  updateQaControllerDisplay();
}

function installTestClockControls(health) {
  if (!health?.test_mode || !health.clock) {
    delete window.HumanOSTestClock;
    syncSharedTestClock(null);
    qaTimeController?.classList.add("hidden");
    return;
  }
  syncSharedTestClock(health.clock);
  window.HumanOSTestClock = {
    state: () => ({ ...sharedTestClock, now: appNow().toISOString() }),
    sync: async () => controlTestClock({}),
    setTime: async (value) => controlTestClock({ set_time: value, time_scale: 0 }),
    advanceMinutes: async (minutes) => controlTestClock({ advance_minutes: Number(minutes), time_scale: 0 }),
    advanceDays: async (days) => controlTestClock({ advance_days: Number(days), time_scale: 0 }),
    setScale: async (minutesPerSecond) => controlTestClock({ time_scale: Number(minutesPerSecond) })
  };
  initializeQaTimeController(health);
}

function setBackendStatus(text, online = backendOnline) {
  backendStatus.textContent = text;
  backendStatus.style.color = online ? "var(--green)" : "var(--muted)";
}

function setEngineStatus(label, usesModel = false, detail = "") {
  if (!enginePill) return;
  enginePill.textContent = label;
  enginePill.classList.toggle("ai-mode", usesModel);
  enginePill.classList.toggle("rule-mode", !usesModel);
  enginePill.title = detail || (usesModel ? "AI scheduling with hard-constraint validation" : "External model is not active");
}

function inferDurationMinutesFromText(text = "") {
  const clean = String(text);
  const chineseAmounts = { 半: 0.5, 一: 1, 一个: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5 };
  const chineseMatch = clean.match(/(半|一个|一|两|二|三|四|五)\s*(小时|分钟)/);
  if (chineseMatch) {
    const amount = chineseAmounts[chineseMatch[1]];
    return chineseMatch[2] === "小时" ? amount * 60 : amount;
  }
  const match = clean.match(/(\d+)\s*(?:个\s*)?(?:-|–|—)?\s*(分钟|minutes?|mins?|min|小时|hours?|hrs?|h)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return ["小时", "hour", "hours", "hr", "hrs", "h"].includes(match[2].toLowerCase()) ? amount * 60 : amount;
}

function normalizeDuration(task) {
  const userDuration = Number(task.duration);
  if (Number.isFinite(userDuration) && userDuration > 0) return userDuration;
  return inferDurationMinutesFromText(`${task.title || ""} ${task.context || ""}`) || 60;
}

function normalizeBackendTask(task) {
  const checkpoints = task.checkpoints || [];
  const duration = normalizeDuration(task);
  const execution = { ...(task.execution || {}) };
  if (
    ["queued", "scheduled", "partially_scheduled", "running"].includes(task.status || "queued")
    && Number(execution.remaining_duration_minutes) === 0
    && Number(execution.accumulated_actual_minutes || 0) === 0
  ) {
    // Older builds confused "fully placed on the calendar" with "work finished".
    execution.remaining_duration_minutes = duration;
  }
  return {
    id: task.id,
    title: task.title,
    due: task.due || "未设置",
    duration,
    priority: task.priority || "中",
    status: task.status || "queued",
    context: task.context || "",
    slot: task.slot,
    checkpoints,
    contextWindow: normalizeContextWindow({ ...task, checkpoints }),
    type: task.type,
    cognitive_load: task.cognitive_load,
    ambiguity: task.ambiguity,
    switch_cost: task.switch_cost,
    reentry_cost: task.reentry_cost
    ,task_demand: task.task_demand || {}
    ,execution
    ,resource_modality: task.resource_modality || []
    ,parallelizable: Boolean(task.parallelizable)
    ,expected_difficulty: task.expected_difficulty
    ,task_type: task.task_type || task.taskType || task.contextWindow?.taskType || task.context_window?.taskType
    ,timezone: task.timezone || task.contextWindow?.timezone || task.context_window?.timezone
    ,start_at: task.start_at || task.contextWindow?.startAt || task.context_window?.startAt
    ,deadline_at: task.deadline_at || task.contextWindow?.deadlineAt || task.context_window?.deadlineAt
    ,deadline_assumption: task.deadline_assumption || task.contextWindow?.deadlineAssumption || task.context_window?.deadlineAssumption
    ,week_id: task.week_id || null
    ,removed_from_week: Boolean(task.removed_from_week)
    ,archived_at: task.archived_at || null
  };
}

function checkpointText(task, keywords) {
  return (task.checkpoints || []).find((item) => {
    const label = `${item.label || ""}`;
    return keywords.some((keyword) => label.includes(keyword));
  })?.text || "";
}

function normalizeContextWindow(task) {
  const saved = task.contextWindow || task.context_window || {};
  const progress = saved.progress
    || checkpointText(task, ["进展", "当前"])
    || task.context
      || "No progress has been recorded yet.";
  const nextStep = saved.nextStep
    || saved.next_step
    || checkpointText(task, ["下一步", "继续"])
      || "Confirm the task goal, then choose one step that fits within 15–30 minutes.";
  const openQuestions = saved.openQuestions
    || saved.open_questions
    || checkpointText(task, ["未解决", "问题", "卡点"])
      || "No open questions have been recorded.";
  const materials = saved.materials
    || saved.references
    || saved.links
      || "No materials are linked yet. Add papers, links, or filenames in the task context.";
  const recoveryCue = saved.recoveryCue
    || saved.recovery_cue
    || (task.slot ? "Open the current materials at the scheduled time, then take the next action." : "Add time, materials, and a next action before scheduling.");

  const decisionTrace = saved.decisionTrace || saved.decision_trace || null;
  return { ...saved, progress, nextStep, openQuestions, materials, recoveryCue, decisionTrace };
}

function taskWorkRemainingMinutes(task) {
  const saved = task?.execution?.remaining_duration_minutes;
  if (saved !== undefined && saved !== null && Number.isFinite(Number(saved))) {
    return Math.max(Number(saved), 0);
  }
  return Math.max(Number(task?.duration || 0), 0);
}

function syncProfileForm() {
  profileRole.value = userFacingRole(currentProfile.role || "research_student");
  profileDeepWork.value = currentProfile.deep_work_window || "09:00-11:30";
  profileControl.value = "ai_proposed_user_editable";
  const research = currentProfile.research_context || {};
  setCheckedValues(profilePlanningTools, research.planning_tools);
  profilePrimaryPlanningTool.value = research.primary_planning_tool || "";
  profilePlanningFrequency.value = research.planning_tool_use_frequency || "";
}

function syncWizardForm() {
  syncingWizardForm = true;
  const preferences = currentProfile.task_preferences || {};
  const roleMap = { 硕士生: "master_student", 本科生: "undergraduate", 自由学习者: "independent_learner", "Master's student": "master_student", Undergraduate: "undergraduate", "Independent learner": "independent_learner" };
  const storedRole = roleMap[currentProfile.role] || currentProfile.role || "master_student";
  wizardRole.value = Array.from(wizardRole.options).some((option) => option.value === storedRole) ? storedRole : "master_student";
  wizardDeepWork.value = currentProfile.deep_work_window || "09:00-11:30";
  wizardLowEnergy.value = currentProfile.low_energy_window || "14:00-15:30";
  const storedWeekly = currentProfile.weekly_context || {};
  const weekly = !storedWeekly.week_of || weekStartLabel(storedWeekly.week_of) === weekStartLabel() ? storedWeekly : {};
  wizardAvailableWindows.value = weekly.weekly_available_windows || "";
  wizardSessionLength.value = String(preferences.preferred_session_minutes || "45");
  wizardRestLength.value = String(Math.max(15, Math.round(Number(preferences.rest_between_tasks_minutes || 15) / 15) * 15));
  const rhythm = preferences.day_rhythm || {};
  wizardMorningEnergy.value = String(rhythm.morning_energy || 6);
  wizardAfternoonEnergy.value = String(rhythm.afternoon_energy || 4);
  wizardEveningEnergy.value = String(rhythm.evening_energy || 5);
  wizardLearningMode.value = preferences.learning_mode || "reading_writing";
  const research = currentProfile.research_context || {};
  setCheckedValues(wizardPlanningTools, research.planning_tools);
  wizardPrimaryPlanningTool.value = research.primary_planning_tool || "";
  wizardPlanningFrequency.value = research.planning_tool_use_frequency || "";
  wizardNearDeadlines.value = "";
  wizardFixedEvents.value = (weekly.fixed_events || []).join("，");
  wizardTemporaryConstraints.value = (weekly.temporary_constraints || []).join("，");
  wizardWeeklyNote.value = weekly.weekly_note || "";
  wizardKeepBuffer.checked = weekly.keep_buffer !== false;
  wizardGoal.value = weekly.weekly_goal || preferences.short_term_goal || "";
  populateStructuredContextRows();

  weeklyTaskList.innerHTML = "";
  const currentWeekTasks = tasks.filter((task) => (
    !task.removed_from_week
    && (!task.week_id || task.week_id === weekStartLabel())
    && !["completed", "terminated"].includes(task.status)
  ));
  if (currentWeekTasks.length) {
    currentWeekTasks.forEach((task) => addWeeklyTaskRow(task));
  } else {
    addWeeklyTaskRow();
  }
  restoreOnboardingDraft();
  syncingWizardForm = false;
}

function renderProfileSummary() {
  const preferences = currentProfile.task_preferences || {};
  const weekly = currentProfile.weekly_context || {};
  const research = currentProfile.research_context || {};
  profileSummary.innerHTML = `
    <div class="summary-row">
      <span>Study context</span>
      <strong>${userFacingRole(currentProfile.role || "Research student")}</strong>
    </div>
    <div class="summary-row">
      <span>Deep work</span>
      <strong>${currentProfile.deep_work_window || "09:00-11:30"}</strong>
    </div>
    <div class="summary-row">
      <span>Low-energy window</span>
      <strong>${currentProfile.low_energy_window || "14:00-15:30"}</strong>
    </div>
    <div class="summary-row">
      <span>Focus / break</span>
      <strong>${preferences.preferred_session_minutes || 45} / ${Math.max(15, Math.round(Number(preferences.rest_between_tasks_minutes || 15) / 15) * 15)} min</strong>
    </div>
    <div class="summary-row">
      <span>Weekly availability</span>
      <strong>${localizeWeeklyContextText(weekly.weekly_available_windows || "Not set")}</strong>
    </div>
    <div class="summary-row">
      <span>Learning style</span>
      <strong>${learningModeLabel(preferences.learning_mode)}</strong>
    </div>
    <div class="summary-row">
      <span>Weekly tasks</span>
      <strong>${tasks.filter((task) => !task.removed_from_week && (!task.week_id || task.week_id === weekStartLabel()) && !["completed", "terminated"].includes(task.status)).map((task) => task.title).join(" / ") || "Not set"}</strong>
    </div>
    <div class="summary-row">
      <span>Context / buffer</span>
      <strong>${valueList(weekly.context_items).length ? valueList(weekly.context_items).map((item) => `${item.title} (${item.type === "flexible_activity" ? "flexible" : item.type === "recurring_routine" ? "routine" : "fixed"})`).join(" / ") : (weekly.fixed_events || []).join(" / ") || "None"}; ${weekly.keep_buffer === false ? "no reserved buffer" : "buffer reserved"}</strong>
    </div>
    <div class="summary-row">
      <span>Weekly goal</span>
      <strong>${weekly.weekly_goal || "Not set"}</strong>
    </div>
    <div class="summary-row research-summary-row">
      <span>Planning background · research only</span>
      <strong>${valueList(research.planning_tools).map((value) => ({ paper_planner: "Paper planner", calendar_app: "Calendar app", task_manager: "Task manager", notes_workspace: "Notes / workspace", ai_assistant: "AI assistant", none: "None", other: "Other" }[value] || value)).join(" / ") || "Not provided"}</strong>
    </div>
  `;
}

function commaList(value) {
  return value
    .split(/[,，、/；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function learningModeLabel(value) {
  return {
    reading_writing: "Reading & writing",
    visual: "Visual materials",
    discussion: "Discussion",
    practice: "Hands-on practice",
    mixed: "Mixed"
  }[value] || "Not set";
}

function supportNeedLabel(value) {
  return {
    clarify_next_action: "把任务变成下一步行动",
    schedule_feasible_plan: "安排可执行时间表",
    recover_after_interruption: "中断后帮我接回来",
    balance_load_and_rest: "平衡负荷和休息"
  }[value] || "尚未填写";
}

async function loadBackendState() {
  try {
    const health = await api("/api/health");
    backendOnline = Boolean(health.ok);
    installTestClockControls(health);
    setEngineStatus(
      health.ai_enabled ? `AI · ${health.ai_model || "model"}` : "Rule engine",
      Boolean(health.ai_enabled),
      health.ai_enabled ? "HumanOS is ready to propose a constraint-checked plan" : "Scheduling service online; AI connection is not configured"
    );
    setBackendStatus(currentUser ? "Synced" : "Log in first", Boolean(currentUser));
    if (!currentUser) {
      showAuth();
      return;
    }

    const profileResponse = await api(`/api/profile?user_id=${currentUserId()}`);
    currentProfile = profileResponse.profile;
    syncProfileForm();
    userBadge.textContent = currentUser.email;

    const taskResponse = await api(`/api/tasks?user_id=${currentUserId()}`);
    if (taskResponse.tasks.length) {
      tasks = taskResponse.tasks.map(normalizeBackendTask);
    } else {
      tasks = [];
    }
    // A new account has no active plan. Older deployed backends returned 404
    // for this normal empty state, so it must not invalidate registration.
    const activePlanResponse = await optionalApi(
      `/api/plans/active?user_id=${currentUserId()}&week_id=${weekStartLabel()}`,
      { plan: null }
    );
    confirmedSchedulePlan = activePlanResponse.plan?.plan_status === "confirmed" ? activePlanResponse.plan : null;
    currentExecutionState = confirmedSchedulePlan ? await optionalApi(`/api/execution-sessions/current?user_id=${currentUserId()}`, null) : null;
    if (activePlanResponse.plan?.plan_status === "needs_update") {
      setBackendStatus("Your task information changed. The current plan needs an update.", true);
    }
    pendingWeekRollover = await optionalApi(
      `/api/weeks/status?user_id=${currentUserId()}&week_id=${weekStartLabel()}`,
      null
    );
    const chatResponse = await optionalApi(`/api/chat/turns?user_id=${currentUserId()}&limit=20`, { turns: [] });
    chatMessages = chatMessagesFromTurns(chatResponse.turns || []);
    activeSelectionMode = "auto";
    activeId = defaultActiveTaskId();
    if (profileCompleted(currentProfile)) {
      showApp();
      const readyForPlanning = tasks.filter((task) => !task.slot && !["completed", "terminated"].includes(task.status) && missingTimeConfirmationFields(task).length === 0);
      if (readyForPlanning.length) {
        calendarView = "week";
        await requestTentativeSchedule("已根据 Weekly Context、长期节奏和任务需求更新整周骨架；当前状态只影响今天第一个任务。", readyForPlanning);
      }
    } else {
      showProfileSetup();
    }
    render();
  } catch (error) {
    backendOnline = false;
    setEngineStatus("Offline", false, "The scheduling backend is unavailable");
    setBackendStatus("Offline", false);
    if (currentUser) {
      syncProfileForm();
      if (profileCompleted(currentProfile)) showApp();
      else showProfileSetup();
      render();
    } else {
      showAuth();
    }
    console.warn("HumanOS backend unavailable:", error.message);
  }
}

async function loadStaticShare() {
  backendOnline = false;
  setEngineStatus("AI unavailable", false, "Check the connection and try again");
  setBackendStatus("Connect HTTPS API", false);
  const accounts = JSON.parse(localStorage.getItem("humanosSyy7StaticAccounts") || "{}");
  // The public research demo must always begin at authentication. Keep the
  // locally registered accounts, but never silently reuse a previous session.
  currentUser = null;
  localStorage.removeItem("humanosSyy7User");
  setAuthMode(Object.keys(accounts).length ? "login" : "register");
  showAuth();
  render();
}

async function saveProfileToBackend() {
  currentProfile = {
    ...currentProfile,
    user_id: currentUserId(),
    role: profileRole.value.trim() || "Research student",
    deep_work_window: profileDeepWork.value.trim() || "09:00-11:30",
    timezone: clientContextPayload().timezone,
    control_preference: "ai_proposed_user_editable",
    research_context: {
      ...(currentProfile.research_context || {}),
      planning_tools: checkedValues(profilePlanningTools),
      primary_planning_tool: profilePrimaryPlanningTool.value || null,
      planning_tool_use_frequency: profilePlanningFrequency.value || null,
      source: "user_self_report"
    }
  };
  if (!backendOnline) {
    setBackendStatus("Preferences updated locally", false);
    render();
    return;
  }
  const response = await api(`/api/profile?user_id=${currentUserId()}`, {
    method: "PUT",
    body: JSON.stringify(currentProfile)
  });
  currentProfile = response.profile;
  syncProfileForm();
  setBackendStatus("Preferences saved", true);
  render();
}

async function saveWizardProfile(markCompleted = true) {
  wizardError.textContent = "";
  const weeklyDrafts = collectWeeklyTaskDrafts();
  const contextItems = collectStructuredContextItems();
  if (markCompleted && !weeklyDrafts.length) {
    throw new Error("Add at least one task for this week.");
  }
  if (markCompleted && !wizardAvailableWindows.value.trim()) {
    throw new Error("Add weekly availability. HumanOS schedules tasks only inside these windows.");
  }
  const incompleteTask = weeklyDrafts.find((task) => missingTimeConfirmationFields(task).length);
  if (incompleteTask) {
    throw new Error(`${incompleteTask.title} still needs: ${missingTimeConfirmationFields(incompleteTask).join(", ")}.`);
  }
  const invalidContextItem = contextItems.find((item) => !item.confirmed || (item.type === "flexible_activity" && !item.duration_minutes));
  if (invalidContextItem) {
    throw new Error(`${invalidContextItem.title} still needs ${invalidContextItem.type === "flexible_activity" ? "a day, possible range, or duration" : "a day or exact start/end time"}. It will not enter the calendar before confirmation.`);
  }
  currentProfile = {
    ...currentProfile,
    user_id: currentUserId(),
    role: wizardRole.value,
    timezone: clientContextPayload().timezone,
    deep_work_window: wizardDeepWork.value.trim() || "09:00-11:30",
    low_energy_window: wizardLowEnergy.value.trim() || "14:00-15:30",
    control_preference: "ai_proposed_user_editable",
    research_context: {
      ...(currentProfile.research_context || {}),
      ...researchContextFromWizard()
    },
    task_preferences: {
      ...(currentProfile.task_preferences || {}),
      onboarding_completed: markCompleted,
      preferred_session_minutes: Number(wizardSessionLength.value) || 45,
      rest_between_tasks_minutes: Number(wizardRestLength.value) || 15,
      day_rhythm: {
        morning_energy: Number(wizardMorningEnergy.value) || 4,
        afternoon_energy: Number(wizardAfternoonEnergy.value) || 4,
        evening_energy: Number(wizardEveningEnergy.value) || 4
      },
      learning_mode: wizardLearningMode.value,
      recovery_preference: "ai_proposed_user_editable"
    },
    weekly_context: {
      week_id: weekStartLabel(),
      week_of: weekStartLabel(),
      weekly_available_windows: wizardAvailableWindows.value.trim(),
      fixed_events: commaList(wizardFixedEvents.value),
      context_items: contextItems,
      weekly_goal: wizardGoal.value.trim(),
      temporary_constraints: commaList(wizardTemporaryConstraints.value),
      other_commitments: [],
      weekly_note: wizardWeeklyNote.value.trim(),
      keep_buffer: wizardKeepBuffer.checked,
      buffer_preference: wizardKeepBuffer.checked ? "Keep adjustable buffer and unscheduled time" : "User decides manually"
    }
  };
  focusInput.value = wizardFocus.value;
  energyInput.value = wizardEnergy.value;
  stressInput.value = wizardStress.value;
  emotionInput.value = wizardEmotion.value;
  if (backendOnline) await saveRuntimeStateToBackend({ daily_checkin: true });

  let plannedTasks = weeklyDrafts.map((task) => normalizeBackendTask({ ...task, status: "queued" }));
  if (backendOnline) {
    const reconciliation = await api("/api/weekly-setup/reconcile", {
      method: "POST",
      body: JSON.stringify({
        user_id: currentUserId(),
        week_id: weekStartLabel(),
        profile: currentProfile,
        tasks: weeklyDrafts
      })
    });
    currentProfile = reconciliation.profile;
    tasks = valueList(reconciliation.tasks).map(normalizeBackendTask);
    plannedTasks = valueList(reconciliation.active_ready_tasks).map(normalizeBackendTask);
    if (reconciliation.plan_needs_update) {
      confirmedSchedulePlan = null;
      pendingSchedulePlan = null;
      setBackendStatus("Your task information changed. The current plan needs an update.", true);
    }
  } else {
    tasks = plannedTasks;
  }
  save();

  clearOnboardingDraft();

  activeSelectionMode = "auto";
  activeId = plannedTasks[0]?.id || defaultActiveTaskId();
  calendarView = "week";
  syncProfileForm();
  markDailyCheckInSeen();
  showApp();
    setBackendStatus(markCompleted ? "Weekly plan generated" : "Set up later", backendOnline);
  if (plannedTasks.length) {
      await requestTentativeSchedule("Generate the weekly structure first; current state may only adjust today's first session.", plannedTasks);
  }
  render();
}

async function saveRuntimeStateToBackend(options = {}) {
  if (!backendOnline) return null;
  const response = await api("/api/state-checkins", {
    method: "POST",
    body: JSON.stringify({
      user_id: currentUserId(),
      focus: Number(focusInput.value),
      energy: Number(energyInput.value),
      stress: Number(stressInput.value),
      emotion: emotionInput.value,
      daily_note: options.daily_note || "",
      daily_checkin: Boolean(options.daily_checkin),
    local_date: appNow().toLocaleDateString("en-CA")
    })
  });
  return response.runtime_state;
}

async function patchBackendTask(task) {
  if (!backendOnline) return;
  await api(`/api/tasks/${task.id}`, {
    method: "PATCH",
    body: JSON.stringify({ ...task, user_id: currentUserId() })
  });
}

async function deleteBackendTask(taskId) {
  if (!backendOnline) return;
  await api(`/api/tasks/${taskId}?user_id=${encodeURIComponent(currentUserId())}`, { method: "DELETE" });
}

async function deleteTaskById(taskId, closeDialog = false) {
  if (!taskId) return;
  const task = tasks.find((item) => item.id === taskId);
  const title = task?.title || "Task";
  const previousTasks = [...tasks];
  const previousPendingPlan = pendingSchedulePlan ? {
    ...pendingSchedulePlan,
    plan_patch: [...(pendingSchedulePlan.plan_patch || [])]
  } : null;
  tasks = tasks.filter((item) => item.id !== taskId);
  if (pendingSchedulePlan?.plan_patch?.length) {
    pendingSchedulePlan.plan_patch = pendingSchedulePlan.plan_patch.filter((block) => block.task_id !== taskId);
    if (!pendingSchedulePlan.plan_patch.length) pendingSchedulePlan = null;
  }
  try {
    await deleteBackendTask(taskId);
    activeSelectionMode = "auto";
    activeId = defaultActiveTaskId();
    addChatMessage("ai", "Task deleted", `${title} was removed from the calendar and task records.`);
    if (editingTaskId === taskId) editingTaskId = null;
    deleteTaskBtn.classList.add("hidden");
    if (closeDialog && dialog.open) dialog.close("deleted");
  } catch (error) {
    tasks = previousTasks;
    pendingSchedulePlan = previousPendingPlan;
    addChatMessage("ai", "Delete failed", `${title} could not be deleted. Try again shortly.`);
    console.error(error);
  }
  render();
}

async function createTaskFromPayload(task) {
  if (backendOnline) {
    const response = await api(`/api/tasks?user_id=${currentUserId()}`, {
      method: "POST",
      body: JSON.stringify({ ...task, user_id: currentUserId() })
    });
    return normalizeBackendTask({
      ...task,
      ...response.task,
      contextWindow: response.task.contextWindow || task.contextWindow
    });
  }
  return task;
}

function taskDurationHours(task) {
  return Math.max(Number(task?.duration || 60), 15) / 60;
}

function colorForTask(task, index = 0) {
  if (task.slot?.color) return task.slot.color;
  const identity = String(task?.id || task?.title || index);
  const hash = [...identity].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
  return ["blue", "green", "violet", "gold"][hash % 4];
}

function taskSlotSessions(task) {
  if (Array.isArray(task.slot?.sessions)) return task.slot.sessions;
  if (task.slot?.start === null || task.slot?.start === undefined) return [];
  return [{
    block_id: task.slot.block_id || `${task.id}-legacy`,
    start: task.slot.start,
    end: task.slot.end ?? (task.slot.start + taskDurationHours(task)),
    day_index: task.slot.day_index ?? dayIndexFromDue(task.due),
    color: task.slot.color,
    session_minutes: Math.round(((task.slot.end ?? (task.slot.start + taskDurationHours(task))) - task.slot.start) * 60),
    session_index: 1,
    session_count: 1
  }];
}

function taskCalendarBlocks(task, index = 0) {
  const sessions = taskSlotSessions(task);
  const scheduledTotal = sessions.reduce((sum, session) => sum + Math.round((session.end - session.start) * 60), 0);
  return sessions.map((session, sessionIndex) => ({
    ...session,
    block_id: session.block_id || `${task.id}-session-${sessionIndex + 1}`,
    task,
    task_id: task.id,
    kind: session.kind || "task_session",
    session_minutes: session.session_minutes || Math.round((session.end - session.start) * 60),
    total_task_minutes: Number(task.duration || 0),
    remaining_after_block_minutes: session.remaining_after_block_minutes ?? Math.max(taskWorkRemainingMinutes(task) - scheduledTotal, 0),
    color: session.color || colorForTask(task, index),
    source: "scheduled"
  }));
}

function taskCalendarBlock(task, index = 0) {
  return taskCalendarBlocks(task, index)[0] || null;
}

function contextCalendarBlocks() {
  const adjustments = valueList(pendingSchedulePlan?.routine_adjustments);
  const savedParallelAdjustments = valueList(currentProfile.weekly_context?.context_items)
    .filter((item) => item?.parallel_session?.user_confirmed)
    .map((item) => ({ context_id: item.id, ...item.parallel_session }));
  const parallelAdjustments = [...savedParallelAdjustments, ...valueList(pendingSchedulePlan?.context_parallel_adjustments)];
  return contextBlocksFromSchedulingContext(buildSchedulingContext(currentProfile)).map((block) => {
    const adjustment = adjustments.find((item) => item?.context_id === block.context_id && Number(item.day_index) === Number(block.day_index));
    const parallelAdjustment = parallelAdjustments.find((item) => String(item?.context_id) === String(block.context_id));
    return {
    ...block,
    ...(adjustment ? { start: Number(adjustment.start), end: Number(adjustment.end), label: `${block.label}（AI 微调，待确认）` } : {}),
    ...(parallelAdjustment ? {
      day_index: Number(parallelAdjustment.day_index), start: Number(parallelAdjustment.start), end: Number(parallelAdjustment.end),
      parallel_group_id: parallelAdjustment.parallel_group_id, parallel_user_confirmed: true,
      parallel_context_ids: valueList(parallelAdjustment.parallel_context_ids), allowed_overlap_minutes: Number(parallelAdjustment.allowed_overlap_minutes || 0)
    } : {}),
    block_id: block.id || `context-${block.context_type}-${block.day_index}-${block.start}`,
    source: "context",
    task: null,
    task_id: null
  };
  });
}

function visibleCalendarBlocks() {
  const pendingIds = new Set((pendingSchedulePlan?.plan_patch || []).map((block) => block.task_id));
  const taskBlocks = tasks.flatMap((task, index) => pendingIds.has(task.id) ? [] : taskCalendarBlocks(task, index));
  const confirmedBlocks = valueList(confirmedSchedulePlan?.plan_patch);
  const pendingViolations = valueList(pendingSchedulePlan?.validation?.violations);
  const pendingBlocks = (pendingSchedulePlan?.plan_patch || [])
    .map((block, index) => {
      const task = tasks.find((item) => item.id === block.task_id);
      if (!task) return null;
      const unchangedFromConfirmed = confirmedBlocks.some((confirmed) => (
        String(confirmed.task_id) === String(block.task_id)
        && Number(confirmed.day_index) === Number(block.day_index)
        && Math.abs(Number(confirmed.start) - Number(block.start)) < 0.001
        && Math.abs(Number(confirmed.end) - Number(block.end)) < 0.001
      ));
      const constraintConflict = pendingViolations.some((violation) => (
        valueList(violation.block_ids).map(String).includes(String(block.block_id || ""))
        || String(violation.task_id || "") === String(block.task_id || "")
      ));
      return {
        ...block,
        block_id: block.block_id || `${block.task_id}-pending-${index}`,
        task,
        source: "pending",
        draft_changed: !unchangedFromConfirmed,
        constraint_conflict: constraintConflict,
        color: block.color || colorForTask(task)
      };
    })
    .filter(Boolean);
  return [...contextCalendarBlocks(), ...taskBlocks, ...pendingBlocks].sort((a, b) => a.day_index - b.day_index || a.start - b.start);
}

function todayCalendarBlocks() {
  const todayIndex = dayIndexFromDue("今天");
  return visibleCalendarBlocks().filter((block) => block.day_index === todayIndex);
}

function overlapLayout(blocks) {
  return blocks.map((block) => {
    const overlaps = blocks.filter((other) => block.start < other.end && other.start < block.end);
    const ordered = overlaps.sort((a, b) => a.start - b.start || a.end - b.end || String(a.block_id).localeCompare(String(b.block_id)));
    const columnCount = Math.max(ordered.length, 1);
    const columnIndex = Math.max(ordered.findIndex((item) => item.block_id === block.block_id), 0);
    return { ...block, columnCount, columnIndex };
  });
}

function taskStatusClass(task, block) {
  const now = currentHourFloat();
  const classes = [];
  if (!task) return `context-block ${block.context_type || block.kind || "context"}${block.parallel_group_id && block.parallel_user_confirmed ? " parallel-session" : ""}`;
  if (task.status === "completed" || task.status === "terminated") classes.push("completed");
  if (task.status === "partially_scheduled") classes.push("partial");
  if (task.status === "paused") classes.push("paused-task");
  if (task.status === "blocked") classes.push("blocked-task");
  if (task.status === "running" || (block.day_index === dayIndexFromDue("今天") && now >= block.start && now < block.end)) {
    classes.push("current");
  }
  const executionSession = currentExecutionState?.session;
  const executionBlockMatches = executionSession && String(executionSession.block_id) === String(block.block_id);
  const executionMode = currentExecutionState?.mode === "now" && executionElapsedMinutes(executionSession) >= Number(executionSession?.planned_work_minutes || 0) ? "session_ended" : currentExecutionState?.mode;
  const legacyCurrentIndex = classes.indexOf("current");
  if (legacyCurrentIndex >= 0 && !(executionBlockMatches && executionMode === "now")) classes.splice(legacyCurrentIndex, 1);
  if (executionBlockMatches && executionMode === "now") classes.push("current", "execution-running");
  else if (executionBlockMatches && executionMode === "paused") classes.push("execution-paused");
  else if (executionBlockMatches && executionMode === "session_ended") classes.push("execution-ended");
  else if (executionBlockMatches && ["up_next", "ready_to_start"].includes(executionMode)) classes.push("execution-up-next");
  else if (block.source !== "pending" && block.day_index === (appNow().getDay() + 6) % 7 && now > block.end && !["completed", "terminated"].includes(task.status)) classes.push("execution-missed");
  if (task.id === activeId) classes.push("selected");
  if (block.source === "pending") classes.push(block.draft_changed === false ? "pending-static" : "pending");
  if (block.source === "suggested") classes.push("suggested");
  if (block.kind === "fixed_event" || task.task_type === "fixed_event") classes.push("fixed-task");
  if (block.constraint_conflict) classes.push("constraint-conflict");
  if (block.parallel_group_id && block.parallel_user_confirmed) classes.push("parallel-session");
  return classes.join(" ");
}

function confirmedParallelOverlapAllowed(first, second) {
  const groupId = String(first?.parallel_group_id || "");
  if (!groupId || groupId !== String(second?.parallel_group_id || "")) return false;
  if (!first?.parallel_user_confirmed || !second?.parallel_user_confirmed) return false;
  const taskIds = new Set([String(first.task_id || first.task?.id || ""), String(second.task_id || second.task?.id || "")]);
  const declared = new Set([...valueList(first.parallel_task_ids), ...valueList(second.parallel_task_ids)].map(String));
  if (taskIds.size !== 2 || [...taskIds].some((taskId) => !declared.has(taskId))) return false;
  const overlapMinutes = Math.max(0, Math.round((Math.min(Number(first.end), Number(second.end)) - Math.max(Number(first.start), Number(second.start))) * 60));
  const allowed = Math.min(Number(first.allowed_overlap_minutes || 0), Number(second.allowed_overlap_minutes || 0));
  return overlapMinutes > 0 && overlapMinutes <= allowed;
}

function calendarConflictLabel(value = "Protected time") {
  return localizeWeeklyContextText(String(value || "Protected time"))
    .replace(/^(?:Fixed|Routine|Flexible|Blocked|Cannot move|Usually around this time|HumanOS may choose the time)\s*/i, "")
    .replace(/^(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?|周[一二三四五六日])\s+\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2}\s*/i, "")
    .trim() || "Protected time";
}

function calendarBlockConflictDetails(block, ignoreBlockId = null) {
  if (!block || block.source === "context") return [];
  const context = buildSchedulingContext(currentProfile);
  const conflicts = [];
  const hasRoutineAdjustment = block.source === "pending" && valueList(pendingSchedulePlan?.routine_adjustments).length > 0;
  // A proposed plan has already been checked by the backend's Python hard-
  // constraint validator. Flexible activities and reserved buffer are still
  // editable at this stage, so their provisional client-side placement must
  // not silently prevent the user from confirming an otherwise valid plan.
  // Manual calendar edits continue to use the stricter derived windows.
  const validationWindows = block.source === "pending"
    ? parseAvailableWindows(currentProfile)
    : hasRoutineAdjustment
      ? (context.movable_routine_windows || context.windows)
      : context.windows;
  const inside = validationWindows.some((window) => window.day_index === block.day_index && block.start >= window.start - 0.001 && block.end <= window.end + 0.001);
  if (!inside) conflicts.push({
    type: "outside_available_window",
    message: "This time is outside the hours HumanOS may use for work.",
  });
  const hardConflict = context.hard_constraints.find((constraint) => constraint.day_index === block.day_index && block.start < constraint.end && constraint.start < block.end);
  if (hardConflict) {
    const conflictLabel = calendarConflictLabel(hardConflict.label);
    conflicts.push({
    type: "protected_time_overlap",
    message: `This overlaps ${conflictLabel} from ${formatHour(hardConflict.start)}–${formatHour(hardConflict.end)}.`,
    conflicting_item_id: hardConflict.context_id || null,
    conflicting_label: conflictLabel,
    conflicting_start: Number(hardConflict.start),
    conflicting_end: Number(hardConflict.end),
    day_index: Number(hardConflict.day_index),
    });
  }
  const now = appNow();
  const todayIndex = (now.getDay() + 6) % 7;
  const nowHour = now.getHours() + now.getMinutes() / 60;
  if (block.day_index === todayIndex && block.start < nowHour) conflicts.push({ type: "past", message: "A session cannot be moved into the past." });
  const deadlineDay = dayIndexFromDue(block.task?.due);
  const explicitDeadlineHour = parseDueStartHour(block.task?.due);
  const availableEnds = context.windows.filter((window) => window.day_index === deadlineDay).map((window) => window.end);
  const deadlineHour = explicitDeadlineHour ?? (availableEnds.length ? Math.max(...availableEnds) : null);
  if (deadlineDay !== null && block.day_index > deadlineDay) conflicts.push({ type: "deadline", message: "This session would fall after the task deadline." });
  if (deadlineDay !== null && block.day_index === deadlineDay && deadlineHour !== null && block.end > deadlineHour + 0.001) conflicts.push({ type: "deadline", message: "This session would end after the task deadline." });
  const overlap = visibleCalendarBlocks().find((other) => {
    if (other.block_id === ignoreBlockId || other.source === "context") return false;
    return other.day_index === block.day_index && block.start < other.end && other.start < block.end && !confirmedParallelOverlapAllowed(block, other);
  });
  if (overlap) conflicts.push({
    type: "task_overlap",
    message: `This overlaps ${overlap.task?.title || overlap.label} from ${formatHour(overlap.start)}–${formatHour(overlap.end)}.`,
    conflicting_block_id: overlap.block_id || null,
    conflicting_task_id: overlap.task_id || overlap.task?.id || null,
    conflicting_label: overlap.task?.title || overlap.label,
    conflicting_start: Number(overlap.start),
    conflicting_end: Number(overlap.end),
    day_index: Number(overlap.day_index),
  });
  const dependencies = [
    ...valueList(pendingSchedulePlan?.ai_analysis?.task_dependencies),
    ...valueList(pendingSchedulePlan?.ai_task_analysis?.dependencies),
    ...valueList(lastDecision?.ai_analysis?.task_dependencies),
    ...valueList(lastDecision?.ai_task_analysis?.dependencies)
  ].filter((item, index, all) => item?.hard_enforced && all.findIndex((candidate) => candidate.before_task_id === item.before_task_id && candidate.after_task_id === item.after_task_id) === index);
  const projectedBlocks = visibleCalendarBlocks()
    .filter((item) => item.source !== "context" && item.block_id !== ignoreBlockId)
    .concat([{ ...block, task_id: block.task_id || block.task?.id }]);
  const ordinalStart = (item) => Number(item.day_index) * 24 + Number(item.start);
  const ordinalEnd = (item) => Number(item.day_index) * 24 + Number(item.end);
  dependencies.forEach((dependency) => {
    const before = projectedBlocks.filter((item) => String(item.task_id) === String(dependency.before_task_id));
    const after = projectedBlocks.filter((item) => String(item.task_id) === String(dependency.after_task_id));
    if (!before.length || !after.length) return;
    if (Math.max(...before.map(ordinalEnd)) > Math.min(...after.map(ordinalStart)) + 0.001) {
      const beforeTitle = tasks.find((item) => String(item.id) === String(dependency.before_task_id))?.title || "Prerequisite";
      const afterTitle = tasks.find((item) => String(item.id) === String(dependency.after_task_id))?.title || "Dependent task";
      conflicts.push({ type: "dependency", message: `${beforeTitle} must finish before ${afterTitle}.` });
    }
  });
  return conflicts;
}

function calendarBlockViolations(block, ignoreBlockId = null) {
  return calendarBlockConflictDetails(block, ignoreBlockId).map((conflict) => conflict.message);
}

function failedDragToastMessage(conflict) {
  if (conflict?.type === "protected_time_overlap") {
    return `Couldn’t move — overlaps ${conflict.conflicting_label || "protected time"} ${formatHour(conflict.conflicting_start)}–${formatHour(conflict.conflicting_end)}.`;
  }
  if (conflict?.type === "task_overlap") {
    return `Couldn’t move — overlaps ${conflict.conflicting_label || "another task"} ${formatHour(conflict.conflicting_start)}–${formatHour(conflict.conflicting_end)}.`;
  }
  return `Couldn’t move — ${String(conflict?.message || "that time is unavailable").replace(/[.]$/, "")}.`;
}

function calendarBlockAdvisories(block, ignoreBlockId = null) {
  if (!block || block.source === "context") return [];
  const advisories = [];
  const restMinutes = Math.max(15, Math.round(Number(currentProfile.rest_minutes || 15) / 15) * 15);
  const sameDay = visibleCalendarBlocks().filter((other) => other.source !== "context" && other.block_id !== ignoreBlockId && other.day_index === block.day_index);
  const nearestGap = sameDay.reduce((best, other) => {
    const gap = block.start >= other.end ? (block.start - other.end) * 60 : other.start >= block.end ? (other.start - block.end) * 60 : Infinity;
    return Math.min(best, gap);
  }, Infinity);
  if (nearestGap < restMinutes) advisories.push(`Rest gap is shorter than the preferred ${restMinutes} minutes`);
  const highDemand = block.task?.task_demand?.estimated_cognitive_load === "high" || Number(block.task?.expected_difficulty || 0) >= 6;
  const clockMatches = Array.from(String(currentProfile.deep_work_window || "09:00-11:30").matchAll(/(\d{1,2}):(\d{2})/g));
  if (highDemand && clockMatches.length >= 2) {
    const deepStart = Number(clockMatches[0][1]) + Number(clockMatches[0][2]) / 60;
    const deepEnd = Number(clockMatches[1][1]) + Number(clockMatches[1][2]) / 60;
    if (block.start < deepStart || block.end > deepEnd) advisories.push("A high-demand task moved outside your deep-work window");
  }
  if ((block.end - block.start) * 60 < 30) advisories.push("This session is under 30 minutes, so switching and re-entry costs may be high");
  return advisories;
}

function refreshTaskScheduleStatus(task) {
  const sessions = taskSlotSessions(task).sort((a, b) => Number(a.day_index) - Number(b.day_index) || Number(a.start) - Number(b.start));
  const workRemainingMinutes = taskWorkRemainingMinutes(task);
  let unassignedWork = workRemainingMinutes;
  let scheduledCapacityMinutes = 0;
  const scheduledMinutes = sessions.reduce((sum, session) => {
    const capacityMinutes = Math.round((Number(session.end) - Number(session.start)) * 60);
    const plannedWorkMinutes = Math.min(capacityMinutes, Math.max(unassignedWork, 0));
    session.session_minutes = capacityMinutes;
    session.planned_work_minutes = plannedWorkMinutes;
    session.padding_minutes = capacityMinutes - plannedWorkMinutes;
    unassignedWork -= plannedWorkMinutes;
    scheduledCapacityMinutes += capacityMinutes;
    return sum + plannedWorkMinutes;
  }, 0);
  const remainingMinutes = Math.max(workRemainingMinutes - scheduledMinutes, 0);
  const protectedStatus = ["running", "completed", "paused", "blocked", "terminated"].includes(task.status);
  if (!protectedStatus) {
    if (!sessions.length) task.status = "queued";
    else if (remainingMinutes > 0) task.status = "partially_scheduled";
    else task.status = "scheduled";
  }
  task.execution = {
    ...(task.execution || {}),
    scheduled_duration_minutes: scheduledMinutes,
    scheduled_capacity_minutes: scheduledCapacityMinutes,
    schedule_padding_minutes: Math.max(scheduledCapacityMinutes - scheduledMinutes, 0),
    unallocated_schedule_minutes: remainingMinutes
  };
  return { scheduledMinutes, scheduledCapacityMinutes, paddingMinutes: Math.max(scheduledCapacityMinutes - scheduledMinutes, 0), remainingMinutes, workRemainingMinutes };
}

async function recordPlanEditEvent({ eventType, taskId = null, blockId = null, before = null, after = null, validation = null, effective = true, revertsEventId = null, actor = "user", source = "calendar" }) {
  if (!backendOnline || !pendingSchedulePlan?.edit_episode_id) return null;
  try {
    return await api("/api/plan-edits/events", {
      method: "POST",
      body: JSON.stringify({
        user_id: currentUserId(), edit_episode_id: pendingSchedulePlan.edit_episode_id,
        task_id: taskId, block_id: blockId, actor, event_type: eventType,
        before, after, interaction_source: source, validation_result: validation,
        effective, reverts_event_id: revertsEventId,
        request_id: crypto.randomUUID?.() || `edit-${Date.now()}-${Math.random()}`,
      client_time: appNow().toISOString()
      })
    });
  } catch (error) {
    console.warn("Plan edit event could not be recorded:", error.message);
    return null;
  }
}

async function moveCalendarSession(taskId, blockId, dayIndex, startHour, requestedEnd = null) {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) return;
  const start = Number(startHour);
  const pendingBlock = pendingSchedulePlan?.plan_patch?.find((item) => item.block_id === blockId);
  if (pendingBlock) {
    const snapshot = { ...pendingBlock };
    const duration = requestedEnd === null ? Number(pendingBlock.end) - Number(pendingBlock.start) : Number(requestedEnd) - start;
    pendingBlock.start = start;
    pendingBlock.end = start + duration;
    pendingBlock.day_index = Number(dayIndex);
    pendingBlock.session_minutes = Math.round(duration * 60);
    const conflictDetails = calendarBlockConflictDetails({ ...pendingBlock, task, source: "pending" }, blockId);
    const violations = conflictDetails.map((conflict) => conflict.message);
    if (conflictDetails.length) {
      const attemptedBlock = { ...pendingBlock };
      Object.assign(pendingBlock, snapshot);
      await recordPlanEditEvent({ eventType: "failed_edit_attempt", taskId, blockId, before: snapshot, after: attemptedBlock, validation: { valid: false, violations }, effective: false });
      render();
      showProductToast(failedDragToastMessage(conflictDetails[0]));
      return;
    } else {
      pendingReviewKey = currentPendingReviewKey();
      const advisories = calendarBlockAdvisories({ ...pendingBlock, task, source: "pending" }, blockId);
      await recordPlanEditEvent({ eventType: requestedEnd === null ? "move_session" : "resize_session", taskId, blockId, before: snapshot, after: { ...pendingBlock }, validation: { valid: true, advisories } });
      setBackendStatus(`${task.title} updated and validated`, true);
    }
    render();
    return;
  }
  const sessions = taskSlotSessions(task).map((session) => ({ ...session }));
  const target = sessions.find((session) => session.block_id === blockId) || sessions[0];
  if (!target) return;
  const snapshot = { ...target };
  const duration = requestedEnd === null ? target.end - target.start : Number(requestedEnd) - start;
  target.start = start;
  target.end = start + duration;
  target.day_index = Number(dayIndex);
  target.session_minutes = Math.round(duration * 60);
  const conflictDetails = calendarBlockConflictDetails({ ...target, task, source: "scheduled" }, blockId);
  const violations = conflictDetails.map((conflict) => conflict.message);
  if (conflictDetails.length) {
    const attemptedBlock = { ...target };
    Object.assign(target, snapshot);
    await recordPlanEditEvent({ eventType: "failed_edit_attempt", taskId, blockId, before: snapshot, after: attemptedBlock, validation: { valid: false, violations }, effective: false });
    render();
    showProductToast(failedDragToastMessage(conflictDetails[0]));
    return;
  }
  task.slot = { sessions, start: sessions[0].start, end: sessions[0].end, day_index: sessions[0].day_index, color: sessions[0].color || colorForTask(task) };
  refreshTaskScheduleStatus(task);
  task.contextWindow = { ...(task.contextWindow || {}), decisionTrace: { ...(task.contextWindow?.decisionTrace || {}), last_manual_adjustment: { block_id: blockId, day_index: dayIndex, start: target.start, end: target.end, validation: "passed" } } };
  selectTask(task.id, "manual");
  await patchBackendTask(task);
  const advisories = calendarBlockAdvisories({ ...target, task, source: "scheduled" }, blockId);
  addChatMessage(
    "ai",
    "Edit validated",
    `${task.title} was moved to ${formatHour(target.start)}-${formatHour(target.end)}. Hard constraints passed.${advisories.length ? ` Preference note: ${advisories.join("; ")}.` : ""}`
  );
  render();
}

async function moveTaskToHour(taskId, startHour) {
  const task = tasks.find((item) => item.id === taskId);
  const block = pendingSchedulePlan?.plan_patch?.find((item) => item.task_id === taskId) || taskCalendarBlock(task);
  if (block) await moveCalendarSession(taskId, block.block_id, dayIndexFromDue("今天"), startHour);
}

function stateBasedScheduleNote(task) {
  const energy = Number(energyInput.value);
  const stress = Number(stressInput.value);
  if (taskDurationHours(task) >= 2 && (energy <= 3 || stress >= 6)) {
    return "This block is long for your current state; keep one brief context checkpoint in the middle.";
  }
  return "This session stays on the calendar and can still be dragged or resized.";
}

function deduplicateVisibleCandidatePlans(decision = {}) {
  const candidates = valueList(decision.candidate_plans);
  if (candidates.length < 2) return decision;
  const unique = [];
  const signatureOwner = new Map();
  let selectedCandidateId = decision.selected_candidate_id;
  candidates.forEach((candidate) => {
    const signature = JSON.stringify(valueList(candidate.plan_patch)
      .filter((block) => block?.task_id)
      .map((block) => [String(block.task_id), Number(block.day_index), Number(block.start), Number(block.end)])
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
    const owner = signatureOwner.get(signature);
    if (!owner) {
      signatureOwner.set(signature, candidate);
      unique.push(candidate);
      return;
    }
    if (candidate.id === selectedCandidateId) selectedCandidateId = owner.id;
  });
  const selected = unique.find((candidate) => candidate.id === selectedCandidateId) || unique[0];
  return {
    ...decision,
    candidate_plans: unique,
    selected_candidate_id: selected?.id || decision.selected_candidate_id,
    plan_patch: selected?.plan_patch || decision.plan_patch,
    routine_adjustments: selected?.routine_adjustments || decision.routine_adjustments,
    parallel_suggestions: selected?.parallel_suggestions || decision.parallel_suggestions
  };
}

async function requestTentativeSchedule(reason = "Generate a plan from the current inputs", targetTasks = null, planningOverrides = {}) {
  if (scheduleRequestInFlight) return scheduleRequestInFlight;
  const sourceTasks = Array.isArray(targetTasks) && targetTasks.length ? targetTasks : tasks;
  const currentWeekId = currentProfile.active_week_id || currentProfile.weekly_context?.week_id || weekStartLabel();
  const schedulableTasks = sourceTasks.filter((task) =>
    !task.removed_from_week
    && (!task.week_id || task.week_id === currentWeekId)
    && !["completed", "terminated", "blocked", "paused"].includes(task.status)
    && missingTimeConfirmationFields(task).length === 0
  );
  if (!schedulableTasks.length) {
    addChatMessage("ai", "Task details required", "Before scheduling, provide the completion deadline and estimated duration. HumanOS will choose the start time.");
    return;
  }
  if (!parseAvailableWindows(currentProfile).length) {
    addChatMessage("ai", "Weekly availability required", "A deadline is not a start time. Add available windows in Weekly Context before generating a plan.");
    return;
  }
  if (!backendOnline) {
    setEngineStatus("AI unavailable", false, "Check the connection and try again");
    setBackendStatus("AI connection unavailable. Try again.", false);
    return;
  }
  const requestId = globalThis.crypto?.randomUUID?.() || `schedule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const autoScheduleBtn = document.getElementById("autoScheduleBtn");
  if (autoScheduleBtn) {
    autoScheduleBtn.disabled = true;
    autoScheduleBtn.dataset.previousLabel = autoScheduleBtn.textContent;
    autoScheduleBtn.textContent = "Generating…";
  }
  scheduleRequestInFlight = (async () => {
    try {
      const runtimeState = await saveRuntimeStateToBackend();
      const response = await api("/api/schedules/decide", {
        method: "POST",
        body: JSON.stringify({
          request_id: requestId,
          user_id: currentUserId(),
          week_id: currentWeekId,
          runtime_state: runtimeState,
          tasks: schedulableTasks,
          client_context: clientContextPayload(),
          accepted_parallel_pairs: valueList(planningOverrides.accepted_parallel_pairs),
          accepted_parallel_context_pairs: valueList(planningOverrides.accepted_parallel_context_pairs)
        })
      });
      pendingSchedulePlan = deduplicateVisibleCandidatePlans({ ...response.decision, request_id: response.decision?.request_id || requestId });
      rightRailMode = "plan";
      activeSelectionMode = "auto";
      recalculateAllPendingTaskSessions();
      setEngineStatus(
        pendingSchedulePlan.llm_provider === "deepseek" ? "AI connected" : "Scheduling service",
        pendingSchedulePlan.llm_provider === "deepseek",
        pendingSchedulePlan.llm_provider === "deepseek" ? "HumanOS generated a constraint-checked plan" : "HumanOS generated this plan without the AI connection"
      );
      if (pendingSchedulePlan.unscheduled_tasks?.length) {
        addChatMessage("ai", "Some work remains unscheduled", pendingSchedulePlan.unscheduled_tasks.map((item) => `${tasks.find((task) => task.id === item.task_id)?.title || "Task"}: ${item.reason}`).join("\n"), `unscheduled:${requestId}`);
      }
      if (pendingSchedulePlan.low_confidence_demand?.length) {
        addChatMessage("ai", "Task demand needs confirmation", pendingSchedulePlan.low_confidence_demand.map((item) => `${item.title}: ${item.evidence.join("; ")}. If this affects the plan, HumanOS will ask only once.`).join("\n"), `demand-confirmation:${requestId}`);
      }
      lastDecision = pendingSchedulePlan;
      setBackendStatus("Draft plan ready for review", true);
      return pendingSchedulePlan;
    } finally {
      scheduleRequestInFlight = null;
      if (autoScheduleBtn) {
        autoScheduleBtn.disabled = false;
        autoScheduleBtn.textContent = autoScheduleBtn.dataset.previousLabel || "Generate adjustments";
      }
    }
  })();
  return scheduleRequestInFlight;
}

function temporalMetadataForTask(task) {
  const timezone = clientContextPayload().timezone;
  const now = appNow();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const text = String(task.due || "");
  const absoluteMatch = text.match(/(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})|(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日?/);
  const nextWeekMatch = text.match(/下周(?:周|星期)?([一二三四五六日天])/);
  const dayMap = { 一: 0, 二: 1, 三: 2, 四: 3, 五: 4, 六: 5, 日: 6, 天: 6 };
  let targetDate = null;
  if (absoluteMatch) {
    targetDate = new Date(
      Number(absoluteMatch[1] || absoluteMatch[4] || now.getFullYear()),
      Number(absoluteMatch[2] || absoluteMatch[5]) - 1,
      Number(absoluteMatch[3] || absoluteMatch[6])
    );
  } else if (nextWeekMatch) {
    targetDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7 + dayMap[nextWeekMatch[1]]);
  } else {
    const dayIndex = dayIndexFromDue(task.due);
    if (dayIndex !== null) targetDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + dayIndex);
  }
  if (!targetDate || Number.isNaN(targetDate.getTime())) return { timezone, deadline_at: null, start_at: null, deadline_assumption: null };
  const targetDayIndex = (targetDate.getDay() + 6) % 7;
  const explicitHour = parseDueStartHour(task.due);
  const availableEnds = parseAvailableWindows(currentProfile)
    .filter((window) => window.day_index === targetDayIndex)
    .map((window) => window.end);
  const assumedHour = availableEnds.length ? Math.max(...availableEnds) : 23.9833;
  const hour = explicitHour ?? assumedHour;
  targetDate.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  const isFixed = task.task_type === "fixed_event";
  return {
    timezone,
    start_at: isFixed && explicitHour !== null ? targetDate.toISOString() : null,
    deadline_at: !isFixed ? targetDate.toISOString() : null,
    deadline_assumption: !isFixed && explicitHour === null
      ? `Temporarily using the final available-window end at ${formatHour(assumedHour)}; editable`
      : null
  };
}

function renderTaskPreview() {
  taskPreviewList.innerHTML = pendingTaskPreview.map((draft, index) => {
    const evidence = valueList(draft.source_spans);
    const missing = valueList(draft.missing_fields);
    const priority = ["高", "中", "低"].includes(draft.priority) ? draft.priority : "";
    return `
      <article class="task-preview-card" data-preview-index="${index}">
        <div class="task-preview-card-head">
          <strong>Item ${index + 1}</strong>
          <span class="confidence-chip">Parse confidence ${Math.round(Number(draft.confidence || 0) * 100)}%</span>
        </div>
        <div class="task-preview-grid">
          <label>Name<input class="preview-title" required value="${escapeHtml(draft.title || "")}" placeholder="Task name"></label>
          <label>Schedule type<select class="preview-type">
            <option value="flexible_task" ${draft.task_type === "flexible_task" ? "selected" : ""}>Flexible task</option>
            <option value="fixed_event" ${draft.task_type === "fixed_event" ? "selected" : ""}>Fixed event</option>
            <option value="recovery_task" ${draft.task_type === "recovery_task" ? "selected" : ""}>Recovery task</option>
          </select></label>
          <label>Fixed time / deadline<input class="preview-due" required value="${escapeHtml(draft.due === "未设置" ? "" : draft.due || "")}" placeholder="e.g. Tomorrow 15:00 or by Friday"></label>
          <label>Estimated duration (minutes)<input class="preview-duration" type="number" min="5" step="1" required value="${draft.duration ? normalizeTaskDurationMinutes(draft.duration) : ""}" placeholder="Confirm or edit"></label>
          <label>Priority<select class="preview-priority">
            <option value="" ${!priority ? "selected" : ""}>Not provided (using Medium)</option>
            ${[["高", "High"], ["中", "Medium"], ["低", "Low"]].map(([item, label]) => `<option value="${item}" ${priority === item ? "selected" : ""}>${label}</option>`).join("")}
          </select></label>
        </div>
        ${evidence.length ? `<div class="source-evidence"><span>User text</span>${evidence.map((item) => `<q>${escapeHtml(item)}</q>`).join("")}</div>` : ""}
        ${missing.length ? `<p class="preview-warning">Confirm: ${missing.map((item) => ({title:"name", start_at:"fixed time", deadline_at:"deadline", duration_minutes:"estimated duration"}[item] || item)).join(", ")}</p>` : ""}
      </article>
    `;
  }).join("");
}

function openTaskPreview(drafts) {
  pendingTaskPreview = drafts.map((draft) => ({ ...draft }));
  renderTaskPreview();
  if (!taskPreviewDialog.open) taskPreviewDialog.showModal();
}

function closeTaskPreview() {
  pendingTaskPreview = [];
  if (taskPreviewDialog.open) taskPreviewDialog.close("cancel");
}

async function handleChatTurn(text) {
  const clean = text.trim();
  if (!clean) {
    addChatMessage("ai", "Input required", "Tell me which task you want to schedule, advance, or review.");
    render();
    return;
  }
  addChatMessage("user", "You", clean);
  chatSendBtn.disabled = true;
  try {
    let turn;
    if (backendOnline) {
      const response = await api("/api/chat/turn", {
        method: "POST",
        body: JSON.stringify({ user_id: currentUserId(), text: clean, client_context: clientContextPayload() })
      });
      turn = response.turn;
    } else {
      turn = {
        reply: "I will parse this message into tasks and generate a plan for your confirmation.",
        features: { intent: "add_task", blockers: [] },
        tasks: localFallbackTasksFromText(clean)
      };
    }
    let contextAffectedTasks = [];
    let contextWasUpdated = false;
    if (turn.weekly_context) {
      currentProfile = { ...currentProfile, weekly_context: turn.weekly_context };
      contextWasUpdated = Boolean(turn.context_event_updated);
      if (turn.context_event_updated) contextAffectedTasks = releaseTasksConflictingWithContext(turn.context_event_updated);
      await Promise.all(contextAffectedTasks.map((task) => patchBackendTask(task)));
      save();
      render();
    }
    const previewTasks = (turn.tasks || []).filter((task) => task?.is_preview);
    const createdTasks = (turn.tasks || []).filter((task) => !task?.is_preview).map(normalizeBackendTask);
    createdTasks.forEach((task) => {
      const identity = (value) => String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
      const existingIndex = tasks.findIndex((item) => item.id === task.id || (
        identity(item.title) === identity(task.title)
        && identity(item.due) === identity(task.due)
        && !["completed", "terminated"].includes(item.status)
      ));
      if (existingIndex >= 0) {
        tasks[existingIndex] = { ...task, id: tasks[existingIndex].id };
      } else {
        tasks.push(task);
      }
    });
    if (createdTasks.length) {
      activeSelectionMode = "auto";
      activeId = defaultActiveTaskId();
    }
    chatInput.value = "";
    const featureText = turn.features?.blockers?.length
      ? `\nExplicit constraints: ${turn.features.blockers.join(" / ")}`
      : "";
    addChatMessage("ai", "HumanOS", `${turn.reply}${featureText}`);
    if (contextWasUpdated) {
      try {
        await requestTentativeSchedule("A Weekly Context item changed in chat. Keep the updated item in place and regenerate one complete draft plan around it.");
      } catch (scheduleError) {
        addChatMessage("ai", "Calendar item updated", "The time change is saved and visible on the calendar, but I could not generate the revised draft yet. Try Generate adjustments when the AI connection is available.");
        console.error(scheduleError);
      }
    }
    if (previewTasks.length) openTaskPreview(previewTasks);
    if (turn.event_trigger === "open_pause_checkin" && selectedTask() && !pauseDialog.open) {
      preparePauseDialog(selectedTask());
    }
    if (createdTasks.length) {
      const incompleteTasks = createdTasks
        .map((task) => ({ task, missing: missingTimeConfirmationFields(task) }))
        .filter((item) => item.missing.length);
      const schedulableTasks = createdTasks.filter((task) => missingTimeConfirmationFields(task).length === 0);
      if (incompleteTasks.length) {
        addChatMessage(
          "ai",
          "Time confirmation required",
          incompleteTasks
            .map(({ task, missing }) => `${task.title}: still needs ${missing.join(", ")}`)
            .join("\n")
        );
      }
      if (schedulableTasks.length) {
        await requestTentativeSchedule("Generate a schedule for the tasks just parsed.", schedulableTasks);
      }
    }
    render();
  } catch (error) {
    addChatMessage("ai", "Update incomplete", "I could not finish this update. Your saved calendar remains unchanged; please try again or edit the item directly on the calendar.");
    console.error(error);
    render();
  } finally {
    chatSendBtn.disabled = false;
  }
}

function currentHourFloat() {
  const now = appNow();
  return now.getHours() + now.getMinutes() / 60;
}

function dayDistanceFromToday(dayIndex) {
  if (dayIndex === null || dayIndex === undefined) return 14;
  const todayIndex = dayIndexFromDue("今天");
  return (dayIndex - todayIndex + 7) % 7;
}

function activeCandidateScore(block) {
  const dayDistance = dayDistanceFromToday(block.day_index);
  const nowHour = currentHourFloat();
  const start = Number(block.start);
  const end = Number(block.end);
  if (dayDistance === 0 && start <= nowHour && nowHour < end) return -1000 + start;
  if (dayDistance === 0 && start >= nowHour) return start;
  return dayDistance * 24 + start;
}

function defaultActiveTaskId() {
  const candidates = visibleCalendarBlocks()
    .filter((block) => block.task && block.task.status !== "completed" && block.task.status !== "terminated")
    .sort((a, b) => activeCandidateScore(a) - activeCandidateScore(b));
  if (candidates.length) return candidates[0].task.id;
  const fallback = tasks.find((task) => task.status !== "completed" && task.status !== "terminated") || tasks[0];
  return fallback?.id || null;
}

function ensureActiveTask() {
  if (activeSelectionMode === "none") {
    activeId = null;
    return;
  }
  const activeExists = tasks.some((task) => task.id === activeId);
  if (activeSelectionMode === "auto" || !activeExists) {
    activeId = defaultActiveTaskId();
    activeSelectionMode = "auto";
  }
}

function checkTaskTimePrompts(force = false) {
  const nowHour = currentHourFloat();
  const todayIndex = dayIndexFromDue("今天");
  tasks.forEach((task) => taskSlotSessions(task).filter((session) => session.day_index === todayIndex).forEach((session) => {
    const startKey = `${task.id}:${session.block_id}:start:${session.start}`;
    const endKey = `${task.id}:${session.block_id}:end:${session.end}`;
    if ((force || Math.abs(nowHour - session.start) <= 0.08) && !promptedSlots.has(startKey)) {
      promptedSlots.add(startKey);
      addChatMessage("ai", "Session starting", `${task.title} is scheduled now. Are you ready to begin? If not, tell me what is blocking you.`);
    }
    if ((force || Math.abs(nowHour - session.end) <= 0.08) && !promptedSlots.has(endKey)) {
      promptedSlots.add(endKey);
      if (task.status !== "completed") {
        addChatMessage("ai", "Session ended", `${task.title} is not marked complete. Choose the outcome to save progress and the next action when needed.`);
      }
    }
  }));
  save();
  renderChat();
}

function statusLabel(task) {
  if (task.status === "running") return "Running";
  if (task.status === "paused") return "Suspended";
  if (task.status === "scheduled") return "Scheduled";
  if (task.status === "partially_scheduled") return "Partially scheduled";
  if (task.status === "completed") return "Completed";
  if (task.status === "blocked") return "Blocked";
  if (task.status === "queued") return "Ready";
  return "Ready";
}

function renderChat() {
  const task = selectedTask();
  const systemMessages = [
    {
      sender: "ai",
      title: "HumanOS",
      text: task ? `Start with: ${task.title}` : "Tell me what you want to schedule."
    }
  ];
  const conversationalTitles = new Set([
    "HumanOS", "You", "Session starting", "Session ended", "Resume task",
    "Input required", "Task details required", "Weekly availability required", "Processing failed"
  ]);
  const visibleMessages = chatMessages.filter((message) => message.sender === "user" || conversationalTitles.has(message.title));
  chatThread.innerHTML = [...systemMessages, ...visibleMessages].map((message) => `
    <div class="message ${message.sender}">
      <strong>${escapeHtml(message.title)}${message.createdAt ? ` · ${escapeHtml(message.createdAt)}` : ""}</strong>
      ${escapeHtml(localizeDisplayTime(message.text, message.sender === "ai")).replace(/\n/g, "<br>")}
    </div>
  `).join("");
  chatThread.scrollTop = chatThread.scrollHeight;
}

function calendarBounds() {
  const windows = parseAvailableWindows(currentProfile);
  if (!windows.length) return { start: 8, end: 22 };
  return {
    start: Math.max(0, Math.floor(Math.min(...windows.map((window) => window.start)))),
    end: Math.min(24, Math.ceil(Math.max(...windows.map((window) => window.end))))
  };
}

function weekDateForDay(dayIndex) {
  const now = appNow();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const date = new Date(monday);
  date.setDate(monday.getDate() + dayIndex);
  return date;
}

function timelineAvailabilityMarkup(dayIndex, bounds) {
  return parseAvailableWindows(currentProfile)
    .filter((window) => window.day_index === dayIndex)
    .map((window) => {
      const top = (window.start - bounds.start) * HOUR_ROW_HEIGHT;
      const height = (window.end - window.start) * HOUR_ROW_HEIGHT;
      return `<div class="availability-band" style="top:${top}px;height:${height}px" title="Available ${formatHour(window.start)}–${formatHour(window.end)}"></div>`;
    }).join("");
}

function layoutParallelTimelineBlocks(blocks) {
  const laidOut = blocks.map((block) => ({ ...block }));
  const groups = new Map();
  laidOut.forEach((block) => {
    if (!block.parallel_group_id || !block.parallel_user_confirmed) return;
    const group = groups.get(block.parallel_group_id) || [];
    group.push(block);
    groups.set(block.parallel_group_id, group);
  });
  groups.forEach((group) => {
    const byTask = [...new Map(group.map((block) => [String(block.task_id || block.context_id), block])).values()]
      .sort((first, second) => {
        const roleOrder = { primary: 0, secondary: 1 };
        return (roleOrder[first.parallel_role] ?? 2) - (roleOrder[second.parallel_role] ?? 2) || String(first.task_id).localeCompare(String(second.task_id));
      });
    if (byTask.length !== 2) return;
    byTask.forEach((block, index) => {
      block.parallel_column_index = index;
      block.parallel_column_count = 2;
    });
  });
  return laidOut;
}

function timelineBlockMarkup(block, bounds) {
  const top = Math.max((block.start - bounds.start) * HOUR_ROW_HEIGHT, 0);
  const height = Math.max((block.end - block.start) * HOUR_ROW_HEIGHT, block.source === "context" ? 22 : 28);
  if (block.source === "context") {
    const typeLabels = { fixed_event: "Cannot move", recurring_routine: "Usually around this time", flexible_activity: "HumanOS may choose the time", temporary_constraint: "Unavailable this week", other_commitment: "Protected time", buffer: "Buffer", recovery_transition: "Transition" };
    const editable = Boolean(block.context_id && !["buffer", "recovery_transition"].includes(block.context_type));
    const displayTitle = localizeWeeklyContextText(String(block.context_type === "recovery_transition" ? typeLabels.recovery_transition : (block.label || typeLabels[block.context_type] || "Constraint"))
      .replace(/^(?:已占用|固定|日常|可灵活安排|可移动|可调整|Fixed|Routine|Flexible|Blocked)\s*/, ""))
      .replace(/^(?:Any day this week|Repeat every day|Every day|Weekdays|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*(?:\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2})?\s*/, "")
      .replace(/\s*(?:时长\d+分钟|duration\s*\d+\s*minutes?)/i, "")
      .replace(/\s*[（(]AI suggestion; review needed[）)]\s*/i, "")
      .trim();
    const parallelHorizontalStyle = block.parallel_column_count === 2
      ? `left:calc(${Number(block.parallel_column_index || 0) * 50}% + ${Number(block.parallel_column_index || 0) ? 3 : 5}px);right:auto;width:calc(50% - 8px);`
      : "";
    return `
      <article class="timeline-event context-event ${block.context_type || block.color} ${editable ? "editable-context" : ""} ${block.parallel_group_id ? "parallel-session" : ""}" data-block-id="${escapeHtml(block.block_id)}" data-context-id="${escapeHtml(block.context_id || "")}" title="${escapeHtml(displayTitle)} · ${formatHour(block.start)}–${formatHour(block.end)}${block.parallel_group_id ? " · Confirmed parallel pair" : ""}${editable ? " · Click to edit" : ""}" style="top:${top}px;height:${height}px;${parallelHorizontalStyle}">
        <strong>${escapeHtml(displayTitle)}</strong>
        <time>${formatHour(block.start)}–${formatHour(block.end)}</time>
      </article>`;
  }
  const sessionMinutes = block.session_minutes || Math.round((block.end - block.start) * 60);
  const isFixedTask = block.kind === "fixed_event" || block.task?.task_type === "fixed_event";
  const isParallel = Boolean(block.parallel_group_id && block.parallel_user_confirmed);
  const sessionLabel = isParallel ? "Confirmed parallel session" : isFixedTask ? "Fixed event" : block.session_count > 1 ? `Session ${block.session_index || 1}/${block.session_count}` : "Flexible task";
  const stateLabel = block.constraint_conflict ? "Needs your decision" : block.source === "pending" ? "Draft" : block.task?.status === "partially_scheduled" ? "Partially scheduled" : "Scheduled";
  const visualTop = top + 2;
  const visualHeight = Math.max(height - 4, 26);
  const parallelHorizontalStyle = block.parallel_column_count === 2
    ? `left:calc(${Number(block.parallel_column_index || 0) * 50}% + ${Number(block.parallel_column_index || 0) ? 3 : 5}px);right:auto;width:calc(50% - 8px);`
    : "";
  const densityClass = visualHeight < 43 ? "event-compact" : visualHeight < 62 ? "event-small" : "";
  const taskTitle = block.task?.title || "Task";
  const executionSession = currentExecutionState?.session;
  const matchesExecution = executionSession && String(executionSession.block_id) === String(block.block_id);
  const interruption = block.task?.contextWindow?.interruption || {};
  const expectedResume = interruption.expected_resume_at ? new Date(interruption.expected_resume_at) : null;
  const executionCaption = matchesExecution && currentExecutionState?.mode === "paused"
    ? `Worked ${executionElapsedMinutes(executionSession)} min · Paused${expectedResume ? ` · resumes ${expectedResume.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}`
    : matchesExecution && currentExecutionState?.mode === "now"
      ? `Running · ${executionSession.session_remaining_minutes ?? ""} min left`
      : "";
  return `
    <article class="timeline-event task-event ${block.color} ${taskStatusClass(block.task, block)} ${densityClass}" draggable="${isFixedTask ? "false" : "true"}" data-task-id="${escapeHtml(block.task_id)}" data-block-id="${escapeHtml(block.block_id)}" data-parallel-group="${escapeHtml(block.parallel_group_id || "")}" data-parallel-role="${escapeHtml(block.parallel_role || "")}" aria-label="${escapeHtml(taskTitle)}, ${formatHour(block.start)} to ${formatHour(block.end)}" title="${escapeHtml(taskTitle)} · ${formatHour(block.start)}–${formatHour(block.end)} · ${sessionMinutes} min · ${sessionLabel} · ${stateLabel}" style="--session-index:${Number(block.session_index || 0)};top:${visualTop}px;height:${visualHeight}px;${parallelHorizontalStyle}">
      <strong><span class="event-title">${escapeHtml(taskTitle)}</span><span class="compact-time">${formatHour(block.start)}–${formatHour(block.end)}</span></strong>
      <time>${formatHour(block.start)}–${formatHour(block.end)}</time>
      ${executionCaption ? `<small class="execution-caption">${escapeHtml(executionCaption)}</small>` : ""}
      ${isFixedTask ? "" : '<button class="resize-handle" type="button" aria-label="Resize session" tabindex="-1"></button>'}
    </article>`;
}

function bindTimelineInteractions(bounds) {
  calendar.querySelectorAll(".timeline-day").forEach((column) => {
    column.addEventListener("dragover", (event) => {
      event.preventDefault();
      column.classList.add("drag-over");
    });
    column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
    column.addEventListener("drop", (event) => {
      event.preventDefault();
      column.classList.remove("drag-over");
      const taskId = event.dataTransfer.getData("text/task-id");
      const blockId = event.dataTransfer.getData("text/block-id");
      if (!taskId || !blockId) return;
      const rect = column.getBoundingClientRect();
      const rawHour = bounds.start + ((event.clientY - rect.top) / HOUR_ROW_HEIGHT);
      const snapped = Math.max(bounds.start, Math.min(bounds.end - 0.25, Math.round(rawHour * 4) / 4));
      moveCalendarSession(taskId, blockId, Number(column.dataset.dayIndex), snapped);
    });
  });
  calendar.querySelectorAll(".task-event").forEach((element) => {
    element.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/task-id", element.dataset.taskId);
      event.dataTransfer.setData("text/block-id", element.dataset.blockId);
      event.dataTransfer.effectAllowed = "move";
      element.classList.add("dragging");
    });
    element.addEventListener("dragend", () => element.classList.remove("dragging"));
    element.addEventListener("click", (event) => {
      if (event.target.closest(".resize-handle")) return;
      selectTask(element.dataset.taskId, "manual");
      render();
    });
    const handle = element.querySelector(".resize-handle");
    handle?.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const taskId = element.dataset.taskId;
      const blockId = element.dataset.blockId;
      const block = visibleCalendarBlocks().find((item) => item.block_id === blockId);
      if (!block) return;
      const originY = event.clientY;
      const originEnd = block.end;
      const onMove = (moveEvent) => {
        const deltaHours = (moveEvent.clientY - originY) / HOUR_ROW_HEIGHT;
        const previewEnd = Math.max(block.start + 0.25, Math.min(bounds.end, Math.round((originEnd + deltaHours) * 4) / 4));
        element.style.height = `${Math.max((previewEnd - block.start) * HOUR_ROW_HEIGHT, 28)}px`;
        element.dataset.previewEnd = String(previewEnd);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const previewEnd = Number(element.dataset.previewEnd || originEnd);
        delete element.dataset.previewEnd;
        moveCalendarSession(taskId, blockId, block.day_index, block.start, previewEnd);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    });
  });
  calendar.querySelectorAll(".context-event.editable-context").forEach((element) => {
    element.addEventListener("click", () => openContextEventDialog(element.dataset.contextId));
  });
}

function updateContextEventDialogMode() {
  const type = document.getElementById("contextEventType").value;
  const flexible = type === "flexible_activity";
  const routine = type === "recurring_routine";
  const blocked = type === "temporary_constraint";
    document.getElementById("contextEventStartLabel").textContent = flexible ? "Earliest start (optional)" : routine ? "Preferred start" : "Start";
    document.getElementById("contextEventEndLabel").textContent = flexible ? "Latest end (optional)" : routine ? "Preferred end" : "End";
  document.getElementById("contextEventDurationField").classList.toggle("hidden", !flexible);
  document.getElementById("contextEventDuration").required = flexible;
  document.getElementById("contextEventStart").required = !flexible;
  document.getElementById("contextEventEnd").required = !flexible;
  document.getElementById("contextEventHint").textContent = flexible
      ? "A day and duration are enough. Add a possible range to keep HumanOS strictly inside it."
    : routine
        ? "This is a preferred routine window. HumanOS may shift it by up to 30 minutes when urgent work requires it."
        : blocked
          ? "Blocked time is unavailable for this week. HumanOS only replans flexible tasks affected by it."
          : "Fixed times stay in place. HumanOS only replans flexible tasks affected by a conflict.";
}

function openContextEventDialog(contextId) {
  const item = valueList(currentProfile.weekly_context?.context_items).find((candidate) => candidate?.id === contextId);
  if (!item) {
    addChatMessage("ai", "Weekly Context update required", "This is legacy text data. Save Weekly Context once from Profile so each item receives an editable ID.");
    renderChat();
    return;
  }
  editingContextEventId = item.id;
  document.getElementById("contextEventId").value = item.id;
  document.getElementById("contextEventType").value = normalizedContextActivityType(item);
  document.getElementById("contextEventTitle").value = item.title || "";
  document.getElementById("contextEventDay").value = item.day || "周一";
  document.getElementById("contextEventStart").value = item.start === null || item.start === undefined ? "" : clockText(Number(item.start));
  document.getElementById("contextEventEnd").value = item.end === null || item.end === undefined ? "" : clockText(Number(item.end));
  document.getElementById("contextEventDuration").value = item.duration_minutes || "";
  updateContextEventDialogMode();
  if (!contextEventDialog.open) contextEventDialog.showModal();
}

function contextItemLegacyText(item) {
  const prefix = contextActivityPrefix(normalizedContextActivityType(item));
  const range = Number.isFinite(Number(item.start)) && Number.isFinite(Number(item.end)) ? ` ${clockText(Number(item.start))}-${clockText(Number(item.end))}` : "";
  const duration = item.type === "flexible_activity" && item.duration_minutes ? ` duration ${item.duration_minutes} minutes` : "";
  return `${prefix} ${item.day || ""}${range} ${item.title || ""}${duration}`.trim();
}

async function persistWeeklyContext() {
  save();
  if (!backendOnline) return;
  const response = await api(`/api/profile?user_id=${currentUserId()}`, {
    method: "PUT",
    body: JSON.stringify(currentProfile)
  });
  currentProfile = response.profile;
}

function releaseTasksConflictingWithContext(item) {
  const days = Array.isArray(item.days) && item.days.length ? item.days.map(Number) : dayIndicesFromText(item.day || "");
  const start = Number(item.start);
  const end = Number(item.end);
  if (!days.length || !Number.isFinite(start) || !Number.isFinite(end)) return [];
  const affected = [];
  tasks.forEach((task) => {
    if (task.task_type === "fixed_event" || ["completed", "terminated"].includes(task.status)) return;
    const conflicts = taskSlotSessions(task).some((session) => days.includes(Number(session.day_index)) && session.start < end && start < session.end);
    if (!conflicts) return;
    task.slot = null;
    if (!['paused', 'blocked', 'running'].includes(task.status)) task.status = "queued";
    refreshTaskScheduleStatus(task);
    affected.push(task);
  });
  pendingSchedulePlan = null;
  return affected;
}

async function saveContextEventFromDialog() {
  const type = document.getElementById("contextEventType").value;
  const title = document.getElementById("contextEventTitle").value.trim();
  const day = document.getElementById("contextEventDay").value;
  const startInput = document.getElementById("contextEventStart");
  const endInput = document.getElementById("contextEventEnd");
  startInput.value = normalizeClockInputValue(startInput.value);
  endInput.value = normalizeClockInputValue(endInput.value);
  const start = parseClockToken(startInput.value);
  const end = parseClockToken(endInput.value);
  const durationRaw = document.getElementById("contextEventDuration").value.trim();
  const duration = type === "flexible_activity" ? (durationRaw ? Math.max(15, Math.round(Number(durationRaw))) : 0) : (start !== null && end !== null ? Math.round((end - start) * 60) : 0);
  const invalidRange = start !== null || end !== null ? start === null || end === null || end <= start : false;
  if (!title || (type !== "flexible_activity" && (start === null || end === null || end <= start)) || (type === "flexible_activity" && (!duration || invalidRange))) {
    throw new Error(type === "flexible_activity" ? "Enter an activity name, day, and duration. The possible time range may be blank or fully specified." : "Enter an item name, day, and a valid start/end time.");
  }
  const items = valueList(currentProfile.weekly_context?.context_items).filter((item) => item && typeof item === "object");
  const index = items.findIndex((item) => item.id === editingContextEventId);
  if (index < 0) throw new Error("This Weekly Context item could not be found. Refresh and try again.");
  const updated = {
    ...items[index], type, category: type,
    title, day, days: dayIndicesFromText(day), start, end,
    occurrence_mode: type === "flexible_activity" ? (day === "任意一天" ? "once_this_week" : "repeat_each_selected_day") : null,
    duration_minutes: duration, shift_minutes: type === "recurring_routine" ? 30 : 0,
    routine_exceptions: {},
    confirmed: true, confidence: "high", source: "user", evidence: ["Confirmed by user edit"], updated_at: appNow().toISOString()
  };
  items[index] = updated;
  currentProfile = {
    ...currentProfile,
    weekly_context: {
      ...(currentProfile.weekly_context || {}),
      context_items: items,
      fixed_events: items.map(contextItemLegacyText),
      temporary_constraints: items.filter((item) => normalizedContextActivityType(item) === "temporary_constraint").map(contextItemLegacyText)
    }
  };
  const affected = releaseTasksConflictingWithContext(updated);
  await Promise.all(affected.map((task) => patchBackendTask(task)));
  await persistWeeklyContext();
  if (contextEventDialog.open) contextEventDialog.close("saved");
  addChatMessage(
    "ai",
    type === "fixed_event" ? "Fixed time updated" : type === "recurring_routine" ? "Routine window updated" : type === "temporary_constraint" ? "Blocked time updated" : "Flexible activity range updated",
    `${title}: ${displayWeeklyDay(day)}${start !== null && end !== null ? ` ${formatHour(start)}–${formatHour(end)}` : ""}. ${type === "fixed_event" ? "This time remains fixed." : type === "recurring_routine" ? "This window is normally preserved and may shift by up to 30 minutes for urgent work." : type === "temporary_constraint" ? "This interval remains unavailable this week." : start !== null && end !== null ? `HumanOS will schedule ${duration} minutes only inside this range.` : `HumanOS will schedule ${duration} minutes within that day's availability.`}${affected.length ? ` Released for local replanning: ${affected.map((task) => task.title).join(", ")}.` : " No conflict with an existing task was found."}`
  );
  try {
    await requestTentativeSchedule(`“${title}” was updated. Keep protected time in place, allow routine windows to shift by at most 30 minutes, and regenerate one complete draft plan around the change.`);
  } catch (scheduleError) {
    addChatMessage("ai", "Weekly Context saved", "The calendar item was updated, but a revised draft could not be generated. Your previous confirmed plan remains available until you try again.");
    console.error(scheduleError);
  }
  render();
}

async function deleteContextEvent() {
  const items = valueList(currentProfile.weekly_context?.context_items).filter((item) => item && typeof item === "object");
  const removed = items.find((item) => item.id === editingContextEventId);
  if (!removed) return;
  const remaining = items.filter((item) => item.id !== editingContextEventId);
  currentProfile = {
    ...currentProfile,
    weekly_context: { ...(currentProfile.weekly_context || {}), context_items: remaining, fixed_events: remaining.map(contextItemLegacyText), temporary_constraints: remaining.filter((item) => normalizedContextActivityType(item) === "temporary_constraint").map(contextItemLegacyText) }
  };
  await persistWeeklyContext();
  if (contextEventDialog.open) contextEventDialog.close("deleted");
  addChatMessage("ai", "Weekly Context updated", `“${removed.title}” was deleted. Existing tasks were not moved automatically; replan when needed.`);
  render();
}

function renderTimeline(dayIndices) {
  const bounds = calendarBounds();
  const hours = Array.from({ length: bounds.end - bounds.start + 1 }, (_, index) => bounds.start + index);
  const height = (bounds.end - bounds.start) * HOUR_ROW_HEIGHT;
  const allBlocks = visibleCalendarBlocks();
  const todayIndex = (appNow().getDay() + 6) % 7;
  const now = appNow();
  const nowHour = now.getHours() + now.getMinutes() / 60;
  calendar.innerHTML = `
    <div class="timeline-grid" style="--timeline-columns:${dayIndices.length};min-width:${64 + dayIndices.length * 174}px">
      <div class="timeline-corner"></div>
      ${dayIndices.map((dayIndex) => {
        const date = weekDateForDay(dayIndex);
        const isToday = dayIndex === todayIndex;
        return `<header class="timeline-day-head ${isToday ? "is-today" : ""} ${dayIndex > 4 ? "is-weekend" : ""}"><strong>${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dayIndex]}</strong><span>${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span></header>`;
      }).join("")}
      <div class="timeline-axis" style="height:${height}px">
        ${hours.map((hour) => `<span style="top:${(hour - bounds.start) * HOUR_ROW_HEIGHT}px">${String(hour).padStart(2, "0")}:00</span>`).join("")}
      </div>
      ${dayIndices.map((dayIndex) => {
        const blocks = layoutParallelTimelineBlocks(allBlocks.filter((block) => block.day_index === dayIndex && block.end > bounds.start && block.start < bounds.end));
        const currentLine = dayIndex === todayIndex && nowHour >= bounds.start && nowHour <= bounds.end
          ? `<div class="current-time-line" style="top:${(nowHour - bounds.start) * HOUR_ROW_HEIGHT}px"></div>` : "";
        return `<section class="timeline-day ${dayIndex > 4 ? "is-weekend" : ""}" data-day-index="${dayIndex}" style="height:${height}px">
          ${hours.slice(0, -1).map((hour) => `<div class="timeline-hour-line" style="top:${(hour - bounds.start) * HOUR_ROW_HEIGHT}px"></div>`).join("")}
          ${timelineAvailabilityMarkup(dayIndex, bounds)}
          ${blocks.map((block) => timelineBlockMarkup(block, bounds)).join("")}
          ${currentLine}
        </section>`;
      }).join("")}
    </div>`;
  bindTimelineInteractions(bounds);
}

function renderCalendar() {
  if (calendarView === "week") {
    renderWeekCalendar();
  } else {
    renderTimeline([(appNow().getDay() + 6) % 7]);
  }
  const visibleBlocks = visibleCalendarBlocks();
  const hasMandatoryDecision = valueList(pendingSchedulePlan?.validation?.violations).length > 0
    || valueList(pendingSchedulePlan?.unscheduled_tasks).some((item) => Number(item.remaining_minutes || 0) > 0);
  conflictLegend?.classList.toggle("hidden", !hasMandatoryDecision);
  parallelLegend?.classList.toggle("hidden", !visibleBlocks.some((block) => block.parallel_group_id));
}

function renderWeekCalendar() {
  renderTimeline([0, 1, 2, 3, 4, 5, 6]);
}

function formatHour(value) {
  const totalMinutes = Math.round(Number(value) * 60);
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parallelGroupForTask(task) {
  return taskSlotSessions(task).find((session) => session.parallel_group_id && session.parallel_user_confirmed) || null;
}

async function cancelParallelGroup(groupId) {
  const affected = [];
  const guestTasks = [];
  for (const task of tasks) {
    const sessions = taskSlotSessions(task);
    if (!sessions.some((session) => session.parallel_group_id === groupId)) continue;
    const retained = [];
    sessions.forEach((session) => {
      if (session.parallel_group_id !== groupId) {
        retained.push(session);
      } else if (session.parallel_role === "secondary") {
        guestTasks.push(task);
      } else {
        const cleaned = { ...session };
        ["parallel_group_id", "parallel_user_confirmed", "parallel_task_ids", "allowed_overlap_minutes", "parallel_evidence", "parallel_role"].forEach((key) => delete cleaned[key]);
        retained.push(cleaned);
      }
    });
    task.slot = retained.length ? { ...task.slot, sessions: retained, start: retained[0].start, end: retained[0].end, day_index: retained[0].day_index } : null;
    refreshTaskScheduleStatus(task);
    affected.push(task);
    await patchBackendTask(task);
  }
  addChatMessage("ai", "Parallel session cancelled", "The tasks remain independent. The paired session was released and will be scheduled in a normal, non-overlapping window." );
  if (guestTasks.length) await requestTentativeSchedule("Find a non-overlapping window for the released task after cancelling its parallel session.", [...new Map(guestTasks.map((task) => [task.id, task])).values()]);
  render();
}

function renderActiveTask() {
  const task = selectedTask();
  if (!task) {
    resumeSubtitle.textContent = "Select a calendar block";
    modePill.textContent = "Ready";
    activeTask.innerHTML = `
      <h3>Select a calendar block to view details</h3>
      <p>Task details appear only after you select a block. Confirming or regenerating a plan clears the previous selection.</p>
    `;
    return;
  }
  resumeSubtitle.textContent = task.title;
  modePill.textContent = statusLabel(task);
  const pendingSessions = (pendingSchedulePlan?.plan_patch || []).filter((block) => block.task_id === task.id);
  const confirmedSessions = taskSlotSessions(task);
  const sessions = pendingSessions.length ? pendingSessions : confirmedSessions;
  const scheduledMinutes = sessions.reduce((sum, session) => sum + Number(session.session_minutes || Math.round((session.end - session.start) * 60)), 0);
  const workRemainingMinutes = taskWorkRemainingMinutes(task);
  const scheduleState = pendingSessions.length
    ? { scheduledMinutes, remainingMinutes: Math.max(workRemainingMinutes - scheduledMinutes, 0), workRemainingMinutes }
    : refreshTaskScheduleStatus(task);
  const isInterrupted = ["paused", "blocked"].includes(task.status);
  const executionEnded = executionSessionForTask(task)?.status === "ended";
  const parallelSession = sessions.find((session) => session.parallel_group_id && session.parallel_user_confirmed);
  const parallelPartnerId = parallelSession ? valueList(parallelSession.parallel_task_ids).find((id) => String(id) !== String(task.id)) : null;
  const parallelPartner = tasks.find((item) => String(item.id) === String(parallelPartnerId));
  activeTask.innerHTML = `
    <h3>${task.title}</h3>
    <p>${task.context}</p>
    <div class="task-meta" style="margin-top:12px">
      <span class="tag ${priorityClass(task.priority)}">${({高:"High",中:"Medium",低:"Low"}[task.priority] || task.priority)} priority</span>
      <span class="tag">${task.duration} min total</span>
      <span class="tag">${scheduleState.workRemainingMinutes} min remaining</span>
      <span class="tag">${sessions.length} session${sessions.length === 1 ? "" : "s"}</span>
      <span class="tag">${scheduleState.scheduledMinutes} min scheduled</span>
      <span class="tag">${scheduleState.remainingMinutes} min unscheduled</span>
      <span class="tag">${escapeHtml(localizeDisplayTime(task.due))}</span>
      <span class="tag">${pendingSessions.length ? "To review" : statusLabel(task)}</span>
      ${parallelSession ? `<span class="tag parallel-detail-tag">Parallel with “${escapeHtml(parallelPartner?.title || "another task")}” for ${Number(parallelSession.allowed_overlap_minutes || parallelSession.session_minutes || 0)} min</span>` : ""}
    </div>
    <div class="task-actions">
      ${isInterrupted ? `<button class="primary" type="button" data-action="resume-active-task">${task.status === "blocked" ? "Resume now" : "Resume task"}</button>` : task.status !== "completed" && !executionEnded ? '<button class="ghost" type="button" data-action="pause-active-task">Pause</button>' : ''}
      ${task.status !== "completed" ? '<button class="primary" type="button" data-action="complete-active-task">Execution feedback</button>' : ''}
      <button class="ghost" type="button" data-action="edit-active-task">Edit</button>
      ${parallelSession && !pendingSessions.length ? '<button class="ghost" type="button" data-action="cancel-parallel">Cancel parallel session</button>' : ''}
      <button class="danger" type="button" data-action="delete-active-task">Delete task</button>
    </div>
  `;
  activeTask.querySelector('[data-action="edit-active-task"]')?.addEventListener("click", () => {
    openTaskDialog(task);
  });
  activeTask.querySelector('[data-action="pause-active-task"]')?.addEventListener("click", () => {
    preparePauseDialog(task);
  });
  activeTask.querySelector('[data-action="resume-active-task"]')?.addEventListener("click", () => resumeInterruptedTask(task));
  activeTask.querySelector('[data-action="complete-active-task"]')?.addEventListener("click", () => {
    prepareFeedbackDialog(task);
    const group = parallelGroupForTask(task);
    document.getElementById("parallelFeedbackField")?.classList.toggle("hidden", !group);
    if (group) {
      const partnerId = valueList(group.parallel_task_ids).find((id) => String(id) !== String(task.id));
      const partner = tasks.find((item) => String(item.id) === String(partnerId));
      document.getElementById("parallelFeedbackHint").textContent = `This feedback only updates “${task.title}”. Open “${partner?.title || "the other task"}” to record its result separately.`;
    }
    if (!feedbackDialog.open) feedbackDialog.showModal();
  });
  activeTask.querySelector('[data-action="cancel-parallel"]')?.addEventListener("click", () => cancelParallelGroup(parallelSession.parallel_group_id));
  activeTask.querySelector('[data-action="delete-active-task"]')?.addEventListener("click", () => {
    deleteTaskById(task.id);
  });
}

function renderDecisionTrace() {
  const task = selectedTask();
  if (!decisionTrace) return;
  const pendingBlocks = (pendingSchedulePlan?.plan_patch || []).filter((block) => block.task_id === task?.id);
  const provenance = pendingSchedulePlan?.ai_provenance || {};
  const uniqueEvidence = (items) => [...new Map(items.map((item) => {
    const key = typeof item === "string" ? item : JSON.stringify(item);
    return [key, item];
  })).values()];
  const pendingTrace = pendingBlocks.length ? {
    generated_at: pendingSchedulePlan.generated_at || "当前待确认计划",
    provider: provenance.provider || pendingSchedulePlan.llm_provider || "constraint_engine",
    model: provenance.model || null,
    selected_candidate_id: pendingSchedulePlan.selected_candidate_id || "default",
    confidence_level: provenance.confidence_level || pendingSchedulePlan.confidence?.level || "medium",
    prompt_versions: provenance.prompt_versions || {},
    evidence: uniqueEvidence([
      ...valueList(provenance.evidence),
      ...pendingBlocks.flatMap((block) => [...valueList(block.constraint_evidence), ...valueList(block.parallel_evidence)])
    ]),
    dependencies: valueList(pendingSchedulePlan.ai_analysis?.task_dependencies || pendingSchedulePlan.ai_task_analysis?.dependencies),
    validation: pendingSchedulePlan.validation || { valid: true, violations: [] }
  } : null;
  const trace = pendingTrace || task?.contextWindow?.decisionTrace;
  if (!task || !trace) {
    decisionTrace.innerHTML = `<div class="trace-card"><strong>No scheduling decision yet</strong><p>After a plan is generated, this panel shows its model source, evidence, dependencies, and constraint validation.</p></div>`;
    return;
  }
  const evidence = valueList(trace.evidence);
  const dependencies = valueList(trace.dependencies);
  const validation = trace.validation || {};
  const userEvidenceText = (item) => {
    const text = typeof item === "string" ? item : JSON.stringify(item);
    if (text.startsWith("可用窗口：")) return "Placed inside the available windows you provided";
    if (text.startsWith("Deadline：")) return `Finishes before ${localizeDisplayTime(text.replace("Deadline：", ""), true)}`;
    if (text.startsWith("单次专注偏好：")) return "Split according to your preferred focus-session length";
    if (/user expected_difficulty/i.test(text)) return "Uses your confirmed difficulty estimate";
    if (/约束引擎|validation|硬约束/i.test(text)) return "Availability, occupied time, and deadline constraints passed validation";
    return localizeDisplayTime(text.replace(/\b(?:before|after)_task_id=[^,，；]+[,，]?\s*/g, "").replace(/\btask[_ -]?id[:=][^,，；]+[,，]?\s*/gi, ""), true);
  };
  const readableEvidence = [...new Set(evidence.map(userEvidenceText))];
  const readableDependencies = dependencies.map((item) => {
    if (typeof item === "string") return localizeDisplayTime(item, true);
    const before = tasks.find((taskItem) => String(taskItem.id) === String(item.before_task_id))?.title || "Predecessor";
    const after = tasks.find((taskItem) => String(taskItem.id) === String(item.after_task_id))?.title || "Following task";
    return `${before} → ${after}: ${item.hard_enforced ? "hard dependency" : "soft preference"}${item.reason ? ` (${localizeDisplayTime(item.reason, true)})` : ""}`;
  });
  decisionTrace.innerHTML = `
    <div class="trace-card">
      <strong>${validation.valid === false ? "This plan still has conflicts" : "Hard constraints passed"}</strong>
      ${readableEvidence.length ? `<ul>${readableEvidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>No additional scheduling evidence.</p>"}
      ${readableDependencies.length ? `<p><strong>Task order:</strong> ${readableDependencies.map(escapeHtml).join("; ")}</p>` : ""}
    </div>
    `;
}

function renderCheckpoints() {
  const task = selectedTask();
  if (!task) {
    checkpointCount.textContent = "0 entries";
    checkpointView.innerHTML = `
      <div class="checkpoint-item">
        <strong>No interruption history</strong>
        <p>Create a task to save progress, open questions, and the next action before switching.</p>
      </div>
    `;
    return;
  }
  checkpointCount.textContent = `${task.checkpoints.length} ${task.checkpoints.length === 1 ? "entry" : "entries"}`;
  if (!task.checkpoints.length) {
    checkpointView.innerHTML = `
      <div class="checkpoint-item">
        <strong>No interruptions yet</strong>
        <p>Pausing a task saves its progress, open questions, and next action.</p>
      </div>
    `;
    return;
  }

  checkpointView.innerHTML = task.checkpoints.map((item) => `
    <div class="checkpoint-item">
      <strong>${item.label}</strong>
      <p>${item.text}</p>
    </div>
  `).join("");
}

function renderContextWindow() {
  const task = selectedTask();
  if (!task) {
    contextWindow.innerHTML = `
      <div class="context-window-empty">
        <strong>No context window</strong>
        <p>Create a task to see progress, the next action, open questions, and resumption cues.</p>
      </div>
    `;
    return;
  }
  const windowData = normalizeContextWindow(task);
  task.contextWindow = windowData;
  const items = [
    ["Current progress", windowData.progress],
    ["Next action", windowData.nextStep],
    ["Open questions", windowData.openQuestions],
    ["Materials", windowData.materials],
    ["Resume cue", windowData.recoveryCue]
  ];
  contextWindow.innerHTML = items.map(([label, value]) => `
    <article class="context-window-item">
      <span>${escapeHtml(label)}</span>
      <p>${escapeHtml(localizeDisplayTime(value)).replace(/\n/g, "<br>")}</p>
    </article>
  `).join("");
}

function renderBrief() {
  const task = selectedTask();
  if (!task) {
    resumeBrief.innerHTML = `
      <div class="brief-card">
        <h3>No task selected</h3>
        <ul>
          <li>Resume entry: generated after a task is created</li>
          <li>Next action: create a task</li>
          <li>Suggested session: not set</li>
        </ul>
      </div>
    `;
    return;
  }
  const hasCheckpoint = task.checkpoints.length > 0;
  const nextAction = hasCheckpoint
    ? task.checkpoints[task.checkpoints.length - 1].text
    : "Take 10 minutes to record the current task state, then decide whether to continue.";

  resumeBrief.innerHTML = `
    <div class="brief-card">
      <h3>${task.title}</h3>
      <ul>
        <li>Resume entry: ${hasCheckpoint ? "continue from the latest interruption" : "save an interruption record first"}</li>
        <li>Next action: ${nextAction}</li>
        <li>Suggested session: ${Math.min(task.duration, 45)} min</li>
      </ul>
    </div>
  `;
}

function render() {
  ensureActiveTask();
  todayBadge.textContent = `Today · ${todayLabel()}`;
  dayViewBtn.classList.toggle("active", calendarView === "day");
  weekViewBtn.classList.toggle("active", calendarView === "week");
  renderProfileSummary();
  renderPendingSchedule();
  renderNowCard();
  renderChat();
  renderCalendar();
  renderActiveTask();
  renderDecisionTrace();
  renderContextWindow();
  renderCheckpoints();
  renderBrief();
  syncRightRailMode();
  save();
}

function executionElapsedMinutes(session) {
  const accumulated = Number(session?.accumulated_active_minutes || 0);
  if (session?.status !== "running") return accumulated;
  const segmentStart = session?.resumed_at || session?.actual_start_at;
  if (!segmentStart) return accumulated;
  return accumulated + Math.max(0, Math.floor((appNowMs() - new Date(segmentStart).getTime()) / 60000));
}

function executionSessionForTask(task) {
  const session = currentExecutionState?.session;
  return session && String(session.task_id) === String(task?.id) ? session : null;
}

function feedbackRemainingEstimate(task, outcome, trackedMinutes) {
  const currentRemaining = taskWorkRemainingMinutes(task);
  if (outcome === "completed") return 0;
  if (outcome === "no_progress" || outcome === "not_started") return currentRemaining;
  return Math.max(currentRemaining - trackedMinutes, 0);
}

function prepareFeedbackDialog(task, outcome = "partial", session = executionSessionForTask(task), openDialog = true) {
  if (!task) return;
  const trackedMinutes = session ? executionElapsedMinutes(session) : 0;
  const remaining = feedbackRemainingEstimate(task, outcome, trackedMinutes);
  document.getElementById("feedbackCompletion").value = outcome;
  document.getElementById("feedbackTrackedTime").textContent = `HumanOS tracked ${trackedMinutes} active minute${trackedMinutes === 1 ? "" : "s"}.`;
  document.getElementById("feedbackRemainingMinutes").value = remaining;
  document.getElementById("feedbackRemainingSummary").textContent = `${remaining} min`;
  document.getElementById("feedbackRemainingReview").classList.toggle("hidden", outcome === "completed");
  document.getElementById("feedbackContextFields").classList.toggle("hidden", !["partial", "no_progress"].includes(outcome));
  document.getElementById("feedbackProgress").value = "";
  document.getElementById("feedbackNextStep").value = "";
  document.getElementById("feedbackDifficulty").value = task.expected_difficulty || 4;
  feedbackDialog.dataset.executionSessionId = session?.execution_session_id || "";
  feedbackDialog.dataset.trackedActiveMinutes = String(trackedMinutes);
  const group = parallelGroupForTask(task);
  document.getElementById("parallelFeedbackField")?.classList.toggle("hidden", !group);
  if (group) {
    const partnerId = valueList(group.parallel_task_ids).find((id) => String(id) !== String(task.id));
    const partner = tasks.find((item) => String(item.id) === String(partnerId));
    document.getElementById("parallelFeedbackHint").textContent = `This feedback only updates “${task.title}”. Open “${partner?.title || "the other task"}” to record its result separately.`;
  }
  if (openDialog && !feedbackDialog.open) feedbackDialog.showModal();
}

function executionTimeLabel(value) {
  if (!value) return "Time not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function executionSessionOrdinal(session) {
  const blocks = valueList(confirmedSchedulePlan?.plan_patch).filter((block) => String(block.task_id) === String(session?.task_id));
  const ordered = blocks.sort((a, b) => Number(a.day_index) - Number(b.day_index) || Number(a.start) - Number(b.start));
  const index = Math.max(ordered.findIndex((block) => String(block.block_id) === String(session?.block_id)), 0);
  return { index: index + 1, count: Math.max(ordered.length, 1) };
}

function continuationMinutesAvailable(session) {
  if (!session) return 0;
  const now = appNow();
  const todayIndex = (now.getDay() + 6) % 7;
  const start = now.getHours() + now.getMinutes() / 60;
  const containingWindow = parseAvailableWindows(currentProfile)
    .filter((window) => Number(window.day_index) === todayIndex && Number(window.start) <= start && Number(window.end) > start)
    .sort((first, second) => Number(first.end) - Number(second.end))[0];
  if (!containingWindow) return 0;
  let freeUntil = Number(containingWindow.end);
  visibleCalendarBlocks().forEach((block) => {
    if (Number(block.day_index) !== todayIndex) return;
    if (String(block.block_id || "") === String(session.block_id || "")) return;
    if (Number(block.start) >= start - 0.001) freeUntil = Math.min(freeUntil, Number(block.start));
  });
  const rawMinutes = Math.max(0, Math.floor((freeUntil - start) * 60));
  const preferredBreak = Number(currentProfile.preferred_break_minutes || currentProfile.break_minutes || 15);
  return rawMinutes >= 15 + preferredBreak ? 15 : 0;
}

function showProductToast(message) {
  let toast = document.getElementById("productToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "productToast";
    toast.className = "product-toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showProductToast.timer);
  showProductToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function todayExecutionBlocks() {
  const todayIndex = (appNow().getDay() + 6) % 7;
  const nowHour = currentHourFloat();
  return visibleCalendarBlocks()
    .filter((block) => {
      if (Number(block.day_index) !== todayIndex || block.source === "pending") return false;
      const task = tasks.find((item) => String(item.id) === String(block.task_id));
      if (!task || ["completed", "terminated", "running", "paused"].includes(task.status)) return false;
      return Number(block.start) >= nowHour;
    })
    .sort((a, b) => Number(a.start) - Number(b.start));
}

function executionBlockTitle(block) {
  return block.task?.title || block.label || (block.context_type === "buffer" ? "Buffer" : "Protected time");
}

function renderExecutionRailDetails() {
  if (!confirmedSchedulePlan?.plan_patch?.length) return;
  const executionDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(appNow()).replace(",", "");
  if (executionTodayLabel) executionTodayLabel.textContent = `Today · ${executionDate}`;
  if (executionPlanState) executionPlanState.textContent = confirmedSchedulePlan?.update_available ? "Update available" : "Confirmed";
  const blocks = todayExecutionBlocks();
  const currentBlockId = String(currentExecutionState?.session?.block_id || "");
  const currentHour = currentHourFloat();
  const after = blocks.filter((block) => String(block.block_id || "") !== currentBlockId && Number(block.start) >= currentHour).slice(0, 2);
  if (todayAfterList) todayAfterList.innerHTML = after.length ? after.map((block) => `
    <button class="today-after-item" type="button" data-after-task-id="${escapeHtml(block.task_id || "")}">
      <time>${formatHour(block.start)}–${formatHour(block.end)}</time><span>${escapeHtml(executionBlockTitle(block))}</span>
      ${block.constraint_conflict ? '<em>Needs your decision</em>' : ""}
    </button>`).join("") : '<p class="empty-compact">No more scheduled items today.</p>';
  todayAfterList?.querySelectorAll("[data-after-task-id]").forEach((button) => button.addEventListener("click", () => {
    if (!button.dataset.afterTaskId) return;
    selectTask(button.dataset.afterTaskId, "manual");
    render();
  }));
  const workBlocks = blocks.filter((block) => block.task_id && block.kind !== "fixed_event");
  const workMinutes = workBlocks.reduce((total, block) => total + Math.max(0, Math.round((Number(block.end) - Number(block.start)) * 60)), 0);
  const bufferBlocks = blocks.filter((block) => block.context_type === "buffer");
  const bufferMinutes = bufferBlocks.reduce((total, block) => total + Math.max(0, Math.round((Number(block.end) - Number(block.start)) * 60)), 0);
  const conflicts = blocks.filter((block) => block.constraint_conflict).length;
  if (todayPlanSummary) todayPlanSummary.innerHTML = `<strong>${workBlocks.length} work sessions · ${workMinutes} min work</strong><span>${bufferMinutes} min buffer protected</span><span>${conflicts} conflicts</span>`;
  const weeklyBuffers = valueList(buildSchedulingContext(currentProfile).buffer_blocks);
  const weeklyMinutes = weeklyBuffers.reduce((total, block) => total + Math.max(0, Math.round((Number(block.end) - Number(block.start)) * 60)), 0);
  if (weeklyBufferSummary) weeklyBufferSummary.textContent = `${Math.round(weeklyMinutes / 60 * 10) / 10} hours of recovery space protected this week.`;
  if (weeklyBufferDays) weeklyBufferDays.innerHTML = confirmedBufferSummary() || "No additional daily buffer details.";
  const reasons = valueList(confirmedSchedulePlan?.explanation?.reasons || confirmedSchedulePlan?.reasons).slice(0, 3);
  if (executionWhyContent) executionWhyContent.innerHTML = (reasons.length ? reasons : ["Demanding work was placed in a stronger focus window.", "Protected activities were kept clear.", "Buffer was kept instead of filling every opening."]).map((reason) => `<p>${escapeHtml(analysisDisplayText(reason))}</p>`).join("");
  if (executionTechnicalDetails) executionTechnicalDetails.innerHTML = `<p>Plan revision ${Number(confirmedSchedulePlan?.plan_revision || 1)}. Hard constraints were validated before confirmation.</p>`;
}

function renderNowCard() {
  if (!nowCard) return;
  const state = currentExecutionState;
  const session = state?.session;
  const task = state?.task;
  renderExecutionRailDetails();
  if (!confirmedSchedulePlan) return;
  if (!session || !task) {
    const next = todayExecutionBlocks().find((block) => block.task_id && Number(block.end) > currentHourFloat());
    nowCard.innerHTML = next ? `<span class="review-eyebrow">No active session</span><h2>Next: ${escapeHtml(executionBlockTitle(next))}</h2><p>Starts at ${formatHour(next.start)} · ${Math.round((Number(next.end) - Number(next.start)) * 60)} min</p><button class="ghost" type="button" data-view-next="${escapeHtml(next.task_id)}">View task</button>` : `<span class="review-eyebrow">Today is clear</span><h2>No more work sessions are scheduled today.</h2><p>Your remaining time stays unplanned.</p><button class="ghost" type="button" data-view-week>View this week</button>`;
    nowCard.querySelector("[data-view-next]")?.addEventListener("click", (event) => { selectTask(event.currentTarget.dataset.viewNext, "manual"); render(); });
    nowCard.querySelector("[data-view-week]")?.addEventListener("click", () => { calendarView = "week"; render(); });
    return;
  }
  const elapsed = executionElapsedMinutes(session);
  const sessionRemaining = Math.max(Number(session.planned_work_minutes || 0) - elapsed, 0);
  const taskRemaining = taskWorkRemainingMinutes(task);
  const effectiveMode = state.mode === "now" && sessionRemaining <= 0 ? "session_ended" : state.mode;
  const plannedStart = executionTimeLabel(session.planned_start_at);
  const plannedEnd = executionTimeLabel(session.planned_end_at);
  const ordinal = executionSessionOrdinal(session);
  const nextStep = valueList(task.checkpoints).slice().reverse().find((item) => /next/i.test(String(item.label || "")))?.text || normalizeContextWindow(task).nextStep;
  const startsIn = session.planned_start_at ? Math.ceil((new Date(session.planned_start_at).getTime() - appNowMs()) / 60000) : null;
  if (rightRailMode === "task" && ["now", "paused"].includes(effectiveMode)) {
    nowCard.innerHTML = `<div class="compact-running-strip"><strong>${effectiveMode === "paused" ? "PAUSED" : "NOW"} · ${escapeHtml(task.title)}</strong><span>${sessionRemaining} min left</span><button class="text-button" type="button" data-return-now>Return</button></div>`;
  } else if (effectiveMode === "now") {
    const progress = Math.min(100, Math.round(elapsed / Math.max(Number(session.planned_work_minutes || 1), 1) * 100));
    const expectedEnd = new Date(appNowMs() + sessionRemaining * 60000);
    nowCard.innerHTML = `<span class="review-eyebrow">Now</span><h2>${escapeHtml(task.title)}</h2><p>Started at ${executionTimeLabel(session.actual_start_at)} · expected to finish around ${executionTimeLabel(expectedEnd.toISOString())}</p><strong class="session-countdown">${sessionRemaining} min left <small>in this session</small></strong><p class="task-remaining">${taskRemaining} min remaining for the whole task</p><div class="execution-progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress}%"></span></div>${nextStep ? `<div class="next-step-line"><b>Next step</b><span>${escapeHtml(nextStep)}</span></div>` : ""}<div class="button-row"><button class="ghost" type="button" data-execution-action="pause">Pause</button><button class="primary" type="button" data-execution-action="finish">Finish / feedback</button></div>`;
  } else if (effectiveMode === "paused") {
    nowCard.innerHTML = `<span class="review-eyebrow">Paused</span><h2>${escapeHtml(task.title)}</h2><p>${elapsed} min completed · ${sessionRemaining} min left in this session</p><p>${taskRemaining} min remaining for the task</p>${nextStep ? `<div class="next-step-line"><b>Next step</b><span>${escapeHtml(nextStep)}</span></div>` : ""}<div class="button-row"><button class="primary" type="button" data-execution-action="start">Resume</button><button class="ghost" type="button" data-review-adjustment>Review adjustment</button></div>`;
  } else if (effectiveMode === "session_ended") {
    const activeMinutes = executionElapsedMinutes(session);
    const continuationMinutes = activeMinutes > 0 ? continuationMinutesAvailable(session) : 0;
    const outcomeButtons = activeMinutes > 0
      ? '<button type="button" data-feedback-outcome="completed">Finished the whole task</button><button type="button" data-feedback-outcome="partial">Made progress</button><button type="button" data-feedback-outcome="no_progress">Worked, no progress</button>'
      : '<button type="button" data-feedback-outcome="not_started">Did not start</button>';
    const continuationButton = continuationMinutes > 0
      ? `<div class="button-row"><button class="ghost" type="button" data-execution-action="start">Continue for ${continuationMinutes} min</button></div>`
      : activeMinutes === 0
        ? '<div class="button-row"><button class="primary" type="button" data-execution-action="start">Start now</button></div>'
        : "";
    nowCard.innerHTML = `<span class="review-eyebrow">Session ended</span><h2>${escapeHtml(task.title)}</h2><p>${plannedStart}–${plannedEnd} · ${activeMinutes} min tracked automatically</p><strong>How did it go?</strong><div class="feedback-shortcuts">${outcomeButtons}</div>${continuationButton}`;
  } else {
    const ready = effectiveMode === "ready_to_start";
    nowCard.innerHTML = `<span class="review-eyebrow">${ready ? "Ready to start" : "Up next"}</span><h2>${escapeHtml(task.title)}</h2><p>${ready ? `Planned for ${plannedStart}–${plannedEnd}` : `${plannedStart}–${plannedEnd} · ${session.planned_work_minutes} min session`}</p><p>Session ${ordinal.index} of ${ordinal.count}</p>${!ready && startsIn > 0 && startsIn <= 15 ? `<strong>Starts in ${startsIn} min</strong>` : ""}<p>${taskRemaining} min remaining for this task</p><div class="button-row"><button class="primary" type="button" data-execution-action="start">${ready ? "Start session" : "Start now"}</button>${ready ? '<details class="not-now"><summary>Not now</summary><button type="button" data-not-now="later">Start later</button><button type="button" data-not-now="move">Move this session</button><button type="button" data-not-now="cannot">I cannot do this now</button></details>' : '<button class="ghost" type="button" data-review-adjustment>Adjust time</button>'}</div>`;
  }
  nowCard.querySelector('[data-execution-action="start"]')?.addEventListener("click", startCurrentExecution);
  nowCard.querySelector('[data-execution-action="pause"]')?.addEventListener("click", pauseCurrentExecution);
  nowCard.querySelector('[data-execution-action="finish"]')?.addEventListener("click", finishCurrentExecution);
  nowCard.querySelector("[data-return-now]")?.addEventListener("click", () => { rightRailMode = "plan"; render(); });
  nowCard.querySelector("[data-review-adjustment]")?.addEventListener("click", () => openTaskDialog(task));
  nowCard.querySelectorAll("[data-feedback-outcome]").forEach((button) => button.addEventListener("click", () => {
    activeId = task.id;
    activeSelectionMode = "auto";
    const outcome = button.dataset.feedbackOutcome;
    const directSave = outcome === "completed" || outcome === "not_started";
    prepareFeedbackDialog(task, outcome, session, !directSave);
    if (directSave) feedbackForm.requestSubmit();
  }));
  nowCard.querySelectorAll("[data-not-now]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.notNow === "move") openTaskDialog(task);
    else if (button.dataset.notNow === "cannot") { selectTask(task.id, "manual"); preparePauseDialog(task); }
    else showProductToast("The session remains ready. Start it when you are able.");
  }));
  const needsClockTick = effectiveMode === "now" || Number(sharedTestClock?.time_scale || 0) > 0;
  const clockTickMs = Number(sharedTestClock?.time_scale || 0) > 0 ? 1000 : 30000;
  if (needsClockTick && !executionClockTimer) executionClockTimer = window.setInterval(renderNowCard, clockTickMs);
  if (!needsClockTick && executionClockTimer) { clearInterval(executionClockTimer); executionClockTimer = null; }
}

async function startCurrentExecution() {
  const session = currentExecutionState?.session;
  if (!backendOnline || !session || executionActionInFlight) return;
  executionActionInFlight = true;
  try {
    const action = currentExecutionState?.mode === "paused" ? "resume" : "start";
    const response = await api("/api/execution-sessions/start", { method: "POST", body: JSON.stringify({ user_id: currentUserId(), execution_session_id: session.execution_session_id, request_id: `${action}-${session.execution_session_id}-${Date.now()}` }) });
    currentExecutionState = { ...currentExecutionState, mode: "now", session: response.execution_session };
    const task = tasks.find((item) => String(item.id) === String(session.task_id));
    if (task) task.status = "running";
    showProductToast(`${action === "resume" ? "Resumed" : "Started"} · ${response.execution_session.session_remaining_minutes} min remaining.`);
    render();
  } finally { executionActionInFlight = false; }
}

async function pauseCurrentExecution() {
  const session = currentExecutionState?.session;
  const task = tasks.find((item) => String(item.id) === String(session?.task_id));
  if (!session || !task || executionActionInFlight) return;
  executionActionInFlight = true;
  try {
    if (backendOnline) {
      const response = await api("/api/execution-sessions/pause", { method: "POST", body: JSON.stringify({ user_id: currentUserId(), execution_session_id: session.execution_session_id, request_id: `pause-${session.execution_session_id}-${Date.now()}` }) });
      currentExecutionState = { ...currentExecutionState, mode: "paused", session: response.execution_session };
    }
    activeId = task.id;
    activeSelectionMode = "auto";
    preparePauseDialog(task);
    render();
  } finally { executionActionInFlight = false; }
}

async function finishCurrentExecution() {
  const session = currentExecutionState?.session;
  const task = tasks.find((item) => String(item.id) === String(session?.task_id));
  if (!session || !task || executionActionInFlight) return;
  executionActionInFlight = true;
  try {
    if (backendOnline) {
      const response = await api("/api/execution-sessions/end", { method: "POST", body: JSON.stringify({ user_id: currentUserId(), execution_session_id: session.execution_session_id, request_id: `finish-${session.execution_session_id}-${Date.now()}` }) });
      currentExecutionState = { ...currentExecutionState, mode: "session_ended", session: response.execution_session };
    }
    activeId = task.id;
    activeSelectionMode = "auto";
    rightRailMode = "plan";
    render();
  } finally { executionActionInFlight = false; }
}

function recalculatePendingTaskSessions(taskId) {
  const task = tasks.find((item) => String(item.id) === String(taskId));
  const blocks = (pendingSchedulePlan?.plan_patch || [])
    .filter((block) => String(block.task_id) === String(taskId))
    .sort((a, b) => Number(a.day_index) - Number(b.day_index) || Number(a.start) - Number(b.start));
  let scheduledWork = 0;
  const total = taskWorkRemainingMinutes(task);
  blocks.forEach((block, index) => {
    const minutes = Math.round((Number(block.end) - Number(block.start)) * 60);
    const plannedWorkMinutes = Math.min(minutes, Math.max(total - scheduledWork, 0));
    scheduledWork += plannedWorkMinutes;
    block.session_index = index + 1;
    block.session_count = blocks.length;
    block.session_minutes = minutes;
    block.planned_work_minutes = plannedWorkMinutes;
    block.padding_minutes = minutes - plannedWorkMinutes;
    block.remaining_after_block_minutes = Math.max(total - scheduledWork, 0);
  });
}

function recalculateAllPendingTaskSessions() {
  const taskIds = [...new Set(valueList(pendingSchedulePlan?.plan_patch).map((block) => block?.task_id).filter(Boolean))];
  taskIds.forEach(recalculatePendingTaskSessions);
}

function syncSelectedCandidateParallelState() {
  const candidate = pendingSchedulePlan?.candidate_plans?.find((item) => item.id === pendingSchedulePlan.selected_candidate_id);
  if (!candidate) return;
  candidate.plan_patch = pendingSchedulePlan.plan_patch;
  candidate.parallel_suggestions = pendingSchedulePlan.parallel_suggestions;
}

async function acceptParallelSuggestion(suggestionId) {
  const suggestion = valueList(pendingSchedulePlan?.parallel_suggestions).find((item) => item.id === suggestionId);
  if (!suggestion || suggestion.status !== "pending") return;
  const previousPlan = JSON.parse(JSON.stringify(pendingSchedulePlan));
  suggestion.status = "replanning";
  setBackendStatus("Updating plan…", backendOnline);
  render();
  if (suggestion.kind === "context_activity_pair") {
    const contextIds = [suggestion.primary_context_id, suggestion.secondary_context_id];
    const acceptedPair = {
      id: suggestion.id,
      context_ids: contextIds,
      primary_context_id: suggestion.primary_context_id,
      secondary_context_id: suggestion.secondary_context_id,
      primary_title: suggestion.primary_title,
      secondary_title: suggestion.secondary_title,
      day_index: Number(suggestion.day_index),
      start: Number(suggestion.start),
      end: Number(suggestion.end),
      suggested_overlap_minutes: Number(suggestion.suggested_overlap_minutes || 0),
      parallel_group_id: suggestion.parallel_group_id,
      evidence: valueList(suggestion.evidence),
      user_confirmed: true
    };
    try {
      const replanned = await requestTentativeSchedule("Rebuild the complete plan after the user accepted a low-conflict parallel activity pair.", null, {
        accepted_parallel_context_pairs: [acceptedPair]
      });
      if (!replanned?.plan_patch?.length) throw new Error("The replanned schedule did not contain any validated work sessions.");
      replanned.context_parallel_adjustments = contextIds.map((contextId) => ({
      context_id: contextId,
      day_index: acceptedPair.day_index,
      start: acceptedPair.start,
      end: acceptedPair.end,
      parallel_group_id: acceptedPair.parallel_group_id,
      parallel_context_ids: contextIds,
      allowed_overlap_minutes: acceptedPair.suggested_overlap_minutes,
      user_confirmed: true,
      evidence: acceptedPair.evidence
    }));
      setBackendStatus("Plan updated", backendOnline);
      pendingReviewKey = currentPendingReviewKey();
      render();
    } catch (error) {
      pendingSchedulePlan = previousPlan;
      pendingSchedulePlan.confirmation_error = { title: "Parallel plan could not be validated", detail: error.message || "Keep the activities separate or try another time." };
      setBackendStatus("Parallel option kept separate", backendOnline);
      render();
    }
    return;
  }
  const acceptedPair = {
    ...suggestion,
    user_confirmed: true,
    status: "accepted"
  };
  try {
    const replanned = await requestTentativeSchedule("Rebuild the complete plan after the user accepted a low-conflict parallel task pair.", null, {
      accepted_parallel_pairs: [acceptedPair]
    });
    const groupBlocks = valueList(replanned?.plan_patch).filter((block) => block.parallel_group_id === suggestion.parallel_group_id);
    if (new Set(groupBlocks.map((block) => String(block.task_id))).size !== 2) {
      throw new Error("HumanOS could not create a valid two-activity combination.");
    }
    setBackendStatus("Plan updated", backendOnline);
    pendingReviewKey = currentPendingReviewKey();
    render();
  } catch (error) {
    pendingSchedulePlan = previousPlan;
    pendingSchedulePlan.confirmation_error = { title: "Parallel plan could not be validated", detail: error.message || "Keep the tasks separate or try another time." };
    setBackendStatus("Parallel option kept separate", backendOnline);
    render();
  }
}

async function rejectParallelSuggestion(suggestionId) {
  const suggestion = valueList(pendingSchedulePlan?.parallel_suggestions).find((item) => item.id === suggestionId);
  if (!suggestion || suggestion.status !== "pending") return;
  const hasActiveParallelBlocks = valueList(pendingSchedulePlan?.plan_patch).some((block) => block.parallel_group_id && block.parallel_group_id === suggestion.parallel_group_id);
  if (hasActiveParallelBlocks) {
    const previousPlan = JSON.parse(JSON.stringify(pendingSchedulePlan));
    suggestion.status = "replanning";
    setBackendStatus("Updating plan…", backendOnline);
    render();
    try {
      const replanned = await requestTentativeSchedule("Rebuild the complete plan with this optional pair kept separate.", null, {
        rejected_parallel_pair_ids: [suggestion.id],
        rejected_parallel_group_ids: [suggestion.parallel_group_id].filter(Boolean)
      });
      valueList(replanned?.parallel_suggestions).forEach((item) => {
        if (item.id === suggestion.id || item.parallel_group_id === suggestion.parallel_group_id) item.status = "rejected";
      });
      setBackendStatus("Plan updated", backendOnline);
      render();
      return;
    } catch (error) {
      pendingSchedulePlan = previousPlan;
      pendingSchedulePlan.confirmation_error = { title: "The plan could not be updated", detail: error.message || "Try again or keep the current parallel arrangement." };
      setBackendStatus("Plan update failed", backendOnline);
      render();
      return;
    }
  }
  suggestion.status = "rejected";
  syncSelectedCandidateParallelState();
  render();
}

function changeParallelSuggestion(suggestionId) {
  const suggestion = valueList(pendingSchedulePlan?.parallel_suggestions).find((item) => item.id === suggestionId);
  if (!suggestion || !["accepted", "rejected"].includes(suggestion.status)) return;
  suggestion.change_from_status = suggestion.status;
  suggestion.status = "pending";
  render();
}

function currentPendingReviewKey() {
  if (!pendingSchedulePlan) return "";
  return `${pendingSchedulePlan.generated_at || "plan"}:${pendingSchedulePlan.selected_candidate_id || "default"}`;
}

function confirmedBufferSummary() {
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const totals = new Map();
  valueList(buildSchedulingContext(currentProfile).buffer_blocks).forEach((block) => {
    const minutes = Math.max(0, Math.round((Number(block.end) - Number(block.start)) * 60));
    totals.set(Number(block.day_index), (totals.get(Number(block.day_index)) || 0) + minutes);
  });
  return [...totals.entries()].filter(([, minutes]) => minutes > 0).map(([day, minutes]) => `${labels[day]} retained ${minutes} min`).join("; ");
}

function renderConfirmedSchedule() {
  const summary = confirmedSchedulePlan;
  if (!summary?.plan_patch?.length) return false;
  const grouped = new Map();
  summary.plan_patch.forEach((block) => {
    if (!block.task_id) return;
    const list = grouped.get(String(block.task_id)) || [];
    list.push(block);
    grouped.set(String(block.task_id), list);
  });
  const taskCards = [...grouped.entries()].map(([taskId, blocks]) => {
    const task = tasks.find((item) => String(item.id) === taskId);
    const sessions = [...blocks].sort((a, b) => Number(a.day_index) - Number(b.day_index) || Number(a.start) - Number(b.start)).map((block) => {
      const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][Number(block.day_index)] || "TBD";
      return `<li>${day} ${formatHour(block.start)}–${formatHour(block.end)} <span>${Math.round((Number(block.end) - Number(block.start)) * 60)} min</span></li>`;
    }).join("");
    return `<article class="pending-task-card complete is-reviewed confirmed-task-card">
      <div class="pending-task-head"><strong>${escapeHtml(task?.title || "Task")}</strong><span>Confirmed</span></div>
      <ul class="pending-session-list">${sessions}</ul>
    </article>`;
  }).join("");
  const assumptions = valueList(summary.assumptions).filter(Boolean);
  const unresolved = valueList(summary.unresolved_issues).filter(Boolean);
  const bufferText = summary.buffer_summary || confirmedBufferSummary();
  pendingSchedule.classList.remove("hidden");
  planReviewActions?.classList.add("hidden");
  planReviewEmpty?.classList.add("hidden");
  planConfidenceInput.closest("label")?.classList.add("hidden");
  if (planReviewTitle) planReviewTitle.textContent = "Confirmed plan";
  if (planReviewDescription) planReviewDescription.textContent = "This is the read-only record of what you approved. Calendar blocks remain editable.";
  if (planReviewCount) {
    planReviewCount.textContent = `Plan confirmed · ${grouped.size} tasks scheduled`;
    planReviewCount.classList.add("complete");
  }
  pendingScheduleText.innerHTML = `
    <section class="recommended-plan-card confirmed-plan-card"><span>Plan confirmed</span><strong>${grouped.size} tasks scheduled</strong><p>Confirmed ${escapeHtml(summary.confirmed_at_label || "this week")}.</p></section>
    ${bufferText ? `<div class="plan-info"><strong>Protected recovery space</strong><span>${escapeHtml(bufferText)}</span><small>Striped blocks are intentional buffer. White space is simply unscheduled; grey time is unavailable.</small></div>` : ""}
    ${assumptions.length ? `<div class="plan-warning"><strong>Assumptions used</strong>${assumptions.map((item) => `<span>${escapeHtml(analysisDisplayText(item))}</span>`).join("")}</div>` : ""}
    ${unresolved.length ? `<div class="repair-options"><strong>Unresolved items</strong>${unresolved.map((item) => `<span>${escapeHtml(analysisDisplayText(item))}</span>`).join("")}</div>` : ""}
  `;
  rejectScheduleBtn.dataset.mode = "confirmed";
  confirmScheduleBtn.dataset.mode = "confirmed";
  if (!lastDecision) lastDecision = summary.decision || summary;
  return true;
}

function renderPendingSchedule() {
  confirmedSchedulePlan = confirmedSchedulePlan || currentProfile.weekly_context?.confirmed_plan_summary || null;
  if (!pendingSchedulePlan?.plan_patch?.length) {
    if (renderConfirmedSchedule()) return;
    pendingSchedule.classList.add("hidden");
    pendingScheduleText.textContent = "";
    planReviewEmpty?.classList.remove("hidden");
    if (planReviewCount) {
      planReviewCount.textContent = "No plan yet";
      planReviewCount.classList.remove("complete");
    }
    if (planReviewTitle) planReviewTitle.textContent = "Review the AI plan";
    if (planReviewDescription) planReviewDescription.textContent = "Review the draft as a whole. Dashed blocks are editable and not yet in your calendar.";
    pendingReviewKey = "";
    planReviewActions?.classList.add("hidden");
    return;
  }
  planReviewActions?.classList.remove("hidden");
  planConfidenceInput.closest("label")?.classList.remove("hidden");
  rejectScheduleBtn.dataset.mode = "pending";
  rejectScheduleBtn.textContent = "Cancel plan";
  confirmScheduleBtn.dataset.mode = "pending";
  const grouped = new Map();
  const changedBlockIds = new Set(valueList(pendingSchedulePlan.local_adjustment?.changed_block_ids).map(String));
  const blocksForReview = changedBlockIds.size
    ? pendingSchedulePlan.plan_patch.filter((block) => changedBlockIds.has(String(block.block_id)))
    : pendingSchedulePlan.plan_patch;
  blocksForReview.forEach((block) => {
    if (!block.task_id) return;
    const current = grouped.get(block.task_id) || [];
    current.push(block);
    grouped.set(block.task_id, current);
  });
  const reviewKey = currentPendingReviewKey();
  if (pendingReviewKey !== reviewKey) pendingReviewKey = reviewKey;
  const reviewTaskIds = [...grouped.keys()].map(String);
  const hasDraftTasks = reviewTaskIds.length > 0;
  const taskCards = [...grouped.entries()].map(([taskId, blocks]) => {
    const task = tasks.find((item) => String(item.id) === String(taskId));
    const unscheduled = (pendingSchedulePlan.unscheduled_tasks || []).find((item) => String(item.task_id) === String(taskId));
    const workRemainingMinutes = taskWorkRemainingMinutes(task);
    let workBudget = workRemainingMinutes;
    let scheduledCapacityMinutes = 0;
    const normalizedBlocks = [...blocks].sort((a, b) => a.day_index - b.day_index || a.start - b.start).map((block) => {
      const capacityMinutes = Number(block.session_minutes || Math.round((block.end - block.start) * 60));
      const plannedWorkMinutes = Number.isFinite(Number(block.planned_work_minutes))
        ? Math.min(Number(block.planned_work_minutes), Math.max(workBudget, 0))
        : Math.min(capacityMinutes, Math.max(workBudget, 0));
      workBudget -= plannedWorkMinutes;
      scheduledCapacityMinutes += capacityMinutes;
      return { ...block, capacityMinutes, plannedWorkMinutes, paddingMinutes: capacityMinutes - plannedWorkMinutes };
    });
    const scheduledMinutes = normalizedBlocks.reduce((sum, block) => sum + block.plannedWorkMinutes, 0);
    const remainingMinutes = unscheduled?.remaining_minutes ?? Math.max(workRemainingMinutes - scheduledMinutes, 0);
    const sessions = normalizedBlocks.map((block) => {
      const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][block.day_index] || "TBD";
      const paddingNote = block.paddingMinutes > 0 ? ` + ${block.paddingMinutes} min transition margin` : "";
      return `<li>${day} ${formatHour(block.start)}–${formatHour(block.end)} <span>${block.plannedWorkMinutes} min work${paddingNote}</span></li>`;
    }).join("");
    const assumption = task?.deadline_assumption || task?.contextWindow?.deadlineAssumption;
    return `<article class="pending-task-card ${remainingMinutes > 0 ? "partial" : "complete"}">
      <div class="pending-task-head"><strong>${escapeHtml(task?.title || "Task")}</strong><span>${remainingMinutes > 0 ? "Partially scheduled" : "Fully scheduled"}</span></div>
      <ul class="pending-session-list">${sessions}</ul>
      ${remainingMinutes > 0 ? `<p class="task-risk-note">${remainingMinutes} min still needs a time before the deadline.</p>` : ""}
      ${assumption ? `<details class="task-assumption"><summary>Scheduling assumption</summary><p>${escapeHtml(localizeDisplayTime(assumption, true))}</p></details>` : ""}
    </article>`;
  }).join("");
  pendingSchedule.classList.remove("hidden");
  planReviewEmpty?.classList.add("hidden");
  const validationViolations = valueList(pendingSchedulePlan.validation?.violations);
  const describePlanViolation = (violation) => {
    const type = String(violation?.type || "hard_constraint_conflict");
    const blocks = valueList(pendingSchedulePlan.plan_patch);
    const taskTitle = (taskId) => tasks.find((task) => String(task.id) === String(taskId))?.title || "a task";
    if (type === "overlap") {
      const involved = valueList(violation.block_ids)
        .map((blockId) => blocks.find((block) => String(block.block_id) === String(blockId)))
        .filter(Boolean);
      if (involved.length >= 2) {
        const first = involved[0];
        const second = involved[1];
        const overlapStart = Math.max(Number(first.start), Number(second.start));
        const overlapEnd = Math.min(Number(first.end), Number(second.end));
        const day = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][Number(first.day_index)] || "the same day";
        return `${taskTitle(first.task_id)} overlaps ${taskTitle(second.task_id)} on ${day}, ${formatHour(overlapStart)}–${formatHour(overlapEnd)}.`;
      }
    }
    if (type === "hard_constraint_conflict") {
      return `${taskTitle(violation.task_id)} conflicts with ${analysisDisplayText(violation.constraint || "protected time")}.`;
    }
    if (type === "deadline") {
      const task = tasks.find((candidate) => String(candidate.id) === String(violation.task_id));
      return `${taskTitle(violation.task_id)} extends beyond ${localizeDisplayTime(task?.due || "its deadline", true)}.`;
    }
    if (type === "outside_available_window") {
      return `${taskTitle(violation.task_id)} falls outside the time HumanOS may use for work.`;
    }
    return analysisDisplayText(violation.message || violation.detail || violation.constraint || "This draft still contains a hard scheduling conflict.");
  };
  const unscheduledDecisions = valueList(pendingSchedulePlan.unscheduled_tasks)
    .filter((item) => Number(item.remaining_minutes || 0) > 0)
    .map((item) => {
      const task = tasks.find((candidate) => String(candidate.id) === String(item.task_id));
      const minutes = Number(item.remaining_minutes || 0);
      return {
        type: "unscheduled_before_deadline",
        task_id: item.task_id,
        message: `${minutes} minutes of “${task?.title || "this task"}” cannot fit before ${localizeDisplayTime(task?.due || "its deadline", true)}.`
      };
    });
  const ambiguityDecisions = valueList(pendingSchedulePlan.needs_clarification || pendingSchedulePlan.critical_ambiguities)
    .filter((item) => item?.required !== false)
    .map((item) => ({ type: "critical_ambiguity", message: analysisDisplayText(item?.question || item?.detail || item) }));
  const rawMandatoryDecisions = [
    ...unscheduledDecisions,
    ...validationViolations.map((item) => ({
      ...item,
      type: item.type || "hard_constraint_conflict",
      task_id: item.task_id,
      message: describePlanViolation(item)
    })),
    ...ambiguityDecisions
  ];
  const mandatoryDecisions = [...rawMandatoryDecisions.reduce((groupedDecisions, decision) => {
    const key = decision.task_id ? `task:${decision.task_id}` : `${decision.type}:${decision.message}`;
    const existing = groupedDecisions.get(key);
    if (!existing) {
      groupedDecisions.set(key, decision);
      return groupedDecisions;
    }
    groupedDecisions.set(key, {
      ...existing,
      ...decision,
      message: [...new Set([existing.message, decision.message].filter(Boolean))].join(" "),
      solutions: [...valueList(existing.solutions), ...valueList(decision.solutions)],
      block_ids: [...new Set([...valueList(existing.block_ids), ...valueList(decision.block_ids)])],
    });
    return groupedDecisions;
  }, new Map()).values()];
  const allParallelSuggestions = valueList(pendingSchedulePlan.parallel_suggestions).filter((item) => item.status !== "unavailable");
  const optionalSuggestions = allParallelSuggestions.filter((item) => item.status === "pending");
  const decisionCount = mandatoryDecisions.length;
  if (planReviewTitle) planReviewTitle.textContent = decisionCount
    ? `HumanOS needs ${decisionCount === 1 ? "one decision" : `${decisionCount} decisions`}`
    : "Your plan is ready";
  if (planReviewDescription) planReviewDescription.textContent = decisionCount
    ? mandatoryDecisions[0].message
    : "Review the calendar, make any local adjustments, then add the plan.";
  if (planReviewCount) {
    const suggestionLabel = allParallelSuggestions.length ? ` · ${allParallelSuggestions.length} parallel suggestion${allParallelSuggestions.length === 1 ? "" : "s"}` : "";
    planReviewCount.textContent = decisionCount
      ? `${decisionCount} decision${decisionCount === 1 ? "" : "s"} required`
      : `${reviewTaskIds.length} tasks${suggestionLabel}`;
    planReviewCount.classList.toggle("complete", hasDraftTasks && decisionCount === 0);
  }
  const hasPartial = (pendingSchedulePlan.unscheduled_tasks || []).some((item) => Number(item.remaining_minutes) > 0);
  confirmScheduleBtn.disabled = !hasDraftTasks || mandatoryDecisions.length > 0;
  confirmScheduleBtn.textContent = pendingSchedulePlan.local_adjustment?.scope === "today_after_pause"
    ? "Update today"
    : "Add plan to calendar";
  planConfidenceInput.closest("label")?.classList.toggle("hidden", mandatoryDecisions.length > 0);
  conflictLegend?.classList.toggle("hidden", mandatoryDecisions.length === 0);
  parallelLegend?.classList.toggle("hidden", !valueList(pendingSchedulePlan.plan_patch).some((block) => block.parallel_group_id && block.parallel_user_confirmed));
  const uncertainItems = pendingSchedulePlan.constraint_summary?.uncertain_constraints || [];
  const translatedUncertainItems = [...new Set(
    valueList(uncertainItems)
      .map(analysisDisplayText)
      .filter((item) => item && !item.startsWith("HumanOS used an internal scheduling note"))
  )];
  const aiAnalysis = pendingSchedulePlan.llm_provider === "deepseek" && pendingSchedulePlan.ai_analysis
    ? [
        ...valueList(pendingSchedulePlan.ai_analysis.constraint_interpretation),
        ...valueList(pendingSchedulePlan.ai_analysis.task_demand_review),
        ...valueList(pendingSchedulePlan.ai_analysis.task_dependencies),
        ...valueList(pendingSchedulePlan.ai_analysis.candidate_comparison_evidence),
        ...valueList(pendingSchedulePlan.ai_analysis.warnings)
      ].filter(Boolean).map(analysisDisplayText)
    : [];
  const provenance = pendingSchedulePlan.ai_provenance || {};
  const repairs = (pendingSchedulePlan.repair_suggestions || []).flatMap((repair) => repair.options || []).filter(Boolean);
  const candidates = pendingSchedulePlan.candidate_plans || [];
  const parallelSuggestions = valueList(pendingSchedulePlan.parallel_suggestions);
  const pendingParallelCards = parallelSuggestions.filter((suggestion) => ["pending", "replanning"].includes(suggestion.status)).map((suggestion) => {
    const primary = tasks.find((item) => String(item.id) === String(suggestion.primary_task_id));
    const secondary = tasks.find((item) => String(item.id) === String(suggestion.secondary_task_id));
    const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][Number(suggestion.day_index)] || "TBD";
    const statusLabels = { accepted: "Combined", rejected: "Kept separate", unavailable: "Unavailable" };
    return `<article class="parallel-suggestion-card ${escapeHtml(suggestion.status || "pending")}">
      <div><strong>Optional suggestion</strong><span>${escapeHtml(statusLabels[suggestion.status] || "Safe default: keep separate")}</span></div>
      <p>${escapeHtml(suggestion.primary_title || primary?.title || "Task 1")} + ${escapeHtml(suggestion.secondary_title || secondary?.title || "Task 2")}</p>
      <p>${day} ${formatHour(suggestion.start)}–${formatHour(suggestion.end)} · ${Number(suggestion.suggested_overlap_minutes || 0)} min shared</p>
      <small>${valueList(suggestion.evidence).filter(Boolean).map(analysisDisplayText).map(escapeHtml).join("; ")}</small>
      ${suggestion.status === "pending" ? `<div class="parallel-suggestion-actions"><button class="primary" type="button" data-accept-parallel="${escapeHtml(suggestion.id)}">Combine</button><button class="ghost" type="button" data-reject-parallel="${escapeHtml(suggestion.id)}">Keep separate</button></div>` : ""}
    </article>`;
  }).join("");
  const resolvedParallelRows = parallelSuggestions.filter((suggestion) => ["accepted", "rejected"].includes(suggestion.status)).map((suggestion) => {
    const primary = tasks.find((item) => String(item.id) === String(suggestion.primary_task_id));
    const secondary = tasks.find((item) => String(item.id) === String(suggestion.secondary_task_id));
    const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][Number(suggestion.day_index)] || "TBD";
    const accepted = suggestion.status === "accepted";
    return `<div class="parallel-resolution-row ${escapeHtml(suggestion.status)}"><span>${accepted ? "✓ Parallel:" : "Kept separate:"} <strong>${escapeHtml(suggestion.primary_title || primary?.title || "Task 1")} + ${escapeHtml(suggestion.secondary_title || secondary?.title || "Task 2")}</strong>${accepted ? `, ${day} ${formatHour(suggestion.start)}–${formatHour(suggestion.end)}` : ""}</span><button class="text-action" type="button" data-change-parallel="${escapeHtml(suggestion.id)}">Change</button></div>`;
  }).join("");
  const defaultDecisionSolutions = (decision) => {
    if (decision.type === "critical_ambiguity") return [
      { action: "ask", label: "Clarify with HumanOS" },
      { action: "edit_task", label: "Edit task" },
    ];
    return [
      { action: "move_deadline", label: "Move deadline" },
      { action: "add_available_time", label: "Add available time" },
      { action: "split_sessions", label: "Split into shorter sessions" },
      ...(decision.conflicting_item_id ? [{ action: "keep_routine_flexible", label: `Change ${decision.conflicting_label || "protected time"}` }] : []),
    ];
  };
  const mandatoryDecisionCards = mandatoryDecisions.map((decision) => `
    <article class="plan-decision-card" tabindex="0" data-violation-id="${escapeHtml(decision.violation_id || "")}" data-conflict-task-id="${escapeHtml(decision.task_id || "")}" data-conflicting-task-id="${escapeHtml(decision.conflicting_task_id || "")}" data-conflicting-item-id="${escapeHtml(decision.conflicting_item_id || "")}" data-conflict-block-ids="${escapeHtml(valueList(decision.block_ids).join(","))}" data-conflict-day="${escapeHtml(decision.day_index ?? "")}" data-conflict-start="${escapeHtml(decision.start ?? "")}" data-conflict-end="${escapeHtml(decision.end ?? "")}">
      <div><i aria-hidden="true"></i><strong>Needs your decision</strong></div>
      <p>${escapeHtml(decision.message)}</p>
      <div class="decision-actions">
        ${(valueList(decision.solutions).length ? valueList(decision.solutions) : defaultDecisionSolutions(decision)).slice(0, 4).map((solution) => `<button class="ghost" type="button" data-plan-decision="${escapeHtml(solution.action || "ask")}" data-task-id="${escapeHtml(decision.task_id || "")}" data-context-id="${escapeHtml(decision.conflicting_item_id || "")}">${escapeHtml(solution.label || "Resolve")}</button>`).join("")}
      </div>
    </article>`).join("");
  pendingScheduleText.innerHTML = `
    ${mandatoryDecisionCards}
    ${pendingParallelCards ? `<section class="parallel-suggestions"><h4>Optional parallel suggestion</h4><p>Unanswered suggestions safely remain separate.</p>${pendingParallelCards}</section>` : ""}
    ${resolvedParallelRows ? `<section class="parallel-resolutions">${resolvedParallelRows}</section>` : ""}
    ${hasPartial && repairs.length ? `<div class="repair-options"><strong>Ways to make the remaining work fit</strong>${[...new Set(repairs.map(analysisDisplayText))].slice(0, 3).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
    `;
  pendingScheduleText.querySelectorAll("[data-accept-parallel]").forEach((button) => button.addEventListener("click", async () => acceptParallelSuggestion(button.dataset.acceptParallel)));
  pendingScheduleText.querySelectorAll("[data-reject-parallel]").forEach((button) => button.addEventListener("click", () => rejectParallelSuggestion(button.dataset.rejectParallel)));
  pendingScheduleText.querySelectorAll("[data-change-parallel]").forEach((button) => button.addEventListener("click", () => changeParallelSuggestion(button.dataset.changeParallel)));
  pendingScheduleText.querySelectorAll("[data-plan-decision]").forEach((button) => button.addEventListener("click", () => handlePlanDecisionAction(button)));
  pendingScheduleText.querySelectorAll(".plan-decision-card[data-violation-id]").forEach((card) => {
    const reveal = (event) => {
      if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
      if (event.target.closest("button")) return;
      calendar.querySelectorAll(".conflict-focus").forEach((element) => element.classList.remove("conflict-focus"));
      calendar.querySelectorAll(".conflict-overlap-overlay").forEach((element) => element.remove());
      const taskIds = [card.dataset.conflictTaskId, card.dataset.conflictingTaskId].filter(Boolean);
      const contextIds = [card.dataset.conflictingItemId].filter(Boolean);
      const blockIds = String(card.dataset.conflictBlockIds || "").split(",").filter(Boolean);
      const matches = [...calendar.querySelectorAll(".timeline-event")].filter((element) => taskIds.includes(element.dataset.taskId) || contextIds.includes(element.dataset.contextId) || blockIds.includes(element.dataset.blockId));
      matches.forEach((element) => element.classList.add("conflict-focus"));
      const day = Number(card.dataset.conflictDay);
      const start = Number(card.dataset.conflictStart);
      const end = Number(card.dataset.conflictEnd);
      const column = calendar.querySelector(`.timeline-day[data-day-index="${day}"]`);
      if (column && Number.isFinite(start) && Number.isFinite(end) && end > start) {
        const bounds = calendarBounds();
        const overlay = document.createElement("div");
        overlay.className = "conflict-overlap-overlay";
        overlay.style.top = `${(start - bounds.start) * HOUR_ROW_HEIGHT}px`;
        overlay.style.height = `${Math.max((end - start) * HOUR_ROW_HEIGHT, 6)}px`;
        overlay.title = `Conflict ${formatHour(start)}–${formatHour(end)}`;
        column.appendChild(overlay);
      }
      matches[0]?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    };
    card.addEventListener("click", reveal);
    card.addEventListener("keydown", reveal);
  });
}

function selectPendingCandidate(candidateId) {
  const candidate = pendingSchedulePlan?.candidate_plans?.find((item) => item.id === candidateId);
  if (!candidate) return;
  pendingSchedulePlan = {
    ...pendingSchedulePlan,
    selected_candidate_id: candidate.id,
    plan_patch: candidate.plan_patch || [],
    routine_adjustments: candidate.routine_adjustments || [],
    parallel_suggestions: candidate.parallel_suggestions || [],
    unscheduled_tasks: candidate.unscheduled_tasks || [],
    validation: candidate.validation || {}
  };
  pendingReviewKey = currentPendingReviewKey();
  recalculateAllPendingTaskSessions();
  lastDecision = pendingSchedulePlan;
  addChatMessage("ai", "Alternative plan selected", `You selected “${localizeDisplayTime(candidate.label || candidate.id, true)}”. Dragging and resizing remain available before confirmation; hard constraints will be revalidated.`);
  render();
}

function createCheckpointFromFeedback(text) {
  const clean = text.trim() || "The user paused the task without additional detail.";
  return [
    { label: "Pause reason", text: clean.includes("切换") || clean.includes("开会") ? "The user needs to switch tasks, so the current task is paused." : "The user reported that the current plan needs adjustment." },
    { label: "Current progress", text: clean },
    { label: "Next action", text: clean.includes("下一步") ? clean.slice(clean.indexOf("下一步")).replace(/^下一步[：: ]*/, "") : "Review the current materials, then choose one action that can be completed within 30 minutes." }
  ];
}

function handlePlanDecisionAction(button) {
  const action = button?.dataset?.planDecision;
  const solutionActionLabels = { move_deadline: "Move deadline", reduce_scope: "Reduce scope", add_available_time: "Add available time" };
  void solutionActionLabels;
  const task = tasks.find((item) => String(item.id) === String(button?.dataset?.taskId));
  if (["availability", "add_available_time"].includes(action)) {
    showProfileSetup();
    setWizardStep("context");
    return;
  }
  if (["deadline", "scope", "move_task", "move_conflicting_item", "move_deadline", "reduce_scope", "edit_task", "split_sessions"].includes(action) && task) {
    selectTask(task.id, "manual");
    openTaskDialog(task);
    return;
  }
  if (action === "keep_routine_flexible" && button?.dataset?.contextId) {
    openContextEventDialog(button.dataset.contextId);
    return;
  }
  if (["ask", "ask_humanos"].includes(action) && chatDrawer) {
    previousRightRailMode = "plan";
    rightRailMode = "agent";
    chatDrawer.open = true;
    syncRightRailMode();
    chatInput?.focus();
  }
}

function cleanUserVisibleTaskContext(value) {
  return String(value || "")
    .replace(/[；;]\s*(?:时间补充|Time update)\s*[：:].*$/giu, "")
    .trim();
}

function openTaskDialog(task = null) {
  editingTaskId = task?.id || null;
  taskDialogTitle.textContent = task ? "Edit task" : "New task";
  saveTaskBtn.textContent = task ? "Save changes" : "Save";
  deleteTaskBtn.classList.toggle("hidden", !task);
  document.getElementById("newTitle").value = task?.title || "";
  document.getElementById("newDue").value = task?.due || "";
  document.getElementById("newDuration").value = task?.duration || "";
  document.getElementById("newPriority").value = task?.priority || "中";
  document.getElementById("newStatus").value = task?.status || "queued";
  document.getElementById("newContext").value = cleanUserVisibleTaskContext(task?.context || "");
  const windowData = normalizeContextWindow(task || {});
  document.getElementById("newProgress").value = task ? windowData.progress : "";
  document.getElementById("newNextStep").value = task ? windowData.nextStep : "";
  document.getElementById("newOpenQuestions").value = task ? windowData.openQuestions : "";
  document.getElementById("newExpectedDifficulty").value = task?.expected_difficulty ?? "";
  document.getElementById("newParallelizable").checked = Boolean(task?.parallelizable);
  document.getElementById("parallelPermissionField")?.classList.toggle("hidden", !task);
  document.querySelectorAll('input[name="taskModality"]').forEach((input) => {
    input.checked = (task?.resource_modality || []).includes(input.value);
  });
  if (!dialog.open) dialog.showModal();
  document.getElementById("newTitle").focus();
}

function taskPayloadFromDialog(id, previous = {}) {
  const initialContext = document.getElementById("newContext").value.trim() || "No additional context.";
  const progress = document.getElementById("newProgress").value.trim();
  const nextStep = document.getElementById("newNextStep").value.trim();
  const openQuestions = document.getElementById("newOpenQuestions").value.trim();
  const due = document.getElementById("newDue").value.trim() || "Not set";
  const title = document.getElementById("newTitle").value.trim() || "Untitled task";
  const duration = Number(document.getElementById("newDuration").value) || 60;
  const difficultyValue = Number(document.getElementById("newExpectedDifficulty").value) || null;
  const priority = document.getElementById("newPriority").value;
  const status = document.getElementById("newStatus").value;
  const taskType = previous.task_type || localScheduleTaskType(title, due, initialContext);
  const temporal = temporalMetadataForTask({ due, task_type: taskType });
  const accumulatedActual = Number(previous.execution?.accumulated_actual_minutes || 0);
  const durationChanged = Number(previous.duration || duration) !== duration;
  return {
    ...previous,
    id,
    title,
    due,
    duration,
    priority,
    status,
    context: initialContext,
    contextWindow: {
      ...(previous.contextWindow || {}),
      taskType,
      deadline: due,
      startAt: temporal.start_at,
      deadlineAt: temporal.deadline_at,
      timezone: temporal.timezone,
      deadlineAssumption: temporal.deadline_assumption,
      progress: progress || initialContext,
      nextStep: nextStep || "Confirm the task goal, then choose one step that fits within 15–30 minutes.",
      openQuestions: openQuestions || "No open questions have been recorded.",
      materials: previous.contextWindow?.materials || "No materials are linked yet. Add papers, links, or filenames in the task context.",
      recoveryCue: previous.contextWindow?.recoveryCue || "Add time, materials, and a next action before scheduling."
    },
    execution: {
      ...(previous.execution || {}),
      original_estimate_minutes: duration,
      remaining_duration_minutes: durationChanged
        ? Math.max(duration - accumulatedActual, 0)
        : taskWorkRemainingMinutes({ ...previous, duration })
    },
    expected_difficulty: difficultyValue,
    task_type: taskType,
    timezone: temporal.timezone,
    start_at: temporal.start_at,
    deadline_at: temporal.deadline_at,
    deadline_assumption: temporal.deadline_assumption,
    task_demand: difficultyValue ? {
      estimated_cognitive_load: difficultyValue >= 6 ? "high" : difficultyValue <= 2 ? "low" : "medium",
      expected_difficulty: difficultyValue,
      evidence: [`user expected_difficulty=${difficultyValue}/7`],
      confidence_level: "high",
      source: "user_self_report",
      user_confirmed: true
    } : previous.task_demand || {},
    resource_modality: Array.from(document.querySelectorAll('input[name="taskModality"]:checked')).map((input) => input.value),
    parallelizable: document.getElementById("newParallelizable").checked,
    slot: previous.due && (
      previous.due !== due
      || durationChanged
      || previous.priority !== priority
      || Number(previous.expected_difficulty || 0) !== Number(difficultyValue || 0)
      || previous.status !== status
    ) ? null : previous.slot || null,
    checkpoints: previous.checkpoints || []
  };
}

[focusInput, energyInput, stressInput, emotionInput].forEach((input) => {
  input.addEventListener("input", render);
});

document.getElementById("autoScheduleBtn").addEventListener("click", async () => {
  if (!tasks.length) {
    addChatMessage("ai", "No tasks yet", "Add a task in the assistant panel first.");
    render();
    return;
  }
  await requestTentativeSchedule("Generate the weekly structure from Weekly Context, long-term rhythm, and task demand.");
  render();
});

confirmScheduleBtn.addEventListener("click", async () => {
  if (confirmScheduleBtn.dataset.mode === "confirmed") {
    await requestTentativeSchedule("Generate an adjustment proposal from the confirmed calendar and current Weekly Context.");
    render();
    return;
  }
  if (scheduleConfirmationInFlight) return;
  if (!pendingSchedulePlan?.plan_patch?.length) return;
  scheduleConfirmationInFlight = true;
  confirmScheduleBtn.disabled = true;
  delete pendingSchedulePlan.confirmation_error;
  // An unanswered parallel suggestion is optional.  The confirmed schedule
  // remains the safe non-overlapping base plan and the suggestion is recorded
  // as "keep separate" without creating another confirmation step.
  pendingSchedulePlan.parallel_suggestions = valueList(pendingSchedulePlan.parallel_suggestions).map((suggestion) => (
    suggestion.status === "pending"
      ? {
          ...suggestion,
          status: suggestion.change_from_status === "accepted" ? "accepted" : "rejected",
          change_from_status: undefined,
          decision_source: suggestion.change_from_status === "accepted" ? "retained_after_unfinished_change" : "safe_default_on_plan_confirmation"
        }
      : suggestion
  ));
  const confirmedDecisionSnapshot = JSON.parse(JSON.stringify(pendingSchedulePlan));
  try {
  const pendingTaskIds = [...new Set(pendingSchedulePlan.plan_patch.map((block) => String(block.task_id || "")).filter(Boolean))];
  const hardViolations = pendingSchedulePlan.plan_patch.flatMap((block) => {
    const target = tasks.find((item) => item.id === block.task_id);
    return target ? calendarBlockConflictDetails({ ...block, task: target, source: "pending" }, block.block_id).map((conflict) => ({ ...conflict, task_id: block.task_id, block_ids: [block.block_id] })) : [];
  });
  if (hardViolations.length) {
    pendingSchedulePlan.validation = { valid: false, violations: hardViolations };
    render();
    return;
  }
  let backendConfirmation = null;
  if (backendOnline) {
    const response = await api("/api/schedules/validate", {
      method: "POST",
      body: JSON.stringify({
        user_id: currentUserId(),
        plan_patch: pendingSchedulePlan.plan_patch,
        unscheduled_tasks: pendingSchedulePlan.unscheduled_tasks || [],
        ai_task_analysis: pendingSchedulePlan.ai_task_analysis || {}
      })
    });
    const backendValidation = response.validation || { valid: false, violations: [{ type: "missing_validation" }] };
    if (!backendValidation.valid) {
      pendingSchedulePlan.validation = backendValidation;
      render();
      return;
    }
    backendConfirmation = await api("/api/schedules/confirm", {
      method: "POST",
      body: JSON.stringify({
        user_id: currentUserId(),
        plan_id: pendingSchedulePlan.plan_id,
        plan_revision: pendingSchedulePlan.plan_revision,
        week_id: pendingSchedulePlan.week_id || weekStartLabel(),
        request_id: pendingSchedulePlan.request_id,
        plan_patch: pendingSchedulePlan.plan_patch,
        unscheduled_tasks: pendingSchedulePlan.unscheduled_tasks || [],
        ai_task_analysis: pendingSchedulePlan.ai_task_analysis || {},
        decision: pendingSchedulePlan,
        rationale: pendingSchedulePlan.pending_rationale || null
      })
    });
    if (backendConfirmation.requires_rationale) {
      pendingRationaleSubmission = {
        edit_episode_id: backendConfirmation.edit_episode_id,
        final_plan_hash: backendConfirmation.final_plan_hash,
        canonical_diff: backendConfirmation.canonical_diff
      };
      const summary = backendConfirmation.canonical_diff?.summary || {};
      document.getElementById("planRationaleDiff").textContent = `You changed ${Number(summary.moved || 0)} time block(s), resized ${Number(summary.resized || 0)}, added ${Number(summary.added || 0)}, and removed ${Number(summary.removed || 0)}.`;
      if (!planRationaleDialog.open) planRationaleDialog.showModal();
      setBackendStatus("Your changes are ready. The research question is optional.", true);
      render();
      return;
    }
    tasks = valueList(backendConfirmation.tasks).map(normalizeBackendTask);
  }
  const blocksByTask = new Map();
  const resourceProfileMap = new Map(valueList(pendingSchedulePlan.ai_task_analysis?.task_resource_profiles).map((profile) => [String(profile.task_id), profile]));
  pendingSchedulePlan.plan_patch.forEach((block) => {
    if (!block.task_id) return;
    const list = blocksByTask.get(block.task_id) || [];
    list.push(block);
    blocksByTask.set(block.task_id, list);
  });
  for (const [taskId, taskBlocks] of blocksByTask.entries()) {
    const target = tasks.find((item) => item.id === taskId);
    if (!target) continue;
    const ordered = [...taskBlocks].sort((a, b) => a.day_index - b.day_index || a.start - b.start);
    const sessions = ordered.map((block, index) => ({
      block_id: block.block_id || `${taskId}-session-${index + 1}`,
      start: block.start,
      end: block.end,
      day_index: block.day_index,
      color: block.color || "blue",
      kind: block.kind || "task_session",
      session_index: index + 1,
      session_count: ordered.length,
      session_minutes: block.session_minutes || Math.round((block.end - block.start) * 60),
      planned_work_minutes: Number.isFinite(Number(block.planned_work_minutes)) ? Number(block.planned_work_minutes) : undefined,
      padding_minutes: Number(block.padding_minutes || 0),
      remaining_after_block_minutes: block.remaining_after_block_minutes,
      constraint_evidence: block.constraint_evidence || [],
      parallel_group_id: block.parallel_group_id || null,
      parallel_user_confirmed: Boolean(block.parallel_user_confirmed),
      parallel_task_ids: valueList(block.parallel_task_ids),
      allowed_overlap_minutes: Number(block.allowed_overlap_minutes || 0),
      parallel_evidence: valueList(block.parallel_evidence),
      parallel_role: block.parallel_role || null
    }));
    const resourceProfile = resourceProfileMap.get(String(taskId));
    if (resourceProfile) {
      target.resource_modality = valueList(resourceProfile.resource_modality);
      target.parallelizable = Boolean(resourceProfile.parallelizable);
      target.contextWindow = {
        ...(target.contextWindow || {}),
        parallelAnalysis: {
          evidence: valueList(resourceProfile.evidence),
          confidence_level: resourceProfile.confidence_level,
          source: resourceProfile.source || "deepseek"
        }
      };
    }
    target.slot = {
      sessions,
      start: sessions[0].start,
      end: sessions[0].end,
      day_index: sessions[0].day_index,
      color: sessions[0].color,
      constraint_evidence: sessions.flatMap((session) => session.constraint_evidence || [])
    };
    const scheduleState = refreshTaskScheduleStatus(target);
    const provenance = pendingSchedulePlan.ai_provenance || {};
    target.contextWindow = {
      ...(target.contextWindow || {}),
      decisionTrace: {
    generated_at: appNow().toLocaleString("zh-CN", { hour12: false }),
        provider: provenance.provider || pendingSchedulePlan.llm_provider || "constraint_engine",
        model: provenance.model || null,
        selected_candidate_id: pendingSchedulePlan.selected_candidate_id || null,
        confidence_level: provenance.confidence_level || pendingSchedulePlan.confidence?.level || "medium",
        prompt_versions: provenance.prompt_versions || {},
        evidence: [...new Set([
          ...valueList(provenance.evidence),
          ...sessions.flatMap((session) => [...valueList(session.constraint_evidence), ...valueList(session.parallel_evidence)])
        ].map((item) => typeof item === "string" ? item : JSON.stringify(item)))],
        dependencies: pendingSchedulePlan.ai_analysis?.task_dependencies || pendingSchedulePlan.ai_task_analysis?.dependencies || [],
        validation: { valid: true, violations: [] },
        total_minutes: Number(target.duration || 0),
        work_remaining_minutes: scheduleState.workRemainingMinutes,
        scheduled_minutes: scheduleState.scheduledMinutes,
        scheduled_capacity_minutes: scheduleState.scheduledCapacityMinutes,
        schedule_padding_minutes: scheduleState.paddingMinutes,
        unallocated_schedule_minutes: scheduleState.remainingMinutes,
        session_count: sessions.length,
        parallel_groups: [...new Set(sessions.map((session) => session.parallel_group_id).filter(Boolean))]
      }
    };
    if (!backendConfirmation) await patchBackendTask(target);
  }
  const routineAdjustments = valueList(pendingSchedulePlan.routine_adjustments).filter((item) => item?.context_id);
  if (routineAdjustments.length) {
    const contextItems = valueList(currentProfile.weekly_context?.context_items).map((item) => {
      if (!item || typeof item !== "object") return item;
      const relevant = routineAdjustments.filter((adjustment) => adjustment.context_id === item.id);
      if (!relevant.length) return item;
      const exceptions = { ...(item.routine_exceptions || {}) };
      relevant.forEach((adjustment) => {
        exceptions[String(adjustment.day_index)] = {
          start: Number(adjustment.start),
          end: Number(adjustment.end),
          reason: adjustment.reason,
          source: "ai_schedule_adjustment",
      updated_at: appNow().toISOString()
        };
      });
      return { ...item, routine_exceptions: exceptions };
    });
    currentProfile = {
      ...currentProfile,
      weekly_context: {
        ...(currentProfile.weekly_context || {}),
        context_items: contextItems,
        fixed_events: contextItems.filter((item) => item && typeof item === "object").map(contextItemLegacyText)
      }
    };
    await persistWeeklyContext();
  }
  const contextParallelAdjustments = valueList(pendingSchedulePlan.context_parallel_adjustments).filter((item) => item?.context_id && item?.user_confirmed);
  if (contextParallelAdjustments.length) {
    const contextItems = valueList(currentProfile.weekly_context?.context_items).map((item) => {
      if (!item || typeof item !== "object") return item;
      const adjustment = contextParallelAdjustments.find((candidate) => String(candidate.context_id) === String(item.id));
      return adjustment ? { ...item, parallel_session: { ...adjustment, confirmed_at: appNow().toISOString() } } : item;
    });
    currentProfile = {
      ...currentProfile,
      weekly_context: {
        ...(currentProfile.weekly_context || {}),
        context_items: contextItems,
        fixed_events: contextItems.filter((item) => item && typeof item === "object").map(contextItemLegacyText)
      }
    };
  }
  if (backendOnline) {
    await api("/api/state-transitions", {
      method: "POST",
      body: JSON.stringify({
        user_id: currentUserId(),
        before_state: pendingSchedulePlan.joint_state || {},
        action: { type: "confirm_plan", confidence_to_complete: planConfidenceInput.value },
        predicted_state: { plan_blocks: pendingSchedulePlan.plan_patch, uncertainty: pendingSchedulePlan.confidence?.level || "medium" },
        actual_state: {}, outcome: { awaiting_execution: true }
      })
    });
  }
  const partialCount = tasks.filter((task) => task.status === "partially_scheduled").length;
  setBackendStatus(partialCount ? "Feasible sessions added; some work still needs time" : "Plan added to calendar", true);
  const uncertainConstraints = valueList(confirmedDecisionSnapshot.constraint_summary?.uncertain_constraints);
  const deadlineAssumptions = tasks.map((task) => task.deadline_assumption || task.contextWindow?.deadlineAssumption).filter(Boolean);
  confirmedSchedulePlan = {
    request_id: confirmedDecisionSnapshot.request_id || null,
    confirmed_at: appNow().toISOString(),
    confirmed_at_label: appNow().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
    plan_patch: confirmedDecisionSnapshot.plan_patch,
    selected_candidate_id: confirmedDecisionSnapshot.selected_candidate_id || null,
    plan_revision: Number(confirmedDecisionSnapshot.plan_revision || 1),
    explanation: confirmedDecisionSnapshot.explanation || "",
    assumptions: [...new Set([...uncertainConstraints, ...deadlineAssumptions])],
    unresolved_issues: valueList(confirmedDecisionSnapshot.unscheduled_tasks).map((item) => item.reason || item),
    buffer_summary: confirmedBufferSummary(),
    draft_task_ids: pendingTaskIds,
    decision: {
      ai_provenance: confirmedDecisionSnapshot.ai_provenance || {},
      ai_analysis: confirmedDecisionSnapshot.ai_analysis || {},
      ai_task_analysis: confirmedDecisionSnapshot.ai_task_analysis || {},
      explanation: confirmedDecisionSnapshot.explanation || "",
      confidence: confirmedDecisionSnapshot.confidence || {},
      validation: confirmedDecisionSnapshot.validation || {}
    }
  };
  if (backendConfirmation?.plan) confirmedSchedulePlan = backendConfirmation.plan;
  if (backendOnline) currentExecutionState = await optionalApi(`/api/execution-sessions/current?user_id=${currentUserId()}`, null);
  activeSelectionMode = "auto";
  rightRailMode = "plan";
  setBackendStatus("Calendar confirmed", true);
  pendingSchedulePlan = null;
  rightRailMode = "plan";
  calendar.classList.add("plan-settling");
  window.setTimeout(() => calendar.classList.remove("plan-settling"), 500);
  activeSelectionMode = "none";
  activeId = null;
  checkTaskTimePrompts(false);
  render();
  showProductToast("Plan added to calendar.");
  } catch (error) {
    if (pendingSchedulePlan) {
      pendingSchedulePlan.confirmation_error = {
        title: "Calendar could not be created",
        detail: error?.message || "An unexpected confirmation error occurred."
      };
    }
    addChatMessage("ai", "Calendar confirmation failed", error?.message || "An unexpected confirmation error occurred.");
    setBackendStatus("Calendar confirmation failed", backendOnline);
    render();
  } finally {
    scheduleConfirmationInFlight = false;
  }
});

rejectScheduleBtn.addEventListener("click", () => {
  if (rejectScheduleBtn.dataset.mode === "confirmed") {
    activeSelectionMode = "none";
    activeId = null;
    addChatMessage("ai", "Calendar editing is ready", "Select a calendar block to view details, or drag and resize a normal task. HumanOS revalidates constraints after each change.");
    document.querySelector(".calendar-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    render();
    return;
  }
  pendingSchedulePlan = null;
  addChatMessage("ai", "Schedule cancelled", "This proposal was not added to the calendar. Add or revise constraints to generate another plan.");
  render();
});

function submitPlanRationale(responseStatus) {
  if (qaRationalePreview) {
    qaRationalePreview = false;
    planRationaleDialog.close(responseStatus);
    showProductToast("QA rationale interaction recorded only in this visual preview.");
    return;
  }
  if (!pendingSchedulePlan || !pendingRationaleSubmission) return;
  pendingSchedulePlan.pending_rationale = {
    edit_episode_id: pendingRationaleSubmission.edit_episode_id,
    final_plan_hash: pendingRationaleSubmission.final_plan_hash,
    reason_codes: checkedValues(document.getElementById("planRationaleReasons")),
    raw_user_response: document.getElementById("planRationaleText").value.trim(),
    generalizability: document.getElementById("planRationaleScope").value,
    affected_task_ids: [...new Set(valueList(pendingSchedulePlan.plan_patch).map((block) => block.task_id).filter(Boolean))],
    response_status: responseStatus,
    request_id: `rationale-${pendingRationaleSubmission.final_plan_hash}-${responseStatus}`,
    source: { channel: "pre_confirmation_card", source: "user_self_report" }
  };
  pendingRationaleSubmission = null;
  planRationaleDialog.close(responseStatus);
  confirmScheduleBtn.click();
}

planRationaleForm?.addEventListener("submit", (event) => { event.preventDefault(); submitPlanRationale("answered"); });
document.getElementById("skipPlanRationaleBtn")?.addEventListener("click", () => submitPlanRationale("skipped"));
document.getElementById("backToPlanEditBtn")?.addEventListener("click", () => {
  qaRationalePreview = false;
  pendingRationaleSubmission = null;
  planRationaleDialog.close("back_to_edit");
  setBackendStatus("Continue editing the draft. Your changes have not entered the calendar.", true);
});

document.getElementById("addTaskBtn").addEventListener("click", () => {
  openTaskDialog();
});

document.querySelectorAll("[data-qa-minutes]").forEach((button) => button.addEventListener("click", async () => {
  try {
    showQaStatus("Advancing the Unified Clock…");
    await window.HumanOSTestClock.advanceMinutes(Number(button.dataset.qaMinutes));
    showQaStatus("Time advanced. No execution action was fabricated.");
  } catch (error) { showQaStatus(error.message, true); }
}));
document.querySelectorAll("[data-qa-days]").forEach((button) => button.addEventListener("click", async () => {
  try {
    await window.HumanOSTestClock.advanceDays(Number(button.dataset.qaDays));
    showQaStatus("Time advanced. No execution action was fabricated.");
  } catch (error) { showQaStatus(error.message, true); }
}));
document.getElementById("qaApplyCustomTime")?.addEventListener("click", async () => {
  const value = document.getElementById("qaCustomTime").value;
  if (!value) return showQaStatus("Choose a custom date and time first.", true);
  const candidate = new Date(`${value}:00+08:00`);
  if (candidate < appNow()) return showQaStatus("Backward jumps require an independent scenario snapshot. Choose a preset below.", true);
  try {
    await window.HumanOSTestClock.setTime(candidate.toISOString());
    showQaStatus("Custom time applied. No execution action was fabricated.");
  } catch (error) { showQaStatus(error.message, true); }
});
document.getElementById("qaAutoPlayBtn")?.addEventListener("click", async (event) => {
  if (qaAutoPlayTimer) {
    window.clearInterval(qaAutoPlayTimer);
    qaAutoPlayTimer = null;
    await window.HumanOSTestClock.setScale(0);
    event.currentTarget.textContent = "Auto-play";
    showQaStatus("Auto-play stopped.");
    return;
  }
  const rate = Number(document.getElementById("qaAutoPlayRate").value || 15);
  await window.HumanOSTestClock.setScale(rate);
  event.currentTarget.textContent = "Stop auto-play";
  qaAutoPlayTimer = window.setInterval(async () => {
    try { await window.HumanOSTestClock.sync(); } catch (error) { showQaStatus(error.message, true); }
  }, 1000);
  showQaStatus(`Auto-play running at ${rate} simulated minute(s) per second.`);
});
document.getElementById("qaResetBtn")?.addEventListener("click", () => {
  document.getElementById("qaResetConfirmCheck").checked = false;
  document.getElementById("qaResetConfirmBtn").disabled = true;
  qaResetDialog.showModal();
});
document.getElementById("qaResetConfirmCheck")?.addEventListener("change", (event) => {
  document.getElementById("qaResetConfirmBtn").disabled = !event.currentTarget.checked;
});
document.getElementById("qaResetConfirmBtn")?.addEventListener("click", async () => {
  if (!window.confirm("Final confirmation: restore the independent QA baseline?")) return;
  qaResetDialog.close("reset");
  try {
    const result = await api("/api/qa-scenarios/reset", { method: "POST", body: "{}" });
    qaActiveScenarioId = "base";
    syncSharedTestClock(result.clock);
    await reloadAfterQaJump();
    showQaStatus("QA scenario reset to the independent baseline.");
  } catch (error) { showQaStatus(error.message, true); }
});

[closeTaskPreviewBtn, cancelTaskPreviewBtn].forEach((button) => {
  button.addEventListener("click", closeTaskPreview);
});

taskPreviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const cards = Array.from(taskPreviewList.querySelectorAll(".task-preview-card"));
  if (!cards.length) return;
  for (const card of cards) {
    const dueInput = card.querySelector(".preview-due");
    const taskType = card.querySelector(".preview-type").value;
    dueInput.setCustomValidity(taskType === "fixed_event" && parseDueStartHour(dueInput.value.trim()) === null
      ? "固定事项需要具体开始时间，例如：周二 15:00"
      : "");
    if (!dueInput.checkValidity()) {
      dueInput.reportValidity();
      return;
    }
  }
  const confirmed = [];
  try {
    for (const card of cards) {
      const index = Number(card.dataset.previewIndex);
      const original = pendingTaskPreview[index] || {};
      const title = card.querySelector(".preview-title").value.trim();
      const taskType = card.querySelector(".preview-type").value;
      const dueInput = card.querySelector(".preview-due");
      const due = dueInput.value.trim();
      const duration = normalizeTaskDurationMinutes(card.querySelector(".preview-duration").value, 60);
      const priorityInput = card.querySelector(".preview-priority").value;
      if (taskType === "fixed_event" && parseDueStartHour(due) === null) {
        dueInput.setCustomValidity("固定事项需要具体开始时间，例如：周二 15:00");
        dueInput.reportValidity();
        return;
      }
      dueInput.setCustomValidity("");
      const temporal = temporalMetadataForTask({ due, task_type: taskType });
      const priority = priorityInput || "中";
      const changedFields = [
        original.title !== title ? "title" : null,
        original.task_type !== taskType ? "task_type" : null,
        original.due !== due ? "due" : null,
        Number(original.duration || 0) !== duration ? "duration" : null,
        original.priority !== priority ? "priority" : null
      ].filter(Boolean);
      const payload = {
        title,
        due,
        deadline: due,
        duration,
        priority,
        status: "queued",
        task_type: taskType,
        context: original.context || valueList(original.source_spans).join("；"),
        timezone: temporal.timezone,
        start_at: temporal.start_at,
        deadline_at: temporal.deadline_at,
        deadline_assumption: temporal.deadline_assumption,
        contextWindow: {
          taskType,
          deadline: due,
          startAt: temporal.start_at,
          deadlineAt: temporal.deadline_at,
          timezone: temporal.timezone,
          deadlineAssumption: temporal.deadline_assumption,
          sourceSpans: valueList(original.source_spans),
          parseReview: {
    confirmed_at: appNow().toISOString(),
            original: { title: original.title, task_type: original.task_type, due: original.due, duration: original.duration, priority: original.priority },
            changed_fields: changedFields,
            assumptions: priorityInput ? [] : ["No priority was entered; Medium is used until the user changes it."]
          }
        }
      };
      const created = await createTaskFromPayload(payload);
      const identity = (value) => String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
      const existingIndex = tasks.findIndex((item) => item.id === created.id || (
        identity(item.title) === identity(created.title) && identity(item.due) === identity(created.due)
        && !["completed", "terminated"].includes(item.status)
      ));
      if (existingIndex >= 0) tasks[existingIndex] = { ...created, id: tasks[existingIndex].id };
      else tasks.push(created);
      confirmed.push(created);
    }
    pendingTaskPreview = [];
    if (taskPreviewDialog.open) taskPreviewDialog.close("confirmed");
    activeSelectionMode = "auto";
    activeId = defaultActiveTaskId();
    const fixedNames = confirmed.filter((task) => task.task_type === "fixed_event").map((task) => task.title);
    const flexibleNames = confirmed.filter((task) => task.task_type !== "fixed_event").map((task) => task.title);
    addChatMessage("ai", "Created after your confirmation", [
      fixedNames.length ? `${fixedNames.join(", ")} ${fixedNames.length === 1 ? "is a fixed event" : "are fixed events"}. HumanOS keeps the stated time and checks for conflicts.` : "",
      flexibleNames.length ? `${flexibleNames.join(", ")} ${flexibleNames.length === 1 ? "is a flexible task" : "are flexible tasks"}. HumanOS proposes sessions inside availability and before the deadline.` : ""
    ].filter(Boolean).join("\n"));
    await requestTentativeSchedule("Generate candidate plans from the tasks confirmed by the user.", confirmed);
    render();
  } catch (error) {
    addChatMessage("ai", "Creation failed", "No tasks were silently created. Check the backend connection and try again.");
    console.error(error);
    render();
  }
});

chatSendBtn.addEventListener("click", () => {
  handleChatTurn(chatInput.value);
});

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    handleChatTurn(chatInput.value);
  }
});

workspaceNavBtn.addEventListener("click", () => {
  showWorkspaceView();
});

profileHomeBtn.addEventListener("click", () => {
  showProfileHomeView();
});

closeTaskDialogBtn.addEventListener("click", () => {
  editingTaskId = null;
  deleteTaskBtn.classList.add("hidden");
  dialog.close("cancel");
});

closeTaskDetailsBtn?.addEventListener("click", () => {
  rightRailMode = "plan";
  activeSelectionMode = "auto";
  render();
});

chatDrawer?.addEventListener("toggle", () => {
  if (chatDrawer.open) {
    if (rightRailMode !== "agent") previousRightRailMode = rightRailMode === "task" ? "task" : "plan";
    rightRailMode = "agent";
  } else if (rightRailMode === "agent") {
    rightRailMode = previousRightRailMode;
  }
  syncRightRailMode();
});

document.getElementById("closePauseDialogBtn").addEventListener("click", () => pauseDialog.close("cancel"));
pauseDialog?.addEventListener("close", () => {
  if (rightRailMode === "pause") rightRailMode = previousRightRailMode;
  syncRightRailMode();
});
document.getElementById("closeFeedbackDialogBtn").addEventListener("click", () => feedbackDialog.close("cancel"));

function pauseAdjustment(stopReason) {
  if (stopReason === "fatigue") return { action: "rest", label: "Take a break", detail: "Rest for 10–20 minutes. The task and its context will be preserved." };
  if (stopReason === "stuck" || stopReason === "underestimated") return { action: "reduce_current_task", label: "Reduce the current step", detail: "Complete a smaller checkpoint first; the remaining work will stay recorded." };
  if (stopReason === "blocked") return { action: "switch_to_lighter_task", label: "Switch to a lighter task", detail: "This task is Blocked until the external condition is resolved." };
  return { action: "switch_to_lighter_task", label: "Switch to a lighter task", detail: "Choose a shorter, lower-demand task that can be started now." };
}

function preparePauseDialog(task) {
  if (!task) return;
  previousRightRailMode = rightRailMode === "agent" ? previousRightRailMode : rightRailMode;
  rightRailMode = "pause";
  if (chatDrawer?.open) chatDrawer.open = false;
  const context = normalizeContextWindow(task);
  const usefulProgress = context.progress && !context.progress.startsWith("No progress") ? context.progress : "";
  const usefulNext = context.nextStep && !context.nextStep.startsWith("Confirm the task goal") ? context.nextStep : "";
  document.getElementById("pauseContextNote").value = [usefulProgress, usefulNext ? `Next: ${usefulNext}` : ""].filter(Boolean).join("\n");
  const session = executionSessionForTask(task);
  const trackedMinutes = session ? executionElapsedMinutes(session) : 0;
  document.getElementById("pauseTrackedTime").textContent = `Active time this session: ${trackedMinutes} min`;
  pauseDialog.dataset.taskId = task.id;
  pauseDialog.dataset.executionSessionId = session?.execution_session_id || "";
  pauseDialog.dataset.trackedActiveMinutes = String(trackedMinutes);
  document.getElementById("pauseResumeChoice").value = "in_10";
  document.getElementById("pauseResumeTimeField").classList.add("hidden");
  document.getElementById("pauseImpactSummary").textContent = "Only affected sessions later today will be checked.";
  if (!pauseDialog.open) pauseDialog.showModal();
}

function interruptionReasonLabel(reason) {
  return {
    fatigue: "Fatigue",
    stuck: "Stuck",
    blocked: "Waiting for material or a reply",
    interrupted: "Interrupted",
    underestimated: "Took longer than expected",
    priority_changed: "Priority changed"
  }[reason] || "Other reason";
}

function slotFromSessions(task, sourceSessions) {
  const sessions = [...sourceSessions]
    .sort((a, b) => a.day_index - b.day_index || a.start - b.start)
    .map((session, index, ordered) => ({ ...session, session_index: index + 1, session_count: ordered.length }));
  if (!sessions.length) return null;
  return {
    sessions,
    start: sessions[0].start,
    end: sessions[0].end,
    day_index: sessions[0].day_index,
    color: sessions[0].color || task.slot?.color || colorForTask(task)
  };
}

function splitSessionsAtInterruption(task, calendarAction) {
  const sessions = taskSlotSessions(task).map((session) => ({ ...session }));
  if (calendarAction === "keep") return { retained: sessions, released: [] };
  const now = appNow();
  const todayIndex = (now.getDay() + 6) % 7;
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const retained = sessions.filter((session) => session.day_index < todayIndex || (session.day_index === todayIndex && session.end <= nowHour));
  const retainedIds = new Set(retained.map((session) => session.block_id));
  return { retained, released: sessions.filter((session) => !retainedIds.has(session.block_id)) };
}

function localizeLegacyReentryPrompt(value = "") {
  return String(value)
    .replace(/^恢复任务：/, "Resume task: ")
    .replace(/。上次进展：/g, ". Previous progress: ")
    .replace(/。第一步：/g, ". First action: ");
}

async function resumeInterruptedTask(task) {
  if (!task || !["paused", "blocked"].includes(task.status)) return;
  const runtimeState = {
    focus: Number(focusInput.value),
    energy: Number(energyInput.value),
    stress: Number(stressInput.value),
    emotion: emotionInput.value,
    source: "self_report"
  };
  let reentry = {
    prompt: `Resume ${task.title}. First step: ${normalizeContextWindow(task).nextStep}`,
    first_step: normalizeContextWindow(task).nextStep,
    suggested_block_minutes: runtimeState.energy <= 3 ? 25 : 45
  };
  try {
    if (backendOnline) {
      const response = await api("/api/reentry", {
        method: "POST",
        body: JSON.stringify({ user_id: currentUserId(), task_id: task.id, runtime_state: runtimeState })
      });
      reentry = response.reentry || reentry;
    }
    reentry.prompt = localizeLegacyReentryPrompt(reentry.prompt);
    const remainingMinutes = taskWorkRemainingMinutes(task);
    const session = currentExecutionState?.session?.task_id === task.id
      ? currentExecutionState.session
      : executionSessionForTask(task);
    if (backendOnline && session?.execution_session_id) {
      const started = await api("/api/execution-sessions/start", {
        method: "POST",
        body: JSON.stringify({
          user_id: currentUserId(),
          execution_session_id: session.execution_session_id,
          request_id: `resume-${session.execution_session_id}-${Date.now()}`
        })
      });
      currentExecutionState = { mode: "now", session: started.execution_session, task };
    }
    task.status = remainingMinutes <= 0 ? "completed" : "running";
    task.contextWindow = {
      ...normalizeContextWindow(task),
      nextStep: reentry.first_step || normalizeContextWindow(task).nextStep,
      recoveryCue: reentry.prompt,
      lastReentry: {
    resumed_at: appNow().toISOString(),
        suggested_block_minutes: reentry.suggested_block_minutes,
        source: backendOnline ? "backend_reentry" : "local_context"
      }
    };
    await patchBackendTask(task);
    activeId = task.id;
    activeSelectionMode = "auto";
    rightRailMode = "plan";
    showProductToast(`Resumed · ${currentExecutionState?.session?.session_remaining_minutes ?? remainingMinutes} min remaining.`);
  } catch (error) {
    console.error(error);
    addChatMessage("ai", "Resume failed", "The recovery record is preserved, but a new plan could not be generated. Try again shortly.");
  }
  render();
}

pauseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (pauseForm.dataset.modernPause === "1") return;
  const task = selectedTask();
  if (!task) return;
  const stopReason = document.querySelector('input[name="stopReason"]:checked')?.value || "other";
  const progress = document.getElementById("pauseProgress").value.trim();
  const nextAction = document.getElementById("pauseNextStep").value.trim();
  const calendarAction = document.getElementById("pauseCalendarAction").value;
  const previousRemaining = taskWorkRemainingMinutes(task);
  const trackedMinutes = Number(pauseDialog.dataset.trackedActiveMinutes || 0);
  const adjustedValue = document.getElementById("pauseAdjustedMinutes").value.trim();
  const adjustmentReason = document.getElementById("pauseAdjustmentReason").value.trim();
  if (adjustedValue && !adjustmentReason) {
    document.getElementById("pauseAdjustmentReason").setCustomValidity("Explain why the tracked time needs correction.");
    document.getElementById("pauseAdjustmentReason").reportValidity();
    return;
  }
  document.getElementById("pauseAdjustmentReason").setCustomValidity("");
  const remainingMinutes = previousRemaining;
  const originalMinutes = Number(task.execution?.original_estimate_minutes ?? task.duration ?? previousRemaining);
  const accumulatedActual = Number(task.execution?.accumulated_actual_minutes || 0);
  const progressPercent = Number(task.execution?.progress_percent || 0);
  const sessionChange = splitSessionsAtInterruption(task, calendarAction);
  const adjustment = pauseAdjustment(stopReason);
  const beforeState = {
    task_id: task.id,
    task_status: task.status,
    task_demand: task.task_demand,
    momentary_state: { focus: Number(focusInput.value), energy: Number(energyInput.value), stress: Number(stressInput.value), source: "self_report" }
  };
  if (backendOnline) {
    if (adjustedValue && pauseDialog.dataset.executionSessionId) {
      const pauseResponse = await api("/api/execution-sessions/pause", {
        method: "POST",
        body: JSON.stringify({
          user_id: currentUserId(), execution_session_id: pauseDialog.dataset.executionSessionId,
          request_id: `pause-adjust-${pauseDialog.dataset.executionSessionId}-${Date.now()}`,
          tracked_time_adjustment: { minutes: Number(adjustedValue), reason: adjustmentReason }
        })
      });
      currentExecutionState = { ...currentExecutionState, mode: "paused", session: pauseResponse.execution_session };
    }
    await api("/api/context-dumps", {
      method: "POST",
      body: JSON.stringify({
        user_id: currentUserId(), task_id: task.id, stop_reason: stopReason,
        progress, next_action: nextAction
      })
    });
    await api("/api/state-transitions", {
      method: "POST",
      body: JSON.stringify({
        user_id: currentUserId(), task_id: task.id, before_state: beforeState,
        action: adjustment,
        predicted_state: { qualitative_outlook: adjustment.detail, uncertainty: "medium" },
        actual_state: {}, outcome: { pending_execution_feedback: true }
      })
    });
  }
  task.status = stopReason === "blocked" ? "blocked" : (calendarAction === "replan" ? "queued" : "paused");
  task.slot = slotFromSessions(task, sessionChange.retained);
  task.execution = {
    ...(task.execution || {}),
    original_estimate_minutes: originalMinutes,
    accumulated_actual_minutes: accumulatedActual,
    remaining_duration_minutes: remainingMinutes,
    progress_percent: progressPercent,
    last_stop_reason: stopReason
  };
  task.contextWindow = {
    ...normalizeContextWindow(task),
    progress,
    nextStep: nextAction,
    interruption: {
    stopped_at: appNow().toISOString(),
      reason: stopReason,
      calendar_action: calendarAction,
      released_session_count: sessionChange.released.length,
      retained_session_count: sessionChange.retained.length,
      tracked_active_minutes: adjustedValue ? Number(adjustedValue) : trackedMinutes
    }
  };
  task.checkpoints = [
    { label: "Pause reason", text: interruptionReasonLabel(stopReason) },
    { label: "Current progress", text: progress || "Not provided" },
    { label: "Next step", text: nextAction || "Confirm one small next step when resuming." }
  ];
  if (pendingSchedulePlan?.plan_patch?.length) {
    pendingSchedulePlan.plan_patch = pendingSchedulePlan.plan_patch.filter((block) => block.task_id !== task.id);
    if (!pendingSchedulePlan.plan_patch.length) pendingSchedulePlan = null;
  }
  await patchBackendTask(task);
  const calendarNote = calendarAction === "keep"
    ? "The original sessions were kept."
    : `${sessionChange.released.length} current or future session(s) were released; past records were kept.`;
  addChatMessage("ai", adjustment.label, `${adjustment.detail}\n${calendarNote} ${remainingMinutes} minutes of work and the next re-entry step were saved.`);
  pauseDialog.close("saved");
  let adjustmentPlan = null;
  if (calendarAction === "replan" && stopReason !== "blocked") {
    const replannable = tasks.filter((item) => (
      !["completed", "terminated", "paused", "blocked"].includes(item.status)
      && missingTimeConfirmationFields(item).length === 0
    ));
    if (replannable.length) {
      calendarView = "week";
      adjustmentPlan = await requestTentativeSchedule("Replan all remaining work, including the interrupted task, using the released time. Preserve recorded active time and do not reduce remaining work until execution feedback is submitted.", replannable);
    }
  }
  activeId = task.id;
  if (adjustmentPlan?.plan_patch?.length) {
    // requestTentativeSchedule opens Plan Review. Do not immediately hide the
    // new adjustment by switching the rail back to the interrupted task.
    activeSelectionMode = "auto";
    rightRailMode = "plan";
    showProductToast("Adjustment ready — review the changed times.");
  } else {
    activeSelectionMode = "manual";
    rightRailMode = "task";
    showProductToast(
      calendarAction === "keep"
        ? "Pause saved — existing calendar times were kept."
        : calendarAction === "release" || stopReason === "blocked"
          ? "Pause saved — future sessions were removed for now."
          : "Pause saved — no calendar adjustment was needed."
    );
  }
  render();
});

function splitPauseContextNote(note) {
  const parts = String(note || "").split(/\bNext\s*:\s*/i);
  return { progress: parts[0].trim(), nextAction: (parts[1] || parts[0]).trim() };
}

function selectedPauseResumeDate(choice) {
  const value = new Date(appNow());
  if (choice === "in_10") value.setMinutes(value.getMinutes() + 10);
  else if (choice === "in_30") value.setMinutes(value.getMinutes() + 30);
  else if (choice === "choose") {
    const [hours, minutes] = String(document.getElementById("pauseResumeTime").value || "").split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    value.setHours(hours, minutes, 0, 0);
    if (value <= appNow()) value.setDate(value.getDate() + 1);
  } else return null;
  value.setMinutes(Math.ceil(value.getMinutes() / 15) * 15, 0, 0);
  return value;
}

function hourFromDate(value) {
  return value.getHours() + value.getMinutes() / 60;
}

function pauseContinuationDraft(task, resumeAt, executionSession) {
  if (!confirmedSchedulePlan?.plan_patch?.length || !resumeAt || !executionSession) return { plan: null, error: null };
  const today = (appNow().getDay() + 6) % 7;
  const resumeDay = (resumeAt.getDay() + 6) % 7;
  if (resumeDay !== today) return { plan: null, error: null };
  const source = confirmedSchedulePlan.plan_patch.map((block) => ({ ...block }));
  const activeIndex = source.findIndex((block) => String(block.block_id) === String(executionSession.block_id));
  if (activeIndex < 0) return { plan: null, error: null };
  const active = source[activeIndex];
  const resumeStart = Math.ceil(hourFromDate(resumeAt) * 4) / 4;
  const remainingMinutes = Math.max(15, Number(executionSession.session_remaining_minutes ?? taskWorkRemainingMinutes(task) ?? 15));
  const continuationEnd = Math.ceil((resumeStart + remainingMinutes / 60) * 4) / 4;
  const available = parseAvailableWindows(currentProfile).filter((window) => Number(window.day_index) === today);
  const containing = available.find((window) => resumeStart >= Number(window.start) - 0.001 && continuationEnd <= Number(window.end) + 0.001);
  if (!containing) {
    return { plan: null, error: `${task.title} cannot resume at ${formatHour(resumeStart)} because ${remainingMinutes} minutes do not fit inside today's available time.` };
  }
  const hard = hardConstraintIntervals(currentProfile).intervals.filter((item) => Number(item.day_index) === today);
  const directConflict = hard.find((item) => resumeStart < Number(item.end) && Number(item.start) < continuationEnd);
  if (directConflict) {
    return { plan: null, error: `Continuing ${task.title} until ${formatHour(continuationEnd)} overlaps ${analysisDisplayText(directConflict.label)} at ${formatHour(directConflict.start)}–${formatHour(directConflict.end)}.` };
  }
  const restHours = Math.max(15, Math.round(Number(currentProfile.task_preferences?.rest_between_tasks_minutes || 15) / 15) * 15) / 60;
  const future = source
    .map((block, index) => ({ ...block, _index: index }))
    .filter((block) => block._index !== activeIndex && Number(block.day_index) === today && Number(block.start) >= currentHourFloat() - 0.001)
    .sort((left, right) => Number(left.start) - Number(right.start));
  const changedBlockIds = [String(active.block_id)];
  const changes = [];
  active.start = resumeStart;
  active.end = continuationEnd;
  active.session_minutes = Math.round((continuationEnd - resumeStart) * 60);
  active.planned_work_minutes = remainingMinutes;
  active.padding_minutes = Math.max(active.session_minutes - remainingMinutes, 0);
  active.execution_continuation = true;
  active.draft_changed = true;
  let cursor = continuationEnd;
  for (const block of future) {
    const originalStart = Number(block.start);
    const duration = Number(block.end) - originalStart;
    if (originalStart >= cursor + restHours - 0.001) {
      cursor = Number(block.end);
      continue;
    }
    let candidateStart = Math.ceil((cursor + restHours) * 4) / 4;
    let candidateEnd = candidateStart + duration;
    const window = available.find((item) => candidateStart >= Number(item.start) - 0.001 && candidateEnd <= Number(item.end) + 0.001);
    const collision = hard.find((item) => candidateStart < Number(item.end) && Number(item.start) < candidateEnd);
    if (!window || collision) {
      const obstacle = collision ? `${analysisDisplayText(collision.label)} ${formatHour(collision.start)}–${formatHour(collision.end)}` : "the end of today's available time";
      const affectedTask = tasks.find((item) => String(item.id) === String(block.task_id));
      return { plan: null, error: `Resuming at ${formatHour(resumeStart)} would leave no valid time for ${affectedTask?.title || "the next task"} before ${obstacle}. Choose another time.` };
    }
    const deadlineTask = tasks.find((item) => String(item.id) === String(block.task_id));
    const deadlineDay = deadlineTask ? dayIndexFromDue(deadlineTask.due) : null;
    const deadlineHour = deadlineTask ? parseDueStartHour(deadlineTask.due) : null;
    if (deadlineDay !== null && (today > deadlineDay || (today === deadlineDay && deadlineHour !== null && candidateEnd > deadlineHour + 0.001))) {
      return { plan: null, error: `Moving ${deadlineTask?.title || "the next task"} to ${formatHour(candidateStart)}–${formatHour(candidateEnd)} would miss its deadline.` };
    }
    source[block._index] = { ...source[block._index], start: candidateStart, end: candidateEnd, draft_changed: true };
    changedBlockIds.push(String(block.block_id));
    changes.push(`${deadlineTask?.title || "Task"} ${formatHour(originalStart)} → ${formatHour(candidateStart)}`);
    cursor = candidateEnd;
  }
  return {
    plan: {
      request_id: `pause-local-${Date.now()}`,
      week_id: confirmedSchedulePlan.week_id || currentProfile.active_week_id || weekStartLabel(),
      plan_patch: source,
      validation: { valid: true, violations: [] },
      unscheduled_tasks: [],
      explanation: changes.length
        ? `Resuming at ${formatHour(resumeStart)} affects only later work today: ${changes.join("; ")}.`
        : `The remaining work will continue at ${formatHour(resumeStart)} without moving another session.`,
      local_adjustment: {
        scope: "today_after_pause",
        day_index: today,
        task_id: task.id,
        changed_block_ids: changedBlockIds,
        changes
      },
      ai_provenance: confirmedSchedulePlan.decision?.ai_provenance || {},
      ai_analysis: confirmedSchedulePlan.decision?.ai_analysis || {},
      ai_task_analysis: confirmedSchedulePlan.decision?.ai_task_analysis || {}
    },
    error: null
  };
}

document.getElementById("pauseResumeChoice")?.addEventListener("change", (event) => {
  document.getElementById("pauseResumeTimeField").classList.toggle("hidden", event.target.value !== "choose");
});

pauseForm.dataset.modernPause = "1";
pauseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const task = tasks.find((item) => String(item.id) === String(pauseDialog.dataset.taskId));
  if (!task) return;
  const stopReason = document.querySelector('input[name="stopReason"]:checked')?.value || "other";
  const { progress, nextAction } = splitPauseContextNote(document.getElementById("pauseContextNote").value.trim());
  const resumeChoice = document.getElementById("pauseResumeChoice").value;
  const resumeAt = selectedPauseResumeDate(resumeChoice);
  if (resumeChoice === "choose" && !resumeAt) {
    document.getElementById("pauseResumeTime").setCustomValidity("Choose a valid resume time.");
    document.getElementById("pauseResumeTime").reportValidity();
    return;
  }
  const trackedMinutes = Number(currentExecutionState?.session?.live_active_minutes ?? pauseDialog.dataset.trackedActiveMinutes ?? 0);
  if (backendOnline) {
    await api("/api/context-dumps", {
      method: "POST",
      body: JSON.stringify({ user_id: currentUserId(), task_id: task.id, stop_reason: stopReason, progress, next_action: nextAction })
    });
  }
  task.status = stopReason === "blocked" ? "blocked" : "paused";
  task.contextWindow = {
    ...normalizeContextWindow(task),
    progress,
    nextStep: nextAction,
    interruption: {
      stopped_at: appNow().toISOString(),
      reason: stopReason,
      resume_choice: resumeChoice,
      expected_resume_at: resumeAt?.toISOString() || null,
      tracked_active_minutes: trackedMinutes
    }
  };
  task.execution = {
    ...(task.execution || {}),
    last_stop_reason: stopReason,
    accumulated_actual_minutes: Number(task.execution?.accumulated_actual_minutes || 0)
  };
  await patchBackendTask(task);
  pauseDialog.close("saved");
  activeId = task.id;
  activeSelectionMode = "auto";
  rightRailMode = "plan";
  if (resumeChoice === "reschedule" && stopReason !== "blocked") {
    const localDraft = await requestTentativeSchedule(
      "Reschedule only this interrupted task's remaining work. Keep every unaffected session and date unchanged; preserve active time, fixed events and unavailable time.",
      [task]
    );
    if (localDraft?.plan_patch?.length && confirmedSchedulePlan?.plan_patch?.length) {
      const unchanged = confirmedSchedulePlan.plan_patch.filter((block) => String(block.task_id) !== String(task.id));
      pendingSchedulePlan.plan_patch = [...unchanged, ...localDraft.plan_patch];
      pendingSchedulePlan.local_adjustment = { task_id: task.id, scope: "affected_task_only", untouched_block_count: unchanged.length };
      recalculateAllPendingTaskSessions();
    }
    showProductToast("Pause saved · review the proposed continuation time.");
  } else if (resumeAt && stopReason !== "blocked") {
    const local = pauseContinuationDraft(task, resumeAt, currentExecutionState?.session);
    if (local.error) {
      showProductToast(local.error);
    } else if (local.plan) {
      pendingSchedulePlan = local.plan;
      recalculateAllPendingTaskSessions();
      showProductToast(local.plan.local_adjustment.changes.length
        ? "Pause saved · review the affected times for today."
        : `Pause saved · continuation set for ${resumeAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
    }
  } else {
    showProductToast(resumeAt
      ? `Paused · expected resume ${resumeAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
      : "Pause saved.");
  }
  render();
});

feedbackForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const task = selectedTask();
  if (!task) return;
  const completion = document.getElementById("feedbackCompletion").value;
  const nextPreference = document.getElementById("feedbackNextPreference").value;
  const progress = document.getElementById("feedbackProgress").value.trim();
  const nextAction = document.getElementById("feedbackNextStep").value.trim();
  const parallelSession = parallelGroupForTask(task);
  const feedbackSession = currentExecutionState?.session?.execution_session_id === feedbackDialog.dataset.executionSessionId
    ? currentExecutionState.session
    : executionSessionForTask(task);
  const earlyMinutes = feedbackSession?.actual_end_at && feedbackSession?.planned_end_at
    ? Math.max(Math.floor((new Date(feedbackSession.planned_end_at) - new Date(feedbackSession.actual_end_at)) / 60000), 0)
    : 0;
  const payload = {
    user_id: currentUserId(), task_id: task.id, trigger: "task_block_ended",
    execution_session_id: feedbackDialog.dataset.executionSessionId || null,
    request_id: `feedback-${feedbackDialog.dataset.executionSessionId || task.id}-${Date.now()}`,
    task_evaluation: {
      completion,
      progress,
      next_action: nextAction,
      perceived_difficulty: Number(document.getElementById("feedbackDifficulty").value) || null,
      remaining_duration_minutes: completion === "completed" ? 0 : Math.max(Number(document.getElementById("feedbackRemainingMinutes").value) || 0, 0)
    },
    state_evaluation: {
      next_preference: nextPreference,
      focus: Number(focusInput.value), energy: Number(energyInput.value), stress: Number(stressInput.value), source: "self_report"
    },
    recommendation_evaluation: { rating: document.getElementById("feedbackRecommendation").value },
    parallel_evaluation: parallelSession ? {
      parallel_group_id: parallelSession.parallel_group_id,
      partner_task_ids: valueList(parallelSession.parallel_task_ids).filter((id) => String(id) !== String(task.id)),
      experience: document.getElementById("feedbackParallelExperience").value,
      source: "user_post_session_report"
    } : null
  };
  let savedFeedback = null;
  if (backendOnline) savedFeedback = await api("/api/execution-feedback", { method: "POST", body: JSON.stringify(payload) });
  if (backendOnline && ["partial", "no_progress"].includes(completion)) {
    await api("/api/context-dumps", {
      method: "POST",
      body: JSON.stringify({
        user_id: currentUserId(), task_id: task.id,
        stop_reason: completion === "no_progress" ? "no_progress" : "session_ended",
        progress, next_action: nextAction
      })
    });
  }
  if (completion === "completed") task.status = "completed";
  task.execution = {
    ...(task.execution || {}),
    original_estimate_minutes: Number(task.execution?.original_estimate_minutes ?? task.duration ?? 0),
    accumulated_actual_minutes: Number(savedFeedback?.task?.execution?.accumulated_actual_minutes ?? task.execution?.accumulated_actual_minutes ?? 0),
    remaining_duration_minutes: Number(savedFeedback?.task?.execution?.remaining_duration_minutes ?? payload.task_evaluation.remaining_duration_minutes),
    last_perceived_difficulty: payload.task_evaluation.perceived_difficulty
  };
  if (["partial", "no_progress"].includes(completion)) {
    task.contextWindow = {
      ...normalizeContextWindow(task),
      progress: progress || normalizeContextWindow(task).progress,
      nextStep: nextAction || normalizeContextWindow(task).nextStep
    };
    task.checkpoints = [
      ...(task.checkpoints || []),
      { label: "Session outcome", text: completion === "no_progress" ? "Worked, no progress" : "Made progress" },
      { label: "Current progress", text: progress || "Not provided" },
      { label: "Next step", text: nextAction || "Choose one concrete step when resuming." }
    ];
    await patchBackendTask(task);
  }
  if (payload.parallel_evaluation) {
    task.checkpoints = [
      ...(task.checkpoints || []),
      { label: "Parallel experience", text: `${payload.parallel_evaluation.experience} (${payload.parallel_evaluation.parallel_group_id})` }
    ];
    await patchBackendTask(task);
  }
  const nextLabels = { continue: "continue the current plan", rest: "take a break", reduce: "reduce the current task", switch: "switch to an easier task" };
  showProductToast(`Feedback saved. Next: ${nextLabels[nextPreference]}.`);
  feedbackDialog.close("saved");
  delete feedbackDialog.dataset.executionSessionId;
  if (backendOnline) currentExecutionState = await optionalApi(`/api/execution-sessions/current?user_id=${currentUserId()}`, null);
  activeSelectionMode = "auto";
  rightRailMode = "plan";
  document.getElementById("parallelFeedbackField")?.classList.add("hidden");
  render();
  if (completion === "completed" && earlyMinutes > 0) {
    const earlyDialog = document.getElementById("earlyFinishDialog");
    earlyDialog.dataset.minutes = String(earlyMinutes);
    document.getElementById("earlyFinishTitle").textContent = `Finished ${earlyMinutes} minutes early — great work.`;
    earlyDialog.showModal();
  }
});

document.getElementById("keepEarlyTimeFreeBtn")?.addEventListener("click", () => {
  document.getElementById("earlyFinishDialog")?.close("keep-free");
  showProductToast("Free time kept open.");
});

document.getElementById("updateTodayAfterEarlyBtn")?.addEventListener("click", async () => {
  document.getElementById("earlyFinishDialog")?.close("update-today");
  const today = (appNow().getDay() + 6) % 7;
  const affected = tasks.filter((task) => !["completed", "terminated", "running", "paused"].includes(task.status)
    && taskSlotSessions(task).some((session) => Number(session.day_index) === today && Number(session.start) >= currentHourFloat()));
  if (!affected.length) {
    showProductToast("No later work needs to move. The time stays free.");
    return;
  }
  const draft = await requestTentativeSchedule("Update only today's not-yet-started sessions after an early finish. Preserve every other date and all fixed or unavailable time.", affected);
  if (draft?.plan_patch?.length && confirmedSchedulePlan?.plan_patch?.length) {
    const affectedIds = new Set(affected.map((task) => String(task.id)));
    const unchanged = confirmedSchedulePlan.plan_patch.filter((block) => Number(block.day_index) !== today || !affectedIds.has(String(block.task_id)));
    pendingSchedulePlan.plan_patch = [...unchanged, ...draft.plan_patch.filter((block) => Number(block.day_index) === today)];
    pendingSchedulePlan.local_adjustment = { scope: "today_after_early_finish", day_index: today };
    recalculateAllPendingTaskSessions();
    render();
  }
});

document.getElementById("feedbackCompletion")?.addEventListener("change", (event) => {
  const task = selectedTask();
  if (!task) return;
  const outcome = event.target.value;
  const trackedMinutes = Number(feedbackDialog.dataset.trackedActiveMinutes || 0);
  const remaining = feedbackRemainingEstimate(task, outcome, trackedMinutes);
  document.getElementById("feedbackRemainingMinutes").value = remaining;
  document.getElementById("feedbackRemainingSummary").textContent = `${remaining} min`;
  document.getElementById("feedbackRemainingReview").classList.toggle("hidden", outcome === "completed");
});

dayViewBtn.addEventListener("click", () => {
  calendarView = "day";
  render();
});

viewFullDayBtn?.addEventListener("click", () => { calendarView = "day"; render(); });
executionViewWeekBtn?.addEventListener("click", () => { calendarView = "week"; render(); });
executionEditPlanBtn?.addEventListener("click", async () => {
  await requestTentativeSchedule("Create one adjustment draft from the confirmed plan. Preserve unchanged sessions and validate every hard constraint.");
  render();
});

weekViewBtn.addEventListener("click", () => {
  calendarView = "week";
  render();
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (editingTaskId) {
    const index = tasks.findIndex((task) => task.id === editingTaskId);
    if (index >= 0) {
      const previous = tasks[index];
      const updated = normalizeBackendTask(taskPayloadFromDialog(editingTaskId, previous));
      const scheduleChanged = ["title", "due", "duration", "priority", "expected_difficulty", "status"]
        .some((field) => String(previous[field] ?? "") !== String(updated[field] ?? ""));
      tasks[index] = updated;
      selectTask(updated.id, "manual");
      await patchBackendTask(updated);
      addChatMessage("ai", "Task updated", `${updated.title} was updated. ${stateBasedScheduleNote(updated)}`);
      setBackendStatus("Task updated", backendOnline);
      if (scheduleChanged && !["completed", "terminated", "blocked", "paused"].includes(updated.status)) {
        pendingSchedulePlan = null;
        await requestTentativeSchedule(`“${updated.title}” changed. Regenerate one complete draft plan and keep every hard constraint valid.`);
      }
    }
  } else {
    const id = `task-${Date.now()}`;
    const task = taskPayloadFromDialog(id, {});
    const created = await createTaskFromPayload(task);
    tasks.push(created);
    selectTask(created.id, "manual");
    addChatMessage("ai", "Task added manually", `${created.title} was added to the calendar view.`);
    setBackendStatus("Task saved", backendOnline);
  }
  editingTaskId = null;
  deleteTaskBtn.classList.add("hidden");
  dialog.close("saved");
  render();
});

deleteTaskBtn.addEventListener("click", async () => {
  if (!editingTaskId) return;
  await deleteTaskById(editingTaskId, true);
});

document.getElementById("saveProfileBtn").addEventListener("click", () => {
  saveProfileToBackend().catch((error) => {
    setBackendStatus("Save failed", false);
    console.error(error);
  });
});

openProfileWizardBtn.addEventListener("click", () => {
  showProfileSetup();
});

profileWizard.addEventListener("submit", (event) => {
  event.preventDefault();
  syncStructuredContextFields();
  wizardError.textContent = "Generating your proposed weekly plan…";
  saveWizardBtn.disabled = true;
  saveWizardBtn.textContent = "Generating…";
  saveWizardProfile(true).catch((error) => {
    wizardError.textContent = error.message || "The plan could not be generated. Try again shortly.";
    wizardError.scrollIntoView({ behavior: "smooth", block: "center" });
    console.error(error);
  }).finally(() => {
    saveWizardBtn.disabled = false;
    saveWizardBtn.textContent = "Generate weekly plan";
  });
});
profileWizard.addEventListener("input", saveOnboardingDraft);
profileWizard.addEventListener("change", saveOnboardingDraft);

wizardNextBtn.addEventListener("click", () => setWizardStep("rhythm"));
wizardBackBtnRhythm?.addEventListener("click", () => setWizardStep("profile"));
wizardNextBtnRhythm?.addEventListener("click", () => setWizardStep("context"));
wizardBackBtnContext?.addEventListener("click", () => setWizardStep("rhythm"));
wizardNextBtnContext?.addEventListener("click", () => {
  syncStructuredContextFields();
  if (!wizardAvailableWindows.value.trim()) {
    wizardError.textContent = "Add at least one available-time window before entering tasks.";
    return;
  }
  wizardError.textContent = "";
  setWizardStep("tasks");
});
wizardBackBtn.addEventListener("click", () => setWizardStep("context"));
addWeeklyTaskBtn.addEventListener("click", () => addWeeklyTaskRow());
addAvailableWindowBtn?.addEventListener("click", () => addAvailableWindowRow());
addFixedEventBtn?.addEventListener("click", () => addFixedEventRow());
addTemporaryConstraintBtn?.addEventListener("click", () => addTemporaryConstraintRow());
document.getElementById("contextEventType")?.addEventListener("change", updateContextEventDialogMode);
document.getElementById("closeContextEventDialogBtn")?.addEventListener("click", () => contextEventDialog.close("cancel"));
contextEventForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  saveContextEventFromDialog().catch((error) => {
    document.getElementById("contextEventHint").textContent = error.message;
    console.error(error);
  });
});
document.getElementById("deleteContextEventBtn")?.addEventListener("click", () => {
  deleteContextEvent().catch((error) => console.error(error));
});
[wizardAvailableWindows, wizardFixedEvents, wizardTemporaryConstraints, wizardNearDeadlines, wizardKeepBuffer].forEach((input) => {
  input.addEventListener("input", updateWizardWeekPreview);
  input.addEventListener("change", updateWizardWeekPreview);
});

function updateMomentaryStateValues() {
  const pairs = [
    [wizardFocus, "wizardFocusValue"],
    [wizardEnergy, "wizardEnergyValue"],
    [wizardStress, "wizardStressValue"],
    [focusInput, "focusValue"],
    [energyInput, "energyValue"],
    [stressInput, "stressValue"]
  ];
  pairs.forEach(([input, outputId]) => {
    const output = document.getElementById(outputId);
    if (input && output) output.textContent = `${input.value}/7`;
  });
}

[wizardFocus, wizardEnergy, wizardStress, focusInput, energyInput, stressInput].forEach((input) => {
  input?.addEventListener("input", updateMomentaryStateValues);
});
updateMomentaryStateValues();

[dailyFocus, dailyEnergy, dailyStress].forEach((input) => input?.addEventListener("input", updateDailyCheckInValues));
dailyCheckInForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  focusInput.value = dailyFocus.value;
  energyInput.value = dailyEnergy.value;
  stressInput.value = dailyStress.value;
  emotionInput.value = dailyEmotion.value;
  updateMomentaryStateValues();
  markDailyCheckInSeen();
  const changeNote = dailyChangeNote.value.trim();
  dailyCheckInDialog.close("updated");
  await saveRuntimeStateToBackend({ daily_checkin: true, daily_note: changeNote }).catch((error) => console.error(error));
  setBackendStatus("Today’s state will only affect the next unstarted session", true);
  render();
  if (changeNote) await handleChatTurn(changeNote);
});
keepTodayPlanBtn?.addEventListener("click", async () => {
  markDailyCheckInSeen();
  dailyCheckInDialog.close("kept");
  await saveRuntimeStateToBackend({ daily_checkin: true }).catch((error) => console.error(error));
  setBackendStatus("Today’s plan kept", true);
});
skipDailyCheckInBtn?.addEventListener("click", () => {
  markDailyCheckInSeen();
  dailyCheckInDialog.close("skipped");
  saveRuntimeStateToBackend({ daily_checkin: true }).catch((error) => console.error(error));
});
weekRolloverForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  applyWeekRollover(true).catch((error) => setBackendStatus(error.message, false));
});
startFreshWeekBtn?.addEventListener("click", () => {
  applyWeekRollover(false).catch((error) => setBackendStatus(error.message, false));
});

loginModeBtn.addEventListener("click", () => setAuthMode("login"));
registerModeBtn.addEventListener("click", () => setAuthMode("register"));

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuth();
});

logoutBtn.addEventListener("click", () => {
  if (STATIC_SHARE_MODE) save();
  currentUser = null;
  currentProfile = createDefaultProfile();
  tasks = STATIC_SHARE_MODE ? [] : cloneSeedTasks();
  activeSelectionMode = "auto";
  activeId = defaultActiveTaskId();
  lastDecision = null;
  localStorage.removeItem("humanosSyy7User");
  localStorage.removeItem("humanosSyy7MotionTasks");
  localStorage.removeItem("humanosSyy7Profile");
  syncProfileForm();
  profileScreen.classList.add("hidden");
  appRoot.classList.add("hidden");
  setAuthMode("login");
  showAuth();
  render();
});

// Always require an explicit login after a page load. Previously a saved user
// was restored in the background while the auth card was still visible. If the
// visitor opened the Sign up tab during that brief interval, the old session
// could suddenly open the calendar and look like an unsubmitted registration.
if (currentUser) {
  currentUser = null;
  localStorage.removeItem("humanosSyy7User");
}
setAuthMode("login");
render();
if (STATIC_SHARE_MODE) loadStaticShare();
else loadBackendState();
setInterval(() => {
  if (currentUser && !appRoot.classList.contains("hidden")) {
    checkTaskTimePrompts(false);
  }
}, 60000);
