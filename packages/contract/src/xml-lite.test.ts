import { describe, expect, it } from "vitest";
import { parseXml } from "./xml-lite.js";

describe("xml-lite (D-680)", () => {
  it("елементи, атрибути с двата вида кавички, ентитита, коментари, CDATA, текстът се пропуска", () => {
    const r = parseXml(`<?xml version="1.0"?><!-- c --><a x='1' y="&#x41;&#66;&quot;"><b/><![CDATA[<not a tag>]]>text &amp; more<c z="&lt;&gt;"></c></a>`);
    expect(r.ok && r.root).toEqual({ name: "a", attrs: { x: "1", y: 'AB"' }, children: [{ name: "b", attrs: {}, children: [] }, { name: "c", attrs: { z: "<>" }, children: [] }] });
  });
  it("отказва: DOCTYPE, непознато ентити, второ поле, два корена, незатворено, дубликат, без кавички", () => {
    for (const bad of ['<!DOCTYPE a><a/>', '<a x="&foo;"/>', '<a x="&amp"/>', "<a/><b/>", "<a><b></a>", "<a>", '<a x="1" x="2"/>', "<a x=1/>", "", "text<a/>"]) {
      expect([bad, parseXml(bad).ok]).toEqual([bad, false]);
    }
  });
  it("__proto__ като атрибут не пипа прототипа", () => {
    const r = parseXml('<a __proto__="x" constructor="y"/>');
    expect(r.ok && Object.getPrototypeOf(r.root.attrs)).toBe(null);
    expect(r.ok && r.root.attrs["__proto__"]).toBe("x");
  });
  it("дълбочината е ограничена", () => {
    expect(parseXml(`${"<a>".repeat(100)}${"</a>".repeat(100)}`).ok).toBe(false);
  });
});
