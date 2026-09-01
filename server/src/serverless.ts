import type { IncomingMessage, ServerResponse } from 'http';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Express } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { validateEnv } from './config/env.validation';
import './pdfkit-fonts-for-tracer';
// AppModule is NOT a static import — see bootstrap() below for why.

/**
 * The Vercel serverless entry point. Mirrors main.ts's bootstrap exactly, minus
 * app.listen()/enableShutdownHooks() — Vercel owns the actual socket, and there is no
 * persistent process for a shutdown signal to arrive at between invocations.
 *
 * This file lives under server/src so it compiles through the project's own `tsc` build
 * (server/tsconfig.json has the decorator settings Nest's DI depends on) rather than
 * through Vercel's own function bundler, which is esbuild-based and does not reliably emit
 * `emitDecoratorMetadata` output — that gap is exactly what breaks Nest's DI silently on
 * many "just point Vercel at the TS source" setups. The root api/index.ts is a thin
 * plain-JS shim (Vercel's Functions convention requires the entry to physically live under
 * a root-level api/ directory) that imports this file's already-compiled dist output.
 *
 * The bootstrapped app is cached at module scope so a warm invocation (the common case —
 * Vercel reuses instances across nearby requests) reuses it instead of re-running Nest's DI
 * bootstrap on every request. A cold start still pays that cost once.
 */
let server: Express | undefined;

async function bootstrap(): Promise<Express> {
  if (server) return server;

  // Validated here, explicitly, BEFORE AppModule is ever touched: AppModule pulls in
  // ConfigModule.forRoot({ validate: validateEnv }), which re-runs this same check
  // synchronously the moment its @Module() decorator evaluates. Nest's own internal
  // exception handling for a throw at that exact point doesn't reliably surface through a
  // caller's promise chain — in testing it logged via Nest's [ExceptionHandler] and took the
  // whole process down before this function's try/catch ever saw it, which on a normal
  // server is an acceptable "crash and let the platform restart me" story but on Vercel
  // means the request just hangs until it times out. Calling the same pure, Nest-independent
  // validator directly, first, means a bad env var fails through this file's own error
  // handling and AppModule's copy of the check never has anything to catch.
  validateEnv(process.env);

  // Dynamic, not static: even with the above pre-check, AppModule (and everything it
  // transitively imports — which is most of the app) is a large, decorator-heavy module
  // graph. Keeping its import lazy means any OTHER unexpected throw during that evaluation
  // still becomes a promise rejection this function's try/catch can catch, rather than a
  // crash during this file's own module load, outside any handler.
  //
  // Dynamic import() (unlike a static import, which tsc rewrites to an extension-less
  // require()) resolves through Node's real ESM resolver even in this CJS-compiled output,
  // which — unlike require() — does not probe for a matching extension. Hence the explicit
  // .js here, pointing at the compiled sibling file, not the .ts source.
  const { AppModule } = await import('./app.module.js');
  const { GlobalExceptionFilter } = await import('./common/filters/http-exception.filter.js');

  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp), { bufferLogs: true });

  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    credentials: true,
  });

  app.setGlobalPrefix('v1');
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();

  new Logger('Bootstrap').log('Elite Blue API cold-started (serverless)');
  server = expressApp;
  return expressApp;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await bootstrap();
    app(req, res);
  } catch (err) {
    // A failure here (almost always a missing/invalid env var — Zod validation or a
    // `config.getOrThrow(...)` throwing during module setup, before any route ever runs)
    // would otherwise surface only as Vercel's opaque FUNCTION_INVOCATION_FAILED, with the
    // real reason visible solely in the dashboard's runtime logs. Surfacing the actual
    // message directly in the response makes it debuggable from curl/the browser alone.
    // Safe to expose: these are Nest/Zod's own "X is not set" messages, never secret values.
    const message = err instanceof Error ? err.message : String(err);
    new Logger('Bootstrap').error(`Serverless bootstrap failed: ${message}`, err instanceof Error ? err.stack : undefined);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { code: 'BOOTSTRAP_FAILED', message } }));
  }
}
