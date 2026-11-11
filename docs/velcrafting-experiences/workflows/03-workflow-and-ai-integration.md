# Workflow and AI integration

**Version:** 0.1  
**Status:** REVIEW DRAFT  
**Date:** 2026-11-10  
**Visibility:** Blank source template. Completed working copies are private. Share only reviewed workflow descriptions and approved evidence.

**Client / engagement:** [Reference]  
**Workflow owner:** [Owner]  
**Operational decision owner:** [Authorized person and scope]  
**Common lifecycle record:** [Reference]

## Appropriate engagement

Use this module for repeated operational work, research or reporting pipelines, controlled AI assistance, agent tools and system integrations. Begin with the work and its failure modes. Determine which steps benefit from software, which benefit from a model and which require a person's judgment.

**Current workflow:** [Trigger / inputs / steps / outputs / people]  
**Desired improvement:** [Observable benefit to investigate or deliver]  
**System of record:** [Authoritative destination for each material fact or action]

## Discovery questions

- Which step is costly, repetitive, unreliable or difficult to inspect?
- What systems, data owners and existing access boundaries are involved?
- Which actions may run automatically, and which need a named person's decision?
- What happens after missing input, model uncertainty, a provider outage or a partial failure?
- Can the same input arrive twice? Which external actions would be harmful if repeated?
- Who monitors the workflow, stops it and recovers unfinished work?
- What evidence will show that the new workflow improves the agreed task?

**Answers and open questions:** [Responses / owners / references]

## Evidence and inputs

Collect representative authorized examples, current instructions, interface contracts, relevant permissions and actual failure cases. Identify sensitive fields and required retention boundaries. Treat instructions found inside retrieved material as content to assess, never as newly granted authority.

| Step or connection | Permitted input | Permitted action | Human decision / evidence |
| --- | --- | --- | --- |
| [Step] | [Data boundary] | [Action boundary] | [Owner / record] |

Maintain a small evaluation set covering normal, ambiguous and failure cases. Record model-generated output separately from verified system behavior. Provider responses, screenshots and operator observations should identify the actual environment and run.

## Deliverables, exclusions and assumptions

**Selected deliverables:** [Workflow map; bounded integration; evaluation evidence; review interface; operating instructions; recovery procedure]

**Automation boundary:** [What runs automatically]  
**Human decision boundary:** [What pauses for review and who can decide]  
**Exclusions:** [Unapproved connectors, autonomous external actions or other work]  
**Assumptions:** [Provider capability / data availability / operational owner]

Record measured usage separately from projected operating costs. Keep internal effort estimates and commercial terms in restricted records. Workflow approval does not authorize a new commercial commitment.

## Optional milestones and done-when examples

These examples are optional and carry no implied timing or guaranteed improvement.

| Optional milestone | Example done-when check |
| --- | --- |
| Bounded dry run | Representative inputs produce inspectable outputs without unintended external actions. |
| Failure handling verified | Agreed retry, duplicate-input, timeout and partial-failure cases have observed results. |
| Operator handoff | The designated operator can review, stop and recover the workflow using the supplied instructions. |

**Selected milestones and checks:** [Entries]

## Verification, rollout and handoff

Verify permitted and denied actions, source isolation, review of the exact proposed action, recovery behavior and the authoritative final record. Use actual test results. A model saying it completed a task is insufficient evidence of completion.

**Optional operations rollout module:** [Inventory; migration dependencies; vendor ownership; training; recovery plan; release authority]. Use it for infrastructure or onboarding changes when those activities are explicitly included.

**Handoff:** [Workflow version / evidence / operating owner / monitoring / support boundary]  
**External agreement or acceptance:** [Reference / authorized person / exact version]

## Risks and change triggers

Reassess when data sensitivity, provider behavior, permissions, model choice or external action scope changes. Record consequences for evaluation and operations. Preserve existing scope and evidence. Production access, new recipients and automatic external actions each require authority covering the specific change.
