"""Check repository-wide Java engineering rules without changing source files."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
TYPE = re.compile(r"(?m)^(?:(?:public|protected|private|abstract|final|sealed|non-sealed|static|strictfp)\s+)*(?:@interface|class|interface|enum|record)\s+([A-Za-z_$][\w$]*)")
COMMENT = re.compile(r"/\*\*[\s\S]*?\*/")
LEXICAL = re.compile(r'"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/')
QUALIFIED = re.compile(r"(?<![\w.])(?:java|javax|jakarta|org|com|tools|cn)\.[a-z][\w.]*\.[A-Z][A-Za-z0-9_$]*")


def mask(source):
    return LEXICAL.sub(lambda match: re.sub(r"[^\n]", " ", match.group()), source)


def main():
    errors = []
    paths = sorted((ROOT / "backend").glob("*/src/**/*.java"))
    for path in paths:
        source = path.read_text(encoding="utf-8")
        name = path.relative_to(ROOT)
        if source.startswith("\ufeff"):
            errors.append(f"{name}: UTF-8 BOM is not allowed")
        if re.search(r"(?m)^import\s+(?:static\s+)?[\w.]+\.\*;", source):
            errors.append(f"{name}: wildcard imports are forbidden")
        declaration = TYPE.search(source)
        if not declaration or declaration.group(1) != path.stem:
            errors.append(f"{name}: unable to identify top-level type")
            continue
        prefix = source[:declaration.start()]
        docs = list(COMMENT.finditer(prefix))
        doc = docs[-1].group() if docs else ""
        if not re.search(r"[\u4e00-\u9fff]", doc):
            errors.append(f"{name}: Chinese type-level Javadoc is required")
        for tag in ("@Author Mr Shu", "@Version 1.0.0"):
            if tag not in doc:
                errors.append(f"{name}: missing {tag}")
        if not re.search(r"@CreateTime \d{4}/\d{1,2}/\d{1,2} \d{2}:\d{2}", doc):
            errors.append(f"{name}: missing creation date metadata")
        body = re.sub(r"(?m)^(?:package|import)\s+[^;]+;", "", mask(source))
        for match in QUALIFIED.finditer(body):
            errors.append(f"{name}: use an explicit import instead of {match.group()}")
    if not paths:
        errors.append("No Java source files found")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"Java engineering checks passed: {len(paths)} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
