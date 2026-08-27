import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import checker from 'vite-plugin-checker'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // TypeScript type checking in dev mode
    checker({
      typescript: {
        tsconfigPath: './tsconfig.json',
        buildMode: false, // Only check in dev mode
      },
      overlay: {
        initialIsOpen: false, // Don't auto-open overlay on start
        position: 'br', // bottom-right
        badgeStyle: 'margin: 0 0 20px 20px;',
      },
      enableBuild: false, // Disable in build mode (tsc already runs)
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'saas-routes': process.env.VITE_EDITION === 'saas'
        ? path.resolve(__dirname, '../../../saas-extensions/tgo-web-saas/src/routes.tsx')
        : path.resolve(__dirname, './src/saas-routes.ts'),
      'auth-pages': process.env.VITE_EDITION === 'saas'
        ? path.resolve(__dirname, '../../../saas-extensions/tgo-web-saas/src/auth-pages.tsx')
        : path.resolve(__dirname, './src/auth-pages.ts'),
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime'),
    },
  },
  build: {
    // 自定义 manualChunks 曾导致 vendor-react <-> app-components 循环依赖
    // (React.forwardRef undefined / 白屏)。改用 vite 自动分包, 依赖图由 rollup 正确排序。
    // rollupOptions: {
    //   output: {
    //     manualChunks(id) {
    //       ...
    //     },
    //   },
    // },
    chunkSizeWarningLimit: 1000,
  },
})
