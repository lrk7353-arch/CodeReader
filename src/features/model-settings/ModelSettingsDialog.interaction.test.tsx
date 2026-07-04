// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ModelConfig, SaveModelConfigInput } from "../../types/explanation";
import { ModelSettingsDialog } from "./ModelSettingsDialog";

describe("ModelSettingsDialog workspace interactions", () => {
  it("cancels without saving when the cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn();

    renderDialog({ open: true, onClose, onSave });

    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("submits a new config with the entered fields", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    renderDialog({ open: true, onSave });

    await user.clear(screen.getByLabelText("模型名称"));
    await user.type(screen.getByLabelText("模型名称"), "gpt-4o-mini");

    await user.clear(screen.getByLabelText("API Key"));
    await user.type(screen.getByLabelText("API Key"), "sk-test-key");

    await user.click(screen.getByRole("button", { name: "保存配置" }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini",
        apiKey: "sk-test-key",
        timeoutSeconds: 60
      })
    );
  });

  it("omits the api key when the field is left blank", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    renderDialog({
      open: true,
      onSave,
      config: existingConfig({ hasApiKey: true })
    });

    await user.click(screen.getByRole("button", { name: "保存配置" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ apiKey: undefined }));
  });

  it("disables the save button while a save is in flight", () => {
    renderDialog({ open: true, busy: true });

    expect(screen.getByRole("button", { name: "保存中" })).toBeDisabled();
  });

  it("clears the stored config via the danger button", async () => {
    const user = userEvent.setup();
    const onResetConfig = vi.fn();

    renderDialog({
      open: true,
      onResetConfig,
      config: existingConfig({ hasApiKey: true })
    });

    await user.click(screen.getByRole("button", { name: "清除配置" }));

    expect(onResetConfig).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape when not busy", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderDialog({ open: true, onClose });

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on Escape while a save is in flight", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderDialog({ open: true, onClose, busy: true });

    await user.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderDialog({ open: true, onClose });

    await user.click(screen.getByRole("presentation"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when a click lands inside the dialog body", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderDialog({ open: true, onClose });

    await user.click(screen.getByRole("dialog"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    renderDialog({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

interface DialogOverrides {
  busy?: boolean;
  config?: ModelConfig;
  open?: boolean;
  onClose?: () => void;
  onResetConfig?: () => void;
  onSave?: (input: SaveModelConfigInput) => void;
}

function renderDialog(overrides: DialogOverrides = {}) {
  render(
    <ModelSettingsDialog
      busy={overrides.busy ?? false}
      config={overrides.config}
      error={undefined}
      open={overrides.open ?? true}
      onClose={overrides.onClose ?? noop}
      onResetConfig={overrides.onResetConfig ?? noop}
      onSave={overrides.onSave ?? noopSave}
    />
  );
}

function noop() {}

function noopSave() {}

function existingConfig(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    timeoutSeconds: 60,
    hasApiKey: false,
    configured: true,
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}
