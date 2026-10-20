import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'client/src/**/*.test.ts'],
    environment: 'node',
    // vários testes de disco passam de 5 s com a máquina ocupada (meetings, chat-archive, meeting-context)
    testTimeout: 20_000,
  },
});
