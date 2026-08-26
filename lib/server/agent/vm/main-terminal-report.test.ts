import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "main.ts"), "utf8");

describe("VM terminal reporting", () => {
  it("parses malformed JSON inside the error-reporting boundary", () => {
    const boundary = source.indexOf("try {", source.indexOf("async function main"));
    const parse = source.indexOf("JSON.parse(source)", boundary);
    const fallback = source.indexOf("report = {", parse);
    const report = source.indexOf("await cp.reportTurn(report);", fallback);

    expect(boundary).toBeGreaterThan(0);
    expect(parse).toBeGreaterThan(boundary);
    expect(fallback).toBeGreaterThan(parse);
    expect(report).toBeGreaterThan(fallback);
  });

  it("recovers routing hints before attempting full job validation", () => {
    const hint = source.indexOf('const hinted = (field: "appOrigin" | "controlToken")');
    const client = source.indexOf("cp = createControlPlaneClient", hint);
    const parse = source.indexOf("JSON.parse(source)", client);

    expect(hint).toBeGreaterThan(0);
    expect(client).toBeGreaterThan(hint);
    expect(parse).toBeGreaterThan(client);
  });

  it("reads the job inside the reporting boundary and keeps launch-time routing hints", () => {
    const boundary = source.indexOf("try {", source.indexOf("async function main"));
    const read = source.indexOf("await readFile(jobPathFromArgv()", boundary);
    const originArg = source.indexOf("process.argv[3]", source.indexOf("async function main"));
    const client = source.indexOf("cp = createControlPlaneClient", originArg);

    expect(read).toBeGreaterThan(boundary);
    expect(originArg).toBeGreaterThan(0);
    expect(client).toBeGreaterThan(originArg);
  });
});
