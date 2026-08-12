import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

export type WorkspacePanel = "path" | "code" | "explanation";

export interface MoreMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

export function MoreMenu({ items }: { items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
    const handlePointerDown = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target) &&
        !buttonRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]")
    ].filter((item) => !item.disabled);
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      enabled[(current + 1) % enabled.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      enabled[(current - 1 + enabled.length) % enabled.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      enabled[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      enabled.at(-1)?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  };

  return (
    <div className="more-menu">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="application-more-menu"
        title="更多功能"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
        <span>更多</span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          id="application-more-menu"
          className="more-menu-popover"
          role="menu"
          aria-label="更多功能"
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const panelLabels: Record<WorkspacePanel, string> = {
  path: "下一步",
  code: "真实代码",
  explanation: "为什么重要"
};

export function WorkspacePanelSwitcher({
  activePanel,
  onChange
}: {
  activePanel: WorkspacePanel;
  onChange: (panel: WorkspacePanel) => void;
}) {
  const panels = Object.keys(panelLabels) as WorkspacePanel[];
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = panels.indexOf(activePanel);
    let next: WorkspacePanel | undefined;
    if (event.key === "ArrowRight") next = panels[(current + 1) % panels.length];
    if (event.key === "ArrowLeft") next = panels[(current - 1 + panels.length) % panels.length];
    if (event.key === "Home") next = panels[0];
    if (event.key === "End") next = panels.at(-1);
    if (!next) return;
    event.preventDefault();
    onChange(next);
    window.requestAnimationFrame(() => document.getElementById(`workspace-${next}-tab`)?.focus());
  };
  return (
    <div
      className="workspace-panel-switcher"
      role="tablist"
      aria-label="阅读面板"
      onKeyDown={handleKeyDown}
    >
      {panels.map((panel) => (
        <button
          key={panel}
          id={`workspace-${panel}-tab`}
          type="button"
          role="tab"
          aria-selected={activePanel === panel}
          aria-controls={`workspace-${panel}-panel`}
          tabIndex={activePanel === panel ? 0 : -1}
          onClick={() => onChange(panel)}
        >
          {panelLabels[panel]}
        </button>
      ))}
    </div>
  );
}
