"use client";

import { useState, type ComponentProps } from "react";
import { FeedbackSetupWizard } from "./feedback-setup-wizard";

/** Closed setup does no work before intent; later closes preserve its draft. */
export function DeferredFeedbackSetupWizard(props: ComponentProps<typeof FeedbackSetupWizard>) {
  const [state, setState] = useState({ projectId: props.projectId, mounted: props.open });
  const mounted = state.projectId === props.projectId && state.mounted;
  if (state.projectId !== props.projectId || (props.open && !mounted)) {
    setState({ projectId: props.projectId, mounted: props.open });
  }
  return mounted || props.open ? <FeedbackSetupWizard key={props.projectId} {...props} /> : null;
}
