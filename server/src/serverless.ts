import type { IncomingMessage, ServerResponse } from 'http';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { type Express } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

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
  const app = await bootstrap();
  app(req, res);
}
