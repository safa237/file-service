import { Component, Input, Output, EventEmitter } from '@angular/core';

export interface UploadState {
  uploadId?: string;
  fileName: string;
  fileSize: number;
  uploadedSize: number;
  speed: string;
  timeRemaining: string;
}

@Component({
  selector: 'app-upload-progress',
  templateUrl: './upload-progress.component.html',
  styleUrls: ['./upload-progress.component.scss']
})
export class UploadProgressComponent {
  @Input() uploadState!: UploadState;
  @Input() progress: number = 0;
  @Input() uploading: boolean = false;
  @Input() isPaused: boolean = false;

  @Output() start = new EventEmitter<void>();
  @Output() pause = new EventEmitter<void>();
  @Output() resume = new EventEmitter<void>();
  @Output() abort = new EventEmitter<void>();
  @Output() progressUpdate = new EventEmitter<{ progress: number; state: UploadState }>();

  private lastUpdateTime = 0;
  private lastUploadedSize = 0;

  updateProgress(uploadedSize: number) {
    if (!this.uploadState) return;

    const now = Date.now();
    const timeDiff = (now - this.lastUpdateTime) / 1000; // seconds
    const sizeDiff = uploadedSize - this.lastUploadedSize;

    if (timeDiff > 0) {
      // Calculate speed
      const speed = sizeDiff / timeDiff; // bytes per second
      this.uploadState.speed = this.formatSpeed(speed);

      // Calculate time remaining
      const remainingSize = this.uploadState.fileSize - uploadedSize;
      const timeRemaining = remainingSize / speed;
      this.uploadState.timeRemaining = this.formatTimeRemaining(timeRemaining);

      // Update tracking variables
      this.lastUpdateTime = now;
      this.lastUploadedSize = uploadedSize;
      this.uploadState.uploadedSize = uploadedSize;

      // Calculate progress percentage
      const progressPercent = (uploadedSize / this.uploadState.fileSize) * 100;

      // Emit progress update
      this.progressUpdate.emit({
        progress: progressPercent,
        state: { ...this.uploadState }
      });
    }
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
