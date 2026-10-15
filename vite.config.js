import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    entries: ['index.html'],
    // Pre-bundle editor dependencies before a user starts editing. Discovering
    // them on the first lazy mode switch can otherwise reload the dev page.
    include: [
      '@codemirror/state',
      '@codemirror/view',
      '@codemirror/commands',
      '@codemirror/lang-markdown',
      '@codemirror/language',
      '@lezer/highlight',
      '@tiptap/markdown',
      '@tiptap/pm/model',
      'marked',
      '@mantine/core',
      '@mantine/hooks',
    ],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      ignored: [
        '**/public/assets/**',
        '**/public/data/**',
        '**/research/**',
        '**/output/**',
        '**/artifacts/**',
        '**/dist-film/**',
        '**/.vercel/**',
      ],
    },
  },
  build: { chunkSizeWarningLimit: 900 },
});
