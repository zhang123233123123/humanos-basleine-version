# Evidence-to-design mapping v0.1

These are candidate formative requirements. “Supported” means supported as a
design direction by interview evidence; it does not mean that the implemented
mechanism is effective.

## DR1. Represent breakdown type explicitly

- **Evidence:** the corpus contains non-start, active interruption,
  self-initiated disengagement, cascading delay, and non-core cases.
- **Requirement:** preserve task state, execution-session state, interruption
  episode, and schedule revision as distinct records.
- **JITAI role:** identifies different decision points.
- **HumanOS implication:** a missed calendar block must not be treated as an
  actively paused session; a paused session must not remain `running`.
- **Future measure:** state consistency errors and recovery-path completion.
- **Strength:** strong descriptive evidence.

## DR2. Capture recovery context modularly

- **Evidence:** visible progress is sufficient in P02/P10, whereas P05/P13 need
  reasoning context; P01/P06/P07/P09 need material pointers; P12 challenges
  resurfacing negative reasons.
- **Requirement:** support optional modules for progress, next action, material
  pointer, reasoning state, and reason. Do not force every module for every task.
- **JITAI role:** intervention option at explicit pause or return.
- **HumanOS implication:** extend the checkpoint schema without coupling it to a
  single UI form; store reason separately from re-entry display preferences.
- **Future measure:** completion burden, resumption latency, cue usefulness, and
  omission/edit rates per field.
- **Strength:** moderate-to-strong.

## DR3. Treat current self-report as uncertain, time-local evidence

- **Evidence:** P01/P04/P11/P12/P13 describe different task choices under
  different self-reported states, while P14 emphasizes that urgency can override
  preference.
- **Requirement:** use current self-report to revise a weak personalized prior;
  never present inferred internal state as fact or use a universal energy curve.
- **JITAI role:** tailoring variable and availability/receptivity signal.
- **HumanOS implication:** separate current check-in from durable profile traits
  and scheduling-policy state.
- **Future measure:** recommendation acceptance, corrections to inferred state,
  and performance by task demand.
- **Strength:** strong boundary, tentative automated mechanism.

## DR4. Generate schedule repair as a candidate, not an invisible mutation

- **Evidence:** P07/P09/P13 require redistribution under dependencies, future
  availability, and safety constraints; P07/P09 want confirmation for important
  changes.
- **Requirement:** generate a candidate repair, validate workload and hard
  constraints, show changes, then request confirmation.
- **JITAI role:** intervention option plus contestable decision rule.
- **HumanOS implication:** keep proposed, validated, confirmed, and active plan
  states distinct; preserve total task workload during splitting or overlap.
- **Future measure:** candidate acceptance, user edits, validation failures,
  undo, and subsequent completion.
- **Strength:** moderate; automation preferences are hypothetical.

## DR5. Scale explanation to impact and uncertainty

- **Evidence:** P01/P07/P09/P12/P13 request reasons or source evidence, whereas
  P02/P05 sometimes prefer direct output.
- **Requirement:** expose evidence progressively; make it prominent for uncertain
  or consequential changes and optional for low-risk routine actions.
- **JITAI role:** communicates tailoring variables and decision-rule rationale.
- **HumanOS implication:** return stable evidence codes from the backend and
  localize limitations in the frontend; allow inspection of original evidence.
- **Future measure:** evidence-open rate, acceptance after inspection, correction
  rate, and perceived control.
- **Strength:** moderate and heterogeneous.

## DR6. Separate low-risk automation from high-impact control

- **Evidence:** P07/P09 distinguish progress/time updates from changes to plan,
  priority, workload, or long-term goals; P10 expects cancellation of badly
  mismatched recommendations.
- **Requirement:** automate reversible recording where appropriate; require
  confirmation, edit, reject, and undo for consequential mutations.
- **JITAI role:** bounds the intervention option and decision rule.
- **HumanOS implication:** log recommendation, selected action, confirmation,
  feedback, and resulting state transition as separate auditable events.
- **Future measure:** rejection, modification, undo, and ownership ratings.
- **Strength:** moderate; must be validated in actual interaction.

## DR7. Make support suppressible and selective

- **Evidence:** P01/P03/P12 describe anxiety, pressure, or burden from progress
  indicators, reminders, or reflection; P02/P14 report limited need in some
  situations.
- **Requirement:** users can pause reminders, skip reflection, hide negative
  reasons, and choose minimal support without losing task state.
- **JITAI role:** availability/receptivity and “do nothing” intervention option.
- **HumanOS implication:** a no-intervention outcome must be a valid decision,
  not a system failure.
- **Future measure:** dismissals, reminder suppression, burden, and voluntary
  re-engagement.
- **Strength:** strong boundary evidence.

## DR8. Evaluate a closed loop rather than recommendation accuracy alone

- **Evidence:** participants describe return, delay, repeated interruption, and
  downstream schedule effects as distinct outcomes.
- **Requirement:** connect each recommendation to acceptance, execution session,
  interruption episode, resumption latency, recurrence, and completion without
  claiming causality from observational logs alone.
- **JITAI role:** proximal and distal outcomes.
- **HumanOS implication:** Insights should distinguish recorded association from
  verified effect and expose limited/medium evidence labels.
- **Future measure:** linked outcome coverage, latency, recurrence, completion,
  and user-confirmed usefulness.
- **Strength:** strong measurement rationale; effectiveness untested.
