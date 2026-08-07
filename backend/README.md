# HumanOS Backend MVP

This backend supports the current HumanOS prototype with:

- user profile persistence;
- task persistence;
- runtime state check-ins;
- context dumps;
- re-entry prompts;
- schedule decisions;
- local embedding-based personalization memory.
- LangGraph multi-agent orchestration for schedule decisions.
- optional DeepSeek refinement for schedule explanations.
- joint task/environment + user state decisions;
- candidate-action and qualitative next-state comparison;
- execution feedback and state-transition records;
- episodic-memory pattern candidates and confirmed learned patterns.

It uses Python, SQLite, LangGraph when available, and the cross-platform
`tzdata` package for IANA time zones. The local
embedding model is a deterministic hash embedding (`humanos-local-hash-embedding-v1`)
so the MVP can run without API keys. It can later be replaced with FastAPI and
pgvector/Chroma.

`backend/humanos_graph.py` uses LangGraph's `StateGraph` when `langgraph` is
installed. If the package is not installed, it runs the same Profile -> State ->
Memory -> Scheduler -> Explanation -> Confirmation nodes sequentially so the
prototype remains runnable.

## Run

```bash
backend/.venv/bin/python backend/humanos_server.py
```

Optional LangGraph install:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

Optional DeepSeek configuration:

```bash
export DEEPSEEK_API_KEY="..."
export DEEPSEEK_MODEL="deepseek-chat"
```

Do not commit API keys. When `DEEPSEEK_API_KEY` is missing or the provider is
unavailable, plan generation returns an explicit unavailable result. HumanOS
does not silently substitute a local scheduler for AI plan creation.

Backend URL:

```text
http://127.0.0.1:8787
```

Frontend prototype:

```text
http://127.0.0.1:8766/prototype/humanos-motion-prototype/index.html
```

When the backend is running, the frontend shows saved/sync status in the
preferences panel and syncs profile/tasks/context dumps to SQLite.

## Data

SQLite database:

```text
backend/data/humanos.db
```

Tables:

```text
profiles
tasks
runtime_states
context_dumps
execution_feedback
state_transitions
memories
events
```

The `memories` table stores embedding vectors for profile answers, tasks,
context dumps, and later reflections/user feedback.

## Key APIs

```text
GET  /api/health
POST /api/auth/register
POST /api/auth/login
GET  /api/profile?user_id=demo
PUT  /api/profile?user_id=demo
GET  /api/tasks?user_id=demo
POST /api/tasks?user_id=demo
PATCH /api/tasks/{task_id}
POST /api/state-checkins
POST /api/context-dumps
POST /api/schedules/decide
POST /api/reentry
POST /api/execution-feedback
POST /api/state-transitions
GET  /api/patterns/candidates?user_id=demo
POST /api/patterns/promote
GET  /api/memories/search?user_id=demo&q=...
```

Authentication is MVP-grade. Register/login returns a `user.id`; the frontend
stores it in localStorage and sends it as `user_id` for profile, task, context,
memory, and scheduling calls. This is enough to test per-user data deposition,
but production should replace it with real sessions/OAuth/JWT.

## Personalization Flow

```text
profile/task/context dump/reflection
  -> local embedding
  -> memories table
  -> semantic retrieval
  -> LangGraph schedule nodes
  -> schedule decision / re-entry prompt
```

Embedding memory does not replace the scheduler. It provides personalized
evidence to the scheduler, such as similar interruptions, previous rejected
plans, and successful re-entry patterns.

## Prompt Benchmark

Run all 48 cases three times against DeepSeek:

```bash
python backend/run_prompt_benchmark.py --runs 3
```

Useful development commands:

```bash
# Two-case API smoke test
python backend/run_prompt_benchmark.py --limit 2 --runs 2

# Only temporal semantics
python backend/run_prompt_benchmark.py --category temporal_semantics --runs 3

# CI-like failure when any API call or scored expectation fails
python backend/run_prompt_benchmark.py --runs 3 --strict
```

The runner imports `task_parsing_messages()` and
`behavior_feature_messages()` from `humanos_server.py`, so benchmark and
production cannot silently drift to different prompt text. If the API key is
missing or a model call fails, the report records an API failure; it never
substitutes the local parser.
