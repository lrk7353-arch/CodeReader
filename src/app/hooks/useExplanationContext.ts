import { useEffect, useState } from "react";
import type { ContextPreviewStatus } from "../../features/context-preview/ContextPreview";
import { buildExplanationContext, isDesktopRuntime } from "../../services/desktopWorkspace";
import type { CodeFile, ContextBundle, Explanation } from "../../types/explanation";
import { errorMessage } from "../appError";

export function useExplanationContext(file: CodeFile, explanation?: Explanation) {
  const [bundle, setBundle] = useState<ContextBundle>();
  const [error, setError] = useState("");
  const [status, setStatus] = useState<ContextPreviewStatus>(
    isDesktopRuntime() ? "loading" : "unavailable"
  );

  useEffect(() => {
    if (
      !isDesktopRuntime() ||
      !explanation ||
      !file.code ||
      file.capability?.canExplain === false
    ) {
      setBundle(undefined);
      setError("");
      setStatus("unavailable");
      return;
    }

    let cancelled = false;
    setBundle(undefined);
    setError("");
    setStatus("loading");
    void buildExplanationContext(file, explanation)
      .then((context) => {
        if (!cancelled) {
          setBundle(context);
          setStatus("ready");
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setBundle(undefined);
          setError(errorMessage(cause));
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [explanation, file]);

  return { bundle, error, status };
}
