import LegalDocument from "@/components/legal/LegalDocument";
import { readLegalDoc } from "@/lib/legalDocs";

export const metadata = {
  title: "DPA & Sub-processors - MultiLLM",
};

export default function DpaPage() {
  return <LegalDocument content={readLegalDoc("dpa-and-subprocessors.md")} />;
}
