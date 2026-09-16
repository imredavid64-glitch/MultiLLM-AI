import Link from "next/link";

export const metadata = {
  title: "Privacy Policy - MultiLLM",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Link href="/" className="text-purple-600 hover:text-purple-700 font-medium">&larr; Back to MultiLLM</Link>

      <h1 className="text-4xl font-bold text-slate-900 mt-6 mb-2">Privacy Policy</h1>
      <p className="text-slate-500 mb-10">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

      <div className="prose prose-slate max-w-none space-y-8 text-slate-700">
        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">1. What This Covers</h2>
          <p>
            This Privacy Policy explains what information MultiLLM collects, how it is
            used, and the choices you have. It applies to the MultiLLM website,
            dashboard, and API.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">2. Information We Collect</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li><strong>Account information:</strong> email address, name, and authentication data, managed through our authentication provider.</li>
            <li><strong>Billing information:</strong> subscription plan and payment status. Card details are handled directly by Stripe; we never see or store full card numbers.</li>
            <li><strong>Query data:</strong> the prompts you submit, the generated answers, and per-answer quality scores, stored so you can view your own query history and usage analytics.</li>
            <li><strong>Provider API keys (optional):</strong> if you choose to connect your own third-party model-provider key, it is encrypted at rest before storage and only decrypted server-side at the moment it is needed to make a request on your behalf.</li>
            <li><strong>Platform API keys:</strong> keys you generate for programmatic access are stored as a one-way hash; the plaintext key is shown to you once and never stored.</li>
            <li><strong>Usage metadata:</strong> timestamps, rate-limit counters, and coarse request metadata (such as IP address) used to enforce fair-use limits and detect abuse.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">3. How We Use Information</h2>
          <p>We use the information above to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Provide, maintain, and improve the Service, including your query history and analytics;</li>
            <li>Process payments and manage subscriptions through Stripe;</li>
            <li>Enforce rate limits and credit allowances tied to your plan;</li>
            <li>Detect, investigate, and prevent abuse or security incidents;</li>
            <li>Communicate with you about your account, such as billing or security notices.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">4. How Prompts Reach Model Providers</h2>
          <p>
            When you submit a query, it is sent to one or more third-party model
            providers you or the platform have configured (such as OpenAI-compatible,
            Google, or Mistral endpoints) so they can generate a response. Before a
            prompt or conversation history leaves our systems, we run a best-effort
            redaction pass that looks for patterns such as email addresses, API keys,
            card numbers, and similar identifiers and replaces them with a redaction
            marker. This is a safety net, not a guarantee -- avoid pasting sensitive
            information you don&apos;t want a third-party provider to process.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">5. Data Retention</h2>
          <p>
            We retain query history and account data for as long as your account is
            active, so you can review past queries and usage. You can request deletion
            of your account and associated data at any time; some records may be
            retained where required for legal, billing, or fraud-prevention purposes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">6. Data Sharing</h2>
          <p>
            We do not sell your personal information. We share information only with
            the service providers necessary to operate MultiLLM -- our database and
            authentication provider, our payment processor, and the model providers
            you query through the Service -- and only to the extent needed to provide
            the Service, or where required by law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">7. Your Choices</h2>
          <ul className="list-disc pl-6 space-y-1">
            <li>You can view, export, or delete your query history from the dashboard.</li>
            <li>You can revoke a stored provider key or a generated platform API key at any time.</li>
            <li>You can request a copy of your account data or full account deletion by contacting us.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">8. Security</h2>
          <p>
            We use industry-standard measures to protect your data, including
            encryption of stored provider keys, hashed platform API keys, and access
            controls on our database. No method of transmission or storage is
            perfectly secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material changes will
            be announced through the dashboard or by email to the address on your
            account before they take effect.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">10. Contact</h2>
          <p>
            Questions about this Privacy Policy can be sent through the contact
            details listed on your account dashboard.
          </p>
        </section>
      </div>
    </div>
  );
}
