import { fixupPluginRules } from "@eslint/compat";
import { config } from "@repo/eslint-config/base";
import neverthrowPlugin from "eslint-plugin-neverthrow";

// The plugin predates ESLint 9 (uses `context.parserServices` /
// `context.getScope()`); `fixupPluginRules` shims those APIs.
const neverthrow = fixupPluginRules(neverthrowPlugin);
const mustUseResult = neverthrow.rules["must-use-result"];

/**
 * `must-use-result`, also accepting `yield* result` (inside `safeTry`), which
 * unwraps the value and short-circuits on `Err`. The plugin predates `safeTry`.
 */
const mustUseResultWithSafeTry = {
  ...mustUseResult,
  create(context) {
    const report = (descriptor) => {
      const parent = descriptor.node?.parent;
      if (parent?.type === "YieldExpression" && parent.delegate) return;
      context.report(descriptor);
    };
    return mustUseResult.create(
      Object.create(context, { report: { value: report } }),
    );
  },
};

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  { ignores: ["dist/**"] },
  {
    files: ["src/**/*.ts"],
    // `must-use-result` needs type information.
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      neverthrow: {
        ...neverthrow,
        rules: { "must-use-result": mustUseResultWithSafeTry },
      },
    },
    rules: {
      "neverthrow/must-use-result": "error",
    },
  },
];
