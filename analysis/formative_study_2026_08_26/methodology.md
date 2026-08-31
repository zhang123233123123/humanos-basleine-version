# Methodology (pre-analysis plan)

> **Status:** This file records the earlier analytic protocol. The completed
> corpus analysis used the Chinese open-coding rules, focused coding, thematic
> review matrix, and final theme evidence package listed in this directory.
> Before paper submission, this plan must be reconciled into one accurate
> retrospective Method section; it must not be cited as if every planned team
> coding or Framework Analysis step was completed.

## Analytic position

We use a pragmatic, critical-incident-oriented Framework Analysis of
semi-structured interviews. The aim is not to generate a universal theory of
human energy or task interruption. It is to identify situated breakdown and
resumption mechanisms and convert them into traceable candidate design
requirements for HumanOS.

The method combines:

- Critical Incident Technique to reconstruct concrete episodes rather than
  treating general opinions as behavior;
- Framework Method to compare episodes within and across participants;
- abductive coding, combining theory-informed concepts with inductive codes;
- JITAI concepts to organize candidate decision points, tailoring variables,
  intervention options, and proximal outcomes.

## Units of analysis

Two levels are retained:

1. **Participant account**: routine planning practices and general attitudes.
2. **Episode**: one bounded instance in which a planned task did not start,
   ongoing execution was interrupted, or the participant intentionally stopped.

Episodes receive stable identifiers such as `P03-E01`. A participant may
contribute more than one episode. The first-pass index records only the focal
episode elicited by the interview guide.

## Evidence layers

The interview guide yields three analytically separate corpora:

### Layer A: routine planning practice

Questions B1–B5 describe planning horizons, prioritization, estimation,
splitting, buffers, revision, and current tools. These data contextualize an
episode but do not establish what happened during it.

### Layer B: concrete event and recovery

Questions C6–E15 reconstruct the planned task, changed conditions, recognition
of breakdown, immediate action, recovery process, and desired checkpoint. This
is the primary empirical layer for claims about interruption and resumption.

### Layer C: hypothetical system response

Questions F16–F21 elicit preferences about intervention timing, advice,
explanations, automation, confirmation, undo, and memory. These data support
candidate design requirements only. They must not be reported as observed
usability, acceptance, behavioral change, or system effectiveness.

## Episode typology

Each episode is assigned exactly one primary type:

- `planned_task_non_start`: the task did not begin at its planned time;
- `execution_interruption`: execution began and was externally interrupted;
- `self_initiated_disengagement`: the participant stopped because of state,
  difficulty, or avoidance;
- `cascading_plan_breakdown`: dependencies or delays propagated across several
  tasks or stages;
- `non_core`: the example does not provide usable evidence about learning-task
  breakdown or resumption.

Secondary codes may describe overlap, but the primary type prevents all plan
changes from being mislabeled as task interruption.

## Analysis procedure

1. Replace speaker names with `P01`–`P14`; remove direct identifiers.
2. Preserve timestamps and original file identifiers in a restricted audit log.
3. Separate interviewer and participant turns and normalize transcription noise
   without rewriting meaning.
4. Segment focal episodes using changes in task, time, trigger, or outcome.
5. Assign episode type and assess whether the account is concrete or
   hypothetical.
6. Apply descriptive codes to task, state, trigger, action, recovery, outcome,
   and requested support.
7. Add inductive codes when existing definitions do not cover the account.
8. Chart episodes in a case-by-code matrix for within-case and cross-case
   comparison.
9. Write analytic memos that identify mechanisms, countercases, and scope
   conditions rather than merely counting mentions.
10. Map supported patterns to candidate HumanOS mechanisms and measurable
    follow-up outcomes.

## Elicitation provenance

Every design-relevant statement receives one provenance label:

- `spontaneous`: introduced without a relevant prompt;
- `open_prompted`: produced after an open question;
- `option_prompted`: produced after examples or response options;
- `interviewer_reframed`: agreement with the interviewer's interpretation;
- `hypothetical`: speculation about a system not yet used.

For Question 14, content offered before the Reason–Progress–Next Step probes is
stronger evidence of naturally desired recovery context than agreement after
the probes. Prompted agreement must not be described as spontaneous demand.

## Team analysis and reliability

Descriptive coding and interpretive theme development are treated differently.

- Two researchers jointly pilot event segmentation and codebook v0.1 on 2–3
  interviews.
- They independently code at least 25% of the corpus for descriptive fields.
- Disagreements are discussed and definitions are revised before remaining
  coding.
- Agreement statistics may be reported for stable descriptive categories, but
  are not used to claim that interpretive themes have one objectively correct
  answer.
- Theme development uses memos, explicit central concepts, counterexamples,
  and a decision log.

## Claim-strength rules

- **Strong**: multiple concrete, open-elicited episodes with convergent evidence
  and no unaddressed major countercase.
- **Moderate**: multiple accounts support the claim, but some are prompted,
  hypothetical, or heterogeneous.
- **Tentative**: one or two accounts, interviewer reframing, or a largely
  hypothetical preference.
- **Boundary**: evidence limits applicability or identifies a possible harm.

Frequency is descriptive and never sufficient on its own to define a theme.

## Design traceability

Each design claim must preserve this chain:

`transcript timestamp -> episode -> code -> cross-case pattern -> design
requirement -> HumanOS mechanism -> future evaluation measure`

For example:

`high-context writing loses the next conceptual step -> recovery friction ->
externalize progress and next action -> interruption checkpoint -> measure
resumption latency and recurrent interruption`

## Sample sufficiency

The current corpus contains 14 interviews, while the protocol anticipated
15–21 participants with a target of 18. We do not claim saturation from the
current count. Sufficiency should be assessed using information power: scope of
the aim, sample specificity, theoretical grounding, dialogue quality, and depth
of the cross-case analysis. Protocol variation and several weak or non-core
episodes reduce the information power of this corpus.

## Ethics and privacy gate

Before using the material in a publication, confirm that collection and consent
occurred under the applicable ethics approval. Retrospective consent must not be
assumed to repair collection conducted before approval. Raw transcripts,
speaker names, personal circumstances, and sensitive self-reports remain
outside version control.

## Method references

- Flanagan, J. C. (1954). The critical incident technique. *Psychological
  Bulletin, 51*(4), 327–358. https://doi.org/10.1037/h0061470
- Gale, N. K., et al. (2013). Using the framework method for the analysis of
  qualitative data in multi-disciplinary health research. *BMC Medical
  Research Methodology, 13*, 117. https://doi.org/10.1186/1471-2288-13-117
- Kabir, K. S., et al. (2022). Ask the Users: A Case Study of Leveraging
  User-Centered Design for Designing JITAIs. *IMWUT, 6*(2), Article 59.
  https://doi.org/10.1145/3534612
- Malterud, K., et al. (2016). Sample Size in Qualitative Interview Studies:
  Guided by Information Power. *Qualitative Health Research, 26*(13),
  1753–1760. https://doi.org/10.1177/1049732315617444
- McDonald, N., et al. (2019). Reliability and Inter-rater Reliability in
  Qualitative Research: Norms and Guidelines for CSCW and HCI Practice.
  *PACM HCI, 3*(CSCW), Article 72. https://doi.org/10.1145/3359174
- Bowman, R., et al. (2023). Using Thematic Analysis in Healthcare HCI at CHI:
  A Scoping Review. *CHI 2023*. https://doi.org/10.1145/3544548.3581203
