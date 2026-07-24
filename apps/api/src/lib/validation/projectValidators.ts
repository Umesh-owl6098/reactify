import ts from "typescript";
import type { GeneratedProjectV1, ValidationIssue } from "@reactify/generation-contracts";
import { AIResponseEnvelopeSchema, GeneratedProjectV1Schema } from "@reactify/generation-contracts";
import {
  findDuplicateNormalizedPaths,
  normalizeProjectPath,
  validateProjectFilePath,
} from "./filePathValidator.js";
import {
  validateDependencyRecords,
  validatePackageJsonMatchesProject,
} from "./dependencyValidator.js";
import { validateRequiredProjectFiles } from "./requiredFilesValidator.js";

function error(code: string, message: string, filePath?: string): ValidationIssue {
  return { code, message, severity: "error", filePath };
}

export function validateGeneratedProjectSchema(project: GeneratedProjectV1): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const envelope = AIResponseEnvelopeSchema.safeParse(project);
  if (!envelope.success) {
    issues.push(error("AI_RESPONSE_VERSION_MISSING", "Generated project is missing version fields."));
  }

  const parsed = GeneratedProjectV1Schema.safeParse(project);
  if (!parsed.success) {
    for (const issueDetail of parsed.error.issues) {
      issues.push(
        error(
          "GENERATED_PROJECT_SCHEMA_INVALID",
          issueDetail.message,
          issueDetail.path.join("."),
        ),
      );
    }
    return issues;
  }

  if (parsed.data.files.length === 0) {
    issues.push(error("EMPTY_FILES", "Generated project must include at least one file."));
  }

  const duplicate = findDuplicateNormalizedPaths(parsed.data.files.map((file) => file.path));
  if (duplicate) {
    issues.push(error("DUPLICATE_FILE_PATH", `Duplicate normalized path "${duplicate}".`, duplicate));
  }

  for (const file of parsed.data.files) {
    const pathResult = validateProjectFilePath(file.path);
    if (!pathResult.ok) {
      issues.push(error(pathResult.code, pathResult.message, file.path));
    }
  }

  const dependencyIssues = validateDependencyRecords({
    dependencies: parsed.data.dependencies,
    devDependencies: parsed.data.devDependencies,
  }).issues;
  issues.push(...dependencyIssues);

  const packageJson = parsed.data.files.find(
    (file) => normalizeProjectPath(file.path) === "package.json",
  );
  if (packageJson) {
    issues.push(
      ...validatePackageJsonMatchesProject({
        packageJsonContent: packageJson.content,
        dependencies: parsed.data.dependencies,
        devDependencies: parsed.data.devDependencies,
      }),
    );
  }

  issues.push(...validateRequiredProjectFiles(parsed.data));

  const filePaths = new Set(parsed.data.files.map((file) => normalizeProjectPath(file.path)));
  for (const component of parsed.data.components) {
    if (!filePaths.has(normalizeProjectPath(component.filePath))) {
      issues.push(
        error(
          "COMPONENT_FILE_MISSING",
          `Component "${component.name}" references missing file "${component.filePath}".`,
          component.filePath,
        ),
      );
    }
  }

  if (!filePaths.has(normalizeProjectPath(parsed.data.entryFile))) {
    issues.push(
      error("ENTRY_FILE_MISSING", `Entry file "${parsed.data.entryFile}" does not exist.`),
    );
  }

  return issues;
}

export function validateGeneratedProjectSyntax(project: GeneratedProjectV1): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const allowedExtensions = new Set(["tsx", "ts", "css", "json", "html", "js"]);

  for (const file of project.files) {
    if (!allowedExtensions.has(file.language)) {
      issues.push(
        error("UNSUPPORTED_EXTENSION", `Unsupported language "${file.language}".`, file.path),
      );
    }

    if (file.language === "json") {
      try {
        JSON.parse(file.content);
      } catch {
        issues.push(error("INVALID_JSON", "JSON file contains invalid syntax.", file.path));
      }
      continue;
    }

    if (file.language === "tsx" || file.language === "ts" || file.language === "js") {
      const transpiled = ts.transpileModule(file.content, {
        reportDiagnostics: true,
        compilerOptions: {
          allowJs: file.language === "js",
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ESNext,
        },
        fileName: file.path,
      });

      for (const diagnostic of transpiled.diagnostics ?? []) {
        if (!diagnostic.file || diagnostic.start === undefined) {
          continue;
        }

        const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        issues.push({
          code: "SYNTAX_ERROR",
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
          severity: "error",
          filePath: file.path,
          line: line + 1,
          column: character + 1,
        });
      }
    }
  }

  return issues;
}

export function validateLocalImportReferences(project: GeneratedProjectV1): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const filePaths = new Set(project.files.map((file) => normalizeProjectPath(file.path)));

  const resolveImport = (fromPath: string, importPath: string): boolean => {
    if (!importPath.startsWith(".")) {
      return true;
    }

    const baseDir = normalizeProjectPath(fromPath).split("/").slice(0, -1);
    const segments = importPath.split("/");
    const resolved = [...baseDir];

    for (const segment of segments) {
      if (segment === ".") {
        continue;
      }
      if (segment === "..") {
        resolved.pop();
        continue;
      }
      resolved.push(segment);
    }

    const candidates = [
      resolved.join("/"),
      `${resolved.join("/")}.tsx`,
      `${resolved.join("/")}.ts`,
      `${resolved.join("/")}.jsx`,
      `${resolved.join("/")}.js`,
      `${resolved.join("/")}/index.tsx`,
      `${resolved.join("/")}/index.ts`,
    ];

    return candidates.some((candidate) => filePaths.has(normalizeProjectPath(candidate)));
  };

  for (const file of project.files) {
    if (!/\.(tsx?|jsx?)$/.test(file.path)) {
      continue;
    }

    const importMatches = file.content.matchAll(/from\s+["']([^"']+)["']/g);
    for (const match of importMatches) {
      const importPath = match[1];
      if (!importPath || !importPath.startsWith(".")) {
        continue;
      }

      if (!resolveImport(file.path, importPath)) {
        issues.push(
          error(
            "MISSING_IMPORT_TARGET",
            `Import "${importPath}" does not resolve to a generated file.`,
            file.path,
          ),
        );
      }
    }
  }

  return issues;
}
