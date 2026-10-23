import re
import zipfile

path = r"f:\siem\ICS_Short_Project_Report_Format.docx"
z = zipfile.ZipFile(path)
xml = z.read("word/document.xml").decode("utf-8", "replace")

# Iterate paragraphs in order.
for m in re.finditer(r"<w:p\b[^>]*>.*?</w:p>|<w:p\b[^>]*/>", xml, re.DOTALL):
    p = m.group(0)
    style = re.search(r'<w:pStyle w:val="([^"]+)"', p)
    s = style.group(1) if style else "Normal"
    texts = re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.DOTALL)
    text = "".join(texts)
    pb = " <<PAGEBREAK>>" if ('w:type="page"' in p or "<w:sectPr" in p) else ""
    jc = re.search(r'<w:jc w:val="([^"]+)"', p)
    j = f"({jc.group(1)})" if jc else ""
    if text.strip() or pb:
        print(f"[{s}]{j}{pb}\t{text}")

print("\n----- STYLES (names) -----")
styles = z.read("word/styles.xml").decode("utf-8", "replace")
for m in re.finditer(r'<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>(.*?)</w:style>', styles, re.DOTALL):
    sid = m.group(1)
    name = re.search(r'<w:name w:val="([^"]+)"', m.group(2))
    typ = re.search(r'w:type="([^"]+)"', m.group(0))
    print(f"{typ.group(1) if typ else '?':10} id={sid:28} name={name.group(1) if name else ''}")
