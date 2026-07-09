import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  CodeFile,
  ChangeSummary,
  ContextBundle,
  Explanation,
  ExplanationFeedbackType,
  GenerateExplanationResult,
  ModelConfig,
  ProjectGuide,
  ProjectScanResult,
  PromptVersionInfo,
  ReadingState,
  RollbackPromptVersionInput,
  RollbackPromptVersionResult,
  SaveModelConfigInput,
  UpsertPromptVersionInput
} from "../types/explanation";

export function isDesktopRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function pickAndLoadCodeFile(): Promise<CodeFile | null> {
  ensureDesktopRuntime();
  const selectedPath = await open({
    directory: false,
    multiple: false
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
  if (import.meta.env.DEV && file.capability?.canExplain !== false && codeNodes.length === 0) {
    console.warn(
      `[CodeReader] codeNodes empty for ${path} - parse may have failed or payload changed.`
    );
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
  const persisted = await invoke<{
    explanations: Explanation[];
    databasePath: string;
    projectId: string;
    changeSummary?: ChangeSummary;
  }>("hydrate_code_file_persistence", {
    request: {
      file: {
        ...file,
        codeNodes: file.codeNodes ?? []
      },
      seedExplanations
    }
  });
  return {
    ...file,
    databasePath: persisted.databasePath,
    projectId: persisted.projectId,
    explanations: Array.isArray(persisted.explanations) ? persisted.explanations : seedExplanations,
    changeSummary: persisted.changeSummary
  };
}

export async function initializePersistence() {
  ensureDesktopRuntime();
  return invoke<{ databasePath: string; initialized: boolean }>("initialize_persistence");
}

export async function generateProjectGuide(project: ProjectScanResult): Promise<ProjectGuide> {
  ensureDesktopRuntime();
  return invoke<ProjectGuide>("generate_project_guide", {
    request: {
      rootPath: project.rootPath,
      files: project.files.map((file) => ({
        id: file.id,
        relativePath: file.relativePath,
        language: file.language,
        canPreview: file.capability.canPreview,
        canExplain: file.capability.canExplain
      }))
    }
  });
}

export async function loadProjectGuide(projectId: string): Promise<ProjectGuide | null> {
  ensureDesktopRuntime();
  return invoke<ProjectGuide | null>("load_project_guide", {
    request: {
      projectId
    }
  });
}

export async function buildExplanationContext(
  file: CodeFile,
  explanation: Explanation
): Promise<ContextBundle> {
  ensureDesktopRuntime();
  return invoke<ContextBundle>("build_explanation_context", {
    request: {
      file: {
        path: file.path,
        language: file.language,
        code: file.code,
        codeNodes: file.codeNodes ?? []
      },
      target: {
        targetType: explanation.targetType,
        targetName: explanation.targetName,
        startLine: explanation.startLine,
        endLine: explanation.endLine,
        symbolId: explanation.symbolId
      }
    }
  });
}

export async function getModelConfig(): Promise<ModelConfig> {
  ensureDesktopRuntime();
  return invoke<ModelConfig>("get_model_config");
}

export async function saveModelConfig(input: SaveModelConfigInput): Promise<ModelConfig> {
  ensureDesktopRuntime();
  return invoke<ModelConfig>("save_model_config", {
    request: input
  });
}

export async function resetModelConfig(): Promise<ModelConfig> {
  ensureDesktopRuntime();
  return invoke<ModelConfig>("reset_model_config");
}

export interface ModelConnectionResult {
  ok: boolean;
  model: string;
  endpoint: string;
  echo: string;
}

export interface TestConnectionInput {
  endpoint?: string;
  model?: string;
  apiKey?: string;
}

export async function testModelConnection(
  input?: TestConnectionInput
): Promise<ModelConnectionResult> {
  ensureDesktopRuntime();
  return invoke<ModelConnectionResult>("test_model_connection", {
    request: input ?? null
  });
}

export async function listPromptVersions(): Promise<PromptVersionInfo[]> {
  ensureDesktopRuntime();
  return invoke<PromptVersionInfo[]>("list_prompt_versions");
}

export async function upsertPromptVersion(
  input: UpsertPromptVersionInput
): Promise<PromptVersionInfo> {
  ensureDesktopRuntime();
  return invoke<PromptVersionInfo>("upsert_prompt_version", { request: input });
}

export async function rollbackPromptVersion(
  input: RollbackPromptVersionInput
): Promise<RollbackPromptVersionResult> {
  ensureDesktopRuntime();
  return invoke<RollbackPromptVersionResult>("rollback_prompt_version", { request: input });
}

export async function generateExplanation(
  file: CodeFile,
  explanation: Explanation,
  displayMode: "plain" | "detailed" = "plain"
): Promise<GenerateExplanationResult> {
  ensureDesktopRuntime();
  return invoke<GenerateExplanationResult>("generate_explanation", {
    request: {
      file: {
        id: file.id,
        path: file.path,
        projectId: file.projectId,
        projectRoot: file.projectRoot,
        language: file.language,
        code: file.code,
        fileHash: file.fileHash,
        snapshotId: file.snapshotId,
        codeNodes: file.codeNodes ?? []
      },
      target: {
        id: explanation.id,
        targetType: explanation.targetType,
        targetName: explanation.targetName,
        startLine: explanation.startLine,
        endLine: explanation.endLine,
        symbolId: explanation.symbolId,
        codeHash: explanation.codeHash,
        anchorText: explanation.anchorText,
        status: explanation.status
      },
      displayMode,
      codeTransmissionApproved: true
    }
  });
}

export async function persistReadingState(
  projectId: string,
  explanationId: string,
  state: ReadingState
) {
  ensureDesktopRuntime();
  return invoke<{ explanationId: string; state: ReadingState; updatedAt: string }>(
    "save_reading_state",
    {
      request: {
        projectId,
        explanationId,
        state
      }
    }
  );
}

export async function persistExplanationFeedback(
  projectId: string,
  explanationId: string,
  feedbackType: ExplanationFeedbackType
) {
  ensureDesktopRuntime();
  return invoke<{
    id: string;
    explanationId: string;
    feedbackType: ExplanationFeedbackType;
    createdAt: string;
  }>("save_explanation_feedback", {
    request: {
      projectId,
      explanationId,
      feedbackType
    }
  });
}

async function scanProject(path: string): Promise<ProjectScanResult> {
  ensureDesktopRuntime();
  const project = await invoke<ProjectScanResult>("scan_project", { path });
  return {
    ...project,
    files: Array.isArray(project.files) ? project.files : [],
    nodes: Array.isArray(project.nodes) ? project.nodes : [],
    truncated: Boolean(project.truncated),
    skippedEntries: Number(project.skippedEntries) || 0
  };
}

function ensureDesktopRuntime() {
  if (!isDesktopRuntime()) {
    throw new Error("本地文件打开需要在 Tauri 桌面端运行。");
  }
}
