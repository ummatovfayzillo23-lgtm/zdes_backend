import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

export type ImageUploadCategory = 'avatars' | 'logos' | 'faces' | 'attendance';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const UPLOADS_ROOT = join(process.cwd(), 'uploads');

export function imageUploadOptions(
  category: ImageUploadCategory,
): MulterOptions {
  const destination = join(UPLOADS_ROOT, category);

  return {
    storage: diskStorage({
      destination: (_req, _file, callback) => {
        if (!existsSync(destination)) {
          mkdirSync(destination, { recursive: true });
        }
        callback(null, destination);
      },
      filename: (_req, file, callback) => {
        callback(
          null,
          `${randomUUID()}${extname(file.originalname).toLowerCase()}`,
        );
      },
    }),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (_req, file, callback) => {
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        callback(
          new BadRequestException(
            `Unsupported file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
          ),
          false,
        );
        return;
      }
      callback(null, true);
    },
  };
}

export function buildUploadUrl(
  category: ImageUploadCategory,
  filename: string,
): string {
  const relativePath = `/uploads/${category}/${filename}`;
  const baseUrl = process.env.APP_BASE_URL?.trim().replace(/\/+$/, '');

  return baseUrl ? `${baseUrl}${relativePath}` : relativePath;
}

export function getFile(
  file?: Express.Multer.File,
): Express.Multer.File {
  if (!file) {
    throw new BadRequestException('file is required');
  }
  return file;
}
