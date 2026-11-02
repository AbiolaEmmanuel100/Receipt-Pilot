import type { Metadata } from "next";
import { Generator } from "@/components/generator/Generator";

export const metadata: Metadata = {
  title: "New receipt",
  description: "Create a receipt, send it on WhatsApp, download a PDF or image, and keep it in your records.",
  alternates: { canonical: "/new" },
};

export default function NewReceiptPage() {
  return <Generator />;
}
