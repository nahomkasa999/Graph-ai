import { createRequire } from "node:module";
import { type PluginObj, types as t, transformAsync } from "@babel/core";

const require = createRequire(import.meta.url);

export async function instrumentSource(
  source: string,
  filename: string,
  entries: ReadonlyMap<string, string>,
  runtime: string,
) {
  const plugin: () => PluginObj = () => ({
    name: "flowlens",
    visitor: {
      Program(path) {
        const wrap = path.scope.generateUidIdentifier("flowlensWrap");
        let changed = false;
        const wrapCall = (id: string, fn: t.Expression) =>
          t.callExpression(t.cloneNode(wrap), [t.stringLiteral(id), fn]);
        for (const statement of path.get("body")) {
          const outer = statement.node;
          const node =
            t.isExportNamedDeclaration(outer) ||
            t.isExportDefaultDeclaration(outer)
              ? outer.declaration
              : outer;
          if (t.isFunctionDeclaration(node) && node.id) {
            const id = entries.get(node.id.name);
            if (!id) continue;
            const name = t.cloneNode(node.id);
            statement.insertAfter(
              t.expressionStatement(
                t.assignmentExpression(
                  "=",
                  name,
                  wrapCall(id, t.cloneNode(name)),
                ),
              ),
            );
            changed = true;
          }
          if (t.isVariableDeclaration(node, { kind: "const" })) {
            for (const declaration of node.declarations) {
              const { id, init } = declaration;
              if (!t.isIdentifier(id)) continue;
              const nodeId = entries.get(id.name);
              let expression = init;
              while (
                t.isTSAsExpression(expression) ||
                t.isTSSatisfiesExpression(expression) ||
                t.isTSNonNullExpression(expression) ||
                t.isParenthesizedExpression(expression)
              ) {
                expression = expression.expression;
              }
              if (
                !nodeId ||
                !expression ||
                (!t.isArrowFunctionExpression(expression) &&
                  !t.isFunctionExpression(expression))
              )
                continue;
              const original = t.cloneNode(expression);
              if (t.isArrowFunctionExpression(original) || !original.id) {
                const key = t.stringLiteral(id.name);
                declaration.init = wrapCall(
                  nodeId,
                  t.memberExpression(
                    t.objectExpression([
                      t.objectProperty(t.cloneNode(key), original, true),
                    ]),
                    key,
                    true,
                  ),
                );
              } else {
                declaration.init = wrapCall(nodeId, original);
              }
              changed = true;
            }
          }
        }
        if (changed)
          path.unshiftContainer(
            "body",
            t.importDeclaration(
              [t.importSpecifier(wrap, t.identifier("wrap"))],
              t.stringLiteral(runtime),
            ),
          );
      },
    },
  });
  const result = await transformAsync(source, {
    filename,
    sourceType: "module",
    sourceMaps: "inline",
    configFile: false,
    babelrc: false,
    presets: /\.[cm]?ts$/.test(filename)
      ? [
          [
            require.resolve("@babel/preset-typescript"),
            {
              allowDeclareFields: true,
              onlyRemoveTypeImports: true,
            },
          ],
        ]
      : [],
    plugins: [plugin],
  });
  if (result?.code == null) throw Error(`Could not transform ${filename}`);
  return result.code;
}
