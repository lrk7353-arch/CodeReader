import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  CodeFile,
  Explanation,
  ExplanationFeedbackType,
  ProjectScanResult,
  ReadingState
} from "../types/explanation";

const codeFileFilters = [
  {
    name: "Code files",
    extensions: ["js", "jsx", "ts", "tsx"]
  }
];

export function isDesktopRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function pickAndLoadCodeFile(): Promise<CodeFile | null> {
  ensureDesktopRuntime();
  const selectedPath = await open({
    directory: false,
    multiple: false,
    filters: codeFileFilters
  });
  if (typeof selectedPath !== "string") {
    return null;
  }
  return loadCodeFile(selectedPath);
}

export async function pickAndScanProject(): Promise<ProjectScanResult | null> {
  ensureDesktopRuntime();
  const selectedPath = await open({
    directory: true,
    multiple: false
  });
  if (typeof selectedPath !== "string") {
    return null;
  }
  return scanProject(selectedPath);
}

export async function loadCodeFile(path: string, projectRoot?: string): Promise<CodeFile> {
  ensureDesktopRuntime();
  const file = projectRoot
    ? await invoke<CodeFile>("load_project_code_file", { path, projectRoot })
    : await invoke<CodeFile>("load_code_file", { path });
  const explanations = Array.isArray(file.explanations) ? file.explanations : [];
  const codeNodes = Array.isArray(file.codeNodes) ? file.codeNodes : [];
  if (import.meta.env.DEV && codeNodes.length === 0) {
    console.warn(`[CodeReader] codeNodes empty for ${path} - parse may have failed or payload changed.`);
  }
  return {
    ...file,
    explanations,
    codeNodes,
    projectRoot: file.projectRoot ?? projectRoot,
    isLoaded: true,
    source: "local"
  };
}

export async function hydrateCodeFilePersistence(
  file: CodeFile,
  seedExplanations: Explanation[]
): Promise<CodeFile> {
  ensureDesktopRuntime();
  const persisted = await invoke<{ explanations: Explanation[]; databasePath: string }>(
    "hydrate_code_file_persistence",
    {
      request: {
        file: {
          ...file,
          codeNodes: file.codeNodes ?? []
        },
        seedExplanations
      }
    }
  );
  return {
    ...file,
    databasePath: persisted.databasePath,
    explanations: Array.isArray(persisted.explanations) ? persisted.explanations : seedExplanations
  };
}

export async function initializePersistence() {
  ensureDesktopRuntime();
  return invoke<{ databasePath: string; initialized: boolean }>("initialize_persistence");
}

export async function persistReadingState(
  projectId: string,
  explanationId: string,
  state: ReadingState
) {
  ensureDesktopRuntime();
  return invoke<{ explanationId: string; state: ReadingState; updatedAt: string }>("save_reading_state", {
    request: {
      projectId,
      explanationId,
      state
    }
  });
}

export async function persistExplanationFeedback(
  projectId: string,
  explanationId: string,
  feedbackType: ExplanationFeedbackType
) {
  ensureDesktopRuntime();
  return invoke<{ id: string; explanationId: string; feedbackType: ExplanationFeedbackType; createdAt: string }>(
    "save_explanation_feedback",
    {
      request: {
        projectId,
        explanationId,
        feedbackType
      }
    }
  );
}

async function scanProject(path: string): Promise<ProjectScanResult> {
  ensureDesktopRuntime();
  const project = await invoke<ProjectScanResult>("scan_project", { path });
  return {
    ...project,
    files: Array.isArray(project.files) ? project.files : []
  };
}

function ensureDesktopRuntime() {
  if (!isDesktopRuntime()) {
    throw new Error("本地文件打开需要在 Tauri 桌面端运行。");
  }
}
