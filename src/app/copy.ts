import type { Explanation } from "../types/explanation";
import type { PersistenceStatus } from "./hooks/useWorkspaceFiles";

export type CopyLocale = "zh-CN" | "en";

export interface AppCopy {
  brand: {
    title: string;
    tagline: string;
    stageBadge: string;
  };
  actions: {
    sample: string;
    openFile: string;
    openProject: string;
    model: string;
  };
  actionTitles: {
    sample: string;
    openFile: string;
    openProject: string;
    model: string;
  };
  persistenceLabel: Record<PersistenceStatus, string>;
  persistenceTooltip: Record<PersistenceStatus, string>;
  explanationStatus: Record<Explanation["status"], string>;
  fileStatus: {
    unpreviewable: string;
    readonlyPreview: string;
    dash: string;
  };
  model: {
    unconfigured: string;
  };
  modelSettings: {
    title: string;
    eyebrow: string;
    closeTitle: string;
    endpointLabel: string;
    endpointPlaceholder: string;
    endpointNote: string;
    modelLabel: string;
    modelPlaceholder: string;
    apiKeyLabel: string;
    apiKeyPlaceholderConfigured: string;
    apiKeyPlaceholderLocal: string;
    timeoutLabel: string;
    credentialNote: string;
    clearConfig: string;
    cancel: string;
    save: string;
    saving: string;
  };
  generation: {
    confirmTitle: string;
    confirm: string;
    cancel: string;
    generating: string;
    regenerate: string;
    generate: string;
    generatingHint: string;
  };
  promptRegistry: {
    title: string;
    eyebrow: string;
    refreshTitle: string;
    closeTitle: string;
    empty: string;
    rollback: string;
    edit: string;
    currentActive: string;
    rollbackConfirm: string;
    rollbackNotesLabel: string;
    rollbackNotesPlaceholder: string;
    rollbackCancel: string;
    rollbackConfirmButton: string;
    rollingBack: string;
    registerTitle: string;
    versionLabel: string;
    versionPlaceholder: string;
    statusLabel: string;
    rolloutLabel: string;
    notesLabel: string;
    notesPlaceholder: string;
    systemTemplateLabel: string;
    systemTemplatePlaceholder: string;
    userTemplateLabel: string;
    userTemplatePlaceholder: string;
    templateColumn: string;
    templateCustom: string;
    templateDefault: string;
    save: string;
    saving: string;
  };
}

