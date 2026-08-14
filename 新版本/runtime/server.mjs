import http from "node:http";
import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const ROOT = process.env.HUMANOS_ROOT || "/root/humanos-app";
const USER_ID = process.env.HUMANOS_DEFAULT_USER || "default";
const PORT = Number(process.env.PORT || 8787);
const workspace = path.join(ROOT, "data", "users", USER_ID);
const skillRoot = path.join(ROOT, "skills", "humanos-personal-agent");
const jobs = new Map();
const execFileAsync = promisify(execFile);

const defaults = {
  identity: { user_id: USER_ID, display_name: "Jian", timezone: "Asia/Shanghai", onboarding_status: "active" },
  profile: { raw_user_input: {}, structured_profile: {}, confirmed_preferences: [], candidate_observations: [], updated_at: null },
  state: { reported_at: null, valid_until: null, source: "default", energy: null, focus: null, focus_difficulty: null, fatigue: null, stress: null, available_minutes: null, environment: "", free_text: "" },
  tasks: { tasks: [] },
  plan: { candidate: null, active: null, history: [] },
  execution: { current: null, sessions: [], interruptions: [] },
  memory: { candidate_observations: [], confirmed_patterns: [], rejected_patterns: [] },
};

async function ensureWorkspace() {
  await fs.mkdir(workspace, { recursive: true });
  for (const [name, value] of Object.entries(defaults)) {
    const file = path.join(workspace, `${name}.json`);
    try { await fs.access(file); } catch { await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`); }
  }
  for (const name of ["history.jsonl", "conversation.jsonl", "behavior.jsonl"]) {
    const file = path.join(workspace, name);
    try { await fs.access(file); } catch { await fs.writeFile(file, ""); }
  }
}

async function appendJsonl(name, value) {
  await ensureWorkspace();
  await fs.appendFile(path.join(workspace, name), `${JSON.stringify(value)}\n`, "utf8");
}

async function atomicJson(name, value) {
  const target = path.join(workspace, name);
  const temporary = `${target}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, target);
}

async function planningContext() {
  const script = path.join(skillRoot, "scripts", "build_planning_context.py");
  const { stdout } = await execFileAsync("python3", [script, workspace], { maxBuffer: 2_000_000 });
  return stdout.trim();
}

async function snapshot() {
  await ensureWorkspace();
  const entries = await Promise.all(Object.keys(defaults).map(async (name) => [name, JSON.parse(await fs.readFile(path.join(workspace, `${name}.json`), "utf8"))]));
  return Object.fromEntries(entries);
}

async function runCodex(message) {
  const context = await planningContext();
  return new Promise((resolve, reject) => {
    const prompt = `Use the humanos-personal-agent skill.\nCURRENT_USER_WORKSPACE=${workspace}\nDETERMINISTIC_PLANNING_CONTEXT=${context}\nThe user said:\n${message}\nUse the complete planning context, including every open task, active session, confirmed preference and fresh self-reported state. If the state is stale and energy affects the decision, ask for a check-in instead of guessing. Update only appropriate files inside CURRENT_USER_WORKSPACE. Planning changes must remain candidate until explicit confirmation. Return JSON following the skill response contract.`;
    // The user's directory is the writable root. Codex can fully maintain that
    // workspace without receiving write access to application or system files.
    const child = spawn("codex", ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "--ephemeral", "-C", workspace, prompt], { cwd: workspace, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("Codex timed out")); }, 150000);
    child.stdout.on("data", (chunk) => stdout += chunk);
    child.stderr.on("data", (chunk) => stderr += chunk);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr.trim() || `Codex exited ${code}`));
      const match = stdout.match(/\{[\s\S]*\}\s*$/);
      if (match) { try { return resolve(JSON.parse(match[0])); } catch {} }
      resolve({ message: stdout.trim().split("\n").slice(-1)[0] || "已更新你的个人空间。" });
    });
  });
}

function json(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(payload) });
  response.end(payload);
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/api/snapshot") return json(response, 200, { snapshot: await snapshot() });
    if (request.method === "GET" && request.url === "/api/health") return json(response, 200, { ok: true, agent: "codex", user: USER_ID });
    if (request.method === "GET" && request.url === "/api/conversation") {
      await ensureWorkspace();
      const lines = (await fs.readFile(path.join(workspace, "conversation.jsonl"), "utf8")).trim().split("\n").filter(Boolean).slice(-100);
      return json(response, 200, { turns: lines.map((line) => JSON.parse(line)) });
    }
    if (request.method === "GET" && request.url?.startsWith("/api/jobs")) {
      const id = new URL(request.url, "http://localhost").searchParams.get("id");
      const job = id ? jobs.get(id) : null;
      return job ? json(response, 200, { job }) : json(response, 404, { error: "job_not_found" });
    }
    if (request.method === "POST" && request.url === "/api/chat") {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw || "{}");
      if (typeof body.message !== "string" || !body.message.trim()) return json(response, 400, { error: "message_required" });
      const id = randomUUID();
      await appendJsonl("conversation.jsonl", { timestamp: new Date().toISOString(), job_id: id, role: "user", content: body.message.trim() });
      jobs.set(id, { id, status: "running", created_at: new Date().toISOString() });
      runCodex(body.message.trim()).then(async (result) => {
        await appendJsonl("conversation.jsonl", { timestamp: new Date().toISOString(), job_id: id, role: "assistant", content: result.message || result.user_message || "已更新你的个人空间。", response: result });
        jobs.set(id, { id, status: "completed", response: result, snapshot: await snapshot() });
      }).catch((error) => {
        console.error(`[codex-job:${id}]`, error);
        jobs.set(id, { id, status: "failed", message: error instanceof Error ? error.message : "Codex failed" });
      });
      return json(response, 202, { job: { id, status: "running" } });
    }
    if (request.method === "POST" && request.url === "/api/state-checkin") {
      let raw = ""; for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw || "{}");
      const numeric = (name, max) => body[name] === null || body[name] === undefined || body[name] === "" ? null : Math.max(0, Math.min(max, Number(body[name])));
      const now = new Date(); const validUntil = new Date(now.getTime() + 6 * 60 * 60 * 1000);
      const state = { reported_at: now.toISOString(), valid_until: validUntil.toISOString(), source: "user_self_report", energy: numeric("energy", 100), focus: numeric("focus", 10), focus_difficulty: numeric("focus_difficulty", 10), fatigue: numeric("fatigue", 10), stress: numeric("stress", 10), available_minutes: numeric("available_minutes", 1440), environment: String(body.environment || ""), free_text: String(body.free_text || "") };
      await atomicJson("state.json", state);
      await appendJsonl("behavior.jsonl", { timestamp: now.toISOString(), type: "state_checkin", payload: state });
      return json(response, 200, { state, snapshot: await snapshot() });
    }
    if (request.method === "POST" && request.url === "/api/behavior") {
      let raw = ""; for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw || "{}");
      if (typeof body.type !== "string" || !body.type.trim()) return json(response, 400, { error: "event_type_required" });
      await appendJsonl("behavior.jsonl", { timestamp: new Date().toISOString(), type: body.type.trim(), payload: body.payload || {} });
      return json(response, 201, { saved: true });
    }
    json(response, 404, { error: "not_found" });
  } catch (error) { json(response, 500, { error: "runtime_failed", message: error instanceof Error ? error.message : "Unknown error" }); }
});

server.listen(PORT, "127.0.0.1", () => console.log(`HumanOS runtime listening on ${PORT}`));
