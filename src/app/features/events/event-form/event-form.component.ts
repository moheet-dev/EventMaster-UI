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
import { EventService, EventReq, Event as AppEvent } from '../../../core/services/event.service';
import { VenueService, Venue } from '../../../core/services/venue.service';
import { ImageUploadComponent } from '../../../shared/image-upload/image-upload.component';

@Component({
  selector: 'app-event-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ImageUploadComponent],
  templateUrl: './event-form.component.html',
  styleUrl: './event-form.component.scss',
})
export class EventFormComponent implements OnInit {
  /** Existing event for edit mode — omit for create */
  @Input() event: AppEvent | null = null;

  /** Emits after a successful save */
  @Output() saved = new EventEmitter<void>();

  /** Emits to close the modal */
  @Output() closed = new EventEmitter<void>();

  name = '';
  description = '';
  venue_id: number | null = null;
  display_image = '';
  event_on = '';   // bound to datetime-local input (local ISO format)

  venues: Venue[] = [];
  submitting = signal(false);
  loadingVenues = signal(false);
  error = signal<string | null>(null);

  get isEdit(): boolean {
    return !!this.event;
  }

  constructor(
    private eventSvc: EventService,
    private venueSvc: VenueService,
  ) {}

  ngOnInit(): void {
    if (this.event) {
      this.name = this.event.name;
      this.description = this.event.description;
      this.venue_id = this.event.venue_id;
      this.display_image = this.event.display_image ?? '';
      // Convert stored ISO string to the datetime-local input format (YYYY-MM-DDTHH:mm)
      if (this.event.event_on) {
        this.event_on = this.event.event_on.slice(0, 16);
      }
    }

    this.loadingVenues.set(true);
    this.venueSvc.getAll().subscribe({
      next: (v) => {
        this.venues = v;
        this.loadingVenues.set(false);
      },
      error: () => this.loadingVenues.set(false),
    });
  }

  onImageUrl(url: string): void {
    this.display_image = url;
  }

  submit(): void {
    if (!this.name.trim() || !this.description.trim() || !this.venue_id) {
      this.error.set('Name, description and venue are required.');
      return;
    }
    if (!this.event_on) {
      this.error.set('Event date & time is required.');
      return;
    }

    const payload: EventReq = {
      name: this.name.trim(),
      description: this.description.trim(),
      display_image: this.display_image,
      venue_id: this.venue_id,
      event_on: new Date(this.event_on).toISOString(),
    };

    this.error.set(null);
    this.submitting.set(true);

    const req$ = this.isEdit
      ? this.eventSvc.update(this.event!.id, payload)
      : this.eventSvc.create(payload);

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
