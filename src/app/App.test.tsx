import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { App, WorkspaceStatusAction } from "./App";

vi.mock("../features/code-viewer/MonacoCodeViewer", () => ({
  MonacoCodeViewer: () => <section>Code viewer</section>
}));

describe("App", () => {
  it("renders the browser-preview shell with the internal beta identity", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("CodeReader");
    expect(markup).toContain("内测 · Beta 4");
    expect(markup).toContain("体验示例");
  });

  it("renders actionable workspace status guidance", () => {
    expect(
      renderToStaticMarkup(
        <WorkspaceStatusAction action="openModelSettings" onOpenModelSettings={vi.fn()} />
      )
    ).toContain("打开模型设置");
    expect(
      renderToStaticMarkup(
        <WorkspaceStatusAction action="checkEncoding" onOpenModelSettings={vi.fn()} />
      )
    ).toContain("建议：检查文件编码");
    expect(
      renderToStaticMarkup(<WorkspaceStatusAction action="retry" onOpenModelSettings={vi.fn()} />)
    ).toContain("建议：重试");
    expect(
      renderToStaticMarkup(<WorkspaceStatusAction action="none" onOpenModelSettings={vi.fn()} />)
    ).toBe("");
  });
});
