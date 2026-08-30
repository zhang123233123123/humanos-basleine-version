# Cross-case matrix v0.1

This matrix charts cases with sufficient transcript evidence. Counts are
descriptive navigation aids, not prevalence estimates. A participant can appear
in several rows when a focal episode contains multiple mechanisms.

## Episode composition

| Primary episode type | Cases | Count | Interpretation |
|---|---|---:|---|
| Planned task did not start as planned | P01, P02, P09 | 3 | Loss of planned time or routine, rather than interruption of an active session. |
| Active execution interruption | P03 | 1 | The only clear focal account dominated by an external interruption during ongoing work. |
| Self-initiated disengagement | P04, P05, P06, P10, P11, P12, P13 | 7 | State, difficulty, feedback, or safety made continuation unattractive or inappropriate. |
| Cascading plan breakdown | P07 | 1 | Dependencies and constrained resources propagated delay across stages. |
| Non-core / negative case | P08, P14 | 2 | No sufficiently clean learning-task breakdown-and-return event was established. |

**Audit implication:** the corpus should be described as a study of plan
breakdown, disengagement, and resumption—not as 14 homogeneous task
interruptions.

## Trigger matrix

| Trigger family | Cases with usable evidence | Cross-case interpretation |
|---|---|---|
| External obligation/resource change | P01, P03, P07, P09 | Available time, infrastructure, people, and equipment can invalidate a plan without changing motivation. |
| Person-reported state | P01, P02, P04, P05, P06, P10, P11, P12, P13 | State changes interact with task demand; they do not imply a universal daily energy curve. |
| Task/result state | P05, P07, P10, P12 | Failure, unexpected difficulty, weak results, or poor feedback can change both duration and willingness to continue. |
| Dependency propagation | P04, P07, P09, P13 | A local change can invalidate downstream tasks when work is serial or resource constrained. |

## Recovery-context matrix

| Recovery context | Cases with usable evidence | Design interpretation |
|---|---|---|
| Visible stop position/progress | P02, P04, P06, P07, P09, P10, P11, P12, P13, P14 | Common but not always sufficient. Existing software or natural subtask boundaries can provide it automatically. |
| First executable next action | P05, P07, P12, P13 | Particularly useful when the next step is not implied by visible progress. |
| Material/artifact pointer | P01, P06, P07, P09 | Link to the document, passage, data, or reference needed on return. |
| Reasoning state/failed alternatives | P04, P05, P11, P13, P14 | Most important for writing, simulation, interpretation, and other high-context work. |
| Reason for stopping | P06, P07, P13; challenged by P12 | Can aid reflection, but should not be mandatory or automatically resurfaced. |

## Recovery-friction contrasts

| Friction | Cases | Mechanism |
|---|---|---|
| Low | P02, P10 | Natural task boundaries or software-visible progress make continuation direct. |
| Medium | P06, P09, P12 | Brief rereading, mark review, or state switching is required. |
| High | P05, P13 | Reasoning and conceptual context must be reconstructed. |
| Not observed / unclear | P01, P03, P04, P07, P08, P11, P14 | Return was absent, distributed, mixed with another example, or insufficiently specified. |

## Candidate adaptive-support matrix

| Candidate mechanism | Supporting cases | Countercases / qualification |
|---|---|---|
| Modular interruption checkpoint | P04, P05, P06, P07, P09, P10, P11, P12, P13 | P02 often has a sufficient natural boundary; P14 does not use an explicit checkpoint. |
| State–task matching | P01, P09, P11, P12, P13 | P14 stresses that urgency can override preference; do not equate self-report with permission to defer. |
| Candidate rescheduling across future availability | P07, P09, P13 | Dependencies and hard resources can make “find a free slot” insufficient. |
| Evidence for consequential advice | P01, P07, P09, P12, P13 | P02 and P05 sometimes prefer direct output; use progressive disclosure. |
| Confirmation for high-impact changes | P07, P09, P10, P13 | Evidence is mostly hypothetical and must be evaluated in system use. |
| Selective long-term memory | P07, P08, P09 | Hypothetical only; requires explicit governance and deletion controls. |
| Minimal/nonintrusive support | P01, P03, P12, P14 | Some other cases welcome reminders or stronger structure; intervention burden must be personalized. |

## Candidate themes and central concepts

### T1. Planning is repairable commitment

Plans act as commitments, but users preserve feasibility through buffers,
substitution, partial completion, and rescheduling. The central concept is not
“people fail to follow plans”; it is that the plan must be repaired when task,
state, or context changes.

### T2. Recovery depends on what the environment remembers

Resumption friction rises when progress, materials, and reasoning are held only
in working context. The central concept is externalized task state, not
interruption duration alone.

### T3. State changes alter safe and productive task fit

Self-reported fatigue, pain, concentration, and affect influence which task is
feasible, but urgency and safety impose boundaries. The central concept is
state–task fit under constraints, not an inferred universal energy score.

### T4. Adaptive support must remain contestable

Participants value reduced planning effort but differ on reminders,
explanations, and automation. Consequential changes require visibility,
confirmation, editing, or undo. The central concept is contestable adaptation.

### T5. Reflection can support recovery or create burden

Progress and next-action capture can lower re-entry cost, while persistent
unfinished-work displays, rigid reminders, or resurfaced negative reasons can
increase pressure. The central concept is selective reflection.

## Claim status

- T1 and T2 have the strongest grounding in concrete episodes.
- T3 has strong boundary evidence but does not validate automated state
  inference.
- T4 is primarily a hypothetical design-preference theme.
- T5 is supported by both positive cases and explicit countercases, but needs
  evaluation during real system use.
