export type ExplanationTargetType =
  | "line"
  | "range"
  | "block"
  | "function"
  | "class"
  | "file"
  | "module"
  | "project";

export type ExplanationStatus = "valid" | "stale" | "invalid" | "new_unexplained" | "deleted";

export type ReadingState = "unread" | "read" | "understood" | "questioned" | "suspicious" | "needs_reexplain";

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
  riskNotes?: string[];
  readerNotes?: string[];
  status: ExplanationStatus;
  readingState: ReadingState;
  createdAt: string;
  updatedAt: string;
}

export interface SampleFile {
  id: string;
  name: string;
  path: string;
  language: "typescript" | "javascript";
  code: string;
  explanations: Explanation[];
}
