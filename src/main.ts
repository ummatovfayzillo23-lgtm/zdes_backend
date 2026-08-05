import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { HttpCacheInterceptor } from './common/interceptors/http-cache.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { CacheService } from './common/redis/cache.service';
import { UPLOADS_ROOT } from './common/upload/image-upload.util';

const API_PREFIX = 'api/v1';
const SWAGGER_PATH = 'docs';
const SWAGGER_USERNAME = 'login';
const SWAGGER_PASSWORD = '1234';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? 'localhost';

  app.useStaticAssets(UPLOADS_ROOT, { prefix: '/uploads' });

  app.use((request: Request, response: Response, next: NextFunction) => {
    if (request.path !== '/' || !['GET', 'HEAD'].includes(request.method)) {
      next();
      return;
    }

    response.status(200).json({
      status: 'ok',
      app: 'ZDES API',
      docs: `/${API_PREFIX}/${SWAGGER_PATH}`,
    });
  });

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(
    new ResponseInterceptor(),
    new HttpCacheInterceptor(app.get(CacheService)),
  );
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerFullPath = `${API_PREFIX}/${SWAGGER_PATH}`;
  app.use(`/${swaggerFullPath}`, protectSwagger);
  app.use(`/${swaggerFullPath}-json`, protectSwagger);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('ZDES API')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup(swaggerFullPath, app, swaggerDocument);

  await app.listen(port);

  console.log(`App running: http://${host}:${port}/${API_PREFIX}`);
  console.log(`Swagger docs: http://${host}:${port}/${swaggerFullPath}`);
  console.log(
    `Swagger basic auth -> username: ${SWAGGER_USERNAME}, password: ${SWAGGER_PASSWORD}`,
  );
}
bootstrap();

function protectSwagger(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const authorization = request.headers.authorization;

  if (authorization?.startsWith('Basic ')) {
    const base64Credentials = authorization.slice('Basic '.length);
    const credentials = Buffer.from(base64Credentials, 'base64').toString(
      'utf8',
    );
    const [username, password] = credentials.split(':');

    if (username === SWAGGER_USERNAME && password === SWAGGER_PASSWORD) {
      next();
      return;
    }
  }

  response.setHeader('WWW-Authenticate', 'Basic realm="Swagger Docs"');
  response.status(401).send('Authentication required.');
}
