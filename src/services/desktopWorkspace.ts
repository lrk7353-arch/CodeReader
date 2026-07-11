import { invoke } from "@tauri-apps/api/core";
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
  const grant = await invoke<{ grantId: string; fileId: string } | null>("register_file_grant");
  if (!grant) return null;
  return loadCodeFile(grant.fileId, grant.grantId);
}

export async function pickAndScanProject(): Promise<ProjectScanResult | null> {
  ensureDesktopRuntime();
  const project = await invoke<ProjectScanResult | null>("register_directory_grant");
  if (!project) return null;
  return normalizeProjectScan(project);
}

export async function expandGrantedDirectory(
  grantId: string,
  directoryId: string
): Promise<ProjectScanResult> {
  ensureDesktopRuntime();
  return normalizeProjectScan(
    await invoke<ProjectScanResult>("expand_granted_directory", {
      grantId,
      directoryIdValue: directoryId
    })
  );
}

export async function loadCodeFile(fileId: string, grantId: string): Promise<CodeFile> {
  ensureDesktopRuntime();
  const file = await invoke<CodeFile>("load_granted_file", { fileId, grantId });
  const explanations = Array.isArray(file.explanations) ? file.explanations : [];
  const codeNodes = Array.isArray(file.codeNodes) ? file.codeNodes : [];
  if (import.meta.env.DEV && file.capability?.canExplain !== false && codeNodes.length === 0) {
    console.warn(
      `[CodeReader] codeNodes empty for ${fileId} - parse may have failed or payload changed.`
    );
  }
  return {
    ...file,
    explanations,
    codeNodes,
    grantId,
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
        grantId: file.grantId,
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
  return invoke<{
    databasePath: string;
    initialized: boolean;
    readOnlyRecovery: boolean;
    backupPath: string | null;
    recoveryMessage: string | null;
  }>("initialize_persistence");
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
  if (!file.grantId || !file.snapshotId) {
    throw new Error("The authorized file snapshot is unavailable. Reopen the file or folder.");
  }
  return invoke<ContextBundle>("build_granted_explanation_context", {
    request: {
      grantId: file.grantId,
      fileId: file.id,
      snapshotId: file.snapshotId,
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
  operationId: string,
  displayMode: "plain" | "detailed" = "plain"
): Promise<GenerateExplanationResult> {
  ensureDesktopRuntime();
  return invoke<GenerateExplanationResult>("generate_explanation", {
    operationId,
    request: {
      file: {
        grantId: file.grantId,
        id: file.id,
        path: "",
        projectId: file.projectId,
        language: "plaintext",
        code: "",
        snapshotId: file.snapshotId,
        codeNodes: []
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

export async function cancelGeneration(operationId: string): Promise<boolean> {
  ensureDesktopRuntime();
  return invoke<boolean>("cancel_generation", { operationId });
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

function normalizeProjectScan(project: ProjectScanResult): ProjectScanResult {
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
