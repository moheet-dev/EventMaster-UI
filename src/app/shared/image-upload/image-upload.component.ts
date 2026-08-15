import {
  Component,
  Output,
  EventEmitter,
  Input,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { UploadService } from '../../core/services/upload.service';

@Component({
  selector: 'app-image-upload',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-upload.component.html',
  styleUrl: './image-upload.component.scss',
})
export class ImageUploadComponent {
  /** Pre-existing URL (for edit mode) */
  @Input() currentUrl: string | null = null;

  /** Emits the final Cloudinary secure_url */
  @Output() imageUrl = new EventEmitter<string>();

  uploading = signal(false);
  error = signal<string | null>(null);
  preview = signal<string | null>(null);
  isDragging = signal(false);

  constructor(private uploadSvc: UploadService) { }

  ngOnInit(): void {
    if (this.currentUrl) {
      this.preview.set(this.currentUrl);
    }
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(): void {
    this.isDragging.set(false);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) this.processFile(file);
  }

  onFileSelect(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.processFile(file);
    input.value = '';
  }

  private processFile(file: File): void {
    if (!file.type.startsWith('image/')) {
      this.error.set('Please select an image file.');
      return;
    }

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => this.preview.set(ev.target?.result as string);
    reader.readAsDataURL(file);

    this.error.set(null);
    this.uploading.set(true);

    this.uploadSvc.uploadFile(file).subscribe({
      next: (url) => {
        this.uploading.set(false);
        this.preview.set(url);
        this.imageUrl.emit(url);
      },
      error: (err) => {
        this.uploading.set(false);
        this.error.set(err?.message ?? 'Upload failed. Please try again.');
      },
    });
  }

  clearImage(): void {
    this.preview.set(null);
    this.imageUrl.emit('');
  }
}
