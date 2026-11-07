// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/messages/en.json";
import { MfaChallenge } from "./mfa-challenge";

const state = vi.hoisted(() => ({
  firstTotpFactorId: vi.fn(),
  verifyTotp: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => state }));
vi.mock("@/components/auth/auth-chrome", () => ({ AUTH_SUBMIT_CLASS: "", SubmitArrow: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ variant: _variant, ...props }: ComponentProps<"button"> & { variant?: string }) => <button {...props} />,
}));
vi.mock("@/components/ui/input", () => ({ Input: (props: ComponentProps<"input">) => <input {...props} /> }));
vi.mock("@/components/ui/spinner", () => ({ Spinner: () => <span data-spinner /> }));
vi.mock("@/components/otp-input", () => ({
  OtpInput: ({ onChange, onComplete: _onComplete, errorId: _errorId, ...props }: Omit<ComponentProps<"input">, "onChange"> & {
    onChange: (value: string) => void;
    onComplete: (value: string) => void;
    errorId?: string;
  }) => <input {...props} onChange={(event) => onChange(event.target.value)} />,
}));

let host: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn<typeof fetch>();
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const button = (text: string) => Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text))!;
const setValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

async function render(props: Partial<ComponentProps<typeof MfaChallenge>> = {}) {
  await act(async () => {
    root.render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MfaChallenge onVerified={() => {}} onRecovered={() => {}} {...props} />
      </NextIntlClientProvider>,
    );
  });
  await flush();
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  vi.resetAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("MfaChallenge", () => {
  it("keeps a factor load failure visible after switching modes", async () => {
    state.firstTotpFactorId.mockRejectedValue(new Error("Factor unavailable"));
    await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Factor unavailable");

    await act(async () => button(messages.Auth.mfaLostDevice).click());
    await act(async () => button(messages.Auth.mfaBackToCode).click());

    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Factor unavailable");
  });

  it("stays busy until the caller's recovery follow-up has finished", async () => {
    state.firstTotpFactorId.mockResolvedValue("factor");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    let finish!: () => void;
    const onRecovered = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    await render({ onRecovered });

    await act(async () => button(messages.Auth.mfaLostDevice).click());
    await act(async () => setValue(host.querySelector("#mfa-recovery-code") as HTMLInputElement, "ABCD-EFGH-IJKL"));
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();

    expect(onRecovered).toHaveBeenCalledTimes(1);
    expect(button(messages.Auth.mfaBackToCode).disabled).toBe(true);

    await act(async () => finish());
    await flush();
    expect(button(messages.Auth.mfaBackToCode).disabled).toBe(false);
  });
});
