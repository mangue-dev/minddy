# Data Breach Registry — minddy

*Article 33.5 of the GDPR. Internal document, to be presented in the event of an inspection.*

**Any violation appears there, notified or not.** The obligation to keep this register
is autonomous: it depends neither on the seriousness of the incident, nor on the decision
to notify. A missing register is a breach in itself.

The procedure to follow is described in
[procedure-violation.md](procedure-violation.md).

---

## State

**No personal data breach noted to date.**

Last checked: July 30, 2026.

---

## How to log a violation

Copy the template below under “Recorded Violations”, complete it as soon as
qualification (step 3 of the procedure) and complete it as the response progresses.
Never wait for the closing to open the line: the register is also used to
hold the wire during the incident.

The fields fill even when the answer is “unknown at this stage” —
writing “unknown” and dating is information; leaving blank is not one of them.

### Template

```markdown
### V-YYYY-MM-DD — <short factual title>

| Field | Value |
| --- | --- |
| Date and time of the violation | |
| Date and time discovered | *(starts the 72-hour period)* |
| Discovery source | host alert / report / logs / internal observation |
| Nature | confidentiality / integrity / availability *(can be combined)* |
| Cause | configuration error / application flaw / compromised access / human error / subcontractor failure |
| Relevant processing | *refer to the processing register* |
| Data categories | |
| Categories of people | registered users / public-board visitors / prospects |
| Number of people affected | exact number or reasoned estimate |
| Number of records | |
| Exposure window | from … to … |
| Effective access observed | yes *(by whom, what evidence)* / no / undetermined |
| Likely consequences | |
| Aggravating factors | volume, easy re-identification, reusable identifiers, vulnerable people |

**Immediate containment measures**

*(what was revoked, disabled, or rotated — with the timestamp of each action)*

**CNIL notification**

| | |
| --- | --- |
| Decision | notified / not notified |
| Reasoning | *required in both cases — “no” must be justified in writing* |
| Filing date and time | |
| Receipt number | |
| Additional information sent | *(Art. 33.4)* |

**Information for affected people**

| | |
| --- | --- |
| Decision | informed / not informed |
| Reasoning | *high risk? exemption under Art. 34.3 invoked?* |
| Date | |
| Channel | email / in-app banner / public communication |
| Number of people informed | |

**Root-cause correction**

*(fix deployed, test or safeguard added, procedure updated)*

**Closure**

| | |
| --- | --- |
| Closure date | |
| Lesson learned | |
```

---

## Violations recorded

*(none to date)*
