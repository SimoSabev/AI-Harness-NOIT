import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import { MandatError } from "./errors.js";
import { Contract, UnsealedContract } from "./schemas.js";
import type { RepoConfig, Sha256 } from "./schemas.js";

/** RFC 8785 JSON Canonicalization Scheme. */
export function jcs(v: unknown): string {
  const out = canonicalize(v);
  if (out === undefined) throw new TypeError("jcs: value is not JSON-serializable");
  return out;
}

export function sha256Tag(b: Uint8Array | string): Sha256 {
  return `sha256:${createHash("sha256").update(b).digest("hex")}`;
}

export function hashJcs(v: unknown): Sha256 {
  return sha256Tag(jcs(v));
}

export function computeConfigHash(rc: RepoConfig): Sha256 {
  return hashJcs(rc);
}

export function computeContractHash(c: Omit<Contract, "contract_hash">): Sha256 {
  return hashJcs(c);
}

/** D-122: fills config_hash and contract_hash. Idempotent on an already sealed contract. */
export function sealContract(c: UnsealedContract): Contract {
  const { contract_hash: _old, ...rest } = UnsealedContract.parse(c);
  const withConfig = { ...rest, config_hash: computeConfigHash(rest.repo_config) };
  return Contract.parse({ ...withConfig, contract_hash: computeContractHash(withConfig) });
}

export function parseContract(json: unknown): Contract {
  const r = Contract.safeParse(json);
  if (!r.success) {
    throw new MandatError("E_CONTRACT_INVALID", "contract does not match the schema", {
      issues: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  const c = r.data;
  const config = computeConfigHash(c.repo_config);
  if (config !== c.config_hash) {
    throw new MandatError("E_CONTRACT_HASH", "config_hash does not match repo_config", { expected: config, actual: c.config_hash });
  }
  const { contract_hash, ...rest } = c;
  const expected = computeContractHash(rest);
  if (expected !== contract_hash) {
    throw new MandatError("E_CONTRACT_HASH", "contract_hash does not match the contract", { expected, actual: contract_hash });
  }
  return c;
}
