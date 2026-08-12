// @vitest-environment jsdom

import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MoreMenu, WorkspacePanelSwitcher, type WorkspacePanel } from "./AppNavigation";

describe("MoreMenu", () => {
  it("keeps secondary actions keyboard accessible and restores trigger focus", async () => {
    const user = userEvent.setup();
    const openFile = vi.fn();
    render(
      <MoreMenu
        items={[
          { id: "file", label: "打开单个文件", onSelect: openFile },
          { id: "model", label: "模型详细配置", onSelect: vi.fn() }
        ]}
      />
    );

    const trigger = screen.getByRole("button", { name: "更多" });
    await user.click(trigger);
    expect(screen.getByRole("menu", { name: "更多功能" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "打开单个文件" })).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "模型详细配置" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "打开单个文件" }));
    expect(openFile).toHaveBeenCalledOnce();
    expect(trigger).toHaveFocus();
  });
});

describe("WorkspacePanelSwitcher", () => {
  it("exposes the three semantic reading panes as tabs", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function ControlledSwitcher() {
      const [activePanel, setActivePanel] = useState<WorkspacePanel>("code");
      return (
        <WorkspacePanelSwitcher
          activePanel={activePanel}
          onChange={(panel) => {
            onChange(panel);
            setActivePanel(panel);
          }}
        />
      );
    }
    render(<ControlledSwitcher />);

    expect(screen.getByRole("tab", { name: "真实代码" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "为什么重要" }));
    expect(onChange).toHaveBeenCalledWith("explanation");
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("code");
  });
});
