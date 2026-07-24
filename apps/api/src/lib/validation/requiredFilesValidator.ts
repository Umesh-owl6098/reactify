import type { GeneratedProjectV1, ValidationIssue } from "@reactify/generation-contracts";
import { normalizeProjectPath } from "./filePathValidator.js";

function issue(code: string, message: string, filePath?: string): ValidationIssue {
  return { code, message, severity: "error", filePath };
}

function findFile(project: GeneratedProjectV1, candidates: string[]): string | undefined {
  const normalizedFiles = new Map(
    project.files.map((file) => [normalizeProjectPath(file.path), file.path]),
  );

  for (const candidate of candidates) {
    const match = normalizedFiles.get(normalizeProjectPath(candidate));
    if (match) {
      return match;
    }
  }

  return undefined;
}

export function validateRequiredProjectFiles(project: GeneratedProjectV1): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fileByPath = new Map(project.files.map((file) => [normalizeProjectPath(file.path), file]));

  const requiredPaths = ["package.json", "index.html"];
  for (const required of requiredPaths) {
    if (!fileByPath.has(normalizeProjectPath(required))) {
      issues.push(issue("MISSING_REQUIRED_FILE", `Required file "${required}" is missing.`));
    }
  }

  const mainPath = findFile(project, ["src/main.tsx", "src/main.jsx"]);
  if (!mainPath) {
    issues.push(issue("MISSING_MAIN_ENTRY", "Required main entry src/main.tsx or src/main.jsx is missing."));
  }

  const appPath = findFile(project, ["src/App.tsx", "src/App.jsx"]);
  if (!appPath) {
    issues.push(issue("MISSING_APP_ENTRY", "Required App entry src/App.tsx or src/App.jsx is missing."));
  }

  const stylePath = findFile(project, ["src/index.css", "src/styles.css", "src/app.css"]);
  if (!stylePath) {
    issues.push(
      issue("MISSING_STYLESHEET", "Required stylesheet src/index.css or equivalent is missing."),
    );
  }

  const viteConfig = fileByPath.get(normalizeProjectPath("vite.config.ts"));
  if (!viteConfig) {
    issues.push(issue("MISSING_VITE_CONFIG", "Required vite.config.ts is missing."));
  }

  const tsConfig = fileByPath.get(normalizeProjectPath("tsconfig.json"));
  if (!tsConfig) {
    issues.push(issue("MISSING_TSCONFIG", "Required tsconfig.json is missing."));
  }

  const packageJson = fileByPath.get(normalizeProjectPath("package.json"));
  if (packageJson) {
    try {
      const parsed = JSON.parse(packageJson.content) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      if (!parsed.scripts?.dev || !parsed.scripts?.build) {
        issues.push(
          issue(
            "INVALID_PACKAGE_SCRIPTS",
            "package.json must include dev and build scripts.",
            packageJson.path,
          ),
        );
      }

      if (!parsed.dependencies?.react || !parsed.dependencies?.["react-dom"]) {
        issues.push(
          issue(
            "MISSING_REACT_DEPENDENCIES",
            "package.json must declare react and react-dom.",
            packageJson.path,
          ),
        );
      }

      if (!parsed.devDependencies?.vite) {
        issues.push(
          issue(
            "MISSING_VITE_DEPENDENCY",
            "package.json must declare vite in devDependencies.",
            packageJson.path,
          ),
        );
      }
    } catch {
      issues.push(issue("INVALID_PACKAGE_JSON", "package.json is not valid JSON.", packageJson.path));
    }
  }

  const indexHtml = fileByPath.get(normalizeProjectPath("index.html"));
  if (indexHtml && !indexHtml.content.includes('id="root"') && !indexHtml.content.includes("id='root'")) {
    issues.push(
      issue(
        "ROOT_ELEMENT_MISMATCH",
        "index.html must contain a root element with id=\"root\".",
        indexHtml.path,
      ),
    );
  }

  if (mainPath) {
    const mainFile = fileByPath.get(normalizeProjectPath(mainPath));
    if (mainFile) {
      if (!/import\s+App\s+from\s+['"]\.\/App['"]/.test(mainFile.content) &&
          !/import\s+\{\s*App\s*\}/.test(mainFile.content)) {
        issues.push(
          issue("MAIN_APP_IMPORT_MISSING", "Main entry must import App.", mainFile.path),
        );
      }

      if (!/createRoot\(|ReactDOM\.render\(/.test(mainFile.content)) {
        issues.push(
          issue("MAIN_MOUNT_MISSING", "Main entry must mount the App into the DOM root.", mainFile.path),
        );
      }
    }
  }

  return issues;
}
