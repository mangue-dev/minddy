# Subcontractors and transfers outside the EU — minddy

*Article 28 of the GDPR. Internal document, to be presented in the event of an inspection.*

Each service provider who processes personal data on behalf of minddy
is a subcontractor within the meaning of article 28. For each person, you need: a contract
of subcontracting (DPA) accepted, a valid transfer basis if it deals outside
of the European Union, and the guarantee that it only acts on instruction.

**Last reviewed: August 6, 2026.** To be repeated each time a service provider is added,
and at least once a year.

> **⚠️ “DPA” column to be confirmed.** The table below lists the DPAs that
> each service provider publishes, **not**, the status of their acceptance on the accounts
>mindy. Most are accepted at the time of subscription or from a
> dedicated dashboard screen (Supabase → Organization → Legal Documents,
> Vercel → Team Settings → Legal, Stripe → Settings → Legal, PostHog → Settings
> → Organization, Resend → Settings → Legal). **Go to each account, sign
> what is not, then replace “to be confirmed” with the date
> acceptance.** An unsigned DPA is the point that a control notes in
> first, and this is the only line in this file that cannot be filled
> from the code.

---

## Summary table

| Subcontractor | Role | Data processed | Accommodation | Outside the EU | Transfer base | DPA |
| --- | --- | --- | --- | --- | --- | --- |
| **Supabase** | Database, authentication, file storage | All application data | EU — Ireland (`eu-west-1`) | No | — | [DPA](https://supabase.com/legal/dpa) — to be confirmed |
| **Vercel** | Application hosting, function execution, agent sandboxes | Data in transit; query logs | United States, with global points of presence | Yes | CCT + DPF | [DPA](https://vercel.com/legal/dpa) — to be confirmed |
| **Stripe** | Payment and subscriptions | Email, customer and subscription IDs, payment data (at Stripe only) | Ireland (EU entity) + United States | Yes | Intra-group CCT | [DPA](https://stripe.com/legal/dpa) — to be confirmed |
| **OpenRouter** | Routing calls to language models | Content transmitted to the models (tickets, code, messages, **feedback posted on a public board and audio of their dictation**) | United States | Yes | CCT | [Policy](https://openrouter.ai/privacy) — TBC |
| **PostHog** | Audience measurement | Usage events, measurement identifier | EU — Germany (`eu.posthog.com`) | No | — | [DPA](https://posthog.com/dpa) — to be confirmed |
| **Resend** | Transactional Emails | Destination address, message content | United States | Yes | CCT | [DPA](https://resend.com/legal/dpa) — to be confirmed |
| **GitHub** | Connection to agent repositories, *pull requests* | Account identifier, content of linked deposit | United States | Yes | CCT (Microsoft) | [DPA](https://github.com/customer-terms/github-data-protection-agreement) — to be confirmed |
| **GitLab** | Connecting to agent repositories, *merge requests* | Account identifier, content of linked deposit | United States or customer self-hosted instance | Yes | CCT | [DPA](https://about.gitlab.com/handbook/legal/data-processing-agreement/) — to be confirmed |

**CCT**: standard contractual clauses of the European Commission (decision
2021/914). **DPF**: *EU–US Data Privacy Framework* (adequacy decision of
July 10, 2023).

---

## Detail by subcontractor

### Supabase

*Supabase Inc. — instance hosted in the European Union (Ireland) region.*

The main subcontractor: it carries the PostgreSQL database, authentication and
file buckets. All application data resides there.

- **Data outside the EU**: none. The instance is provisioned as `eu-west-1` and the
  remainder; the choice of region is fixed at the creation of the project.
- **Subprocessors**: AWS (Irish region infrastructure).
- **Security**: encryption at rest, daily backups with restoration
  at a given time, `Row Level Security` activated on all tables
  applications.
- **At the end of the contract**: deletion of the project and backups.

### Vercel

*Vercel Inc. — hosting Next.js application and running sandboxes
of the code agent.*

Vercel executes the application code: the data passes through its functions,
they are not stored there permanently. Query logs (URL, code
response, duration, IP address) are kept there according to the retention of the plan.

- **Transfer outside the EU**: yes — CCT and adherence to the *Data Privacy Framework*.
- **Agent sandboxes**: one micro-VM per run, where the code from the linked repository
  is cloned. It is not ephemeral in the strict sense: the session is cut off after
  ~5 min of inactivity, but its **filesystem is kept in snapshot for
  7 days** (`SANDBOX_SNAPSHOT_EXPIRATION_MS`), for a conversation to resume
  hot. After this period, the snapshot is deleted and the repository re-cloned if necessary.
- **To watch**: the execution region. Functions can be set to
  a European region (`fra1`, `cdg1`); sandboxes, **no** — Vercel
  Sandbox only exists in `iad1` (United States). The point is open for
  functions, closed for sandboxes as long as the offer does not change.

### Stripe

*Stripe Payments Europe Ltd (Ireland), with Stripe Inc. as subcontractor
later.*

- **No banking data passes through minddy**: the entry is made on
  pages hosted by Stripe (Checkout, customer portal). minddy only keeps
  opaque identifiers (`cus_…`, `sub_…`) and subscription status.
- **Transfer outside the EU**: yes, intra-group, supervised by CCT.
- **Certification**: PCI-DSS level 1.

### OpenRouter and template providers

*OpenRouter, Inc. — single gateway to model providers.*

The content transmitted to the models (ticket text, comments, extracts from
code read by the agent) leaves the European perimeter at this location. This is the
most sensitive transfer of the service and it must be announced as such in the
privacy policy.

**Including feedback from public boards** (processing #6), and this is the case
which requires the most attention: the people concerned are not
minddy's clients but those of her client, they did not accept any conditions
of use, and the text they write goes to the model BEFORE any review —
so before anything could spot that it contains data
personal. Three calls maximum per return: the review (moderation,
categorization, deduplication, translation), the calculation of embedding, and for a
dictated the transcription of the audio and then formatted the form. None of
these calls do not bear the identity of the author.

- **Transfer outside the EU**: yes — CCT.
- **Retention with the supplier: variable, and beyond the control of minddy.**
  OpenRouter routes the call to the provider of the selected model, which applies its
  own policy — some journal the prompts, some keep them,
  some use it to improve their models. The model being chosen by
  the user, **no guarantee of retention can be given**, and
  you should not write one: a promise of confidentiality that cannot be kept
  not is another failure, not a precaution.
- **Sub-processors**: model providers routed by
  OpenRouter. Their list depends on the models open in the catalog.
- **Keys provided by the user (BYOK)**: when the user configures his
  own key, the call goes to *its* provider, under *its* responsibility
  contractual. minddy only stores the encrypted key.

### PostHog

*PostHog, Inc. — European instance `eu.posthog.com` (Germany hosting).*

- **Transfer outside the EU**: none, the European body is used.
- **Browser measurement**: before the choice, it is anonymous, without cookies and
  stored only in memory; consent authorizes persistence.
  A refusal triggers `opt_out_capturing()` and cuts all broadcasts from the browser.
- **Server events**: technical facts necessary to measure the
  service (creation via MCP, webhook, cron) can be issued without depending on the
  banner, under legitimate interest. They do not read or write the terminal.
- **Minimization**: client and server go through a closed catalog and through
  `lib/analytics-sanitize.ts` ; no personal data in free text, no
  IP address retained, autocapture and session recording disabled.

### Resend

*Resend, Inc. — sending transactional emails (invitations, notifications,
public board verification codes).*

- **Transfer outside the EU**: yes — CCT.
- **Data**: destination address and message content. No email
  commercial is not sent, therefore no mailing list is created.

### GitHub and GitLab

*Requested only upon explicit action by the user, when he links a
deposit to a project.*

- **Data**: account identifier, authorized deposits, content of the deposit read and
  written by the agent.
- **Access tokens**: encrypted at rest in base, scope limited to deposits
  explicitly linked, revocable from account settings.
- **Transfer outside the EU**: yes — CCT.

---

## What is not subcontracting

- **The user who invites someone to his project** is not a
  subcontractor: he acts as data controller for the content he
  creates, minddy being in this regard *its* subcontractor (see the section “Role of
  subcontractor” of the privacy policy).
- **Third-party connection providers (Google, GitHub)** used to
  authenticate are autonomous data controllers for their own
  service; minddy only receives from them the minimal identity necessary for
  creation of the account.

---

## Procedure for adding a subcontractor

1. Check that it offers a DPA that complies with article 28 and accept it.
2. Determine the actual hosting of the data and, if outside the EU, the basis of
   transfer (adequacy, CCT, DPF).
3. Add a row to the table above and a detail section.
4. Add the processing concerned to the internal register.
5. Update the list of subcontractors in the privacy policy
   public (key `transfersProcessors` of namespaces `Privacy`, in French and
   in English) — this list is **nominative**, a service provider not mentioned cannot
not be considered as brought to the attention of individuals.
6. Update `lastModified` of key `privacy` in `lib/public-routes.ts`.

**Special case of model suppliers.** Privacy policy
also names them (key `aiProvidersGateway`: DeepSeek, Anthropic, OpenAI,
Google). This listing follows the actual catalog — `lib/agent-models.ts` for
agent models, `lib/ai-model-config.ts` for background tasks, dictation
and embeddings. **Opening a model from an unnamed supplier means adding a
undeclared recipient**: the i18n key moves in the same commit as the
catalog.
