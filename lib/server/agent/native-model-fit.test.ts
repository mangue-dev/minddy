import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { nativeIdFitsCapability } = await import("./models-catalog");

/**
 * Native `/models` listings carry no capability field (MIN-979): the role a
 * model can fill is read from its id, and a model the transport cannot serve
 * never reaches a picker.
 */
describe("nativeIdFitsCapability", () => {
  it("keeps chat models and drops what the transports cannot serve", () => {
    // The Responses-only chat models are served by the Responses transport.
    for (const id of [
      "gpt-5.6-sol", "gpt-6-sol", "gpt-6-astra", "gpt-6.1-sol", "gpt-5-pro", "gpt-4.1",
      "gemini-3.6-flash", "gemini-3.1-pro-preview", "glm-5.3-flash",
    ]) {
      expect(nativeIdFitsCapability(id, "text")).toBe(true);
    }
    for (const id of [
      "gpt-5.1-codex", "sora-2", "computer-use-preview", "gemini-3.8-live-preview", "lyria-3", "gemini-nano-banana-2.1", "gemini-decision-1",
      "text-embedding-3-small", "gpt-transcribe",
    ]) {
      expect(nativeIdFitsCapability(id, "text")).toBe(false);
    }
  });

  it("offers only file transcription models for speech to text", () => {
    expect(nativeIdFitsCapability("gpt-transcribe", "transcription")).toBe(true);
    expect(nativeIdFitsCapability("whisper-1", "transcription")).toBe(true);
    expect(nativeIdFitsCapability("gemini-3.5-transcribe", "transcription")).toBe(true);
    for (const id of ["gpt-4o-transcribe-diarize", "gpt-realtime-whisper", "gpt-live-transcribe"]) {
      expect(nativeIdFitsCapability(id, "transcription")).toBe(false);
    }
  });

  it("leaves out ada-002, which cannot return the fixed feedback size", () => {
    expect(nativeIdFitsCapability("text-embedding-3-small", "embedding")).toBe(true);
    expect(nativeIdFitsCapability("gemini-embedding-001", "embedding")).toBe(true);
    expect(nativeIdFitsCapability("text-embedding-ada-002", "embedding")).toBe(false);
  });
});
