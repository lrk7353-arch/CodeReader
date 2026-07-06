import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("../features/code-viewer/MonacoCodeViewer", () => ({
  MonacoCodeViewer: () => <section>Code viewer</section>
}));

describe("App", () => {
  it("renders the browser-preview shell with the internal beta identity", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("CodeReader");
    expect(markup).toContain("内测 · Beta 3");
    expect(markup).toContain("体验示例");
  });
});
