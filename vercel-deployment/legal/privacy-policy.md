# Privacy Policy (draft)

<!-- Skeleton draft -- not reviewed by a lawyer. Replace every [bracketed]
placeholder and have this checked before publishing. Written with GDPR in
mind given a Budapest/EU base; adjust if most customers are elsewhere. This
comment is intentionally not rendered on the live page. -->

## 1. Who we are

[COMPANY LEGAL NAME] ("MultiLLM", "we") operates the MultiLLM service. For GDPR purposes, we act as a data processor for the prompts and outputs our customers submit through the service, and as a data controller for account and billing information. Contact: [CONTACT EMAIL], [COMPANY ADDRESS].

## 2. What we collect

- **Account data**: name, email, company/agency name, billing details -- collected directly from you at signup and via Stripe.
- **API keys and configuration**: keys you provide for third-party AI providers, stored encrypted.
- **Prompt and output content**: the text you submit for processing and the responses returned, handled per Section 3 below.
- **Usage and telemetry**: latency, token counts, quality/confidence scores, and error rates, associated with your account and client-project labels, used for billing, analytics, and the reports we generate for you.

## 3. How prompt content is handled

- By default, we do not persist full prompt or completion text to disk beyond what is required to return the response to you and to compute the quality/confidence score.
- Before any prompt is sent to a third-party AI provider, we redact common sensitive patterns: email addresses, US Social Security Numbers, credit card numbers, phone numbers, and stray API keys accidentally included in a prompt. This is on by default but can be disabled per-request via the API.
- Aggregated, non-identifying metrics derived from your usage (e.g., average latency, score distributions) may be retained for product improvement.

## 4. Who we share data with (sub-processors)

We share prompt content with the third-party AI providers necessary to answer your query. The current list is maintained in the DPA & Sub-processors document, and includes model providers (currently OpenAI and/or OpenRouter, Google Gemini, Mistral, and Groq -- only those with an active API key configured actually receive traffic) and infrastructure providers (Vercel for hosting, Supabase for database/auth, Stripe for payment processing). We do not sell your data.

## 5. International transfers

Some sub-processors are located outside the European Economic Area (EEA), including in the United States. Where this applies, transfers rely on Standard Contractual Clauses (SCCs) with each sub-processor located outside the European Economic Area.

## 6. Legal basis for processing (GDPR)

- Account and billing data: performance of a contract with you.
- Prompt/output processing: performance of a contract with you (delivering the service you subscribed to).
- Security and abuse monitoring: legitimate interest.
- Marketing communications, if any: consent, which you can withdraw at any time.

## 7. Data retention

- Account data: retained while your account is active, and for 8 years after closure, in line with Hungarian accounting record-keeping requirements.
- Prompt/output content: retained only as long as needed to deliver the response and any reporting feature you've enabled, then deleted or anonymized within 30 days, consistent with Section 3.
- Usage/telemetry: retained for 24 months to support billing history and trend reporting.

## 8. Your rights

If GDPR or another applicable law gives you these rights, you can request to: access the personal data we hold about you; correct it; delete it; export it; restrict or object to certain processing. Contact [CONTACT EMAIL] to exercise these rights. You also have the right to lodge a complaint with your local data protection authority (in Hungary, the Nemzeti Adatvédelmi és Információszabadság Hatóság / NAIH).

## 9. Security

We use TLS in transit and AES-256-GCM encryption at rest for stored third-party API keys, and database row-level security (RLS) to keep each customer's data isolated to their own account. There is no dedicated key-management service (KMS) or hardware enclave -- do not represent one.

## 10. Children

MultiLLM is intended for business use and is not directed at children. We do not knowingly collect personal data from anyone under 16.

## 11. Changes to this policy

We'll notify active customers of material changes at least 15 days before they take effect.

## 12. Contact

Questions or requests regarding this policy: [CONTACT EMAIL].

*Last updated: [DATE]*
