import { History, Plus, Save, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type {
  PromptVersionInfo,
  PromptVersionStatus,
  UpsertPromptVersionInput
} from "../../types/explanation";

interface PromptRegistryDialogProps {
  busy: boolean;
  error?: string;
  open: boolean;
  versions: PromptVersionInfo[];
  onClose: () => void;
  onRefresh: () => void;
  onRollback: (targetVersion: string, failedVersion: string, notes: string) => void;
  onUpsert: (input: UpsertPromptVersionInput) => void;
}

const STATUS_OPTIONS: PromptVersionStatus[] = ["active", "canary", "rolled_back", "deprecated"];

export function PromptRegistryDialog({
  busy,
  error,
  open,
  versions,
  onClose,
  onRefresh,
  onRollback,
  onUpsert
}: PromptRegistryDialogProps) {
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null);
  const [rollbackNotes, setRollbackNotes] = useState("");
  const [registerVersion, setRegisterVersion] = useState("");
  const [registerStatus, setRegisterStatus] = useState<PromptVersionStatus>("canary");
  const [registerRollout, setRegisterRollout] = useState(50);
  const [registerNotes, setRegisterNotes] = useState("");
  const [registerSystemTemplate, setRegisterSystemTemplate] = useState("");
  const [registerUserTemplate, setRegisterUserTemplate] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setRollbackTarget(null);
    setRollbackNotes("");
    setRegisterVersion("");
    setRegisterStatus("canary");
    setRegisterRollout(50);
    setRegisterNotes("");
    setRegisterSystemTemplate("");
    setRegisterUserTemplate("");
  }, [open]);

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

  const activeVersion = versions.find((entry) => entry.status === "active");

  function submitRegister(event: FormEvent) {
    event.preventDefault();
    onUpsert({
      version: registerVersion.trim(),
      status: registerStatus,
      rolloutPercent: registerRollout,
      notes: registerNotes.trim() || null,
      systemPromptTemplate: registerSystemTemplate.trim() || null,
      userPromptTemplate: registerUserTemplate.trim() || null
    });
  }

  function confirmRollback() {
    if (!rollbackTarget) {
      return;
    }
    const failed = activeVersion?.version;
    if (!failed || failed === rollbackTarget) {
      return;
    }
    onRollback(rollbackTarget, failed, rollbackNotes.trim());
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-registry-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <div>
            <span className="dialog-eyebrow">Prompt 版本注册表</span>
            <h2 id="prompt-registry-title">Prompt 版本管理</h2>
          </div>
          <div className="dialog-header-actions">
            <button
              className="icon-button"
              type="button"
              onClick={onRefresh}
              disabled={busy}
              title="刷新版本列表"
            >
              <History size={17} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              onClick={onClose}
              title="关闭 Prompt 版本管理"
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="settings-form">
          <table className="prompt-registry-table">
            <thead>
              <tr>
                <th>版本</th>
                <th>状态</th>
                <th>灰度</th>
                <th>回滚来源</th>
                <th>备注</th>
                <th>模板</th>
                <th>更新时间</th>
                <th aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {versions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="prompt-registry-empty">
                    暂无已注册版本。
                  </td>
                </tr>
              ) : (
                versions.map((entry) => (
                  <tr key={entry.version}>
                    <td>{entry.version}</td>
                    <td>{entry.status}</td>
                    <td>{entry.rolloutPercent}%</td>
                    <td>{entry.rollbackFrom ?? "—"}</td>
                    <td>{entry.notes ?? "—"}</td>
                    <td>
                      {entry.systemPromptTemplate || entry.userPromptTemplate ? "自定义" : "默认"}
                    </td>
                    <td>{entry.updatedAt}</td>
                    <td>
                      {entry.status !== "active" ? (
                        <button
                          type="button"
                          className="prompt-registry-rollback"
                          disabled={busy || !activeVersion}
                          onClick={() => setRollbackTarget(entry.version)}
                          title={`回滚到 ${entry.version}`}
                        >
                          回滚到该版本
                        </button>
                      ) : (
                        <span className="prompt-registry-current">当前生效</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {rollbackTarget ? (
            <div className="prompt-registry-rollback-form">
              <p className="dialog-eyebrow">
                确认回滚：将 {activeVersion?.version} 标记为 rolled_back，并把 {rollbackTarget}{" "}
                提升为 active。
              </p>
              <label>
                <span>回滚备注（可选）</span>
                <input
                  type="text"
                  value={rollbackNotes}
                  onChange={(event) => setRollbackNotes(event.target.value)}
                  placeholder="例如：canary 在 12% 请求中返回畸形 JSON"
                  autoFocus
                />
              </label>
              <footer className="dialog-actions">
                <button type="button" onClick={() => setRollbackTarget(null)} disabled={busy}>
                  取消
                </button>
                <button
                  className="primary-button"
                  type="button"
                  onClick={confirmRollback}
                  disabled={busy}
                >
                  <Save size={15} aria-hidden="true" />
                  <span>{busy ? "回滚中" : "确认回滚"}</span>
                </button>
              </footer>
            </div>
          ) : null}

          <form className="prompt-registry-register" onSubmit={submitRegister}>
            <h3>
              <Plus size={15} aria-hidden="true" />
              <span>注册或更新版本</span>
            </h3>
            <label>
              <span>版本号</span>
              <input
                type="text"
                value={registerVersion}
                onChange={(event) => setRegisterVersion(event.target.value)}
                placeholder="code-explanation-v0.2-rc1"
                required
              />
            </label>
            <label>
              <span>状态</span>
              <select
                value={registerStatus}
                onChange={(event) => setRegisterStatus(event.target.value as PromptVersionStatus)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>灰度百分比</span>
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={registerRollout}
                onChange={(event) => setRegisterRollout(Number(event.target.value))}
              />
            </label>
            <label>
              <span>备注</span>
              <input
                type="text"
                value={registerNotes}
                onChange={(event) => setRegisterNotes(event.target.value)}
                placeholder="可选"
              />
            </label>
            <label>
              <span>System Prompt 模板（可选，留空用默认）</span>
              <textarea
                value={registerSystemTemplate}
                onChange={(event) => setRegisterSystemTemplate(event.target.value)}
                placeholder="留空使用默认 system prompt；自定义文本会作为 system 消息发送给模型"
                rows={3}
              />
            </label>
            <label>
              <span>User Prompt 模板（可选，留空用默认）</span>
              <textarea
                value={registerUserTemplate}
                onChange={(event) => setRegisterUserTemplate(event.target.value)}
                placeholder={
                  "支持占位符：{display_mode} {prompt_version} {payload}\n留空使用默认 user prompt"
                }
                rows={3}
              />
            </label>
            {error ? <p className="dialog-error">{error}</p> : null}
            <footer className="dialog-actions">
              <button className="primary-button" type="submit" disabled={busy}>
                <Save size={15} aria-hidden="true" />
                <span>{busy ? "保存中" : "保存版本"}</span>
              </button>
            </footer>
          </form>
        </div>
      </section>
    </div>
  );
}
