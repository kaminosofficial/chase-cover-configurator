import { defineConfig, loadEnv, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import cssInjectedByJs from 'vite-plugin-css-injected-by-js'
import os from 'os'
import { fetchPricingFromPublicSheet } from './lib/pricing-sheet'

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

function getBuildConfig(isVercel: boolean, buildTarget?: string) {
  if (buildTarget === 'shopify') {
    return {
      lib: {
        entry: 'src/shopify-entry.tsx',
        name: 'ChaseCoverConfigurator',
        fileName: 'chase-cover-configurator',
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
      name: 'ChaseCoverConfigurator',
      fileName: 'chase-cover-configurator',
      formats: ['iife'] as ('iife')[],
    },
    outDir: 'dist',
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isVercel = env.VERCEL === '1'
  const buildTarget = env.BUILD_TARGET || process.env.BUILD_TARGET
  const isBuild = env.NODE_ENV === 'production' || buildTarget !== undefined

  // Vercel sets VERCEL_ENV to 'production' only for production deployments;
  // branch/PR previews get 'preview'. The pricing verification panel is compiled
  // in EVERYWHERE EXCEPT a production deploy — because this is a `define`, the
  // flag becomes a literal `false` there and the whole panel is tree-shaken out
  // of the live bundle rather than merely hidden at runtime.
  const vercelEnv = env.VERCEL_ENV || process.env.VERCEL_ENV || ''
  const isProductionDeploy = vercelEnv === 'production'

  return {
    plugins: [
      {
        name: 'local-pricing-api',
        configureServer(server: ViteDevServer) {
          server.middlewares.use('/api/pricing', async (req: any, res: any, next: any) => {
            if (req.method === 'OPTIONS') {
              res.statusCode = 200
              res.end()
              return
            }
            if (req.method !== 'GET') {
              next()
              return
            }

            try {
              const pricing = await fetchPricingFromPublicSheet(env.GOOGLE_SHEET_ID || '', 'pricing')
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Cache-Control', 'public, max-age=60')
              res.end(JSON.stringify(pricing))
            } catch (error) {
              console.error('Local pricing fetch error:', error)
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Failed to fetch pricing' }))
            }
          })
        },
      },
      react(),
      (!isVercel && buildTarget !== 'shopify') && cssInjectedByJs(),
    ].filter(Boolean),
    define: {
      __LOCAL_IP__: JSON.stringify(getLocalIP()),
      __PRICING_DEBUG__: JSON.stringify(!isProductionDeploy),
      ...(isBuild && {
        'process.env.NODE_ENV': JSON.stringify('production'),
        'process.env': JSON.stringify({}),
      }),
    },
    build: {
      chunkSizeWarningLimit: 1500,
      ...getBuildConfig(isVercel, buildTarget),
    },
    server: {
      port: 5173,
      host: true,
      open: true,
    },
  }
})
