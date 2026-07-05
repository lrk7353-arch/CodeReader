// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PromptVersionInfo, UpsertPromptVersionInput } from "../../types/explanation";
import { PromptRegistryDialog } from "./PromptRegistryDialog";

function sampleVersions(overrides: Partial<PromptVersionInfo>[] = []): PromptVersionInfo[] {
  const base: PromptVersionInfo[] = [
    {
      version: "code-explanation-v0.1",
      status: "active",
      rolloutPercent: 100,
      rollbackFrom: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    },
    {
      version: "code-explanation-v0.2-rc1",
      status: "canary",
      rolloutPercent: 30,
      rollbackFrom: null,
      notes: "Canary for structured output tightening.",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z"
    }
  ];
  return overrides.length ? (overrides as PromptVersionInfo[]) : base;
}

interface RenderOptions {
  busy?: boolean;
  error?: string;
  open?: boolean;
  versions?: PromptVersionInfo[];
  onClose?: () => void;
  onRefresh?: () => void;
  onRollback?: (target: string, failed: string, notes: string) => void;
  onUpsert?: (input: UpsertPromptVersionInput) => void;
}

function renderDialog(options: RenderOptions = {}) {
  const props = {
    busy: options.busy ?? false,
    error: options.error,
    open: options.open ?? true,
    versions: options.versions ?? sampleVersions(),
    onClose: options.onClose ?? vi.fn(),
    onRefresh: options.onRefresh ?? vi.fn(),
    onRollback: options.onRollback ?? vi.fn(),
    onUpsert: options.onUpsert ?? vi.fn()
  };
  render(<PromptRegistryDialog {...props} />);
  return props;
}

describe("PromptRegistryDialog interactions", () => {
  it("renders the registered versions when open", () => {
    renderDialog();

    expect(screen.getByText("code-explanation-v0.1")).toBeInTheDocument();
    expect(screen.getByText("code-explanation-v0.2-rc1")).toBeInTheDocument();
    expect(screen.getByText("当前生效")).toBeInTheDocument();
  });

  it("closes on cancel button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDialog({ onClose });

    await user.click(screen.getByRole("button", { name: "关闭 Prompt 版本管理" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("refreshes the version list on demand", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    renderDialog({ onRefresh });

    await user.click(screen.getByRole("button", { name: "刷新版本列表" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("opens the rollback confirmation form and submits with notes", async () => {
    const user = userEvent.setup();
    const onRollback = vi.fn();
    renderDialog({ onRollback });

    await user.click(screen.getByRole("button", { name: "回滚到该版本" }));

    expect(
      screen.getByPlaceholderText("例如：canary 在 12% 请求中返回畸形 JSON")
    ).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("例如：canary 在 12% 请求中返回畸形 JSON"),
      "Canary malformed JSON"
    );
    await user.click(screen.getByRole("button", { name: "确认回滚" }));

    expect(onRollback).toHaveBeenCalledWith(
      "code-explanation-v0.2-rc1",
      "code-explanation-v0.1",
      "Canary malformed JSON"
    );
  });

  it("submits rollback without notes when the field is blank", async () => {
    const user = userEvent.setup();
    const onRollback = vi.fn();
    renderDialog({ onRollback });

    await user.click(screen.getByRole("button", { name: "回滚到该版本" }));
    await user.click(screen.getByRole("button", { name: "确认回滚" }));

    expect(onRollback).toHaveBeenCalledWith(
      "code-explanation-v0.2-rc1",
      "code-explanation-v0.1",
      ""
    );
  });

  it("registers a new prompt version via the form", async () => {
    const user = userEvent.setup();
    const onUpsert = vi.fn();
    renderDialog({ onUpsert });

    await user.type(
      screen.getByPlaceholderText("code-explanation-v0.2-rc1"),
      "code-explanation-v0.3"
    );
    await user.clear(screen.getByLabelText("灰度百分比"));
    await user.type(screen.getByLabelText("灰度百分比"), "20");
    await user.click(screen.getByRole("button", { name: "保存版本" }));

    expect(onUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        version: "code-explanation-v0.3",
        status: "canary",
        rolloutPercent: 20,
        notes: null
      })
    );
  });

  it("disables actions while busy", () => {
    renderDialog({ busy: true });

    expect(screen.getByRole("button", { name: "保存中" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "刷新版本列表" })).toBeDisabled();
  });

  it("renders an empty state when no versions are registered", () => {
    renderDialog({ versions: [] });

    expect(screen.getByText("暂无已注册版本。")).toBeInTheDocument();
  });

  it("does not offer rollback when no active version exists", () => {
    renderDialog({
      versions: [
        {
          version: "code-explanation-v0.2-rc1",
          status: "canary",
          rolloutPercent: 30,
          rollbackFrom: null,
          notes: null,
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z"
        }
      ]
    });

    expect(screen.queryByRole("button", { name: "回滚到该版本" })).toBeDisabled();
  });
});
