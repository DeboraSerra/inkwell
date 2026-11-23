import type { Metadata } from "next";
import { Settings } from "@/components/pages/settings";

// Each page has its own title, so tabs and screen readers can tell them apart.
export const metadata: Metadata = { title: "Settings · Inkwell" };

export default function SettingsPage() {
  return <Settings />;
}
