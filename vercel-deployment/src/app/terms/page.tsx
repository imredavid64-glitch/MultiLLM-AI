import Link from "next/link";

export const metadata = {
  title: "Terms of Service - MultiLLM",
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Link href="/" className="text-purple-600 hover:text-purple-700 font-medium">&larr; Back to MultiLLM</Link>

      <h1 className="text-4xl font-bold text-slate-900 mt-6 mb-2">Terms of Service</h1>
      <p className="text-slate-500 mb-10">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

      <div className="prose prose-slate max-w-none space-y-8 text-slate-700">
        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">1. Agreement to Terms</h2>
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of MultiLLM
            (the &quot;Service&quot;), an ensemble AI platform that queries multiple large language
            model providers, scores and merges their responses, and returns a single
            answer. By creating an account or using the Service, you agree to be bound
            by these Terms. If you do not agree, do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">2. Accounts</h2>
          <p>
            You are responsible for maintaining the confidentiality of your account
            credentials and for all activity that occurs under your account. You must
            provide accurate information when creating an account and keep it up to
            date.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">3. Subscriptions, Credits, and Billing</h2>
          <p>
            The Service is offered on Free, Pro, and Enterprise plans, each with a
            monthly query allowance (&quot;credits&quot;) and rate limit described on the
            billing page at the time of purchase. Paid subscriptions are billed in
            advance on a recurring basis through our payment processor (Stripe) and
            renew automatically until canceled. You may cancel at any time from the
            billing page; cancellation takes effect at the end of the current billing
            period. Fees are non-refundable except where required by law.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">4. API Keys</h2>
          <p>
            The Service lets you generate API keys for programmatic access, and
            optionally store your own third-party model-provider API keys so queries
            can run against your own provider account instead of ours. You are
            responsible for safeguarding any key you generate or store, and for all
            usage associated with it. Revoke a key immediately if you believe it has
            been compromised.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">5. Acceptable Use</h2>
          <p>You agree not to use the Service to:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Violate any applicable law or the terms of any third-party model provider;</li>
            <li>Attempt to gain unauthorized access to the Service or other users&apos; data;</li>
            <li>Interfere with or disrupt the integrity or performance of the Service;</li>
            <li>Submit content you do not have the right to share, or content intended to harm others.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">6. Third-Party Model Providers</h2>
          <p>
            The Service routes queries to third-party AI providers. Their outputs may
            be inaccurate, incomplete, or unsuitable for a given purpose. You are
            responsible for independently verifying any output before relying on it,
            particularly for decisions with legal, medical, financial, or safety
            consequences.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">7. Disclaimers and Limitation of Liability</h2>
          <p>
            The Service is provided &quot;as is&quot; without warranties of any kind, express or
            implied. To the maximum extent permitted by law, MultiLLM will not be
            liable for any indirect, incidental, special, or consequential damages
            arising from your use of the Service, and our total liability for any claim
            will not exceed the amount you paid us in the twelve months preceding the
            claim.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">8. Termination</h2>
          <p>
            We may suspend or terminate your access to the Service if you violate
            these Terms or if required to comply with applicable law. You may stop
            using the Service and delete your account at any time.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">9. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. If we make material changes,
            we will provide reasonable notice, such as an in-app notice or an email to
            the address on your account. Continued use of the Service after changes
            take effect constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-2">10. Contact</h2>
          <p>
            Questions about these Terms can be sent through the contact details listed
            on your account dashboard.
          </p>
        </section>
      </div>
    </div>
  );
}
