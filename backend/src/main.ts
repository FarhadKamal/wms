import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // The React app runs on its own port during development.
  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'] });
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
