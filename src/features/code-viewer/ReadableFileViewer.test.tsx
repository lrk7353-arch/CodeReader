// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SampleFile } from "../../types/explanation";
import { ReadableFileViewer } from "./ReadableFileViewer";

vi.mock("./MonacoCodeViewer", () => ({
  MonacoCodeViewer: () => <div data-testid="source-viewer" />
}));

const markdownFile: SampleFile = {
  id: "file:notes",
  name: "notes.md",
  path: "/notes.md",
  language: "markdown",
  code: "# Notes\n\n<script>alert('x')</script>\n\n[bad](javascript:alert(1))",
  explanations: [],
  capability: {
    previewKind: "text",
    canPreview: true,
    canExplain: false,
    language: "markdown",
    sizeBytes: 64
  }
};

describe("ReadableFileViewer", () => {
  it("renders markdown without raw HTML or navigable unsafe links", () => {
    const { container } = render(
      <ReadableFileViewer
        file={markdownFile}
        onSelectExplanation={vi.fn()}
        onSelectionChange={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("bad").closest("a")).toBeNull();
    expect(screen.getByText("bad")).toHaveAttribute("title", "Unsafe link removed");
  });
});
