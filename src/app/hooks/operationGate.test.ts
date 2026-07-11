import { describe, expect, it } from "vitest";
import { createOperationGate } from "./operationGate";

describe("createOperationGate", () => {
  it("invalidates an older operation when a newer target starts", () => {
    const gate = createOperationGate();
    const first = gate.begin("file-a", true);
    const second = gate.begin("file-b", true);
    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
  });

  it("invalidates in-flight work on cancellation", () => {
    const gate = createOperationGate();
    const operation = gate.begin("snapshot-1");
    gate.invalidate("snapshot-1");
    expect(gate.isCurrent(operation)).toBe(false);
  });

  it("rejects a lazy-directory result after another workspace opens", () => {
    const gate = createOperationGate();
    const expandProjectA = gate.begin("expand:grant-a:node_modules");
    const openProjectB = gate.begin("open-project", true);

    expect(gate.isCurrent(expandProjectA)).toBe(false);
    expect(gate.isCurrent(openProjectB)).toBe(true);
  });
});
