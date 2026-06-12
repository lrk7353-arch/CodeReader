import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "artifacts/**",
      "dist/**",
      "node_modules/**",
      "src-tauri/gen/**",
      "src-tauri/target/**"
    ]
  },
  {
    files: ["scripts/*.mjs", "*.config.{js,mjs,ts}"],
    ...js.configs.recommended,
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    plugins: {
      "react-hooks": reactHooks
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false
          }
        }
      ],
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "error"
    }
  }
);
