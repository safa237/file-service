import { Component } from '@angular/core';
import { FileUploadService } from '../services/file-upload.service';
import { StoragePath } from '../services/storage-path.enum';
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { PartInfo } from '../part-info';

@Component({
  selector: 'app-modules',
  templateUrl: './modules.component.html',
  styleUrls: ['./modules.component.scss']
})
export class ModulesComponent {
  uploading = false;
  progress = 0;
  errorMessage: string | null = null;
  isPaused = false;
  selectedFile: File | null = null;
  uploadState: {
    uploadId?: string;
    fileName: string;
    fileSize: number;
    uploadedSize: number;
    speed: string;
    timeRemaining: string;
  } | null = null;
  
  constructor(
    private fileUploadService: FileUploadService
  ) {}

  // Upload a batch of parts sequentially and return successful uploads
  private async uploadBatch(
    file: File,
    partSizeBytes: number,
    presignedUrls: { partNumber: number; url: string }[]
  ): Promise<{ partNumber: number; etag: string }[]> {
    // Initialize arrays for tracking current batch
    const currentBatchETags: { partNumber: number; etag: string }[] = [];
    const maxRetries = 3;

    // Process each presigned URL sequentially
    for (const { partNumber, url } of presignedUrls) {
      let retryCount = 0;
      let success = false;

      while (retryCount < maxRetries && !success) {
        try {
          // 1. Calculate part boundaries and slice file directly
          const start = (partNumber - 1) * partSizeBytes;
          const end = Math.min(start + partSizeBytes, file.size);
          const blob = file.slice(start, end, file.type);

          console.log(`Uploading part ${partNumber} (${start}-${end} bytes)...`);

          // 2. Upload the part using presigned URL
          const response = await firstValueFrom(
            this.fileUploadService.uploadPart(url, blob)
          );

          // 3. Store the ETag for successful upload
          currentBatchETags.push({
            partNumber,
            etag: response.etag
          });

          success = true;
          console.log(`Part ${partNumber} uploaded successfully`);

        } catch (error) {
          retryCount++;
          console.error(`Failed to upload part ${partNumber} (attempt ${retryCount}/${maxRetries}):`, error);
          
          if (retryCount < maxRetries) {
            // Exponential backoff
            const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // Update progress after each part
      if (success && this.uploadState) {
        const uploadedSize = (currentBatchETags.length * partSizeBytes);
        this.uploadState.uploadedSize = Math.min(uploadedSize, this.uploadState.fileSize);
      }
    }

    if (currentBatchETags.length < presignedUrls.length) {
      console.warn(`Batch completed with ${currentBatchETags.length}/${presignedUrls.length} successful uploads`);
    } else {
      console.log('All parts in batch uploaded successfully');
    }

    return currentBatchETags;
  }

  async uploadFile(file: File) {
    if (this.isPaused) return;
    
    this.uploading = true;
    this.errorMessage = null;

    let uploadId: string | undefined;

    try {
      // 1. Initiate multipart upload
      const initResponse = await firstValueFrom(
        this.fileUploadService.initiateFileUpload(
          file.name,
          file.size,
          StoragePath.VIDEOS,
          file.type || 'application/octet-stream'
        )
      );

      if (!this.uploadState) {
        this.uploadState = {
          fileName: file.name,
          fileSize: file.size,
          uploadedSize: 0,
          speed: '0 KB',
          timeRemaining: 'Calculating...'
        };
      }
      
      this.uploadState.uploadId = initResponse.uploadId;
      uploadId = initResponse.uploadId;

      const { partSizeBytes } = initResponse.multipartUploadInfo;
      console.log('Starting upload with part size:', partSizeBytes);

      if (!uploadId) {
        throw new Error('Upload ID is missing');
      }

      // 2. Start batch upload process
      let currentBatchETags: { partNumber: number; etag: string }[] = [];
      let allUploadedETags: { partNumber: number; etag: string }[] = [];

      let isUploadComplete = false;
      let progress = await firstValueFrom(
        this.fileUploadService.getNextBatchUrls(uploadId, []) // Initial request with no ETags
      );

      // 3. Process batches until complete
      while (!isUploadComplete && !this.isPaused) {
        try {
          console.log(`Processing new batch with ${progress.presignedUrls.length} parts...`);
          
          // Upload current batch sequentially
          currentBatchETags = await this.uploadBatch(
            file,
            partSizeBytes,
            progress.presignedUrls
          );

          console.log(`Batch complete: ${currentBatchETags.length} parts uploaded successfully`);

          // Add successful uploads to master list
          allUploadedETags = [...allUploadedETags, ...currentBatchETags];
          
          // Get next batch using all successful ETags
          progress = await firstValueFrom(
            this.fileUploadService.getNextBatchUrls(uploadId, allUploadedETags)
          );
          
          // Update upload progress from server's response
          isUploadComplete = progress.progress.isComplete;
          this.progress = progress.progress.percentComplete;

          console.log(
            `Progress: ${this.progress}% ` +
            `[Batch: ${currentBatchETags.length}/${progress.presignedUrls.length} successful]`
          );

        } catch (error) {
          if (this.isPaused) {
            console.log('Upload paused');
            return;
          }
          console.error('Batch request failed:', error);
          throw error;
        }
      }

      if (!this.isPaused) {
        // 4. Complete upload after all parts are uploaded - backend has tracked all ETags
        console.log('All parts uploaded, completing multipart upload...');
        const finalResponse = await firstValueFrom(
          this.fileUploadService.completeUpload(uploadId, allUploadedETags)
        );

        console.log('Upload complete! File URL:', finalResponse.fileUrl);
        
        // Reset state after successful upload
        this.resetUploadState();
      }
    } catch (error) {
      console.error('Upload failed:', error);
      
      if (error instanceof HttpErrorResponse) {
        const httpError = error as HttpErrorResponse;
        this.errorMessage = `Upload failed: ${httpError.error?.message || httpError.statusText}`;
      } else if (error instanceof Error) {
        this.errorMessage = error.message;
      } else {
        this.errorMessage = 'Upload failed due to an unexpected error';
      }

      // If we have an uploadId, try to abort the multipart upload
      if (uploadId) {
        try {
          await firstValueFrom(this.fileUploadService.abortUpload(uploadId));
          console.log('Upload aborted successfully');
        } catch (abortError) {
          console.error('Failed to abort upload:', abortError);
        }
      }
    } finally {
      if (!this.isPaused) {
        this.uploading = false;
      }
    }
  }

  handleFileSelection(file: File) {
    this.selectedFile = file;
    this.uploadState = {
      fileName: file.name,
      fileSize: file.size,
      uploadedSize: 0,
      speed: '0 KB',
      timeRemaining: 'Calculating...'
    };
  }

  // Upload control methods
  pauseUpload() {
    this.isPaused = true;
    // Store the current progress and ETags for resuming later
  }

  async resumeUpload() {
    this.isPaused = false;
    if (this.selectedFile) {
      await this.uploadFile(this.selectedFile);
    }
  }

  async abortUpload() {
    if (this.uploadState?.uploadId) {
      try {
        await firstValueFrom(this.fileUploadService.abortUpload(this.uploadState.uploadId));
        console.log('Upload aborted successfully');
      } catch (error) {
        console.error('Failed to abort upload:', error);
      }
    }
    
    this.resetUploadState();
  }

  private resetUploadState() {
    this.uploading = false;
    this.isPaused = false;
    this.progress = 0;
    this.selectedFile = null;
    this.uploadState = null;
    this.errorMessage = null;
  }
}