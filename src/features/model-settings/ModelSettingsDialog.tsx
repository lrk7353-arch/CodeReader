import { KeyRound, Save, Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { ModelConfig, SaveModelConfigInput } from "../../types/explanation";

interface ModelSettingsDialogProps {
  busy: boolean;
  config?: ModelConfig;
  error?: string;
  open: boolean;
  onClose: () => void;
  onResetConfig: () => void;
  onSave: (input: SaveModelConfigInput) => void;
}

export function ModelSettingsDialog({
  busy,
  config,
  error,
  open,
  onClose,
  onResetConfig,
  onSave
}: ModelSettingsDialogProps) {
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
            <span className="dialog-eyebrow">OpenAI-compatible</span>
            <h2 id="model-settings-title">模型设置</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="关闭模型设置">
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <form className="settings-form" onSubmit={submit}>
          <label>
            <span>Chat Completions URL</span>
            <input
              type="url"
              autoFocus
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="https://api.example.com/v1/chat/completions"
              required
            />
          </label>
          <label>
            <span>模型名称</span>
            <input
              type="text"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="model-name"
              required
            />
          </label>
          <label>
            <span>API Key</span>
            <div className="credential-input">
              <KeyRound size={15} aria-hidden="true" />
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={config?.hasApiKey ? "已安全保存，留空则保持不变" : "本地模型可留空"}
                autoComplete="off"
              />
            </div>
          </label>
          <label>
            <span>请求超时（秒）</span>
            <input
              type="number"
              min={10}
              max={300}
              step={5}
              value={timeoutSeconds}
              onChange={(event) => setTimeoutSeconds(Number(event.target.value))}
            />
          </label>

          <p className="credential-note">密钥保存到系统凭据库，不写入 SQLite、源码或日志。</p>
          {error ? <p className="dialog-error">{error}</p> : null}

          <footer className="dialog-actions">
            {config?.updatedAt || config?.hasApiKey ? (
              <button className="danger-button" type="button" onClick={onResetConfig} disabled={busy}>
                <Trash2 size={15} aria-hidden="true" />
                <span>清除配置</span>
              </button>
            ) : null}
            <span className="dialog-action-spacer" />
            <button type="button" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button className="primary-button" type="submit" disabled={busy}>
              <Save size={15} aria-hidden="true" />
              <span>{busy ? "保存中" : "保存配置"}</span>
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
