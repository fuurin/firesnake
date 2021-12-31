module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "prettier"
  ],
  plugins: ["@typescript-eslint"],
  ignorePatterns: ["*.cjs", "*.json", "*.md", "/functions/lib/**/*"],
  parserOptions: {
    sourceType: "module",
    ecmaVersion: 2019
  },
  env: {
    browser: true,
    es2017: true,
    node: true
  },
  rules: {
    quotes: ["error", "double"],
    semi: ["error", "never", { beforeStatementContinuationChars: "never" }],
    "semi-spacing": ["error", { after: true, before: false }],
    "semi-style": ["error", "first"],
    "no-extra-semi": "error",
    "no-unexpected-multiline": "error",
    "no-unreachable": "error",
    "arrow-parens": ["error", "as-needed"],
    "require-jsdoc": 0,
    "import/no-unresolved": 0,
    "@typescript-eslint/explicit-module-boundary-types": "off"
  }
}
