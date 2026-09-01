// Vercel requires serverless function entry points to physically live under a root-level
// api/ directory — this is a thin pass-through to the real bootstrap, which lives in
// server/src/serverless.ts and compiles through the server project's own `tsc` build (see
// that file's header comment for why: Vercel's own function bundler is esbuild-based and
// does not reliably support the decorator metadata NestJS's dependency injection needs).
//
// This file itself is ESM (the root package.json has "type": "module"), but the compiled
// target below is CommonJS. A plain `import handler from '...'` here is ambiguous in a way
// that actually breaks: Node's *native* runtime interop for importing a CJS module from ESM
// does not understand TypeScript's own __esModule/.default convention (that convention only
// exists between TypeScript-compiled files talking to each other) — the ESM default binding
// just becomes `module.exports` as a whole, so `handler` would be the exports *object*, not
// the function inside it. createRequire sidesteps the ambiguity entirely: a real require()
// call has no such interop question, since both sides are CommonJS.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const handler = require('../server/dist/src/serverless.js').default;

export default handler;
