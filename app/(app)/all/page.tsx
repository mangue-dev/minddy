"use client";

// "All tickets" — every issue across every project (MIN-29), with the
// same saved-views system as a project board (global, personal views).
import { GlobalBoard } from "@/components/global-board";

export default function AllIssuesPage() {
  return <GlobalBoard />;
}
