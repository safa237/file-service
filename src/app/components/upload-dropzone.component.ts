import { Component, Output, EventEmitter, Input } from '@angular/core';

@Component({
  selector: 'app-upload-dropzone',
  templateUrl: './upload-dropzone.component.html',
  styleUrls: ['./upload-dropzone.component.scss']
})
export class UploadDropzoneComponent {
  @Input() hasFile: boolean = false;
  @Output() fileSelected = new EventEmitter<File>();
  isDragging = false;

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
    
    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.handleFileSelection(files[0]);
    }
  }

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      this.handleFileSelection(file);
    }
  }

  @Output() error = new EventEmitter<string>();

  private handleFileSelection(file: File) {
    
    // Log file info for debugging
    console.log('Selected file:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    this.fileSelected.emit(file);
  }
}
