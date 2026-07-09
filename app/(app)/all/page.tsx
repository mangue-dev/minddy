"use client";

// "Tous les tickets" — every issue across every project (MIN-29).
import { GlobalBoard } from "@/components/global-board";

export default function AllIssuesPage() {
  return <GlobalBoard scope="all" />;
}
