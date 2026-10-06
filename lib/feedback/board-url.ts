/** Build a public feedback board URL from the application origin and token. */
export function feedbackBoardUrl(input: {
  token: string;
  origin: string;
}): string {
  return `${input.origin.replace(/\/$/, "")}/f/${input.token}`;
}
