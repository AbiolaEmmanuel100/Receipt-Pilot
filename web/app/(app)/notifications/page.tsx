import type { Metadata } from "next";
import { Notifications } from "@/components/notifications/Notifications";

export const metadata: Metadata = {
  title: "Notification Settings",
  description: "Notification settings for Receipt Pilot business owners. Email, WhatsApp, and SMS receipt channels.",
  robots: { index: false },
};

export default function NotificationsPage() {
  return <Notifications />;
}
