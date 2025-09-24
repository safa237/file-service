import { Injectable } from '@angular/core';
import { FileUploadService } from './file-upload.service';
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { PartInfo } from '../part-info';
import { StoragePath } from './storage-path.enum';
import { InitiateUploadResponse, BatchUploadResponse } from './file-upload.service';

export interface UploadState {
  uploadId?: string;
  fileName: string;
  fileSize: number;
  uploadedSize: number;
  speed: string;
  timeRemaining: string;
}

export interface UploadProgress {
  percentComplete: number;
  uploadedSize: number;
  speed: string;
  timeRemaining: string;
}

@Injectable({
  providedIn: 'root'
})
export class UploadService {
  private lastUpdateTime = 0;
  private lastUploadedSize = 0;

  constructor(private fileUploadService: FileUploadService) {}

  private splitFileIntoChunks(file: File, partSizeBytes: number): PartInfo[] {
    const totalChunks = Math.ceil(file.size / partSizeBytes);
    const chunks: PartInfo[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * partSizeBytes;
      const end = Math.min(start + partSizeBytes, file.size);
      chunks.push({
        partNumber: i + 1,
        blob: file.slice(start, end, file.type)
      });
    }

    console.log(`File split into ${chunks.length} chunks of ${partSizeBytes} bytes each`);
    return chunks;
  }

  private async uploadBatch(
    parts: { partNumber: number; url: string }[],
    chunks: PartInfo[]
  ): Promise<{ partNumber: number; etag: string }[]> {
    const uploadResults = await Promise.allSettled(
      parts.map(async ({ partNumber, url }) => {
        const chunk = chunks.find(c => c.partNumber === partNumber);
        if (!chunk) {
          console.error(`No chunk found for part number ${partNumber}`);
          return Promise.reject(new Error(`Missing chunk ${partNumber}`));
        }

        try {
          const response = await firstValueFrom(this.fileUploadService.uploadPart(url, chunk.blob));
          return {
            partNumber,
            etag: response.etag
          };
        } catch (error) {
          console.error(`Failed to upload part ${partNumber}:`, error);
          return Promise.reject(error);
        }
      })
    );

    const successfulUploads = uploadResults
      .filter((result): result is PromiseFulfilledResult<{ partNumber: number; etag: string }> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value);

    if (successfulUploads.length < parts.length) {
      console.warn(`Batch completed with ${successfulUploads.length}/${parts.length} successful uploads`);
    }

    return successfulUploads;
  }

  async uploadFile(file: File, onProgress: (progress: UploadProgress) => void): Promise<string> {
    this.lastUpdateTime = Date.now();
    this.lastUploadedSize = 0;
    let uploadId: string;

    try {
      // 1. Initiate multipart upload
      const initResponse = await firstValueFrom(
        this.fileUploadService.initiateFileUpload(
          file.name,
          file.size,
          StoragePath.VIDEOS,
          file.type || 'application/octet-stream'
        )
      ) as InitiateUploadResponse;

      uploadId = initResponse.uploadId;
      const { partSizeBytes } = initResponse.multipartUploadInfo;

      // 2. Split file into chunks
      const chunks = this.splitFileIntoChunks(file, partSizeBytes);

      // 3. Upload chunks in batches
      let prevBatchETags: { partNumber: number; etag: string }[] = [];
      let isUploadComplete = false;
      let progress = await firstValueFrom(
        this.fileUploadService.getNextBatchUrls(uploadId, [])
      ) as BatchUploadResponse;

      while (!isUploadComplete) {
        // Upload current batch in parallel
        const currentBatchETags = await this.uploadBatch(
          progress.presignedUrls,
          chunks
        );

        prevBatchETags = currentBatchETags;
        
        // Get next batch using successful ETags
        progress = await firstValueFrom(
          this.fileUploadService.getNextBatchUrls(uploadId, prevBatchETags)
        ) as BatchUploadResponse;

        // Calculate and report progress
        const uploadedSize = (progress.progress.completedParts * file.size) / progress.progress.totalParts;
        const uploadProgress = this.calculateProgress(uploadedSize, file.size);
        onProgress(uploadProgress);
        
        isUploadComplete = progress.progress.isComplete;
      }

      // 4. Complete upload
      console.log('All parts uploaded, completing multipart upload...');
      const finalResponse = await firstValueFrom(
        this.fileUploadService.completeUpload(uploadId, prevBatchETags)
      ) as { fileUrl: string };

      console.log('Upload complete! File URL:', finalResponse.fileUrl);
      return finalResponse.fileUrl;

    } catch (error) {
      console.error('Upload failed:', error);
      
      if (error instanceof HttpErrorResponse) {
        throw new Error(`Upload failed: ${error.error?.message || error.statusText}`);
      } else {
        throw new Error('Upload failed due to an unexpected error');
      }
    }
  }

  async abortUpload(uploadId: string): Promise<void> {
    try {
      await firstValueFrom(this.fileUploadService.abortUpload(uploadId));
      console.log('Upload aborted successfully');
    } catch (error) {
      console.error('Failed to abort upload:', error);
      throw error;
    }
  }

  private calculateProgress(uploadedSize: number, totalSize: number): UploadProgress {
    const now = Date.now();
    const timeDiff = (now - this.lastUpdateTime) / 1000; // seconds
    const sizeDiff = uploadedSize - this.lastUploadedSize;

    let speed = '0 B';
    let timeRemaining = 'Calculating...';

    if (timeDiff > 0) {
      const bytesPerSecond = sizeDiff / timeDiff;
      speed = this.formatSpeed(bytesPerSecond);

      const remainingSize = totalSize - uploadedSize;
      const secondsRemaining = remainingSize / bytesPerSecond;
      timeRemaining = this.formatTimeRemaining(secondsRemaining);

      this.lastUpdateTime = now;
      this.lastUploadedSize = uploadedSize;
    }

    return {
      percentComplete: (uploadedSize / totalSize) * 100,
      uploadedSize,
      speed,
      timeRemaining
    };
  }

  private formatSpeed(bytesPerSecond: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytesPerSecond;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  private formatTimeRemaining(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return 'Calculating...';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
}
