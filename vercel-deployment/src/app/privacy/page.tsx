import LegalDocument from "@/components/legal/LegalDocument";
import { readLegalDoc } from "@/lib/legalDocs";

export const metadata = {
  title: "Privacy Policy - MultiLLM",
};

export default function PrivacyPage() {
  return <LegalDocument content={readLegalDoc("privacy-policy.md")} />;
}
