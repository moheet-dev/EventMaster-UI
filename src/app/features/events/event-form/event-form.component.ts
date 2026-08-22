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
import { EventService, EventReq, SectionReq, Event as AppEvent } from '../../../core/services/event.service';
import { VenueService, Venue } from '../../../core/services/venue.service';
import { SectionService, Section } from '../../../core/services/section.service';
import { ImageUploadComponent } from '../../../shared/image-upload/image-upload.component';

/** Section extended with the price the user sets for this event */
export interface EventSectionEntry extends Section {
  price: number | null;
}

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

  /* ── Sections (loaded after venue selection) ── */
  eventSections = signal<EventSectionEntry[]>([]);
  loadingSections = signal(false);
  sectionsError = signal<string | null>(null);

  get isEdit(): boolean {
    return !!this.event;
  }

  getVenueName(): string {
    return this.venues.find((v) => v.id === this.venue_id)?.name ?? '—';
  }

  constructor(
    private eventSvc: EventService,
    private venueSvc: VenueService,
    private sectionSvc: SectionService,
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
      // Load sections for the pre-selected venue
      this.loadSections(this.event.venue_id);
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

  onVenueChange(): void {
    if (!this.venue_id) {
      this.eventSections.set([]);
      return;
    }
    this.loadSections(this.venue_id);
  }

  loadSections(venueId: number): void {
    this.loadingSections.set(true);
    this.sectionsError.set(null);
    this.sectionSvc.getSections(venueId).subscribe({
      next: (list) => {
        // Map sections to EventSectionEntry with price initialised to null
        this.eventSections.set(
          list.map((s) => ({ ...s, price: null }))
        );
        this.loadingSections.set(false);
      },
      error: () => {
        this.sectionsError.set('Could not load sections for the selected venue.');
        this.loadingSections.set(false);
      },
    });
  }

  onImageUrl(url: string): void {
    this.display_image = url;
  }

  trackById(_: number, s: EventSectionEntry): number {
    return s.id;
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

    if (this.isEdit) {
      // Edit: only update event metadata, no sections
      this.eventSvc.update(this.event!.id, payload).subscribe({
        next: () => {
          this.submitting.set(false);
          this.saved.emit();
        },
        error: (err) => {
          this.submitting.set(false);
          this.error.set(err?.message ?? 'Something went wrong. Please try again.');
        },
      });
      return;
    }

    // Create: validate and send sections
    const sections = this.eventSections();

    if (sections.length === 0) {
      this.submitting.set(false);
      this.error.set('The selected venue has no sections configured.');
      return;
    }

    const invalidSection = sections.find(
      (s) => s.price === null || s.price === undefined || s.price <= 0
    );
    if (invalidSection) {
      this.submitting.set(false);
      this.error.set(`Please enter a valid price (> 0) for section "${invalidSection.name}".`);
      return;
    }

    const sectionPayload: SectionReq[] = sections.map((s) => ({
      id: s.id,
      name: s.name,
      venue_id: s.venue_id,
      tier: s.tier,
      seat_count: s.seat_count,
      price: s.price as number,
    }));

    this.eventSvc.create(payload, sectionPayload).subscribe({
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
