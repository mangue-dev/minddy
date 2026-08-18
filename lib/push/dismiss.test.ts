import { describe, expect, it } from "vitest";

import { notificationTargetPath } from "@/lib/notification-target";
import { showsNotificationTarget } from "./dismiss";

const P = "11111111-1111-1111-1111-111111111111";

/**
 * A target of each type, in TWO copies: this is the only way to
 * check that the parameter which distinguishes them is taken into account. A
 * parameter forgotten in `NOTIFICATION_TARGET_PARAMS` is not seen otherwise —
 * the two paths only differ by it, and everything else (the path, the
 * other parameters) would still match.
 */
const KINDS = [
  {
    name: "ticket",
    a: notificationTargetPath({ project_id: P, issue_id: "iss-a" })!,
    b: notificationTargetPath({ project_id: P, issue_id: "iss-b" })!,
  },
  {
    name: "objectif",
    a: notificationTargetPath({ project_id: P, issue_id: null, objective_id: "obj-a" })!,
    b: notificationTargetPath({ project_id: P, issue_id: null, objective_id: "obj-b" })!,
  },
  {
    name: "retour du board",
    a: notificationTargetPath({ project_id: P, issue_id: null, feedback_post_id: "fp-a" })!,
    b: notificationTargetPath({ project_id: P, issue_id: null, feedback_post_id: "fp-b" })!,
  },
  {
    name: "routine",
    a: notificationTargetPath({ project_id: null, issue_id: null, routine_id: "rt-a" })!,
    b: notificationTargetPath({ project_id: null, issue_id: null, routine_id: "rt-b" })!,
  },
  {
    name: "pull request",
    a: notificationTargetPath({ project_id: null, issue_id: null, pull_request_id: "pr-a" })!,
    b: notificationTargetPath({ project_id: null, issue_id: null, pull_request_id: "pr-b" })!,
  },
];

describe("showsNotificationTarget", () => {
  it.each(KINDS)("reconnaît sa propre page ($name)", ({ a }) => {
    expect(showsNotificationTarget(a, a)).toBe(true);
  });

  // THE test of this module. Without the identifier parameter, arrive at a
  // routine would close all other notifications.
  it.each(KINDS)("ne confond pas deux cibles de même sorte ($name)", ({ a, b }) => {
    expect(showsNotificationTarget(a, b)).toBe(false);
    expect(showsNotificationTarget(b, a)).toBe(false);
  });

  it("ne confond pas deux sortes de cibles entre elles", () => {
    for (const kind of KINDS) {
      for (const other of KINDS) {
        if (other === kind) continue;
        expect(showsNotificationTarget(kind.a, other.a), `${kind.name} ≠ ${other.name}`)
          .toBe(false);
      }
    }
  });

  it("ignores parameters that do not identify the target", () => {
    const target = `/projects/${P}?issue=iss`;
    expect(showsNotificationTarget(`${target}&view=board&group=status`, target)).toBe(
      true
    );
    // The path identifies the page, the parameter identifies the routine; THE
    // decorative parameters should not change the target.
    expect(
      showsNotificationTarget("/routines?routine=rt-a&view=list", "/routines?routine=rt-a")
    ).toBe(true);
  });

  // The desired asymmetry: the board which CONTAINS the ticket is not the page of the
  // ticket. Closing the notification there would mean losing it before reading it.
  it("ne referme pas depuis le board quand le ticket n'est pas ouvert", () => {
    expect(showsNotificationTarget(`/projects/${P}`, `/projects/${P}?issue=iss`)).toBe(
      false
    );
  });

  it("keeps the trailing slash as decoration", () => {
    expect(showsNotificationTarget("/inbox/", "/inbox")).toBe(true);
    expect(showsNotificationTarget("/inbox", "/inbox/")).toBe(true);
  });

  it("does not match another project", () => {
    const other = "22222222-2222-2222-2222-222222222222";
    expect(
      showsNotificationTarget(`/projects/${other}?issue=iss`, `/projects/${P}?issue=iss`)
    ).toBe(false);
  });

  it("returns false for an unreadable URL instead of throwing", () => {
    expect(showsNotificationTarget("/inbox", "http://")).toBe(false);
  });
});
