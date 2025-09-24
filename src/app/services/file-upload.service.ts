import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { StoragePath } from './storage-path.enum';

export interface InitiateUploadRequest {
  bucket: string;
  path: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}

export interface InitiateUploadResponse {
  uploadId: string;
  bucket: string;
  objectKey: string;
  strategy: number;
  presignedUrlExpiryHours: number;
  multipartUploadInfo: {
    multipartUploadId: string;
    totalParts: number;
    partSizeBytes: number;
    presignedUrlsBatchSize: number;
    totalBatches: number;
  };
}

export interface BatchUploadResponse {
  progress: {
    completedParts: number;
    totalParts: number;
    percentComplete: number;
    isComplete: boolean;
  };
  presignedUrls: {
    partNumber: number;
    url: string;
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class FileUploadService {
  constructor(
    private _http: HttpClient
  ) { }

  private getFileType(fileName: string): string {
    // Extract file extension
    const extension = fileName.split('.').pop()?.toLowerCase();
    
    if (!extension) return 'application/octet-stream';

    // Common MIME types mapping
    const mimeTypes: { [key: string]: string } = {
      // Images
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      
      // Videos
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'ogg': 'video/ogg',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'wmv': 'video/x-ms-wmv',
      'flv': 'video/x-flv',
      'm4v': 'video/x-m4v',
      'mkv': 'video/x-matroska',
      
      // Audio
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'aac': 'audio/aac',
      'm4a': 'audio/mp4',
      
      // Documents
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'ppt': 'application/vnd.ms-powerpoint',
      'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      
      // Archives
      'zip': 'application/zip',
      'rar': 'application/x-rar-compressed',
      '7z': 'application/x-7z-compressed',
      
      // Text
      'txt': 'text/plain',
      'csv': 'text/csv',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'text/javascript',
      'json': 'application/json',
      'xml': 'application/xml',
      
      // Other common types
      'ico': 'image/x-icon',
      'ttf': 'font/ttf',
      'woff': 'font/woff',
      'woff2': 'font/woff2'
    };

    return extension in mimeTypes ? mimeTypes[extension] : 'application/octet-stream';
  }

  initiateFileUpload(fileName: string, fileSize: number, path: StoragePath, contentType?: string): Observable<InitiateUploadResponse> {
    const uploadRequest: InitiateUploadRequest = {
      bucket: environment.storageBucket,
      path: path,
      fileName: fileName,
      contentType: contentType || this.getFileType(fileName),
      fileSize: fileSize
    };

    return this._http.post<InitiateUploadResponse>(
      'https://appnest.pro/ObjectStorage/api/v1/uploads/initiate', 
      uploadRequest
    );
  }

  getNextBatchUrls(
    uploadId: string, 
    PartEtags: { partNumber: number; etag: string }[]
  ): Observable<BatchUploadResponse> {
    return this._http.post<BatchUploadResponse>(
      `https://appnest.pro/ObjectStorage/api/v1/uploads/${uploadId}/presigned-urls/batch`,
      {
        uploadId,
        PartEtags
      }
    );
  }

  completeUpload(
    uploadId: string, 
    allETags: { partNumber: number; etag: string }[]
  ): Observable<{ fileUrl: string }> {
    return this._http.post<{ fileUrl: string }>(
      'https://appnest.pro/mozakarabackend/Api/V1/learningresource/complete-upload',
      {
        uploadId,
        parts: allETags
      }
    );
  }

  abortUpload(uploadId: string): Observable<void> {
    return this._http.post<void>(
      'https://appnest.pro/mozakarabackend/Api/V1/learningresource/abort-upload',
      { uploadId }
    );
  }

  uploadPart(url: string, blob: Blob): Observable<{ etag: string }> {
    return this._http.put<void>(url, blob, {
      observe: 'response'
    }).pipe(
      map((response: HttpResponse<void>) => {
        const etag = response.headers.get('ETag');
        if (!etag) {
          throw new Error('No ETag found in response headers');
        }
        // Remove quotes if present in the ETag
        return { etag: etag.replace(/^"(.*)"$/, '$1') };
      })
    );
  }
}
