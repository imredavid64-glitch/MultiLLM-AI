import LegalDocument from "@/components/legal/LegalDocument";
import { readLegalDoc } from "@/lib/legalDocs";

export const metadata = {
  title: "Terms of Service - MultiLLM",
};

export default function TermsPage() {
  return <LegalDocument content={readLegalDoc("terms-of-service.md")} />;
}
