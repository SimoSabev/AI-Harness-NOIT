import { createHash, randomBytes } from "node:crypto";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";

// Демо промпт т. 5.4 / спец. т. 10: RFC 3161 anchor of the ledger. The last entry hash of a batch commits to the whole
// chain, so the anchored datum is the UTF-8 of that hash; messageImprint = SHA-256 of it.
// Signature check uses the certificate inside the token; trust in the TSA root is not checked here (docs/setup/tsa.md).

const SHA256_OID = "2.16.840.1.101.3.4.2.1";
const TST_INFO_OID = "1.2.840.113549.1.9.16.1.4";
const toAb = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

export function anchorDatum(lastHash: string): Uint8Array {
  return new Uint8Array(Buffer.from(lastHash, "utf8"));
}
export function anchorDigest(lastHash: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(anchorDatum(lastHash)).digest());
}

export function buildTsRequest(digest: Uint8Array, nonce: Uint8Array = randomBytes(8)): { der: Uint8Array; nonce: Uint8Array } {
  const req = new pkijs.TimeStampReq({
    version: 1,
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({ algorithmId: SHA256_OID }),
      hashedMessage: new asn1js.OctetString({ valueHex: toAb(digest) }),
    }),
    nonce: new asn1js.Integer({ valueHex: toAb(nonce) }),
    certReq: true,
  });
  return { der: new Uint8Array(req.toSchema().toBER(false)), nonce };
}

export type TsVerdict = { ok: true; genTime: Date; serial: string } | { ok: false; reason: "status" | "parse" | "imprint" | "nonce" | "signature"; detail: string };

const hex = (b: ArrayBuffer) => Buffer.from(b).toString("hex");

/** datum = the anchored bytes (pkijs re-hashes them against messageImprint while verifying). */
export async function verifyTsResponse(der: Uint8Array, datum: Uint8Array, nonce: Uint8Array | null): Promise<TsVerdict> {
  const digest = new Uint8Array(createHash("sha256").update(datum).digest());
  let resp: pkijs.TimeStampResp;
  let tst: pkijs.TSTInfo;
  try {
    resp = pkijs.TimeStampResp.fromBER(toAb(der));
    if (resp.status.status !== pkijs.PKIStatus.granted && resp.status.status !== pkijs.PKIStatus.grantedWithMods) {
      return { ok: false, reason: "status", detail: `PKIStatus ${resp.status.status}` };
    }
    if (!resp.timeStampToken) return { ok: false, reason: "parse", detail: "no token" };
    const signed = new pkijs.SignedData({ schema: resp.timeStampToken.content });
    if (signed.encapContentInfo.eContentType !== TST_INFO_OID || !signed.encapContentInfo.eContent) return { ok: false, reason: "parse", detail: "not a TSTInfo" };
    tst = pkijs.TSTInfo.fromBER(signed.encapContentInfo.eContent.getValue());
  } catch (e) {
    return { ok: false, reason: "parse", detail: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
  if (tst.messageImprint.hashAlgorithm.algorithmId !== SHA256_OID || hex(tst.messageImprint.hashedMessage.getValue()) !== Buffer.from(digest).toString("hex")) {
    return { ok: false, reason: "imprint", detail: "messageImprint does not match" };
  }
  if (nonce && (!tst.nonce || hex(tst.nonce.valueBlock.valueHexView.slice().buffer as ArrayBuffer).replace(/^0+/, "") !== Buffer.from(nonce).toString("hex").replace(/^0+/, ""))) {
    return { ok: false, reason: "nonce", detail: "nonce does not match" };
  }
  try {
    const ok = await resp.verify({ signer: 0, trustedCerts: [], data: toAb(datum) });
    if (!ok) return { ok: false, reason: "signature", detail: "SignedData.verify = false" };
  } catch (e) {
    return { ok: false, reason: "signature", detail: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
  return { ok: true, genTime: tst.genTime, serial: hex(tst.serialNumber.valueBlock.valueHexView.slice().buffer as ArrayBuffer) };
}

export type Fetcher = (url: string, body: Uint8Array) => Promise<{ status: number; body: Uint8Array }>;

export const httpFetcher: Fetcher = async (url, body) => {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/timestamp-query" }, body, signal: AbortSignal.timeout(15_000) });
  return { status: r.status, body: new Uint8Array(await r.arrayBuffer()) };
};

/** Tries TSA_URLS in order; the first verified answer wins. */
export async function requestAnchor(o: { lastHash: string; urls: string[]; fetcher?: Fetcher }): Promise<{ ok: true; url: string; tsr: Uint8Array; genTime: Date } | { ok: false; errors: string[] }> {
  const digest = anchorDigest(o.lastHash);
  const datum = anchorDatum(o.lastHash);
  const errors: string[] = [];
  for (const url of o.urls) {
    const { der, nonce } = buildTsRequest(digest);
    try {
      const r = await (o.fetcher ?? httpFetcher)(url, der);
      if (r.status !== 200) {
        errors.push(`${url}: HTTP ${r.status}`);
        continue;
      }
      const v = await verifyTsResponse(r.body, datum, nonce);
      if (v.ok) return { ok: true, url, tsr: r.body, genTime: v.genTime };
      errors.push(`${url}: ${v.reason}`);
    } catch (e) {
      errors.push(`${url}: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`);
    }
  }
  return { ok: false, errors };
}
