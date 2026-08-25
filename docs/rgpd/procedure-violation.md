# Procedure for handling data breaches — minddy

*Articles 33 and 34 of the GDPR. Internal document, to be presented in the event of an inspection.*

A **personal data breach** is any security incident —
accidental or unlawful — which results in the destruction, loss, alteration,
unauthorized disclosure of personal data, or unauthorized access to
these. All three forms count, not just the escape:

- **confidentiality** — someone saw what they should not see;
- **integrity** — data has been altered without authorization;
- **availability** — data is lost or inaccessible.

A backup deleted by mistake without a copy is a violation, in the same way
than a publicly exposed base.

**The 72 hour period starts from the moment the violation is
*observed*, not the one where it took place.** The timer starts at the first
credible signal, even if the extent is still unknown. A notification
incomplete notification sent on time is better than complete notification
sent too late: article 33.4 explicitly provides for communication in
several times.

---

## Roles

| Role | Who |
| --- | --- |
| Data controller | Clément Guérin |
| Point of contact | hello@minddy.app |
| Decision to notify | The data controller, alone |

There is no DPO: the decision and drafting are the responsibility of the person responsible for
treatment.

---

## 1. Detect

Alert sources to monitor:

- security alerts from the host (Supabase, Vercel) and the code repository;
- abnormal behavior in production: peak of requests, unexpected accesses in
  logs, serial authorization errors;
- report of a user or security researcher arriving on
  hello@minddy.app;
- own observation during an intervention: poor `Row Level policy
  Security`, secret committed, backup missing.

**From the first credible signal: note the date and time.** This is
timestamp which is valid for the 72-hour period.

## 2. Contain — immediately, before any analysis

The order matters: we stop the bleeding first, then we understand.

1. Revoke what can be revoked: API keys, tokens, sessions, service keys,
   access of subcontractors.
2. Cut off the faulty access: deactivate the route, reestablish the RLS policy,
   remove the deployment.
3. Rotate the exposed secrets (environment variables, keys of
   encryption, Git tokens).
4. **Do not delete anything**: logs, trace of the faulty request and status
   of the basis are the proofs. Freeze them, export them if necessary.

## 3. Qualifier

Respond in writing, in the [register of violations](registre-des-violations.md):

| Question | To be documented |
| --- | --- |
| What ? | Nature of the violation (confidentiality / integrity / availability) |
| What data? | Specific categories — identification, content, authentication, billing |
| How many people? | Exact number or reasoned estimate |
| Since when? | Exhibition window |
| Who was able to access it? | Public, an identified third party, person (theoretical access) |
| Probable consequences? | Theft, disclosure of professional information, loss of work, fraud |
| Aggravators? | Easily re-identifiable data, vulnerable people, large volume, connection data reusable elsewhere |

## 4. Decide to notify

Two distinct decisions, not to be confused.

### 4.1 Notification to the CNIL — article 33

**Mandatory unless** the violation is *unlikely* to create a risk for
the rights and freedoms of people. Dispensation is the exception; doubt
leads to notify.

**Not notifying** may be justified, for example, if the data exposed
were encrypted with a key that remained out of reach, or if the exposure was
theoretical and demonstrably without effective access. **This decision is motivated by
written in the register**, with the reasoning — it is this document that the CNIL
will read if she learns of the incident elsewhere.

**Deadline: 72 hours** from the observation. Beyond that, the notification
remains due but must explain the delay.

**Channel**: CNIL notification teleservice —
<https://notifications.cnil.fr>.

**Minimum content** (Art. 33.3):

- nature of the violation, categories and approximate number of people
  concerned, categories and approximate number of records;
- contact details (hello@minddy.app);
- probable consequences;
- measures taken or envisaged to remedy them and mitigate their effects.

If everything is not known within 72 hours: notify with what is established and
then complete (art. 33.4).

### 4.2 Information of data subjects — article 34

**Mandatory if** the violation is likely to result in a **high risk**
for the rights and freedoms of people. The threshold is higher than that of the
notification to the CNIL: any notified violation does not give rise to information
people.

**Exemptions** (art. 34.3): data made incomprehensible by encryption
robust; subsequent measures that avert the high risk; effort
disproportionate — in which case an equivalent public communication replaces
individual information.

**Deadline**: as soon as possible.

**Channel**: e-mail to the account address, and, if the number justifies it, banner
in the application and public note on the site.

**Content**: in plain and simple terms — what happened, what data
are affected, what possible consequences, what minddy did, **what
the person must do** (change their password, revoke a key, monitor
access), and the contact hello@minddy.app.

Communication that minimizes or drowns out information is communication that is not
compliant. Say what happened, including when it was a careless mistake,
is both the obligation and the only tenable position.

## 5. Record — in all cases

**All violations are entered in the register, including those that are not
notified.** This is an independent obligation of Article 33.5, and the absence of
register is itself a breach — regardless of the seriousness of the incident.

See [registre-des-violations.md](registre-des-violations.md).

## 6. Correct

Once the incident is closed:

- correct the root cause, and not just the symptom;
- add the test or safeguard that would have detected the flaw — a policy
  Missing RLS is made up for by a test that checks the insulation, not by a
  careful proofreading;
- update the internal processing register if security measures
  change;
- repeat this procedure if the incident showed that it was incomplete.

---

## Cheat sheet — the first 72 hours

| When | What |
| --- | --- |
| **H+0** | Note date and time of observation. Contain: revoke, cut, rotate secrets. Do not delete anything. |
| **H+2** | Qualify: what data, how many people, what window, what effective access. Open the line at the register. |
| **H+12** | Decide: CNIL notification? information of people? Give reasons in writing in both cases, including “no”. |
| **H+72** | CNIL notification filed if due, even incomplete. |
| **Then** | Inform people if high risk. Supplements to the CNIL. Fixing the root cause. |

---

## Related documents

- Internal register of processing activities
- [Subcontractors and transfers](sous%2Dtraitants.md)
- [Register of violations](registre-des-violations.md)
- CNIL — [Notify a personal data violation](https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles)
