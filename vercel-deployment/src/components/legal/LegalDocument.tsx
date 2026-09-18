import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function LegalDocument({ content }: { content: string }) {
  const lastUpdated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Link href="/" className="text-purple-600 hover:text-purple-700 font-medium">
        &larr; Back to MultiLLM
      </Link>
      <p className="text-slate-500 text-sm mt-6">Last updated: {lastUpdated}</p>
      <div className="prose prose-slate max-w-none mt-2">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}
