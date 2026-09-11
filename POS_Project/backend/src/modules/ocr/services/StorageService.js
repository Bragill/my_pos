const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const { getWorkerBindings } = require('../../../database/dbHelper');

class StorageService {
    constructor() {
        this.client = new S3Client({
            region: 'auto',
            endpoint: process.env.R2_ENDPOINT,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID,
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
            },
        });
        this.bucket = process.env.R2_BUCKET_NAME;
    }

    async uploadImage(buffer, mimetype = 'image/jpeg') {
        const filename = `${uuidv4()}.jpeg`;
        const key = `receipts/${filename}`;
        const domain = process.env.R2_PUBLIC_DOMAIN || '';

        // 1. Edge Mode: Native Cloudflare R2 bucket binding
        const r2Binding = getWorkerBindings()?.R2_BUCKET;
        if (r2Binding) {
            try {
                await r2Binding.put(key, buffer, {
                    httpMetadata: { contentType: mimetype }
                });
                const url = domain ? `${domain}/${key}` : `/${key}`;
                return { key, url };
            } catch (err) {
                console.error('[R2 Binding Error] Upload failed:', err.message);
            }
        }

        // 2. Node.js S3 Client Mode
        if (process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME) {
            try {
                const command = new PutObjectCommand({
                    Bucket: this.bucket,
                    Key: key,
                    Body: buffer,
                    ContentType: mimetype,
                });
                await this.client.send(command);
                const url = domain ? `${domain}/${key}` : `/${key}`;
                return { key, url };
            } catch (error) {
                console.error('Cloudflare R2 upload error, storing locally fallback:', error.message);
            }
        }

        // 3. Local filesystem fallback for Node.js
        try {
            const fs = require('fs');
            const path = require('path');
            if (typeof __dirname !== 'undefined') {
                const uploadDir = path.join(__dirname, '../../../../uploads/receipts');
                if (!fs.existsSync(uploadDir)) {
                    fs.mkdirSync(uploadDir, { recursive: true });
                }
                const localPath = path.join(uploadDir, filename);
                fs.writeFileSync(localPath, buffer);

                return {
                    key,
                    url: `/uploads/receipts/${filename}`
                };
            }
        } catch (e) {
            console.warn('Local file fallback failed:', e.message);
            return { key, url: `/${key}` };
        }
    }

    async deleteImage(key) {
        if (!key) return;

        // 1. Edge Mode
        const r2Binding = getWorkerBindings()?.R2_BUCKET;
        if (r2Binding) {
            try {
                await r2Binding.delete(key);
                return;
            } catch (err) {
                console.error('[R2 Binding Delete Error]:', err.message);
            }
        }

        // 2. S3 API Mode
        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });
            await this.client.send(command);
        } catch (error) {
            console.error(`Failed to delete image from R2: ${key}`, error.message);
        }
    }

    async getPresignedUrl(key, expiresIn = 3600) {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });

        return await getSignedUrl(this.client, command, { expiresIn });
    }
}

module.exports = new StorageService();
