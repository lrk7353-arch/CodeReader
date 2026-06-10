import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import "monaco-editor/esm/vs/editor/edcore.main";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/monaco.contribution";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import type { Explanation, SampleFile } from "../../types/explanation";
import { findExplanationForSelection, rangeExplanationId } from "../explanations/selectableExplanations";

interface MonacoCodeViewerProps {
  file: SampleFile;
  selectedExplanation?: Explanation;
  onSelectExplanation: (explanationId: string) => void;
  onSelectionChange: (selection: CodeSelection) => void;
  onRefresh?: () => void;
  refreshBusy?: boolean;
}

export interface CodeSelection {
  startLine: number;
  endLine: number;
}

const workerScope = globalThis as typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: (_workerId: string, label: string) => Worker;
  };
};

workerScope.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "typescript" || label === "javascript") {
      return new tsWorker();
    }
    return new editorWorker();
  }
};

function uriForFile(file: SampleFile) {
  return monaco.Uri.parse(`codereader://sample/${file.path}`);
}

function targetRange(explanation?: Explanation): CodeSelection | undefined {
  if (!explanation || explanation.targetType === "file" || !explanation.startLine) {
    return undefined;
  }
  return {
    startLine: explanation.startLine,
    endLine: explanation.endLine ?? explanation.startLine
  };
}

function normalizeSelection(selection: monaco.Selection): CodeSelection {
  return {
    startLine: Math.min(selection.startLineNumber, selection.endLineNumber),
    endLine: Math.max(selection.startLineNumber, selection.endLineNumber)
  };
}

function createModel(file: SampleFile) {
  const uri = uriForFile(file);
  const existing = monaco.editor.getModel(uri);
  if (existing) {
    if (existing.getLanguageId() !== file.language) {
      monaco.editor.setModelLanguage(existing, file.language);
    }
    if (existing.getValue() !== file.code) {
      existing.setValue(file.code);
    }
    return existing;
  }
  return monaco.editor.createModel(file.code, file.language, uri);
}

