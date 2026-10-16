const path = require('path');

// O jest-expo importa expo-modules-core direto, mas o npm pode deixá-lo dentro de expo/node_modules.
const modulesCore = path.dirname(require.resolve('expo-modules-core/package.json', { paths: [path.dirname(require.resolve('expo/package.json'))] }));

/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // Os testes do banco e de ponta a ponta (tests/) rodam à parte.
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo-modules-core(/.*)?$': `${modulesCore}$1`,
  },
};
