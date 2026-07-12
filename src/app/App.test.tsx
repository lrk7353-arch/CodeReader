import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { App, WorkspaceStatusAction } from "./App";

vi.mock("../features/code-viewer/MonacoCodeViewer", () => ({
  MonacoCodeViewer: () => <section>Code viewer</section>
}));

describe("App", () => {
  it("renders the browser-preview shell with the release-candidate identity", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("CodeReader");
    expect(markup).toContain("1.0.0-rc.2");
    expect(markup).toContain("体验示例");
  });

  it("renders actionable workspace status guidance", () => {
    const noop = () => {};
    expect(
      renderToStaticMarkup(
        <WorkspaceStatusAction
          action="openModelSettings"
          hasErrorDetail={false}
          onCopyErrorDetail={noop}
          onOpenModelSettings={vi.fn()}
          onReopenFile={noop}
          onReopenProject={noop}
          onRetry={noop}
        />
      )
    ).toContain("打开模型设置");
    expect(
      renderToStaticMarkup(
        <WorkspaceStatusAction
          action="checkEncoding"
          hasErrorDetail={false}
          onCopyErrorDetail={noop}
          onOpenModelSettings={noop}
          onReopenFile={noop}
          onReopenProject={noop}
          onRetry={noop}
        />
      )
    ).toContain("重新选择文件");
    expect(
      renderToStaticMarkup(
        <WorkspaceStatusAction
          action="retry"
          hasErrorDetail={false}
          onCopyErrorDetail={noop}
          onOpenModelSettings={noop}
          onReopenFile={noop}
          onReopenProject={noop}
          onRetry={noop}
        />
      )
    ).toContain("重试");
    expect(
      renderToStaticMarkup(
        <WorkspaceStatusAction
          action="retry"
          hasErrorDetail={true}
          onCopyErrorDetail={noop}
          onOpenModelSettings={noop}
          onReopenFile={noop}
          onReopenProject={noop}
          onRetry={noop}
        />
      )
    ).toContain("复制错误详情");
    expect(
      renderToStaticMarkup(
        <WorkspaceStatusAction
          action="none"
          hasErrorDetail={false}
          onCopyErrorDetail={noop}
          onOpenModelSettings={noop}
          onReopenFile={noop}
          onReopenProject={noop}
          onRetry={noop}
        />
      )
    ).toBe("");
  });
});
