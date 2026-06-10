export type ExplanationTargetType =
  | "import"
  | "export"
  | "line"
  | "range"
  | "block"
  | "function"
  | "class"
  | "file"
  | "module"
  | "project";

export type ExplanationStatus = "valid" | "stale" | "invalid" | "new_unexplained" | "deleted" | "transient";

export type ReadingState = "unread" | "read" | "understood" | "questioned" | "suspicious" | "needs_reexplain";

export type ExplanationFeedbackType =
  | "helpful"
  | "suspicious"
  | "too_vague"
  | "too_technical"
  | "needs_plain_language"
  | "needs_more_detail"
  | "regenerate_requested"
  | "user_note";

export interface Explanation {
  id: string;
  filePath: string;
  fileHash?: string;
  targetType: ExplanationTargetType;
  targetName?: string;
  startLine?: number;
  endLine?: number;
  symbolId?: string;
  codeHash?: string;
  anchorText?: string;
  codeMeaning: string;
  localMeaning?: string;
  globalMeaning?: string;
  priorKnowledge?: string;
  reviewSuggestion?: string;
  trustLabel?: "clear" | "context_needed" | "review_recommended";
  trustReason?: string;
  dependsOnLines?: number[];
  affectsLines?: number[];
  riskNotes?: string[];
  readerNotes?: string[];
  status: ExplanationStatus;
  readingState: ReadingState;
  createdAt: string;
  updatedAt: string;
}

export interface CodeNode {
  id: string;
  filePath: string;
  nodeType: ExplanationTargetType;
  name: string;
  startLine: number;
  endLine: number;
  symbolId?: string;
  codeHash: string;
  anchorText: string;
}

export type EditorLanguage =
  | "c"
  | "cpp"
  | "css"
  | "html"
  | "java"
  | "javascript"
  | "json"
  | "markdown"
  | "plaintext"
  | "python"
  | "ruby"
  | "rust"
  | "shell"
  | "sql"
  | "typescript"
  | "xml"
  | "yaml";

export type FilePreviewKind = "code" | "text" | "unavailable";

export interface FileCapability {
  previewKind: FilePreviewKind;
  canPreview: boolean;
  canExplain: boolean;
  language: EditorLanguage;
  reason?: string;
  sizeBytes: number;
}

export interface CodeFile {
  id: string;
  name: string;
  path: string;
  projectId?: string;
  projectRoot?: string;
  relativePath?: string;
  language: EditorLanguage;
  code: string;
  fileHash?: string;
  snapshotId?: string;
  codeNodes?: CodeNode[];
  explanations: Explanation[];
  changeSummary?: ChangeSummary;
  databasePath?: string;
  parseError?: boolean;
  capability?: FileCapability;
  source?: "sample" | "local";
  isLoaded?: boolean;
}

export interface ChangeSummary {
  id: string;
  beforeHash: string;
  afterHash: string;
  addedLines: number;
  modifiedLines: number;
  deletedLines: number;
  addedNodes: number;
  modifiedNodes: number;
  deletedNodes: number;
  affectedExplanationIds: string[];
  summary: string;
  createdAt: string;
}

export type SampleFile = CodeFile;

export interface ProjectFileEntry {
  id: string;
  name: string;
  path: string;
  projectId?: string;
  projectRoot?: string;
  relativePath: string;
  language: EditorLanguage;
  capability: FileCapability;
}

export interface ProjectTreeNode {
  id: string;
  parentId?: string;
  name: string;
  path: string;
  relativePath: string;
  kind: "directory" | "file";
  capability?: FileCapability;
}

export interface ProjectScanResult {
  rootPath: string;
  files: ProjectFileEntry[];
  nodes: ProjectTreeNode[];
  truncated: boolean;
  skippedEntries: number;
}

export type ContextStrategy = "line" | "range" | "function" | "file";

export interface ContextTargetSummary {
  targetType: ExplanationTargetType;
  targetName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  symbolId?: string;
}

export interface ContextSnippet {
  sourceId: string;
  kind: string;
  label: string;
  filePath: string;
  startLine: number;
  endLine: number;
  code: string;
  reason: string;
  isSummary: boolean;
}

export interface ContextSignals {
  referencedIdentifiers: string[];
  definedIdentifiers: string[];
  inputIdentifiers: string[];
  outputIdentifiers: string[];
  calledFunctions: string[];
}

export interface ContextSource {
  sourceId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  nodeId?: string;
  reason: string;
}

export interface ContextBudgetResult {
  requestedMaxChars: number;
  effectiveMaxChars: number;
  usedChars: number;
  maxSnippets: number;
  omittedSnippets: number;
  expandedForTarget: boolean;
  truncated: boolean;
}

export interface ContextBundle {
  contextId: string;
  strategy: ContextStrategy;
  target: ContextTargetSummary;
  snippets: ContextSnippet[];
  signals: ContextSignals;
  sources: ContextSource[];
  budget: ContextBudgetResult;
  warnings: string[];
}

export interface ModelConfig {
  endpoint: string;
  model: string;
  timeoutSeconds: number;
  hasApiKey: boolean;
  configured: boolean;
  updatedAt?: string;
}

export interface SaveModelConfigInput {
  endpoint: string;
  model: string;
  timeoutSeconds: number;
  apiKey?: string;
}

export interface GenerateExplanationResult {
  explanation: Explanation;
  contextId: string;
  provider: string;
  model: string;
  attempts: number;
}
