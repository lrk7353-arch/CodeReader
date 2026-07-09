import { KeyRound, Save, Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { getAppCopy } from "../../app/copy";
import type { ModelConfig, SaveModelConfigInput } from "../../types/explanation";

interface ModelSettingsDialogProps {
  busy: boolean;
  config?: ModelConfig;
  connectionResult?: string;
  connectionTesting?: boolean;
  error?: string;
  open: boolean;
  onClose: () => void;
  onResetConfig: () => void;
  onSave: (input: SaveModelConfigInput) => void;
  onTestConnection?: (input: { endpoint?: string; model?: string; apiKey?: string }) => void;
}

export function ModelSettingsDialog({
  busy,
  config,
  connectionResult,
  connectionTesting,
  error,
  open,
  onClose,
  onResetConfig,
  onSave,
  onTestConnection
}: ModelSettingsDialogProps) {
  const copy = getAppCopy();
  const modelSettings = copy.modelSettings;
  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState("");
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setEndpoint(config?.endpoint ?? "https://api.openai.com/v1/chat/completions");
    setModel(config?.model ?? "");
    setTimeoutSeconds(config?.timeoutSeconds ?? 60);
    setApiKey("");
  }, [config, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose, open]);

  if (!open) {
    return null;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      endpoint,
      model,
      timeoutSeconds,
      apiKey: apiKey.trim() || undefined
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div>
            <span className="dialog-eyebrow">{modelSettings.eyebrow}</span>
            <h2 id="model-settings-title">{modelSettings.title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            title={modelSettings.closeTitle}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <form className="settings-form" onSubmit={submit}>
          <label>
            <span>{modelSettings.endpointLabel}</span>
            <input
              type="url"
              autoFocus
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder={modelSettings.endpointPlaceholder}
              required
            />
          </label>
          <p className="credential-note">{modelSettings.endpointNote}</p>
          <label>
            <span>{modelSettings.modelLabel}</span>
            <input
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={modelSettings.modelPlaceholder}
              required
            />
          </label>
          <label>
            <span>{modelSettings.apiKeyLabel}</span>
            <div className="credential-input">
              <KeyRound size={15} aria-hidden="true" />
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={
                  config?.hasApiKey
                    ? modelSettings.apiKeyPlaceholderConfigured
                    : modelSettings.apiKeyPlaceholderLocal
                }
                autoComplete="off"
              />
            </div>
          </label>
          <label>
            <span>{modelSettings.timeoutLabel}</span>
            <input
              type="number"
              min={10}
              max={300}
              step={5}
              value={timeoutSeconds}
              onChange={(event) => setTimeoutSeconds(Number(event.target.value))}
            />
          </label>

          <p className="credential-note">{modelSettings.credentialNote}</p>
          {onTestConnection ? (
            <div className="model-connection-test">
              <button
                type="button"
                className="model-connection-button"
                onClick={() =>
                  onTestConnection({
                    endpoint: endpoint || undefined,
                    model: model || undefined,
                    apiKey: apiKey.trim() || undefined
                  })
                }
                disabled={busy || connectionTesting}
                title="用当前表单内容向模型端点发送最小请求，验证连通性"
              >
                {connectionTesting ? "测试中..." : "测试连接"}
              </button>
              {connectionResult ? (
                <p
                  className={
                    connectionResult.startsWith("连接成功")
                      ? "model-connection-result ok"
                      : "model-connection-result error"
                  }
                >
                  {connectionResult}
                </p>
              ) : null}
            </div>
          ) : null}
          {error ? <p className="dialog-error">{error}</p> : null}

          <footer className="dialog-actions">
            {config?.updatedAt || config?.hasApiKey ? (
              <button
                className="danger-button"
                type="button"
                onClick={onResetConfig}
                disabled={busy}
              >
                <Trash2 size={15} aria-hidden="true" />
                <span>{modelSettings.clearConfig}</span>
              </button>
            ) : null}
            <span className="dialog-action-spacer" />
            <button type="button" onClick={onClose} disabled={busy}>
              {modelSettings.cancel}
            </button>
            <button className="primary-button" type="submit" disabled={busy}>
              <Save size={15} aria-hidden="true" />
              <span>{busy ? modelSettings.saving : modelSettings.save}</span>
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
