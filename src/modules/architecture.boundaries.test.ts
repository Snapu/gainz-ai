import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(process.cwd(), "src/modules");
const SRC_ROOT = path.resolve(process.cwd(), "src");

type Layer = "domain" | "application" | "infrastructure" | "presentation";

async function listTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listTsFiles(fullPath);
      if (!entry.isFile()) return [];
      if (!entry.name.endsWith(".ts")) return [];
      return [fullPath];
    }),
  );

  return files.flat();
}

async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listSourceFiles(fullPath);
      if (!entry.isFile()) return [];
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".vue")) return [];
      return [fullPath];
    }),
  );

  return files.flat();
}

function toModuleRelative(filePath: string): string {
  return path.relative(ROOT, filePath).split(path.sep).join("/");
}

function extractImports(source: string): string[] {
  return Array.from(source.matchAll(/from\s+["']([^"']+)["']/g))
    .map((match) => match[1])
    .filter((importPath): importPath is string => typeof importPath === "string");
}

function isLayerFile(filePath: string, layer: Layer): boolean {
  return new RegExp(`/${layer}/.+\\.ts$`).test(filePath);
}

function isProductionTsFile(filePath: string): boolean {
  return filePath.endsWith(".ts") && !filePath.endsWith(".test.ts");
}

function isPresentationStoreWrapper(filePath: string): boolean {
  return filePath.includes("/presentation/stores/");
}

function moduleName(filePath: string): string {
  return toModuleRelative(filePath).split("/")[0] ?? "";
}

function resolvedModuleNameFromImport(filePath: string, importPath: string): string | null {
  if (importPath.startsWith("@/modules/")) {
    const parts = importPath.split("/");
    return parts[2] ?? null;
  }

  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    const resolvedPath = path.resolve(path.dirname(filePath), importPath);
    return moduleName(resolvedPath);
  }

  return null;
}

function importTargetsLayer(filePath: string, importPath: string, layer: Layer): boolean {
  const aliasLayerImport = new RegExp(`^@/modules/[^/]+/${layer}(?:$|/)`).test(importPath);
  if (aliasLayerImport) return true;

  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    const resolvedPath = path.resolve(path.dirname(filePath), importPath);
    const resolvedRelative = toModuleRelative(resolvedPath);
    return new RegExp(`/${layer}(?:/|$)`).test(`/${resolvedRelative}`);
  }

  return false;
}

