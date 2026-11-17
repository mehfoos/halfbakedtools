"""Minimal standard-library .xlsx reader: yields rows of cell strings per sheet name."""
import re, zipfile, xml.etree.ElementTree as ET
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}
def _col(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group():
        n = n * 26 + ord(ch) - 64
    return n - 1
def read(path):
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(t.text or "" for t in si.iter("{%s}t" % NS["m"])))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    target = {r.get("Id"): r.get("Target") for r in rels}
    out = {}
    for s in wb.find("m:sheets", NS):
        t = target[s.get("{%s}id" % NS["r"])].lstrip("/")
        t = t if t.startswith("xl/") else "xl/" + t
        rows = []
        for row in ET.fromstring(z.read(t)).iter("{%s}row" % NS["m"]):
            cells = {}
            for c in row.findall("m:c", NS):
                v = c.find("m:v", NS); typ = c.get("t")
                if typ == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter("{%s}t" % NS["m"]))
                elif v is None:
                    continue
                elif typ == "s":
                    val = shared[int(v.text)]
                else:
                    val = v.text
                cells[_col(c.get("r"))] = val
            if cells:
                rows.append([cells.get(i) for i in range(max(cells) + 1)])
            else:
                rows.append([])
        out[s.get("name")] = rows
    return out
