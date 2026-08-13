// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { App, WorkspaceStatusAction } from "./App";

vi.mock("../features/code-viewer/MonacoCodeViewer", () => ({
  MonacoCodeViewer: () => <section>Code viewer</section>
}));

describe("App", () => {
  it("preserves the real App path origin across code and explanation navigation", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const { container } = render(<App />);
    const pathTab = container.querySelector<HTMLButtonElement>("#workspace-path-tab")!;
    const codeTab = container.querySelector<HTMLButtonElement>("#workspace-code-tab")!;
    const explanationTab = container.querySelector<HTMLButtonElement>(
      "#workspace-explanation-tab"
    )!;
    fireEvent.click(pathTab);
    const origin = container.querySelector<HTMLButtonElement>("[data-path-origin]")!;
    origin.focus();
    fireEvent.click(origin);
    fireEvent.click(codeTab);
    fireEvent.click(explanationTab);
    const explanationPanel = container.querySelector<HTMLElement>("#workspace-explanation-panel")!;
    fireEvent.keyDown(explanationPanel, { key: "Escape" });
    expect(container.querySelector("#workspace-path-panel")).toHaveAttribute("data-active", "true");
    expect(origin).toHaveFocus();
  });

  it("exposes the entry, more menu, and all three panel states in the real App", () => {
    const { container } = render(<App />);
    expect(container.querySelector(".project-start")).toBeInTheDocument();
    const moreTrigger = container.querySelector<HTMLButtonElement>(".more-menu > button")!;
    fireEvent.click(moreTrigger);
    expect(container.querySelector("#application-more-menu")).toHaveAttribute("role", "menu");
    for (const panel of ["path", "code", "explanation"] as const) {
      fireEvent.click(container.querySelector<HTMLButtonElement>(`#workspace-${panel}-tab`)!);
      expect(container.querySelector(`#workspace-${panel}-panel`)).toHaveAttribute(
        "data-active",
        "true"
      );
    }
  });

  it("renders the browser-preview shell with the release-candidate identity", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("CodeReader");
    expect(markup).toContain("1.0.0-rc.5");
    expect(markup).toContain("体验可验证示例");
    expect(markup).toContain("继续阅读");
    expect(markup).toContain("打开项目");
    expect(markup).toContain("为什么重要");
    expect(markup).not.toContain(
      'aria-label="Workspace actions"><button type="button" title="体验示例'
    );
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
