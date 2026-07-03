import type { CodeFile, Explanation } from "../../types/explanation";

export function stripUnexplainableFile(file: CodeFile): CodeFile {
  return {
    ...file,
    codeNodes: [],
    explanations: []
  };
}

export function seedBrowserHydratedFile(file: CodeFile, seedExplanations: Explanation[]): CodeFile {
  return {
    ...file,
    databasePath: "",
    explanations: seedExplanations
  };
}
