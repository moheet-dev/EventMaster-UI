import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VenueService, VenueReq, Venue } from '../../../core/services/venue.service';
import { ImageUploadComponent } from '../../../shared/image-upload/image-upload.component';

@Component({
  selector: 'app-venue-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ImageUploadComponent],
  templateUrl: './venue-form.component.html',
  styleUrl: './venue-form.component.scss',
})
export class VenueFormComponent implements OnInit {
  /** Existing venue for edit mode — omit for create */
  @Input() venue: Venue | null = null;

  /** Emits after a successful save */
  @Output() saved = new EventEmitter<void>();

  /** Emits to close the modal */
  @Output() closed = new EventEmitter<void>();

  name = '';
  address = '';
  display_image = '';

  submitting = signal(false);
  error = signal<string | null>(null);

  get isEdit(): boolean {
    return !!this.venue;
  }

  constructor(private venueSvc: VenueService) {}

  ngOnInit(): void {
    if (this.venue) {
      this.name = this.venue.name;
      this.address = this.venue.address;
      this.display_image = this.venue.display_image ?? '';
    }
  }

  onImageUrl(url: string): void {
    this.display_image = url;
  }

  submit(): void {
    if (!this.name.trim() || !this.address.trim()) {
      this.error.set('Name and address are required.');
      return;
    }

    const payload: VenueReq = {
      name: this.name.trim(),
      address: this.address.trim(),
      display_image: this.display_image,
    };

    this.error.set(null);
    this.submitting.set(true);

    const req$ = this.isEdit
      ? this.venueSvc.update(this.venue!.id, payload)
      : this.venueSvc.create(payload);

    req$.subscribe({
      next: () => {
        this.submitting.set(false);
        this.saved.emit();
      },
      error: (err) => {
        this.submitting.set(false);
        this.error.set(err?.message ?? 'Something went wrong. Please try again.');
      },
    });
  }

  close(): void {
    this.closed.emit();
  }
}
