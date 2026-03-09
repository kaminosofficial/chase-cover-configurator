import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cssInjectedByJs from 'vite-plugin-css-injected-by-js'
import os from 'os'

const isVercel = process.env.VERCEL === '1'
const buildTarget = process.env.BUILD_TARGET // 'shopify' | undefined

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return undefined;
}

function getBuildConfig() {
  if (buildTarget === 'shopify') {
    return {
      lib: {
        entry: 'src/shopify-entry.tsx',
        name: 'ChaseConfigurator',
        fileName: 'chase-configurator',
        formats: ['iife'] as ('iife')[],
      },
      outDir: 'dist-shopify',
      cssCodeSplit: false,
      minify: 'esbuild' as const,
      rollupOptions: {
        output: { inlineDynamicImports: true },
      },
    };
  }

  if (isVercel) {
    return { outDir: 'dist' };
  }

  // Default: legacy web-component IIFE build
  return {
    lib: {
      entry: 'src/web-component.tsx',
      name: 'ChaseConfigurator',
      fileName: 'chase-configurator',
      formats: ['iife'] as ('iife')[],
    },
    outDir: 'dist',
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  };
}

const isBuild = process.env.NODE_ENV === 'production' || buildTarget !== undefined;

export default defineConfig({
  plugins: [
    react(),
    (!isVercel && buildTarget !== 'shopify') && cssInjectedByJs(),
  ].filter(Boolean),
  define: {
    __LOCAL_IP__: JSON.stringify(getLocalIP()),
    ...(isBuild && {
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env': JSON.stringify({}),
    }),
  },
  build: getBuildConfig(),
  server: { 
    port: 5173, 
    host: true, 
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5173', // This is just a dummy, we need a real backend or mock it
        bypass: (req, _res) => {
          if (req.url?.includes('/api/pricing')) {
            // Locally, we should probably just return a static JSON or the real script logic
            // For now, let's just avoid the 404/code-serving mess if possible.
          }
        }
      }
    }
  },
})