const zhCN: AppCopy = {
  brand: {
    title: "CodeReader",
    tagline: "\u72ec\u7acb\u684c\u9762\u4ee3\u7801\u9605\u8bfb IDE",
    stageBadge: "\u5185\u6d4b \u00b7 Beta 3"
  },
  actions: {
    sample: "\u4f53\u9a8c\u793a\u4f8b",
    openFile: "\u6253\u5f00\u6587\u4ef6",
    openProject: "\u6253\u5f00\u9879\u76ee",
    model: "\u6a21\u578b"
  },
  actionTitles: {
    sample: "\u4f53\u9a8c\u65e0\u9700 API Key \u7684\u4e09\u6587\u4ef6\u793a\u4f8b\u9879\u76ee",
    openFile: "\u6253\u5f00\u5355\u4e2a\u4ee3\u7801\u6587\u4ef6",
    openProject: "\u6253\u5f00\u672c\u5730\u9879\u76ee\u6587\u4ef6\u5939",
    model: "\u914d\u7f6e LLM"
  },
  persistenceLabel: {
    preview: "\u6d4f\u89c8\u5668\u9884\u89c8",
    initializing: "\u672c\u5730\u5e93\u521d\u59cb\u5316\u4e2d",
    ready: "\u672c\u5730\u5e93\u5c31\u7eea",
    error: "\u672c\u5730\u5e93\u5f02\u5e38"
  },
  persistenceTooltip: {
    preview: "\u6d4f\u89c8\u5668\u9884\u89c8\u4e0d\u521b\u5efa SQLite \u6570\u636e\u5e93",
    initializing: "\u6b63\u5728\u521b\u5efa\u6216\u6253\u5f00 CodeReader SQLite \u6570\u636e\u5e93",
    ready: "CodeReader SQLite \u6570\u636e\u5e93\u5df2\u5c31\u7eea",
    error: "CodeReader SQLite \u6570\u636e\u5e93\u521d\u59cb\u5316\u6216\u5199\u5165\u5931\u8d25"
  },
  explanationStatus: {
    valid: "\u6709\u6548",
    stale: "\u53ef\u80fd\u8fc7\u671f",
    invalid: "\u5df2\u8fc7\u671f",
    new_unexplained: "\u65b0\u589e\u672a\u89e3\u91ca",
    deleted: "\u5df2\u5220\u9664",
    transient: "\u4e34\u65f6\u9009\u62e9"
  },
  fileStatus: {
    unpreviewable: "\u4e0d\u53ef\u9884\u89c8",
    readonlyPreview: "\u53ea\u8bfb\u9884\u89c8",
    dash: "-"
  },
  model: {
    unconfigured: "\u6a21\u578b\u672a\u914d\u7f6e"
  },
  modelSettings: {
    title: "\u6a21\u578b\u8bbe\u7f6e",
    eyebrow: "OpenAI-compatible",
    closeTitle: "\u5173\u95ed\u6a21\u578b\u8bbe\u7f6e",
    endpointLabel: "Chat Completions / Responses URL",
    endpointPlaceholder: "https://api.example.com/v1/chat/completions or /v1/responses",
    endpointNote:
      "Supports Chat Completions, for example /v1/chat/completions, or Responses, for example /v1/responses.",
    modelLabel: "\u6a21\u578b\u540d\u79f0",
    modelPlaceholder: "model-name",
    apiKeyLabel: "API Key",
    apiKeyPlaceholderConfigured:
      "\u5df2\u5b89\u5168\u4fdd\u5b58\uff0c\u7559\u7a7a\u5219\u4fdd\u6301\u4e0d\u53d8",
    apiKeyPlaceholderLocal: "\u672c\u5730\u6a21\u578b\u53ef\u7559\u7a7a",
    timeoutLabel: "\u8bf7\u6c42\u8d85\u65f6\uff08\u79d2\uff09",
    credentialNote:
      "\u5bc6\u94a5\u4fdd\u5b58\u5230\u7cfb\u7edf\u51ed\u636e\u5e93\uff0c\u4e0d\u5199\u5165 SQLite\u3001\u6e90\u7801\u6216\u65e5\u5fd7\u3002",
    clearConfig: "\u6e05\u9664\u914d\u7f6e",
    cancel: "\u53d6\u6d88",
    save: "\u4fdd\u5b58\u914d\u7f6e",
    saving: "\u4fdd\u5b58\u4e2d"
  },
  generation: {
    confirmTitle: "\u751f\u6210\u786e\u8ba4",
    confirm: "\u786e\u8ba4\u751f\u6210",
    cancel: "\u53d6\u6d88",
    generating: "\u751f\u6210\u4e2d",
    regenerate: "\u91cd\u65b0\u751f\u6210",
    generate: "\u751f\u6210\u89e3\u91ca",
    generatingHint: "\u6b63\u5728\u751f\u6210\u89e3\u91ca\uff0c\u53ef\u7ee7\u7eed\u9605\u8bfb\u3002"
  },
  promptRegistry: {
    title: "Prompt \u7248\u672c\u7ba1\u7406",
    eyebrow: "Prompt \u7248\u672c\u6ce8\u518c\u8868",
    refreshTitle: "\u5237\u65b0\u7248\u672c\u5217\u8868",
    closeTitle: "\u5173\u95ed Prompt \u7248\u672c\u7ba1\u7406",
    empty: "\u6682\u65e0\u5df2\u6ce8\u518c\u7248\u672c\u3002",
    rollback: "\u56de\u6eda",
    edit: "\u7f16\u8f91",
    currentActive: "\u5f53\u524d\u751f\u6548",
    rollbackConfirm:
      "\u786e\u8ba4\u56de\u6eda\uff1a\u5c06\u5931\u8d25\u7248\u672c\u6807\u8bb0\u4e3a rolled_back\uff0c\u5e76\u628a\u76ee\u6807\u7248\u672c\u63d0\u5347\u4e3a active\u3002",
    rollbackNotesLabel: "\u56de\u6eda\u5907\u6ce8\uff08\u53ef\u9009\uff09",
    rollbackNotesPlaceholder:
      "\u4f8b\u5982\uff1acanary \u5728 12% \u8bf7\u6c42\u4e2d\u8fd4\u56de\u7572\u5f62 JSON",
    rollbackCancel: "\u53d6\u6d88",
    rollbackConfirmButton: "\u786e\u8ba4\u56de\u6eda",
    rollingBack: "\u56de\u6eda\u4e2d",
    registerTitle: "\u6ce8\u518c\u6216\u66f4\u65b0\u7248\u672c",
    versionLabel: "\u7248\u672c\u53f7",
    versionPlaceholder: "code-explanation-v0.2-rc1",
    statusLabel: "\u72b6\u6001",
    rolloutLabel: "\u7070\u5ea6\u767e\u5206\u6bd4",
    notesLabel: "\u5907\u6ce8",
    notesPlaceholder: "\u53ef\u9009",
    systemTemplateLabel:
      "System Prompt \u6a21\u677f\uff08\u53ef\u9009\uff0c\u7559\u7a7a\u7528\u9ed8\u8ba4\uff09",
    systemTemplatePlaceholder:
      "\u7559\u7a7a\u4f7f\u7528\u9ed8\u8ba4 system prompt\uff1b\u81ea\u5b9a\u4e49\u6587\u672c\u4f1a\u4f5c\u4e3a system \u6d88\u606f\u53d1\u9001\u7ed9\u6a21\u578b",
    userTemplateLabel:
      "User Prompt \u6a21\u677f\uff08\u53ef\u9009\uff0c\u7559\u7a7a\u7528\u9ed8\u8ba4\uff09",
    userTemplatePlaceholder:
      "\u652f\u6301\u5360\u4f4d\u7b26\uff1a{display_mode} {prompt_version} {payload}\n\u7559\u7a7a\u4f7f\u7528\u9ed8\u8ba4 user prompt",
    templateColumn: "\u6a21\u677f",
    templateCustom: "\u81ea\u5b9a\u4e49",
    templateDefault: "\u9ed8\u8ba4",
    save: "\u4fdd\u5b58\u7248\u672c",
    saving: "\u4fdd\u5b58\u4e2d"
  }
};

