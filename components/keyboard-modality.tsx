"use client";

import { useEffect } from "react";

import { trackKeyboardModality } from "@/lib/keyboard-modality";

/** Shows the focus outline while the keyboard drives focus (lib/keyboard-modality.ts). */
export function KeyboardModality() {
  useEffect(() => trackKeyboardModality(), []);
  return null;
}
