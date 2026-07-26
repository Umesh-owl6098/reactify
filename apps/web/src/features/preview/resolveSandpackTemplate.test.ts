import { describe, expect, it } from "vitest";
import type { GeneratedProjectV1 } from "@reactify/generation-contracts";
import { resolveSandpackTemplate, SUPPORTED_SANDPACK_PRESETS } from "./resolveSandpackTemplate";

function createViteReactTsProject(overrides: Partial<GeneratedProjectV1> = {}): GeneratedProjectV1 {
  return {
    schemaVersion: "1",
    responseVersion: "1.0.0",
    projectName: "DeviceFramesShowcase",
    summary: "Vite React TypeScript project",
    dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
    devDependencies: { vite: "^6.0.11", typescript: "^5.7.3" },
    components: [],
    warnings: [],
    entryFile: "src/main.tsx",
    files: [
      {
        path: "package.json",
        language: "json",
        purpose: "Package manifest",
        content: JSON.stringify({
          name: "device-frames-showcase",
          dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
          devDependencies: { vite: "^6.0.11", "@vitejs/plugin-react": "^4.3.4" },
        }),
      },
      { path: "index.html", language: "html", purpose: "HTML entry", content: "<div id=\"root\"></div>" },
      { path: "vite.config.ts", language: "ts", purpose: "Vite config", content: "export default {}" },
      { path: "tsconfig.json", language: "json", purpose: "TS config", content: "{}" },
      { path: "src/main.tsx", language: "tsx", purpose: "App entry", content: "export {}" },
      { path: "src/index.css", language: "css", purpose: "Styles", content: "body { margin: 0; }" },
    ],
    ...overrides,
  };
}

describe("resolveSandpackTemplate", () => {
  it("resolves a Vite React TypeScript project to a supported bundler preset", () => {
    const resolution = resolveSandpackTemplate(createViteReactTsProject());

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;

    expect(resolution.template.preset).toBe("react");
    expect(SUPPORTED_SANDPACK_PRESETS).toContain(resolution.template.preset);
    expect(resolution.template.toolchain).toBe("vite");
    expect(resolution.template.typescript).toBe(true);
    expect(resolution.template.entry).toBe("/src/main.tsx");
    expect(resolution.template.htmlEntry).toBe("/index.html");
    expect(resolution.template.dependencies).toEqual({ react: "^18.3.1", "react-dom": "^18.3.1" });
  });

  it("never selects create-react-app for a Vite project", () => {
    const resolution = resolveSandpackTemplate(createViteReactTsProject());

    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.template.preset).not.toBe("create-react-app");
    expect(resolution.template.preset).not.toBe("create-react-app-typescript");
  });

  it("rejects an unsupported preset instead of silently falling back", () => {
    const resolution = resolveSandpackTemplate(createViteReactTsProject(), {
      requestedPreset: "create-react-app",
    });

    expect(resolution.ok).toBe(false);
    if (resolution.ok) return;
    expect(resolution.errors.map((error) => error.code)).toContain("unsupported_preset");
    expect(resolution.errors[0]?.message).toContain("create-react-app");
  });

  it("reports a missing entry file", () => {
    const resolution = resolveSandpackTemplate(createViteReactTsProject({ entryFile: "src/nope.tsx" }));

    expect(resolution.ok).toBe(false);
    if (resolution.ok) return;
    expect(resolution.errors.map((error) => error.code)).toContain("missing_entry_file");
  });

  it("reports a missing index.html", () => {
    const project = createViteReactTsProject();
    const resolution = resolveSandpackTemplate({
      ...project,
      files: project.files.filter((file) => file.path !== "index.html"),
    });

    expect(resolution.ok).toBe(false);
    if (resolution.ok) return;
    expect(resolution.errors.map((error) => error.code)).toContain("missing_html_entry");
  });

  it("reports missing or unusable React versions", () => {
    const base = createViteReactTsProject();
    const withoutReactManifest = base.files.map((file) =>
      file.path === "package.json"
        ? { ...file, content: JSON.stringify({ name: "x", dependencies: { "react-dom": "^18.3.1" } }) }
        : file,
    );

    const missing = resolveSandpackTemplate(
      createViteReactTsProject({ dependencies: { "react-dom": "^18.3.1" }, files: withoutReactManifest }),
    );
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.errors.map((error) => error.code)).toContain("missing_react_dependency");
    }

    const invalid = resolveSandpackTemplate(
      createViteReactTsProject({ dependencies: { react: "workspace:*", "react-dom": "^18.3.1" } }),
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.errors.map((error) => error.code)).toContain("invalid_react_version");
    }
  });

  it("requires a server-compiled stylesheet for Tailwind projects", () => {
    const project = createViteReactTsProject();
    const tailwindProject: GeneratedProjectV1 = {
      ...project,
      files: project.files.map((file) =>
        file.path === "src/index.css"
          ? { ...file, content: "@tailwind base;\n@tailwind components;\n@tailwind utilities;" }
          : file,
      ),
    };

    const withoutStylesheet = resolveSandpackTemplate(tailwindProject);
    expect(withoutStylesheet.ok).toBe(false);
    if (!withoutStylesheet.ok) {
      expect(withoutStylesheet.errors.map((error) => error.code)).toContain("missing_compiled_stylesheet");
    }

    const withStylesheet = resolveSandpackTemplate(tailwindProject, {
      compiledStylesheet: ".flex { display: flex; }",
    });
    expect(withStylesheet.ok).toBe(true);
  });
});
