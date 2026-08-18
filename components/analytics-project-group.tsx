"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAnalytics } from "@/lib/use-analytics";
import { projectIdFromPath } from "@/lib/project-id-from-path";

/**
 * Associates analytics events with the current project (MIN-78).
 *
 * PostHog calls it a “group”: as long as the association holds, each
 * event carries the project, which makes it possible to cut out funnels and retention
 * by project — and to answer “is this project alive?” » rather than
 * “Is this user?” ".
 *
 * Mounted once in the app layout, it follows the URL: `/projects/<id>/…`
 * puts the group down, any other path removes it. PostHog init being deferred
 * (≤800 ms), arriving directly on a project page may miss the group on
 * its very first events — inconsequential, measured actions
 * arrive much later.
 */
export function AnalyticsProjectGroup() {
  const pathname = usePathname();
  const { group, resetGroups, setProjectContext } = useAnalytics();

  useEffect(() => {
    const projectId = projectIdFromPath(pathname ?? "");
    // Two channels voluntarily: PROPERTY `project_id` (free, on
    // which we can cut today) and the PostHog GROUP (which
    // only brings its aggregates with the paid add-on, but costs nothing as much
    // that you do not subscribe to it — billing starts upon subscription).
    setProjectContext(projectId);
    if (projectId) {
      group("project", projectId);
    } else {
      resetGroups();
    }
  }, [pathname, group, resetGroups, setProjectContext]);

  return null;
}
