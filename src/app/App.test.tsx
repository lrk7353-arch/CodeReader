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
    // checkEncoding now renders an actionable "重新选择文件" button, not a hint.
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
    // retry now renders an actionable "重试" button.
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
    // When there is an error detail, a "复制错误详情" button appears.
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
