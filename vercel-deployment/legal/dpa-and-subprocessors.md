# DPA & Sub-processors (draft)

<!-- Skeleton draft -- not reviewed by a lawyer. EU/GDPR-based agencies will
typically ask for a signed DPA before sending real client data through
MultiLLM -- have this reviewed before offering it as a signable document.
This comment is intentionally not rendered on the live page. -->

## Purpose

This Data Processing Agreement (DPA) describes how [COMPANY LEGAL NAME] ("Processor") handles personal data on behalf of a customer ("Controller") when the customer submits prompts through MultiLLM that contain personal data. It supplements the Terms of Service and Privacy Policy.

## Scope of processing

- **Subject matter**: processing of prompt/output content submitted via the MultiLLM API or dashboard.
- **Duration**: for as long as the Controller's subscription is active, plus any post-termination retention described in the Privacy Policy.
- **Nature and purpose**: routing prompts to third-party AI model providers, scoring and synthesizing responses, and returning results and usage reports to the Controller.
- **Categories of data subjects**: determined by what the Controller chooses to include in prompts -- typically the Controller's own end-clients or their end-users. The Controller must not submit special-category data (health, biometric, criminal, or similarly sensitive data) through the Service unless a separate written agreement specifically covers that processing.

## Sub-processors

| Sub-processor | Purpose | Data location (typical) |
| --- | --- | --- |
| OpenAI and/or OpenRouter | AI model inference. Our "OpenAI" provider slot can be configured with either a real OpenAI key or an OpenRouter key (OpenRouter is a separate company that itself forwards the request to an underlying model provider); both are disclosed here since either may be in use. | United States |
| Google (Gemini) | AI model inference | United States / configurable region |
| Mistral | AI model inference | European Union |
| Groq | AI model inference (used for regular queries and for the optional Deep Review confidence check -- not exclusive to either) | United States |
| Vercel | Application hosting | [confirm region/plan] |
| Supabase | Auth, database, and file storage | European Union (eu-central-1 / AWS Frankfurt) |
| Stripe | Payment processing (once configured) | United States / EU (Stripe Ireland for EU customers) |

*Keep this table current -- add a sub-processor here and notify active customers before routing their prompts through it. Anthropic and ClickHouse Cloud were removed from this list: neither is integrated anywhere in the codebase (no Anthropic API client exists, and ClickHouse was explicitly decided out of scope for this product) -- don't represent them as sub-processors unless and until they're actually built. Mistral is optional (only active if a Mistral key is configured) -- same for OpenAI/OpenRouter and Groq; only providers with a configured API key are ever actually sent data. Update this table again once real production keys are locked in.*

## Sub-processor changes

We will notify Controllers at least 30 days before adding or replacing a sub-processor that will process their data, giving them the opportunity to object on reasonable data-protection grounds.

## Security measures

As actually implemented today (verify current before publishing, this changes as the product does):

- **Encryption at rest**: customer-provided third-party API keys are encrypted with AES-256-GCM before being stored, using a server-side encryption key never exposed to the client.
- **Encryption in transit**: all traffic to the Service and between its internal components uses TLS/HTTPS.
- **Access control**: database-level row-level security (RLS) policies restrict every customer's data (queries, API keys, client projects, billing records) to that customer's own account; a separate internal shared secret authenticates the dashboard's calls to the model-inference backend.
- **Data minimization before third-party calls**: common sensitive patterns (email addresses, US Social Security Numbers, credit card numbers, phone numbers, and stray API keys) are redacted from prompt text before it's sent to any third-party AI provider, unless a Controller has explicitly disabled this for their own account.
- **Incident response**: [describe your actual process once one exists -- who's on call, how a breach is triaged, how the 72-hour notification below actually gets triggered].

There is no dedicated key-management-service (KMS) or hardware enclave -- do not represent one.

## Data subject requests

If a data subject contacts the Processor directly about their data, the Processor will forward the request to the relevant Controller without responding to it directly, except to confirm receipt, unless required otherwise by law.

## International transfers

Where a sub-processor is located outside the EEA, transfers are made under Standard Contractual Clauses (SCCs).

## Audits

The Processor will make available information reasonably necessary to demonstrate compliance with this DPA, and will allow for audits by the Controller or an appointed auditor, no more than once every 12 months, with at least 30 days' written notice, under confidentiality terms equivalent to this DPA.

## Breach notification

The Processor will notify the Controller without undue delay, and in any case within 72 hours, after becoming aware of a personal data breach affecting the Controller's data.

*Last updated: [DATE]*
