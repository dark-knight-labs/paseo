import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = path.resolve(__dirname, "../..");
const WEB_SIBLING_SPECIFIER = "@/components/status-ring/clock";

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(entryPath);
    }
    return /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function listExportedValueNames(filePath: string): Set<string> {
  const sourceFile = ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    const isExported = ts
      .getModifiers(statement as ts.HasModifiers)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) continue;
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name) names.add(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    }
  }
  return names;
}

function listValueImports(filePath: string, specifier: string): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const names: string[] = [];
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== specifier
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (statement.importClause?.isTypeOnly || !bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (!element.isTypeOnly) names.push((element.propertyName ?? element.name).text);
    }
  }
  return names;
}

function hasWebSibling(file: string): boolean {
  return existsSync(file.replace(/\.tsx?$/, (ext) => `.web${ext}`));
}

function isSharedModule(file: string): boolean {
  return (
    !/\.(web|native|ios|android|electron|test)\.tsx?$/.test(file) &&
    // A base file with a `.web` sibling is never bundled for web (e.g. status-ring/index.tsx).
    !hasWebSibling(file)
  );
}

function findMissingWebImports(file: string, webExports: Set<string>): string[] {
  const missing = listValueImports(file, WEB_SIBLING_SPECIFIER).filter(
    (name) => !webExports.has(name),
  );
  const relative = path.relative(SOURCE_ROOT, file);
  return missing.map((name) => `${relative}: ${name}`);
}

// The web build resolves `clock` to `clock.web.ts`, which exports a different surface than the
// native `clock.ts`. A module with no platform extension that imports a native-only symbol gets
// `undefined` on web and crashes at render ("useStatusRingRotation is not a function").
describe("status-ring clock platform split", () => {
  it("shared modules import only symbols that clock.web.ts also exports", () => {
    const webExports = listExportedValueNames(
      path.join(SOURCE_ROOT, "components/status-ring/clock.web.ts"),
    );
    const offenders = listSourceFiles(SOURCE_ROOT)
      .filter(isSharedModule)
      .flatMap((file) => findMissingWebImports(file, webExports));

    expect(offenders).toEqual([]);
  });
});
