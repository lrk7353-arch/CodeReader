export interface OperationToken {
  epoch: number;
  operationId: number;
  targetId: string | null;
}

export interface OperationGate {
  begin: (targetId: string | null, advanceEpoch?: boolean) => OperationToken;
  invalidate: (targetId?: string | null) => void;
  isCurrent: (token: OperationToken) => boolean;
}

/** A synchronous identity gate for suppressing stale async completions. */
export function createOperationGate(): OperationGate {
  let epoch = 0;
  let operationId = 0;
  let targetId: string | null = null;

  return {
    begin(nextTargetId, advanceEpoch = false) {
      if (advanceEpoch) epoch += 1;
      operationId += 1;
      targetId = nextTargetId;
      return { epoch, operationId, targetId };
    },
    invalidate(nextTargetId = null) {
      epoch += 1;
      operationId += 1;
      targetId = nextTargetId;
    },
    isCurrent(token) {
      return (
        token.epoch === epoch && token.operationId === operationId && token.targetId === targetId
      );
    }
  };
}
