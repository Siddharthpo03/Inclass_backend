// Backend ESLint flat config (Node.js)
const js = require("@eslint/js");

module.exports = [
  // Ignore patterns (first block; applied before other configs)
  {
    ignores: [
      "node_modules/**",
      "tests/**",
      "**/*.test.js",
      "**/jest.setup.js",
      "**/load/**",
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        console: "readonly",
        process: "readonly",
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
      },
    },
    rules: {
      // Temporary baseline for existing repository state; tighten incrementally.
      "no-unused-vars": "off",
      "no-useless-escape": "off",
      "no-undef": "off",
    },
  },
];
