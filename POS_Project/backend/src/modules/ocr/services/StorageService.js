const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

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

    async uploadImage(buffer, mimetype) {
        // Image is already optimized in OcrService before calling this
        const key = `receipts/${uuidv4()}.jpeg`;

        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: buffer,
            ContentType: mimetype,
        });

        await this.client.send(command);
        
        return {
            key,
            url: `${process.env.R2_PUBLIC_DOMAIN}/${key}`
        };
    }

    async deleteImage(key) {
        if (!key) return;
        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });
            await this.client.send(command);
        } catch (error) {
            console.error(`Failed to delete image from R2: ${key}`, error);
            // We don't throw here to avoid failing the DB deletion if R2 fails
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