describe("module architecture boundaries", () => {
  it("domain layer does not import services/stores/presentation/infrastructure", async () => {
    const allFiles = await listTsFiles(ROOT);
    const domainFiles = allFiles.filter((filePath) => isLayerFile(filePath, "domain"));

    const violations: string[] = [];

    for (const filePath of domainFiles) {
      const source = await readFile(filePath, "utf-8");
      const importPaths = extractImports(source);

      for (const importPath of importPaths) {
        const isViolation =
          importPath.startsWith("@/services/") ||
          importPath.startsWith("@/stores/") ||
          importTargetsLayer(filePath, importPath, "infrastructure") ||
          importTargetsLayer(filePath, importPath, "presentation");

        if (isViolation) {
          violations.push(`${toModuleRelative(filePath)} -> ${importPath}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("domain production files only use allowed domain imports", async () => {
    const allFiles = await listTsFiles(ROOT);
    const domainProductionFiles = allFiles.filter(
      (filePath) => isLayerFile(filePath, "domain") && isProductionTsFile(filePath),
    );

    const violations: string[] = [];

    for (const filePath of domainProductionFiles) {
      const source = await readFile(filePath, "utf-8");
      const importPaths = extractImports(source);
      const currentModule = moduleName(filePath);

      for (const importPath of importPaths) {
        if (importPath.startsWith("@/")) {
          const allowedAlias = /^@\/modules\/[^/]+\/domain(\/|$)/.test(importPath);
          if (!allowedAlias) {
            violations.push(`${toModuleRelative(filePath)} -> ${importPath}`);
          }
          continue;
        }

        if (importPath.startsWith("./")) {
          continue;
        }

        if (importPath.startsWith("../")) {
          const resolvedPath = path.resolve(path.dirname(filePath), importPath);
          const resolvedRelative = toModuleRelative(resolvedPath);
          const sameModule = moduleName(resolvedPath) === currentModule;
          const inDomain = /\/domain\//.test(`/${resolvedRelative}`);
          if (!sameModule || !inDomain) {
            violations.push(`${toModuleRelative(filePath)} -> ${importPath}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("application production files stay isolated from UI and storage tech", async () => {
    const allFiles = await listTsFiles(ROOT);
    const applicationProductionFiles = allFiles.filter(
      (filePath) => isLayerFile(filePath, "application") && isProductionTsFile(filePath),
    );

    const violations: string[] = [];

    for (const filePath of applicationProductionFiles) {
      const source = await readFile(filePath, "utf-8");
      const importPaths = extractImports(source);
      const currentModule = moduleName(filePath);

      for (const importPath of importPaths) {
        if (importTargetsLayer(filePath, importPath, "presentation")) {
          violations.push(`${toModuleRelative(filePath)} -> ${importPath}`);
          continue;
        }

        if (importTargetsLayer(filePath, importPath, "infrastructure")) {
          const importedModule = resolvedModuleNameFromImport(filePath, importPath);
          if (importedModule && importedModule !== currentModule) {
            violations.push(`${toModuleRelative(filePath)} -> ${importPath}`);
          }
        }

        if (importPath === "google-spreadsheet") {
          violations.push(`${toModuleRelative(filePath)} -> ${importPath}`);
        }
      }

      const hasRuntimeLocalStorageUsage = source
        .split("\n")
        .some((line) => /\blocalStorage\./.test(line) && !/^\s*(?:\/\/|\*|\/\*)/.test(line));
      if (hasRuntimeLocalStorageUsage) {
        violations.push(toModuleRelative(filePath));
      }

      if (/\bGoogleSpreadsheet\b/.test(source)) {
        violations.push(toModuleRelative(filePath));
      }
    }

    expect(violations).toEqual([]);
  });

  it("infrastructure production files do not import presentation", async () => {
    const allFiles = await listTsFiles(ROOT);
    const infrastructureProductionFiles = allFiles.filter(
      (filePath) => isLayerFile(filePath, "infrastructure") && isProductionTsFile(filePath),
    );

    const violations: string[] = [];

    for (const filePath of infrastructureProductionFiles) {
      const source = await readFile(filePath, "utf-8");
      const importPaths = extractImports(source);

      for (const importPath of importPaths) {
        if (importTargetsLayer(filePath, importPath, "presentation")) {
          violations.push(`${toModuleRelative(filePath)} -> ${importPath}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("source files use module facades instead of deep alias imports", async () => {
    const allFiles = await listSourceFiles(SRC_ROOT);
    const sourceFiles = allFiles.filter((filePath) => {
      if (filePath.includes("/node_modules/")) return false;
      if (filePath.includes("/docs/")) return false;
      if (filePath.endsWith(".test.ts")) return false;
      return true;
    });

    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const source = await readFile(filePath, "utf-8");
      const importPaths = extractImports(source);

      for (const importPath of importPaths) {
        if (!importPath.startsWith("@/modules/")) continue;
        const isDeepModuleImport = /^@\/modules\/[^/]+\/(domain|application|presentation)\/.+/.test(
          importPath,
        );
        if (isDeepModuleImport) {
          const relativePath = path.relative(SRC_ROOT, filePath).split(path.sep).join("/");
          violations.push(`${relativePath} -> ${importPath}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("source files do not import legacy shared module aliases", async () => {
    const allFiles = await listSourceFiles(SRC_ROOT);
    const sourceFiles = allFiles.filter((filePath) => {
      if (filePath.includes("/node_modules/")) return false;
      if (filePath.includes("/docs/")) return false;
      if (filePath.endsWith(".test.ts")) return false;
      return true;
    });

    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const relativePath = path.relative(SRC_ROOT, filePath).split(path.sep).join("/");

      const source = await readFile(filePath, "utf-8");
      const importPaths = extractImports(source);

      for (const importPath of importPaths) {
        const isLegacySharedAlias =
          /^@\/modules\/shared\/(domain|application|presentation|infrastructure)\b/.test(
            importPath,
          );
        if (isLegacySharedAlias) {
          violations.push(`${relativePath} -> ${importPath}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
  it("presentation production files only use allowlisted store imports", async () => {
    const allFiles = await listTsFiles(ROOT);
    const presentationProductionFiles = allFiles.filter(
      (filePath) => isLayerFile(filePath, "presentation") && isProductionTsFile(filePath),
    );

    const violations: string[] = [];

    for (const filePath of presentationProductionFiles) {
      if (isPresentationStoreWrapper(filePath)) continue;

      const source = await readFile(filePath, "utf-8");
      const importPaths = extractImports(source);

      for (const importPath of importPaths) {
        if (!importPath.startsWith("@/stores/")) continue;
        violations.push(`${toModuleRelative(filePath)} -> ${importPath}`);
      }
    }

    expect(violations).toEqual([]);
  });
  it("views and shared presentation files do not import module domain/application/infrastructure layers directly", async () => {
    const viewFiles = await listSourceFiles(path.resolve(SRC_ROOT, "views"));
    const sharedPresentationFiles = await listSourceFiles(
      path.resolve(SRC_ROOT, "shared/presentation"),
    );
    const sourceFiles = [...viewFiles, ...sharedPresentationFiles].filter((filePath) => {
      if (filePath.endsWith(".test.ts")) return false;
      return true;
    });

    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const source = await readFile(filePath, "utf-8");
      const importPaths = extractImports(source);

      for (const importPath of importPaths) {
        if (!importPath.startsWith("@/modules/")) continue;

        const importsRestrictedLayer =
          /^@\/modules\/[^/]+\/(domain|application|infrastructure)(\/|$)/.test(importPath);

        if (importsRestrictedLayer) {
          const relativePath = path.relative(SRC_ROOT, filePath).split(path.sep).join("/");
          violations.push(`${relativePath} -> ${importPath}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("module page components keep orchestration in composables/stores", async () => {
    const pageComponents = [
      path.resolve(ROOT, "trainingLogs/presentation/components/ExerciseLogsPage.vue"),
      path.resolve(ROOT, "trainingInsights/presentation/components/TrainingInsightsPage.vue"),
    ];

    const violations: string[] = [];

    for (const filePath of pageComponents) {
      const source = await readFile(filePath, "utf-8");
      const hasDirectStoreUsage = /\buse[A-Za-z0-9]+Store\(/.test(source);
      if (hasDirectStoreUsage) {
        violations.push(toModuleRelative(filePath));
      }
    }

    expect(violations).toEqual([]);
  });

  it("presentation store files use facades for cross-module domain/application imports", async () => {
    const allFiles = await listTsFiles(ROOT);
    const presentationStoreFiles = allFiles.filter(
      (filePath) =>
        isLayerFile(filePath, "presentation") &&
        isProductionTsFile(filePath) &&
        isPresentationStoreWrapper(filePath),
    );

    const violations: string[] = [];

    for (const filePath of presentationStoreFiles) {
      const source = await readFile(filePath, "utf-8");
      const importPaths = extractImports(source);
      const currentModule = moduleName(filePath);

      for (const importPath of importPaths) {
        const targetsRestrictedLayer =
          importTargetsLayer(filePath, importPath, "domain") ||
          importTargetsLayer(filePath, importPath, "application");

        if (!targetsRestrictedLayer) continue;

        const importedModule = resolvedModuleNameFromImport(filePath, importPath);
        if (
          importedModule &&
          importedModule !== currentModule &&
          importedModule !== "sharedKernel"
        ) {
          violations.push(`${toModuleRelative(filePath)} -> ${importPath}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
