export interface PartInfo {
  partNumber: number;
  blob: Blob;
  etag?: string;
}

export interface PartEtag {
  partNumber: number;
  etag: string;
}

export interface UploadProgress {
  completedParts: number;
  totalParts: number;
  percentComplete: number;
  isComplete: boolean;
}