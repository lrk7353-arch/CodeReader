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
