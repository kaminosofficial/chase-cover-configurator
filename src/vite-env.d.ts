/// <reference types="vite/client" />

/**
 * Compile-time flag injected by vite.config.ts `define`.
 * `true` in dev and on Vercel branch/PR previews, `false` on production
 * deploys — where it lets the bundler strip the pricing verification panel
 * out of the shipped bundle entirely.
 */
declare const __PRICING_DEBUG__: boolean;

declare module '*.css?inline' {
    const css: string;
    export default css;
}

declare module 'qrious' {
    export default class QRious {
        constructor(options: any);
    }
}
