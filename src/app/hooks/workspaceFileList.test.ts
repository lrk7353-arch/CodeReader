import { describe, expect, it } from "vitest";
import type { CodeFile } from "../../types/explanation";
import { upsertFileInList } from "./workspaceFileList";

describe("upsertFileInList", () => {
  it("prepends a new file when no id or path matches", () => {
    const first = codeFile({ id: "file:a", path: "/a.py" });
    const existing = [first];
    const incoming = codeFile({ id: "file:b", path: "/b.py" });

    const result = upsertFileInList(existing, incoming);

    expect(result).toEqual([incoming, first]);
    expect(result).toHaveLength(2);
  });

  it("replaces in place when an existing id matches, preserving order", () => {
    const first = codeFile({ id: "file:a", path: "/a.py" });
    const target = codeFile({ id: "file:b", path: "/b.py", name: "old.py" });
    const last = codeFile({ id: "file:c", path: "/c.py" });
    const existing = [first, target, last];
    const incoming = codeFile({ id: "file:b", path: "/b.py", name: "new.py" });

    const result = upsertFileInList(existing, incoming);

    expect(result).toEqual([first, incoming, last]);
    expect(result[1]).toBe(incoming);
    expect(result[0]).toBe(first);
    expect(result[2]).toBe(last);
  });

  it("replaces in place when an existing path matches, preserving order", () => {
    const first = codeFile({ id: "file:a", path: "/a.py" });
    const target = codeFile({ id: "file:b", path: "/b.py", name: "old.py" });
    const last = codeFile({ id: "file:c", path: "/c.py" });
    const existing = [first, target, last];
    const incoming = codeFile({ id: "file:other", path: "/b.py", name: "new.py" });

    const result = upsertFileInList(existing, incoming);

    expect(result).toEqual([first, incoming, last]);
    expect(result[1]).toBe(incoming);
    expect(result[0]).toBe(first);
    expect(result[2]).toBe(last);
  });

  it("replaces only the first match when separate items match by id and by path", () => {
    const byId = codeFile({ id: "file:b", path: "/b.py", name: "by-id.py" });
    const byPath = codeFile({ id: "file:d", path: "/shared.py", name: "by-path.py" });
    const existing = [byId, byPath];
    const incoming = codeFile({ id: "file:b", path: "/shared.py", name: "incoming.py" });

    const result = upsertFileInList(existing, incoming);

    expect(result).toEqual([incoming, byPath]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(incoming);
    expect(result[1]).toBe(byPath);
  });

  it("does not mutate the input array or its elements", () => {
    const first = codeFile({ id: "file:a", path: "/a.py" });
    const target = codeFile({ id: "file:b", path: "/b.py", name: "old.py" });
    const existing = [first, target];
    const incoming = codeFile({ id: "file:b", path: "/b.py", name: "new.py" });

    const result = upsertFileInList(existing, incoming);

    expect(existing).toHaveLength(2);
    expect(existing[0]).toBe(first);
    expect(existing[1]).toBe(target);
    expect(existing[1].name).toBe("old.py");
    expect(result).not.toBe(existing);
  });
});

function codeFile(overrides: Partial<CodeFile>): CodeFile {
  return {
    id: "file:test",
    name: "model.py",
    path: "/tmp/model.py",
    language: "python",
    code: "",
    explanations: [],
    codeNodes: [],
    source: "sample",
    isLoaded: true,
    ...overrides
  };
}
