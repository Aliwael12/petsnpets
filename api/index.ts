// Vercel requires serverless function entry points to physically live under a root-level
// api/ directory — this is a thin pass-through to the real bootstrap, which lives in
// server/src/serverless.ts and compiles through the server project's own `tsc` build (see
// that file's header comment for why: Vercel's own function bundler is esbuild-based and
// does not reliably support the decorator metadata NestJS's dependency injection needs).
import handler from '../server/dist/src/serverless.js';

export default handler;
