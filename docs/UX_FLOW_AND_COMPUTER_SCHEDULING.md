# HumanOS UX flow and its computer-scheduling model

Last updated: 2026-08-13  
Applies to: `humanos-v4-zhj`

## 1. Design principle

HumanOS treats a weekly plan as a user-confirmed schedule rather than an autonomous calendar overwrite. DeepSeek proposes decisions that require semantic understanding; Python checks deterministic constraints; the user confirms any calendar revision before it becomes active.

The execution flow follows the same idea as an operating-system scheduler:

- a **Task** is persistent work, similar to a process or job;
- a **Session** is one scheduled execution interval, similar to a CPU time slice;
- the **Ready Queue** contains work that can run now;
- **Running**, **Paused**, **Ended**, and **Completed** are distinct states;
- an **Interrupt** saves execution state before HumanOS decides what can happen next;
- a **Plan Revision** is a proposed reschedule and does not replace the active plan until the user applies it.

## 2. Weekly planning UX

### User flow

1. The user enters stable working rhythm and the current week's availability.
2. The user enters protected time, routine windows, flexible activities, weekly tasks, deadlines, durations, priorities, and task demand.
3. DeepSeek analyses task semantics, dependencies, resource demands, cognitive demand, and possible low-conflict parallel pairs.
4. DeepSeek generates concrete candidate Session times. Python validates availability, protected time, deadline, dependency, overlap, the 15-minute grid, remaining duration, and confirmed parallel groups.
5. If a candidate is invalid, Python returns concrete violations to DeepSeek for repair. Intermediate failures remain internal.
6. HumanOS presents one recommended Draft Plan. Alternative candidates remain optional technical detail.
7. The user adjusts the draft and confirms it once with **Add plan to calendar**.
8. Only this action creates the confirmed Plan Revision and its Execution Sessions.

### Scheduling interpretation

- Weekly tasks are the job set.
- Available time is processor capacity.
- Fixed events are non-preemptible reserved intervals.
- Routine windows are movable soft reservations within a bounded envelope.
- Flexible activities are schedulable low-demand work.
- Deadline and dependency checks are hard feasibility constraints.
- Task demand, working rhythm, current state, switching cost, and buffer are ranked optimisation criteria.

## 3. Daily check-in

The daily check-in records the user's current focus, energy, stress, and mood. This momentary state affects only today's next Session choice and Session size. It must not be projected across the entire week.

- High focus and adequate energy favour an important, demanding Ready task.
- Low focus, low energy, or high stress favour a light task or a shorter checkpoint.
- A fixed event, deadline, or unavailable window can override this preference, but the reason must be concrete.

This corresponds to dynamic priority adjustment at dispatch time. The weekly plan remains the baseline, while the next dispatch can respond to current runtime conditions.

## 4. Starting and running a Session

When the user selects **Start**, HumanOS changes the Execution Session from `ready` to `running` and stores `actual_start_at` and `resumed_at` in the backend. The visible timer is derived from backend timestamps, so changing browser tabs or temporarily closing the page does not reset tracked work.

This corresponds to dispatching one Ready job onto the processor. Browser UI state is not the source of truth; the persisted backend execution state is.

## 5. Pause as an Interrupt

Pressing **Pause** immediately stops the active timer and saves:

- `task_id` and `execution_session_id`;
- accumulated active minutes;
- remaining Session and Task work;
- the current Plan Revision;
- the interruption reason and, when needed, progress and next action.

This is an Interrupt plus context save. The Task moves from `running` to `paused`; capturing context alone does not rewrite the calendar.

### 5.1 Take a short break — Timed Waiting

The Task enters a bounded waiting period of 5, 10, 15, or a chosen number of minutes. Because the user intends to resume the same Task, HumanOS does not require a full context dump.

- If buffer or slack absorbs the break, the confirmed plan stays unchanged.
- If resuming would affect a future flexible Session, HumanOS explains that local impact after the break.
- A fixed event is never pushed.

This corresponds to timed waiting followed by returning the same job to the Ready Queue.

### 5.2 Continue this task later — Suspension

The user saves where they stopped and the first step to take on return, then chooses a preferred resume time or asks HumanOS to recommend one.

HumanOS retains the same Task identity, progress, remaining work, and interruption history. It checks availability, fixed events, deadlines, dependencies, and downstream Sessions. If a change is needed, it produces a local Calendar Diff. The confirmed calendar changes only after **Apply changes**.

This corresponds to suspension with a saved process context and later re-admission to the Ready Queue.

### 5.3 Switch to another task — Preemption and context switch

HumanOS saves the current Task context and selects another Ready Task. If the user chooses the next Task directly, the system only checks readiness, dependencies, and whether the remaining interval is suitable. If the user asks HumanOS to choose, current focus, energy, and stress participate in ranking the Ready Queue.

The replacement Task can start immediately. Only affected future Slots are reconsidered, and any Calendar Diff still requires user confirmation.

This corresponds to preemption followed by a context switch.

