// Next.js middleware — wires up the auth proxy for all routes.
// See src/proxy.ts for the actual logic.
export { proxy as middleware, config } from './proxy';
