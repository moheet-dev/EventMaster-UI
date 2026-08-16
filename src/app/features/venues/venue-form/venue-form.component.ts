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
import { SectionService, Section } from '../../../core/services/section.service';
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

  /* ── Sections (edit mode only) ── */
  sections = signal<Section[]>([]);
  loadingSections = signal(false);
  sectionsError = signal<string | null>(null);

  /** True while an add-section API call is in-flight (disables drag) */
  savingSection = signal(false);

  /** Controls visibility of the add-section inline input row */
  isAddingSection = signal(false);

  /** Bound to the new section name input */
  newSectionName = '';

  /** Index of the row currently being dragged (-1 = none) */
  private dragIndex = -1;

  get isEdit(): boolean {
    return !!this.venue;
  }

  /** Drag is only active when not loading / adding */
  get isSortable(): boolean {
    return !this.savingSection() && !this.isAddingSection();
  }

  constructor(
    private venueSvc: VenueService,
    private sectionSvc: SectionService,
  ) {}

  ngOnInit(): void {
    if (this.venue) {
      this.name = this.venue.name;
      this.address = this.venue.address;
      this.display_image = this.venue.display_image ?? '';
      this.loadSections();
    }
  }

  onImageUrl(url: string): void {
    this.display_image = url;
  }

  /* ── Section loading ── */
  loadSections(): void {
    if (!this.venue) return;
    this.loadingSections.set(true);
    this.sectionsError.set(null);
    this.sectionSvc.getSections(this.venue.id).subscribe({
      next: (list) => {
        this.sections.set(list);
        this.loadingSections.set(false);
      },
      error: () => {
        this.sectionsError.set('Could not load sections.');
        this.loadingSections.set(false);
      },
    });
  }

  /* ── Add section ── */
  openAddSection(): void {
    this.newSectionName = '';
    this.isAddingSection.set(true);
  }

  cancelAddSection(): void {
    this.isAddingSection.set(false);
    this.newSectionName = '';
  }

  confirmAddSection(): void {
    const name = this.newSectionName.trim();
    if (!name || !this.venue) return;

    this.savingSection.set(true);
    this.sectionSvc.addSection(this.venue.id, name).subscribe({
      next: () => {
        this.isAddingSection.set(false);
        this.newSectionName = '';
        this.savingSection.set(false);
        this.loadSections();
      },
      error: () => {
        this.savingSection.set(false);
        this.sectionsError.set('Failed to add section. Please try again.');
      },
    });
  }

  /* ── Drag-and-drop (native HTML5) ── */
  onDragStart(index: number): void {
    if (!this.isSortable) return;
    this.dragIndex = index;
  }

  onDragOver(index: number, event: DragEvent): void {
    if (!this.isSortable) return;
    event.preventDefault();
    if (this.dragIndex === -1 || this.dragIndex === index) return;

    // Reorder in-memory
    const list = [...this.sections()];
    const [moved] = list.splice(this.dragIndex, 1);
    list.splice(index, 0, moved);

    // Reassign tiers to match new visual order
    const retiered = list.map((s, i) => ({ ...s, tier: i + 1 }));
    this.sections.set(retiered);
    this.dragIndex = index;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    if (!this.venue || this.dragIndex === -1) return;
    // Persist new tiers to server
    this.sectionSvc.updateTiers(this.venue.id, this.sections()).subscribe({
      error: () => this.sectionsError.set('Failed to save section order. Please try again.'),
    });
    this.dragIndex = -1;
  }

  onDragEnd(): void {
    this.dragIndex = -1;
  }

  /* ── Venue form submit ── */
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
