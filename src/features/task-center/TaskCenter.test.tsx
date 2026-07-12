// @vitest-environment jsdom
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskCenter } from "./TaskCenter";

const idleUpdate = { status: "idle" } as const;

describe("TaskCenter", () => {
  it("offers cancellation for an active generation", () => {
    const cancel = vi.fn();
    const trigger = createRef<HTMLButtonElement>();
    render(
      <>
        <button ref={trigger}>trigger</button>
        <TaskCenter
          generationStatus="generating"
          open
          returnFocusRef={trigger}
          updateState={idleUpdate}
          workspaceBusy={false}
          onCancelGeneration={cancel}
          onClose={vi.fn()}
          onRetryGeneration={vi.fn()}
          onRetryUpdate={vi.fn()}
        />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("closes with Escape and restores focus after closing", () => {
    const close = vi.fn();
    const trigger = createRef<HTMLButtonElement>();
    const { rerender } = render(
      <>
        <button ref={trigger}>trigger</button>
        <TaskCenter
          generationStatus="idle"
          open
          returnFocusRef={trigger}
          updateState={idleUpdate}
          workspaceBusy={false}
          onCancelGeneration={vi.fn()}
          onClose={close}
          onRetryGeneration={vi.fn()}
          onRetryUpdate={vi.fn()}
        />
      </>
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();

    rerender(
      <>
        <button ref={trigger}>trigger</button>
        <TaskCenter
          generationStatus="idle"
          open={false}
          returnFocusRef={trigger}
          updateState={idleUpdate}
          workspaceBusy={false}
          onCancelGeneration={vi.fn()}
          onClose={close}
          onRetryGeneration={vi.fn()}
          onRetryUpdate={vi.fn()}
        />
      </>
    );
    expect(trigger.current).toHaveFocus();
  });
});
