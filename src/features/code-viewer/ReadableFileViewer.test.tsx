// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SampleFile } from "../../types/explanation";
import { ReadableFileViewer } from "./ReadableFileViewer";

vi.mock("./MonacoCodeViewer", () => ({
  MonacoCodeViewer: () => <div data-testid="source-viewer" />
}));

let viewerResizeCallback: ResizeObserverCallback | undefined;
class ViewerResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    viewerResizeCallback = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ViewerResizeObserver);

function resizeViewer(width: number) {
  act(() => {
    viewerResizeCallback?.(
      [{ contentRect: { width } } as ResizeObserverEntry],
      {} as ResizeObserver
    );
  });
}

function renderViewer() {
  return render(
    <ReadableFileViewer
      file={markdownFile}
      onSelectExplanation={vi.fn()}
      onSelectionChange={vi.fn()}
    />
  );
}

const markdownFile: SampleFile = {
  id: "file:notes",
  name: "notes.md",
  path: "/notes.md",
  language: "markdown",
  code: "# Notes\n\n<script>alert('x')</script>\n\n<script\n\n[bad](javascript:alert(1))",
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
    expect(container.textContent).not.toContain("<script");
    expect(screen.getByText("bad").closest("a")).toBeNull();
    expect(screen.getByText("bad")).toHaveAttribute("title", "Unsafe link removed");
  });

  it("hides and restores the outline without removing the document", async () => {
    const user = userEvent.setup();
    render(
      <ReadableFileViewer
        file={markdownFile}
        onSelectExplanation={vi.fn()}
        onSelectionChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Hide outline" }));
    expect(screen.queryByRole("navigation", { name: "Document outline" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show outline" }));
    expect(screen.getByRole("navigation", { name: "Document outline" })).toBeInTheDocument();
  });

  it("automatically hides the outline below 560px and retains the article and recovery", async () => {
    const user = userEvent.setup();
    renderViewer();

    resizeViewer(559);
    expect(screen.queryByRole("navigation", { name: "Document outline" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show outline" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show outline" }));
    expect(screen.getByRole("navigation", { name: "Document outline" })).toBeInTheDocument();
  });

  it("supports every keyboard resize action and clamps to 140, 360, and 45 percent", () => {
    renderViewer();

    let separator = screen.getByRole("separator", { name: "Resize document outline" });
    expect(separator).toHaveAttribute("aria-valuenow", "190");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator).toHaveAttribute("aria-valuenow", "206");
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(separator).toHaveAttribute("aria-valuenow", "190");
    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator).toHaveAttribute("aria-valuenow", "140");
    fireEvent.keyDown(separator, { key: "End" });
    expect(separator).toHaveAttribute("aria-valuenow", "360");

    resizeViewer(600);
    separator = screen.getByRole("separator", { name: "Resize document outline" });
    expect(separator).toHaveAttribute("aria-valuemax", "270");
    expect(separator).toHaveAttribute("aria-valuenow", "270");
  });

  it("resizes by pointer movement and stops after pointer up", () => {
    renderViewer();
    const separator = screen.getByRole("separator", { name: "Resize document outline" });
    Object.defineProperty(separator, "setPointerCapture", { value: vi.fn() });

    fireEvent.pointerDown(separator, { pointerId: 1, clientX: 200 });
    fireEvent.pointerMove(window, { clientX: 250 });
    expect(separator).toHaveAttribute("aria-valuenow", "240");
    fireEvent.pointerUp(window);
    fireEvent.pointerMove(window, { clientX: 300 });
    expect(separator).toHaveAttribute("aria-valuenow", "240");
  });
});
