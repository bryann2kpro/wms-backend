import { Upload } from '@aws-sdk/lib-storage';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3 } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { logger } from '../../util/logger.js';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import axios from 'axios';
import { getMimeTypeFromFilename } from '@/util/file.js';
import { env } from '@/env.js';

export class S3Repository {
  private s3: S3;

  constructor() {
    this.s3 = new S3({
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY
      },
      region: env.AWS_REGION
    });
  }

  async uploadFile(filePath: string, s3Path: string, bucketName: string): Promise<string> {
    logger.info(`ℹ️ [S3Repository.uploadFile] Uploading file to S3...`);
    logger.debug(`🔎 [S3Repository.uploadFile] S3 path: ${s3Path}`);
    logger.debug(`🔎 [S3Repository.uploadFile] Bucket name: ${bucketName}`);
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    // Ensure s3Path ends with a slash to treat it as a folder
    const folderPath = s3Path.endsWith('/') ? s3Path : `${s3Path}/`;

    logger.info(`ℹ️ [S3Repository.uploadFile] Folder path found!`);
    logger.debug(`🔎 [S3Repository.uploadFile] Folder path: ${folderPath}`);

    const params = {
      Bucket: bucketName,
      Key: `${folderPath}${fileName}`,
      Body: fileContent,
      ContentType: 'application/octet-stream', 
    };

    logger.debug(`🔎 [S3Repository.uploadFile] Params: ${JSON.stringify(params)}`);

    try {
      logger.info(`ℹ️ [S3Repository.uploadFile] Uploading file to S3...`);
      await new Upload({
        client: this.s3,
        params
      }).done();
      logger.info(`✅ [S3Repository.uploadFile] File uploaded successfully!`);
      const s3FilePath = `${folderPath}${fileName}`;
      logger.debug(`🔎 [S3Repository.uploadFile] S3 file path: ${s3FilePath}`);
      return s3FilePath;
    } catch (error) {
      logger.error(`❌ [S3Repository.uploadFile] Error uploading file: ${error}`);
      return "";
    }
  }

  async handleUploadFileBuffer(fileContent: Buffer, fileName: string, s3Path: string, bucketName: string): Promise<string> {
    logger.info(`ℹ️ [S3Repository.handleUploadFileBufferToS3] Uploading file buffer to S3...`);
    const folderPath = s3Path.endsWith('/') ? s3Path : `${s3Path}/`;
    logger.info(`ℹ️ [S3Repository.handleUploadFileBufferToS3] Folder path found!`);
    logger.debug(`🔎 [S3Repository.handleUploadFileBufferToS3] Folder path: ${folderPath}`);

    const params = {
      Bucket: bucketName,
      Key: `${folderPath}${fileName}`,
      Body: fileContent,
      ContentType: 'application/octet-stream', 
    };

    logger.debug(`🔎 [S3Repository.handleUploadFileBufferToS3] Params: ${JSON.stringify(params)}`);

    try {
      logger.info(`ℹ️ [S3Repository.handleUploadFileBufferToS3] Uploading file buffer to S3...`);
      await new Upload({
        client: this.s3,
        params
      }).done();
      logger.info(`✅ [S3Repository.handleUploadFileBufferToS3] File uploaded successfully!`);
      const s3FilePath = `${folderPath}${fileName}`;
      logger.debug(`🔎 [S3Repository.handleUploadFileBufferToS3] S3 file path: ${s3FilePath}`);
      return s3FilePath;
    } catch (error) {
      logger.error(`❌ [S3Repository.handleUploadFileBufferToS3] Error uploading file: ${error}`);
      return "";
    }
  }

  async uploadFileV2(file: Buffer, fileName: string, contentType: string, agencyName: string, enrollTime: string) {
    try {
      logger.info(`ℹ️ [S3Repository.uploadFileV2] Uploading file to S3...`);
      logger.debug(`🔎 [S3Repository.uploadFileV2] File name: ${fileName}`);
      logger.debug(`🔎 [S3Repository.uploadFileV2] Content type: ${contentType}`);
      logger.debug(`🔎 [S3Repository.uploadFileV2] Agency name: ${agencyName}`);
      logger.debug(`🔎 [S3Repository.uploadFileV2] Enroll time: ${enrollTime}`);

      const sluggedAgencyName = this.slugify(agencyName);
      logger.debug(`🔎 [S3Repository.uploadFileV2] Slugged agency name: ${sluggedAgencyName}`);

      const key = `recons/${sluggedAgencyName}/${enrollTime}/${Date.now()}-${fileName}`;
      logger.debug(`🔎 [S3Repository.uploadFileV2] Key: ${key}`);

      logger.info(`ℹ️ [S3Repository.uploadFileV2] Uploading file to S3...`);
      const command = new PutObjectCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Key: key,
        Body: file,
        ContentType: contentType
      });
      await this.s3.send(command);
      logger.info(`✅ [S3Repository.uploadFileV2] File uploaded successfully!`);
      logger.debug(`🔎 [S3Repository.uploadFileV2] S3 file path: https://${env.AWS_BUCKET_NAME}.s3.amazonaws.com/${key}`);

      return `https://${env.AWS_BUCKET_NAME}.s3.amazonaws.com/${key}`;

    } catch (error) {
      logger.error(`❌ [S3Repository.uploadFileV2] Error uploading file: ${error}`);
      return "";
    }
  }

  /**
   * Upload a report PDF to S3 under reports/{reportType}/{date}/.
   * @returns Public URL of the uploaded file, or empty string on failure.
   */
  async uploadReportPdf(
    pdfBuffer: Buffer,
    filename: string,
    reportType: string
  ): Promise<string> {
    try {
      const dateFolder = new Date().toISOString().split('T')[0];
      const key = `reports/${reportType}/${dateFolder}/${Date.now()}-${filename}`;
      logger.info(`ℹ️ [S3Repository.uploadReportPdf] Uploading report to S3: ${key}`);
      const command = new PutObjectCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Key: key,
        Body: pdfBuffer,
        ContentType: 'application/pdf',
      });
      await this.s3.send(command);
      const url = `https://${env.AWS_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
      logger.info(`✅ [S3Repository.uploadReportPdf] Report uploaded: ${url}`);
      return url;
    } catch (error) {
      logger.error(`❌ [S3Repository.uploadReportPdf] Error uploading report: ${error}`);
      return '';
    }
  }

  async getFileUrl(fileName: string, agencyName: string, enrollTime: string): Promise<string> {
    const sluggedAgencyName = this.slugify(agencyName);
    const key = `recons/${sluggedAgencyName}/${enrollTime}/${fileName}`;
    return `https://${env.AWS_BUCKET_NAME}.s3.amazonaws.com/${key}`;
  }

  async uploadCompanyLogo(
    file: Buffer,
    contentType: string,
    imagePath: string,
    status: string,
    oldImagePath: string
  ): Promise<string> {
    try {
      if (status.toLowerCase().trim() === 'update' && oldImagePath) {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: env.AWS_BUCKET_NAME,
          Key: oldImagePath
        });
        await this.s3.send(deleteCommand);
      }
      const command = new PutObjectCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Key: imagePath,
        Body: file,
        ContentType: contentType
      });
      await this.s3.send(command);
      return `https://${env.AWS_BUCKET_NAME}.s3.amazonaws.com/${imagePath}`;
    } catch (error) {
      logger.error('Error uploading company logo to S3:', error);
      throw error;
    }
  }

  async uploadSubmissionFile(
    file: Buffer,
    fileName: string,
    contentType: string,
    policyName: string,
    customerName: string,
    policyHolderId: string
  ): Promise<string> {
    try {
      const sluggedPolicyName = this.slugify(policyName);
      const sluggedCustomerName = this.slugify(customerName);
      const key = `cust_application_forms/${sluggedPolicyName}/${policyHolderId}-${sluggedCustomerName}/${fileName}`;

      const command = new PutObjectCommand({
        Bucket: env.AWS_PRIVATE_BUCKET_NAME,
        Key: key,
        Body: file,
        ContentType: contentType,
        ContentDisposition: `inline; filename="${fileName}"`,
        Metadata: {
          'original-filename': fileName,
          'upload-date': new Date().toISOString(),
          'policy-holder-id': policyHolderId,
        }
      });
      await this.s3.send(command);
      return `/${key}`;
    } catch (error) {
      logger.error('Error uploading submission file to S3:', error);
      throw error;
    }
  }

  /**
   * Downloads a file from S3 and converts it to base64
   * @param s3Url - The S3 key/path (e.g., "/path/to/file.pdf")
   * @param bucketName - The S3 bucket name
   * @param expiresIn - Number of seconds for signed URL expiration (default: 3600 = 1 hour)
   */
  async downloadFileAsBase64(
    s3Url: string,
    bucketName: string,
    expiresIn: number = 3600
  ): Promise<{ base64: string; contentType: string; filename: string }> {
    try {
      const key = s3Url.startsWith('/') ? s3Url.substring(1) : s3Url;

      if (!bucketName || !key) {
        throw new Error('Invalid S3 URL format');
      }

      const getObjectCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: key
      });

      const signedUrl = await getSignedUrl(this.s3, getObjectCommand, { expiresIn });

      const response = await axios.get(signedUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      const buffer = Buffer.from(response.data);
      const base64 = buffer.toString('base64');
      const filename = key.split('/').pop() || 'unknown';

      let contentType = response.headers['content-type'] || 'application/octet-stream';
      if (contentType === 'application/octet-stream' || !contentType) {
        contentType = getMimeTypeFromFilename(filename);
      }

      logger.info('Successfully downloaded and converted S3 file to base64', {
        bucket: bucketName,
        key,
        filename,
        contentType,
        size: buffer.length
      });

      return { contentType, filename, base64 };
    } catch (error) {
      logger.error('Error downloading S3 file as base64:', {
        s3Url,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to download S3 file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Downloads multiple files from S3 and converts them to base64
   * @param s3Urls - Array of S3 keys/paths
   * @param bucketName - The S3 bucket name
   * @param expiresIn - Number of seconds for signed URL expiration (default: 3600 = 1 hour)
   */
  async downloadMultipleFilesAsBase64(
    s3Urls: string[],
    bucketName: string,
    expiresIn: number = 3600
  ): Promise<Array<{ base64: string; contentType: string; filename: string }>> {
    try {
      const downloadPromises = s3Urls.map(url => this.downloadFileAsBase64(url, bucketName, expiresIn));
      const results = await Promise.all(downloadPromises);

      logger.info('Successfully downloaded multiple S3 files as base64', {
        count: results.length
      });

      return results;
    } catch (error) {
      logger.error('Error downloading multiple S3 files as base64:', {
        s3Urls,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to download multiple S3 files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generates a signed URL for an S3 object
   * @param s3Key - The S3 key (path) of the object
   * @param bucketName - The name of the S3 bucket
   * @param expiresIn - Number of seconds for signed URL expiration (default: 3600 = 1 hour)
   */
  async generateSignedUrl(
    s3Key: string,
    bucketName: string,
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      const key = s3Key.startsWith('/') ? s3Key.substring(1) : s3Key;

      if (!bucketName || !key) {
        throw new Error('Invalid S3 key or bucket name');
      }

      const getObjectCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
        ResponseContentType: 'application/pdf',
        ResponseContentDisposition: 'inline'
      });

      const signedUrl = await getSignedUrl(this.s3, getObjectCommand, { expiresIn });

      logger.info('Successfully generated signed URL for S3 object', {
        bucket: bucketName,
        key,
        expiresIn
      });

      return signedUrl;
    } catch (error) {
      logger.error('Error generating signed URL:', {
        s3Key,
        bucketName,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private slugify(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') 
        .replace(/(^-|-$)+/g, '');  
  }
}
