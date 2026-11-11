import { relative, sep } from "node:path";
import { type Expression, Node, type SourceFile } from "ts-morph";

export function relativePath(root: string, file: string) {
  return relative(root, file).split(sep).join("/");
}

export function isSourcePath(file: string) {
  return (
    !file.startsWith("../") &&
    !file
      .split("/")
      .some((part) =>
        ["node_modules", "__tests__", ".flowlens", ".git"].includes(part),
      ) &&
    !/\.(?:d|test|spec)\.[cm]?[jt]sx?$/.test(file) &&
    /\.[cm]?[jt]sx?$/.test(file)
  );
}

export function sourceRange(node: Node) {
  return {
    startLine: node.getStartLineNumber(),
    endLine: node.getEndLineNumber(),
  };
}

export function unparenthesize(node: Expression) {
  let expression = node;
  while (
    Node.isParenthesizedExpression(expression) ||
    Node.isAsExpression(expression) ||
    Node.isSatisfiesExpression(expression) ||
    Node.isNonNullExpression(expression)
  ) {
    expression = expression.getExpression();
  }
  return expression;
}

export function rootExpression(node: Expression): Expression {
  const expression = unparenthesize(node);
  if (
    Node.isPropertyAccessExpression(expression) ||
    Node.isElementAccessExpression(expression) ||
    Node.isCallExpression(expression)
  )
    return rootExpression(expression.getExpression());
  return expression;
}

export function declarations(node: Node) {
  const symbol = node.getSymbol();
  return (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
}

export function importedFrom(node: Expression) {
  const root = rootExpression(node);
  return root
    .getSymbol()
    ?.getDeclarations()
    .flatMap((declaration) => {
      const statement = declaration.getFirstAncestor(Node.isImportDeclaration);
      return statement ? [statement.getModuleSpecifierValue()] : [];
    })[0];
}

export function packageName(node: Expression) {
  const source = importedFrom(node);
  if (
    !source ||
    source.startsWith(".") ||
    source.startsWith("/") ||
    source.startsWith("#")
  )
    return undefined;
  return source
    .split("/")
    .slice(0, source.startsWith("@") ? 2 : 1)
    .join("/");
}

export function expressionName(node: Expression) {
  if (Node.isPropertyAccessExpression(node)) return node.getName();
  return node.getText();
}

export function localCalls(node: Node) {
  const calls = [];
  if (Node.isCallExpression(node)) calls.push(node);
  node.forEachDescendant((child, traversal) => {
    if (
      Node.isFunctionLikeDeclaration(child) ||
      Node.isClassDeclaration(child) ||
      Node.isClassExpression(child)
    ) {
      traversal.skip();
      return;
    }
    if (Node.isCallExpression(child)) calls.push(child);
  });
  return calls;
}

export function ownSources(files: SourceFile[], root: string) {
  return files
    .filter(
      (file) =>
        !file.isDeclarationFile() &&
        isSourcePath(relativePath(root, file.getFilePath())),
    )
    .sort((left, right) =>
      left.getFilePath().localeCompare(right.getFilePath()),
    );
}