export function MonacoCodeViewer({
  file,
  selectedExplanation,
  onSelectExplanation,
  onSelectionChange,
  onRefresh,
  refreshBusy = false
}: MonacoCodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const ignoreSelectionRef = useRef(false);
  const selectionSyncIdRef = useRef(0);
  const fileRef = useRef(file);
  const onSelectExplanationRef = useRef(onSelectExplanation);
  const onSelectionChangeRef = useRef(onSelectionChange);

  fileRef.current = file;
  onSelectExplanationRef.current = onSelectExplanation;
  onSelectionChangeRef.current = onSelectionChange;

  const selectedRange = useMemo(() => targetRange(selectedExplanation), [selectedExplanation]);

  useEffect(() => {
    if (!containerRef.current || editorRef.current) {
      return;
    }

    const initialFile = fileRef.current;

    const editor = monaco.editor.create(containerRef.current, {
      automaticLayout: true,
      contextmenu: false,
      fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
      fontSize: 13,
      glyphMargin: true,
      language: initialFile.language,
      lineHeight: 23,
      lineNumbers: "on",
      minimap: { enabled: false },
      model: createModel(initialFile),
      readOnly: true,
      renderLineHighlight: "all",
      roundedSelection: false,
      scrollBeyondLastLine: false,
      selectionHighlight: true,
      theme: "vs"
    });

    editorRef.current = editor;
    decorationsRef.current = editor.createDecorationsCollection();

    const selectionDisposable = editor.onDidChangeCursorSelection((event) => {
      if (ignoreSelectionRef.current) {
        return;
      }
      const currentFile = fileRef.current;
      const selection = normalizeSelection(event.selection);
      onSelectionChangeRef.current(selection);
      if (currentFile.capability?.canExplain === false) {
        onSelectExplanationRef.current("");
        return;
      }
      const explanation = findExplanationForSelection(currentFile.explanations, selection);
      const fallbackId =
        selection.startLine !== selection.endLine
          ? rangeExplanationId(currentFile.id, selection)
          : currentFile.explanations[0]?.id ?? "";
      onSelectExplanationRef.current(explanation?.id ?? fallbackId);
    });

    return () => {
      selectionDisposable.dispose();
      decorationsRef.current?.clear();
      editor.dispose();
      editorRef.current = null;
      decorationsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    ignoreSelectionRef.current = true;
    const selectionSyncId = selectionSyncIdRef.current + 1;
    selectionSyncIdRef.current = selectionSyncId;
    const model = createModel(file);
    editor.setModel(model);
    const timeoutId = window.setTimeout(() => {
      if (selectionSyncIdRef.current === selectionSyncId) {
        ignoreSelectionRef.current = false;
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [file]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !decorationsRef.current) {
      return;
    }

    const decorations: monaco.editor.IModelDeltaDecoration[] = file.explanations
      .filter(
        (explanation) =>
          explanation.status !== "deleted" &&
          explanation.targetType !== "file" &&
          explanation.startLine
      )
      .map((explanation) => {
        const range = targetRange(explanation);
        const isSelected = selectedExplanation?.id === explanation.id;
        return {
          range: new monaco.Range(range?.startLine ?? 1, 1, range?.endLine ?? 1, 1),
          options: {
            className: isSelected
              ? "codereader-line-selected"
              : `codereader-line-explained codereader-line-${explanation.status}`,
            isWholeLine: true,
            linesDecorationsClassName: isSelected
              ? "codereader-gutter-selected"
              : `codereader-gutter-explained codereader-gutter-${explanation.status}`,
            glyphMarginClassName: isSelected
              ? "codereader-glyph-selected"
              : `codereader-glyph-explained codereader-glyph-${explanation.status}`,
            overviewRuler: {
              color: isSelected ? "#1f7a65" : "#94b7aa",
              position: monaco.editor.OverviewRulerLane.Left
            }
          }
        };
      });

    decorationsRef.current.set(decorations);
  }, [file, selectedExplanation]);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) {
      return;
    }

    ignoreSelectionRef.current = true;
    const selectionSyncId = selectionSyncIdRef.current + 1;
    selectionSyncIdRef.current = selectionSyncId;
    if (selectedRange) {
      editor.setSelection(
        new monaco.Selection(
          selectedRange.startLine,
          1,
          selectedRange.endLine,
          model.getLineMaxColumn(selectedRange.endLine)
        )
      );
      editor.revealLinesInCenterIfOutsideViewport(selectedRange.startLine, selectedRange.endLine);
    } else {
      editor.setPosition({ lineNumber: 1, column: 1 });
      editor.revealLineNearTop(1);
    }
    const timeoutId = window.setTimeout(() => {
      if (selectionSyncIdRef.current === selectionSyncId) {
        ignoreSelectionRef.current = false;
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [selectedRange]);

  const selectionLabel = selectedRange
    ? selectedRange.startLine === selectedRange.endLine
      ? `line:${selectedRange.startLine}`
      : `lines:${selectedRange.startLine}-${selectedRange.endLine}`
    : "file";

  return (
    <section className="code-viewer" aria-label="Code viewer">
      <div className="editor-toolbar">
        <span>{file.path}</span>
        <span className="editor-meta">
          <span>{file.language}</span>
          <span>{selectionLabel}</span>
          {onRefresh ? (
            <button
              className="icon-button editor-refresh"
              type="button"
              onClick={onRefresh}
              disabled={refreshBusy}
              title="重新读取并检测变更"
              aria-label="重新读取并检测变更"
            >
              <RefreshCw
                className={refreshBusy ? "spin-icon" : undefined}
                size={15}
                aria-hidden="true"
              />
            </button>
          ) : null}
        </span>
      </div>
      <div className="editor-stage">
        <div className="monaco-shell" ref={containerRef} />
        {file.capability?.canPreview === false ? (
          <div className="editor-unavailable" role="status">
            <strong>此文件无法安全预览</strong>
            <span>{file.capability.reason ?? "当前文件类型不支持文本预览。"}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
