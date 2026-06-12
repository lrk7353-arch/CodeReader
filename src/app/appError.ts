export function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (isErrorPayload(error)) {
    return error.message;
  }
  return String(error);
}

function isErrorPayload(error: unknown): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  );
}
