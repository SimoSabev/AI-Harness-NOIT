export type ErrorCode =
  | "E_USAGE"
  | "E_LOCKED"
  | "E_CONTRACT_INVALID"
  | "E_CONTRACT_HASH"
  | "E_DOCKER_VERSION"
  | "E_GIT_VERSION"
  | "E_IMAGES_MISSING"
  | "E_PROXY_DOWN"
  | "E_MIRROR_MISSING"
  | "E_BASE_NOT_FOUND"
  | "E_FIXTURE_MISMATCH"
  | "E_DOCKER"
  | "E_GATE_START"
  | "E_GATE_POLICY"
  | "E_LOCKFILE_BASE"
  | "E_INSTALL_BASE"
  | "E_INSTALL_TREE"
  | "E_BASELINE_INVALID"
  | "E_INTERRUPTED"
  | "E_FORBIDDEN_DOCKER_FLAG"
  | "E_CHANNEL_UNSUPPORTED"
  | "E_UNSUPPORTED_FS";

export class MandatError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "MandatError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/** D-026 / D-038: usage and lock → 2; invalid contract → 5; everything else is environment/infra → 3. */
export function exitCodeOf(code: ErrorCode): 2 | 3 | 5 {
  if (code === "E_USAGE" || code === "E_LOCKED") return 2;
  if (code === "E_CONTRACT_INVALID" || code === "E_CONTRACT_HASH") return 5;
  return 3;
}
