import { Inter } from "next/font/google";
import "./globals.css";
import { AppwriteProvider } from "@/components/providers/appwrite-provider";
import { ReactQueryProvider } from "@/components/providers/react-query-provider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { Toaster } from "react-hot-toast";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "MultiLLM - Ensemble AI Platform",
  description: "One prompt. Multiple LLMs. The best answer, automatically selected.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
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
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
