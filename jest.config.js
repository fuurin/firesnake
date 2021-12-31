module.exports = {
  roots: ["<rootDir>/packages/firestore", "<rootDir>/packages/database"],
  testMatch: ["**/__tests__/**/*.+(ts|tsx|js)", "**/?(*.)+(spec|test).+(ts|tsx|js)"],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest"
  },
  testTimeout: 10000
}
