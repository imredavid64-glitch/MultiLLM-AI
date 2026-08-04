import { Inter } from "next/font/google";
import "./globals.css";
import { AppwriteProvider } from "@/components/providers/appwrite-provider";
import { ReactQueryProvider } from "@/components/providers/react-query-provider";
import { Toaster } from "react-hot-toast";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "MultiLLM - Unified Sustainable AI Platform",
  description: "Zero-carbon, privacy-first AI platform with multi-language support",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AppwriteProvider>
          <ReactQueryProvider>
            <Header />
            <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
              {children}
            </main>
            <Footer />
          </ReactQueryProvider>
          <Toaster position="top-right" />
        </AppwriteProvider>
      </body>
    </html>
  );
}
