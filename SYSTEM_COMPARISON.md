# HumanOS syy7: System Comparison

## Summary

The teammate prototype has a calmer onboarding experience, but the syy-v12 system has substantially more complete scheduling semantics. syy7 combines the teammate prototype's strongest information-design idea—short paginated profile setup—with the current system's scheduling, validation, interruption, and parallel-task logic.

| Area | Teammate prototype | syy-v12 / syy7 |
| --- | --- | --- |
| Profile setup | Four short pages covering context, weekly information, state preferences, and planning failure | Four short pages, but separates stable profile, weekly boundaries, weekly tasks, and today's state according to their scheduling scope |
| Weekly availability | Primarily free-text input | Structured day/start/end windows used as hard scheduling boundaries |
| Calendar context | Simpler context model | Fixed time, routine windows, flexible activities, and blocked time have different scheduling semantics |
| Deadline | Parsed as task timing information | Treated as the latest completion time; sessions must finish before it |
| Scheduling source | Earlier mixed rule-based scheduling | DeepSeek proposes day/start/end blocks; Python accepts or rejects them without silently moving them |
| Candidate plans | Limited comparison | Multiple generated candidates, hard-constraint filtering, scoring, explanation, evidence, and confidence |
| Long tasks | Limited session semantics | Total work, session capacity, scheduled work, margin, and remaining work are tracked separately |
| Fixed events | Basic fixed placement | Preserved at the stated time; conflicts trigger local replanning of flexible work |
| Interruption | Basic pause and re-entry | Progress, actual time, remaining work, open questions, next action, released sessions, and re-entry are preserved |
| Parallel tasks | No complete confirmation chain | AI pair analysis, Python compatibility gate, user confirmation, shared group ID, side-by-side calendar rendering, and separate feedback |
| Decision trace | Lighter explanation | Prompt source, evidence, confidence, hard validation, comparison reasoning, and repair suggestions |

## UI choices borrowed for syy7

- A visible four-step progress indicator
- One cognitive topic per page
- A narrower, calmer card for stable profile questions
- A larger layout only when structured weekly context or tasks require it
- Short introductions that explain the system contract without repeating implementation details

## Logic deliberately not borrowed

- Free-text availability as the primary scheduling constraint
- A single undifferentiated event type
- Rule-generated time blocks presented as if they were directly created by AI
- Silent duration rounding
- Treating schedule placement as task completion
- Moving fixed events to resolve conflicts

## syy7 onboarding rationale

1. Stable context is collected first because it persists across weeks.
2. Working rhythm is separate because it is a preference, not a hard boundary.
3. Weekly availability and occupied time are collected before tasks so every later proposal has a valid search space.
4. Tasks and today's state appear last. The weekly skeleton uses profile, weekly boundaries, and tasks; today's state may adjust only today's first session.

This preserves the HumanOS research logic while reducing the amount of information visible at any one time.
