import ts from "typescript";
import type { GeneratedProjectV1, ValidationIssue } from "@reactify/generation-contracts";

interface SafetyRule {
  id: string;
  message: string;
  test: (content: string, filePath: string) => boolean;
}

const TEXT_RULES: SafetyRule[] = [
  {
    id: "EVAL",
    message: "Use of eval() is prohibited.",
    test: (content) => /\beval\s*\(/.test(content),
  },
  {
    id: "NEW_FUNCTION",
    message: "Use of the Function constructor is prohibited.",
    test: (content) => /\bnew\s+Function\s*\(/.test(content),
  },
  {
    id: "CHILD_PROCESS",
    message: "Node child_process APIs are prohibited.",
    test: (content) => /child_process|node:child_process/.test(content),
  },
  {
    id: "PROCESS_ENV",
    message: "Access to process.env is prohibited.",
    test: (content) => /\bprocess\.env\b/.test(content),
  },
  {
    id: "FS_ACCESS",
    message: "Filesystem access is prohibited.",
    test: (content) => /require\(["']fs["']\)|from\s+["']fs["']|from\s+["']node:fs["']/.test(content),
  },
  {
    id: "DOCUMENT_WRITE",
    message: "document.write is prohibited.",
    test: (content) => /\bdocument\.write\s*\(/.test(content),
  },
  {
    id: "DANGEROUSLY_SET_INNER_HTML",
    message: "dangerouslySetInnerHTML is prohibited unless explicitly sanitized.",
    test: (content) => /dangerouslySetInnerHTML/.test(content),
  },
  {
    id: "JAVASCRIPT_URL",
    message: "javascript: URLs are prohibited.",
    test: (content) => /javascript:/i.test(content),
  },
  {
    id: "IFRAME_CREATION",
    message: "iframe creation is prohibited.",
    test: (content) => /<iframe\b|createElement\(\s*["']iframe["']\s*\)/.test(content),
  },
  {
    id: "API_KEY_SECRET",
    message: "Potential API key or secret detected.",
    test: (content) =>
      /(?:api[_-]?key|secret[_-]?key|private[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/i.test(content),
  },
  {
    id: "INLINE_BASE64",
    message: "Inline base64 assets are prohibited.",
    test: (content) => /data:[^;]+;base64,/.test(content),
  },
];

function scanTypeScriptAst(content: string, filePath: string): ValidationIssue[] {
  if (!/\.(tsx?|jsx?)$/.test(filePath)) {
    return [];
  }

  const scriptKind = filePath.endsWith(".tsx")
    ? ts.ScriptKind.TSX
    : filePath.endsWith(".jsx")
      ? ts.ScriptKind.JSX
      : ts.ScriptKind.TS;

  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind);
  const issues: ValidationIssue[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const expressionText = node.expression.getText(sourceFile);
      if (expressionText === "eval") {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        issues.push({
          code: "EVAL",
          message: "Use of eval() is prohibited.",
          severity: "error",
          filePath,
          line: line + 1,
          column: character + 1,
        });
      }
    }

    if (
      ts.isNewExpression(node) &&
      node.expression.getText(sourceFile) === "Function"
    ) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      issues.push({
        code: "NEW_FUNCTION",
        message: "Use of the Function constructor is prohibited.",
        severity: "error",
        filePath,
        line: line + 1,
        column: character + 1,
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return issues;
}

export function scanSourceSafety(content: string, filePath = "patch"): { ok: true } | { ok: false; message: string } {
  for (const rule of TEXT_RULES) {
    if (rule.test(content, filePath)) {
      return { ok: false, message: rule.message };
    }
  }

  const astIssues = scanTypeScriptAst(content, filePath);
  if (astIssues.length > 0) {
    return { ok: false, message: astIssues[0]!.message };
  }

  return { ok: true };
}

export function scanGeneratedSourceSafety(project: GeneratedProjectV1): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const file of project.files) {
    for (const rule of TEXT_RULES) {
      if (rule.test(file.content, file.path)) {
        issues.push({
          code: rule.id,
          message: rule.message,
          severity: "error",
          filePath: file.path,
        });
      }
    }

    issues.push(...scanTypeScriptAst(file.content, file.path));
  }

  return issues;
}
