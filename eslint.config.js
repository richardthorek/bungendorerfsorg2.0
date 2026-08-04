const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: ["public/js/vendor/**"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        L: "readonly",
        marked: "readonly",
        luxon: "readonly",
        DOMPurify: "readonly",
        showModal: "readonly",
        showErrorMessage: "readonly",
        showLoadingMessage: "readonly",
        getUserFriendlyErrorMessage: "readonly",
        getApiBaseUrl: "readonly",
        fetchWithErrorHandling: "readonly",
        populateFireInfoTable: "readonly",
        extractFields: "readonly",
        getIconUrl: "readonly",
      },
    },
    rules: {
      indent: ["error", 2],
      "linebreak-style": ["error", "unix"],
      quotes: ["error", "double"],
      semi: ["error", "always"],
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      "prefer-const": "warn",
      "no-var": "warn",
    },
  },
];
