"use client";

// "Mes tickets" — my issues aggregated across every project (MIN-29).
import { GlobalBoard } from "@/components/global-board";

export default function MyIssuesPage() {
  return <GlobalBoard scope="my" />;
}
