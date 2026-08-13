import http from "node:http";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = process.env.HUMANOS_ROOT || "/root/humanos-app";
const USER_ID = process.env.HUMANOS_DEFAULT_USER || "default";
const PORT = Number(process.env.PORT || 8787);
const workspace = path.join(ROOT, "data", "users", USER_ID);
const jobs = new Map();

const defaults = {
  identity: { user_id: USER_ID, display_name: "Jian", timezone: "Asia/Shanghai", onboarding_status: "active" },
  profile: { raw_user_input: {}, structured_profile: {}, confirmed_preferences: [], candidate_observations: [], updated_at: null },
  state: { reported_at: null, energy: 64, focus: 6.2, stress: 3.1, free_text: "" },
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
  const history = path.join(workspace, "history.jsonl");
  try { await fs.access(history); } catch { await fs.writeFile(history, ""); }
}

async function snapshot() {
  await ensureWorkspace();
  const entries = await Promise.all(Object.keys(defaults).map(async (name) => [name, JSON.parse(await fs.readFile(path.join(workspace, `${name}.json`), "utf8"))]));
  return Object.fromEntries(entries);
}

function runCodex(message) {
  return new Promise((resolve, reject) => {
    const prompt = `Use the humanos-personal-agent skill.\nCURRENT_USER_WORKSPACE=${workspace}\nThe user said:\n${message}\nUpdate only the appropriate files inside CURRENT_USER_WORKSPACE. If planning changes, create or revise a candidate plan, never silently confirm it. Return JSON following the skill response contract.`;
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
      jobs.set(id, { id, status: "running", created_at: new Date().toISOString() });
      runCodex(body.message.trim()).then(async (result) => {
        jobs.set(id, { id, status: "completed", response: result, snapshot: await snapshot() });
      }).catch((error) => {
        console.error(`[codex-job:${id}]`, error);
        jobs.set(id, { id, status: "failed", message: error instanceof Error ? error.message : "Codex failed" });
      });
      return json(response, 202, { job: { id, status: "running" } });
    }
    json(response, 404, { error: "not_found" });
  } catch (error) { json(response, 500, { error: "runtime_failed", message: error instanceof Error ? error.message : "Unknown error" }); }
});

server.listen(PORT, "127.0.0.1", () => console.log(`HumanOS runtime listening on ${PORT}`));
