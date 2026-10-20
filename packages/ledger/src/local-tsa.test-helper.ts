import { webcrypto } from "node:crypto";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";

// A local RFC 3161 TSA for tests (key generated in memory, never on disk).
const ab = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

export async function localTsa(): Promise<{ respond: (reqDer: Uint8Array, o?: { tamperImprint?: boolean; status?: number; dropNonce?: boolean }) => Promise<Uint8Array> }> {
  const alg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256", publicExponent: new Uint8Array([1, 0, 1]), modulusLength: 2048 };
  const keys = (await webcrypto.subtle.generateKey(alg, true, ["sign", "verify"])) as webcrypto.CryptoKeyPair;
  const cert = new pkijs.Certificate();
  cert.version = 2;
  cert.serialNumber = new asn1js.Integer({ value: 1 });
  const cn = new pkijs.AttributeTypeAndValue({ type: "2.5.4.3", value: new asn1js.Utf8String({ value: "Mandat test TSA" }) });
  cert.issuer.typesAndValues.push(cn);
  cert.subject.typesAndValues.push(new pkijs.AttributeTypeAndValue({ type: "2.5.4.3", value: new asn1js.Utf8String({ value: "Mandat test TSA" }) }));
  cert.notBefore.value = new Date(Date.now() - 86_400_000);
  cert.notAfter.value = new Date(Date.now() + 86_400_000);
  // id-kp-timeStamping, critical (RFC 3161 §2.3)
  cert.extensions = [new pkijs.Extension({ extnID: "2.5.29.37", critical: true, extnValue: new pkijs.ExtKeyUsage({ keyPurposes: ["1.3.6.1.5.5.7.3.8"] }).toSchema().toBER(false), parsedValue: new pkijs.ExtKeyUsage({ keyPurposes: ["1.3.6.1.5.5.7.3.8"] }) })];
  await cert.subjectPublicKeyInfo.importKey(keys.publicKey);
  await cert.sign(keys.privateKey, "SHA-256");
  let serial = 1;
  return {
    async respond(reqDer, o = {}) {
      const req = pkijs.TimeStampReq.fromBER(ab(reqDer));
      if (o.status !== undefined) return new Uint8Array(new pkijs.TimeStampResp({ status: new pkijs.PKIStatusInfo({ status: o.status }) }).toSchema().toBER(false));
      const imprint = o.tamperImprint
        ? new pkijs.MessageImprint({ hashAlgorithm: req.messageImprint.hashAlgorithm, hashedMessage: new asn1js.OctetString({ valueHex: new Uint8Array(32).buffer }) })
        : req.messageImprint;
      const tst = new pkijs.TSTInfo({
        version: 1, policy: "1.3.6.1.4.1.99999.1", messageImprint: imprint, serialNumber: new asn1js.Integer({ value: serial++ }), genTime: new Date(),
        ...(req.nonce && !o.dropNonce ? { nonce: req.nonce } : {}),
      });
      // Real TSAs encode eContent as a primitive OCTET STRING; the pkijs constructor would make it constructed.
      const eci = new pkijs.EncapsulatedContentInfo({ eContentType: "1.2.840.113549.1.9.16.1.4" });
      eci.eContent = new asn1js.OctetString({ valueHex: tst.toSchema().toBER(false) });
      const signed = new pkijs.SignedData({
        version: 3,
        encapContentInfo: eci,
        signerInfos: [new pkijs.SignerInfo({ version: 1, sid: new pkijs.IssuerAndSerialNumber({ issuer: cert.issuer, serialNumber: cert.serialNumber }) })],
        certificates: [cert],
      });
      await signed.sign(keys.privateKey, 0, "SHA-256");
      const content = new pkijs.ContentInfo({ contentType: pkijs.ContentInfo.SIGNED_DATA, content: signed.toSchema(true) });
      const resp = new pkijs.TimeStampResp({ status: new pkijs.PKIStatusInfo({ status: pkijs.PKIStatus.granted }), timeStampToken: new pkijs.ContentInfo({ schema: content.toSchema() }) });
      return new Uint8Array(resp.toSchema().toBER(false));
    },
  };
}