### 5.4 Help me decide — Scheduler decision

HumanOS compares a short break, continuation later, and switching tasks. DeepSeek interprets the interruption reason and task semantics; Python validates the proposed action against the calendar and deadline capacity.

If deadline capacity is insufficient, HumanOS only asks the user to:

- add available time; or
- keep the current constraints and accept the risk.

It does not silently move a deadline.

This corresponds to a scheduler policy decision made from the Ready Queue, runtime state, remaining work, and hard reservations.

## 6. Finish behavior

### 6.1 Finish early or on time — normal termination

Pressing **Finish session** ends timing and opens one outcome feedback step. HumanOS does not ask whether the user wants to move the Session and does not automatically fill the freed time.

The user records one of:

- finished the whole Task;
- made progress;
- worked with no progress;
- did not start, only when no active work was recorded.

After feedback, the Task is updated while the existing calendar stays unchanged. Finishing the whole Task marks it completed. Partial work returns the remaining Task work to the Ready Queue.

This corresponds to normal termination and accounting. Early completion releases capacity, but released capacity remains idle unless a later explicit planning action uses it.

### 6.2 Minor delay — tolerated execution variance

A finish less than 15 minutes after the planned Session end is recorded as `late_within_tolerance`. This avoids treating interaction latency or a very small overrun as a scheduling failure. It does not automatically create a Plan Revision.

### 6.3 Finish materially late — overrun failure and local reschedule

A finish at least 15 minutes after `planned_end_at` is recorded as:

- `timing_outcome = overrun_failure`;
- `overrun_minutes`;
- one `execution_overrun_failed` event;
- one state-transition outcome containing the timing result.

After the user saves the Session outcome, HumanOS identifies only affected downstream work in the current day and queues a local replan with trigger `execution_overrun`. Completed execution is preserved. Unaffected tasks and fixed events stay in place.

The local replan is a draft Calendar Diff. The confirmed Plan remains active until the user reviews and applies the revision. If no downstream work is affected, HumanOS records the failure but does not create an unnecessary replan.

This corresponds to an execution overrun or missed time-slice boundary, followed by incremental rescheduling rather than a destructive rebuild of the full schedule.

## 7. Session-end feedback

Session-end feedback updates three different objects:

1. **Task result:** completion, progress, next step, actual minutes, and remaining work.
2. **Runtime state:** optional focus, energy, and stress after the Session.
3. **Recommendation feedback:** whether an AI suggestion was accepted and whether it worked.

These records become episodic evidence. Repeated observations may inform later scheduling, but a single event does not become a stable user trait.

## 8. Local rescheduling policy

HumanOS always tries the smallest safe change:

1. absorb variance with current Session slack, buffer, or unused availability;
2. preserve completed/running Sessions and all fixed events;
3. release only affected future Slots;
4. ask DeepSeek for new concrete times;
5. validate the result with Python;
6. show a local Calendar Diff;
7. activate the new Plan Revision only after user confirmation.

This is incremental scheduling with protected committed work. It prevents a small interruption from causing an unnecessary full-week reshuffle.

## 9. DeepSeek, Python, and user responsibilities

| Actor | Responsibility |
| --- | --- |
| DeepSeek | Understand task meaning, demand, dependencies, interruption context, parallel compatibility, candidate comparison, and proposed concrete Session times. |
| Python | Enforce available windows, fixed events, deadline, dependency, duration conservation, overlap rules, the 15-minute grid, Plan versioning, and idempotent persistence. |
| User | Supply constraints, adjust drafts, choose optional parallel work, resolve genuine capacity decisions, and confirm a Plan Revision. |

## 10. Core state transitions

| User action | Before | After | Scheduling meaning |
| --- | --- | --- | --- |
| Start | `ready` | `running` | Dispatch |
| Pause | `running` | `paused` | Interrupt and context save |
| Resume | `paused` | `running` | Return from waiting/suspension |
| Switch | current `running` | current `paused`, selected `running` | Preemption and context switch |
| Finish session | `running` or `paused` | `ended` | Stop execution clock; await result accounting |
| Feedback: completed | `ended` | Session `completed`, Task `completed` | Normal termination |
| Feedback: partial/no progress | `ended` | Session settled, Task `queued` | Remaining work returns to Ready Queue |
| Finish at least 15 minutes late | `ended` | `overrun_failure` recorded | Incremental rescheduling request |
| Apply Calendar Diff | confirmed revision N | confirmed revision N+1 | Atomic plan revision activation |

## 11. Research events retained by the backend

The backend keeps auditable events without exposing developer logs in the ordinary UI, including:

- Session start, pause, resume, end, and feedback transitions;
- Context Dump and interruption reason;
- accepted or rejected recommendations;
- `execution_overrun_failed` and its measured minutes;
- `execution_overrun_replan_requested` and affected Task IDs;
- Plan Revision generation and confirmation.

These events support later analysis of interruptions, overruns, recommendation quality, and scheduling adaptation while keeping the user-facing flow lightweight.
