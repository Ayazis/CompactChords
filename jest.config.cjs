/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', isolatedModules: true } }],
  },
  setupFiles: ['<rootDir>/tests/stubs/setup.ts'],
  moduleNameMapper: {
    '\\.css(\\?.*)?$': '<rootDir>/tests/stubs/style.ts',
    '\\.txt\\?raw$': '<rootDir>/tests/stubs/raw-text.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/core/**/*.ts'],
  coverageThreshold: {
    global: { lines: 95, branches: 90 },
  },
};
