import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { logger } from '@/util/logger';
import { Request, Response } from 'express';
import { S3Repository } from './aws_s3.repository.js';
import { env } from '@/env.js';

class UploadServices {
    private publicPath: string;
    private uploadsPath: string;
    private upload: (req: Request, res: Response, cb: (err: any) => void) => void;

    constructor(private s3Repository: S3Repository) {
        this.publicPath = path.resolve(process.cwd(), 'public');
        this.uploadsPath = path.join(this.publicPath, 'uploads');

        const storage = multer.diskStorage({
            destination: async (req: any, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
                await this.ensureUploadsDirectory();
                cb(null, this.uploadsPath); 
            },
            filename: (req: any, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
            }
        });

        const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
            const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
            if (allowedTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Invalid file type. Only JPEG, PNG, GIF and PDF are allowed.'));
            }
        };

        this.upload = multer({ 
            storage: storage,
            fileFilter: fileFilter as any,
            limits: {
                fileSize: 5 * 1024 * 1024 // 5MB limit
            }
        }).single('image');
    }

    // Ensure the uploads directory exists
    async ensureUploadsDirectory(): Promise<boolean> {
        try {
            logger.info(`[UploadServices] Ensuring uploads directory exists: ${this.uploadsPath}`);
            await fs.access(this.uploadsPath);
            logger.info(`[UploadServices] Uploads directory exists: ${this.uploadsPath}`);
            return true
        } catch (error: any) {
            logger.error(`❌ [UploadServices] Error ensuring uploads directory exists: ${error.message}`);
            if (error.code === 'ENOENT') {
                logger.warn(`❌ [UploadServices] Uploads directory does not exist, creating it: ${this.uploadsPath}`);
                await fs.mkdir(this.uploadsPath, { recursive: true });
                logger.info(`✅ [UploadServices] Uploads directory created: ${this.uploadsPath}`);
                return true;
            } 
            logger.error(`❌ [UploadServices] Error ensuring uploads directory exists: ${error.message}`);
            return false;
        }
    }

    async uploadFile(req: Request, res: Response): Promise<{ url: string, filename: string, originalName: string, size: number, mimetype: string }> {
        return new Promise((resolve, reject) => {
            this.upload(req, res, async (err: any) => {
                logger.info(`ℹ️ [UploadServices] Uploading file: ${req.file?.originalname}`);
                if (err instanceof multer.MulterError) {
                    if (err.code === 'LIMIT_FILE_SIZE') {
                        logger.error(`❌ [UploadServices] File size is too large. Max size is 5MB.`);
                        reject(new Error('File size is too large. Max size is 5MB.'));
                        return;
                    }
                    logger.error(`❌ [UploadServices] Error uploading file with multer error: ${err.message}`);
                    reject(new Error(err.message));
                    return;
                }
                if (err) {
                    logger.error(`[UploadServices] Error uploading file: ${err.message}`);
                    reject(new Error(err.message));
                    return;
                }
                if (!req.file) {
                    logger.error(`❌ [UploadServices] No file uploaded`);
                    reject(new Error('No file uploaded'));
                    return;
                }
                logger.info(`ℹ️ [UploadServices] File uploaded to server: ${req.file.filename}`);

                const localPath = path.join(this.uploadsPath, req.file.filename);
                let s3Key: string = '';
                try {
                    s3Key = await this.s3Repository.uploadFile(localPath, 'files', env.AWS_BUCKET_NAME);
                } catch (e) {
                    logger.error(`❌ [UploadServices] S3 upload error, file kept on server: ${e instanceof Error ? e.message : e}`);
                }

                if (s3Key) {
                    try {
                        await this.deleteFile(req.file.filename);
                    } catch (e) {
                        logger.error(`❌ [UploadServices] Failed to delete local file after S3 upload: ${e instanceof Error ? e.message : e}`);
                    }
                    const s3Url = `https://${env.AWS_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${s3Key}`;
                    logger.info(`✅ [UploadServices] File uploaded to S3, local file removed: ${req.file.filename}`);
                    resolve({
                        url: s3Url,
                        filename: req.file.filename,
                        originalName: req.file.originalname,
                        size: req.file.size,
                        mimetype: req.file.mimetype
                    });
                } else {
                    const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
                    logger.warn(`❌ [UploadServices] S3 upload failed, file kept on server: ${req.file.filename}`);
                    resolve({
                        url: fileUrl,
                        filename: req.file.filename,
                        originalName: req.file.originalname,
                        size: req.file.size,
                        mimetype: req.file.mimetype
                    });
                }
            });
        });
    }

    async deleteFile(filename: string): Promise<boolean> {
        try {
            await fs.unlink(path.join(this.uploadsPath, filename));
            return true;
        } catch (error: any) {
            logger.error(`❌ [UploadServices] Error deleting file: ${error?.message}`);
            return false;
        }
    }
}

export { UploadServices };