const en: AppCopy = {
  brand: {
    title: "CodeReader",
    tagline: "Standalone desktop code-reading IDE",
    stageBadge: "Internal \u00b7 Beta 3"
  },
  actions: {
    sample: "Try sample",
    openFile: "Open file",
    openProject: "Open project",
    model: "Model"
  },
  actionTitles: {
    sample: "Try the three-file sample project without an API key",
    openFile: "Open a single code file",
    openProject: "Open a local project folder",
    model: "Configure LLM"
  },
  persistenceLabel: {
    preview: "Browser preview",
    initializing: "Local DB initializing",
    ready: "Local DB ready",
    error: "Local DB error"
  },
  persistenceTooltip: {
    preview: "Browser preview does not create an SQLite database",
    initializing: "Creating or opening the CodeReader SQLite database",
    ready: "CodeReader SQLite database is ready",
    error: "CodeReader SQLite database failed to initialize or write"
  },
  explanationStatus: {
    valid: "Valid",
    stale: "Possibly stale",
    invalid: "Stale",
    new_unexplained: "New unexplained",
    deleted: "Deleted",
    transient: "Transient selection"
  },
  fileStatus: {
    unpreviewable: "Not previewable",
    readonlyPreview: "Read-only preview",
    dash: "-"
  },
  model: {
    unconfigured: "Model not configured"
  },
  modelSettings: {
    title: "Model settings",
    eyebrow: "OpenAI-compatible",
    closeTitle: "Close model settings",
    endpointLabel: "Chat Completions / Responses URL",
    endpointPlaceholder: "https://api.example.com/v1/chat/completions or /v1/responses",
    endpointNote:
      "Supports Chat Completions, for example /v1/chat/completions, or Responses, for example /v1/responses.",
    modelLabel: "Model name",
    modelPlaceholder: "model-name",
    apiKeyLabel: "API Key",
    apiKeyPlaceholderConfigured: "Saved securely, leave blank to keep",
    apiKeyPlaceholderLocal: "Leave blank for local model",
    timeoutLabel: "Request timeout (seconds)",
    credentialNote:
      "The key is stored in the system credential vault, not in SQLite, source, or logs.",
    clearConfig: "Clear config",
    cancel: "Cancel",
    save: "Save config",
    saving: "Saving"
  },
  generation: {
    confirmTitle: "Generate confirmation",
    confirm: "Confirm generate",
    cancel: "Cancel",
    generating: "Generating",
    regenerate: "Regenerate",
    generate: "Generate explanation",
    generatingHint: "Generating explanation, you can keep reading."
  },
  promptRegistry: {
    title: "Prompt version management",
    eyebrow: "Prompt version registry",
    refreshTitle: "Refresh version list",
    closeTitle: "Close Prompt version management",
    empty: "No registered versions yet.",
    rollback: "Rollback",
    edit: "Edit",
    currentActive: "Active",
    rollbackConfirm:
      "Confirm rollback: mark the failed version as rolled_back and promote the target to active.",
    rollbackNotesLabel: "Rollback note (optional)",
    rollbackNotesPlaceholder: "e.g. canary returned malformed JSON in 12% of requests",
    rollbackCancel: "Cancel",
    rollbackConfirmButton: "Confirm rollback",
    rollingBack: "Rolling back",
    registerTitle: "Register or update a version",
    versionLabel: "Version",
    versionPlaceholder: "code-explanation-v0.2-rc1",
    statusLabel: "Status",
    rolloutLabel: "Rollout percent",
    notesLabel: "Notes",
    notesPlaceholder: "Optional",
    systemTemplateLabel: "System Prompt template (optional, blank = default)",
    systemTemplatePlaceholder:
      "Leave blank for the default system prompt; custom text is sent as the system message.",
    userTemplateLabel: "User Prompt template (optional, blank = default)",
    userTemplatePlaceholder:
      "Placeholders: {display_mode} {prompt_version} {payload}\nLeave blank for the default user prompt.",
    templateColumn: "Template",
    templateCustom: "Custom",
    templateDefault: "Default",
    save: "Save version",
    saving: "Saving"
  }
};

const copies: Record<CopyLocale, AppCopy> = {
  "zh-CN": zhCN,
  en
};

const DEFAULT_LOCALE: CopyLocale = "zh-CN";

export function getCopyLocale(): CopyLocale {
  return DEFAULT_LOCALE;
}

export function getAppCopy(locale: CopyLocale = getCopyLocale()): AppCopy {
  return copies[locale] ?? copies[DEFAULT_LOCALE];
}
