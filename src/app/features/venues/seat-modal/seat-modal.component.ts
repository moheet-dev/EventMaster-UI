import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SeatService, SeatRow } from '../../../core/services/seat.service';

@Component({
  selector: 'app-seat-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './seat-modal.component.html',
  styleUrl: './seat-modal.component.scss',
})
export class SeatModalComponent implements OnInit {
  @Input() venueId!: number;
  @Input() sectionId!: number;
  @Input() sectionName = '';

  @Output() closed = new EventEmitter<void>();

  /* ── State ── */
  rows = signal<SeatRow[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  /* ── Add seat form ── */
  isAddingOpen = signal(false);
  newCode = '';
  newRowNumber: number | null = null;
  savingSeat = signal(false);
  addError = signal<string | null>(null);

  /** The maximum row number present in the API data */
  readonly maxRow = computed(() => {
    const r = this.rows();
    return r.length ? Math.max(...r.map((row) => row.row_number)) : 0;
  });

  /** Max number of seats in any single row (used for centering) */
  readonly maxSeatsPerRow = computed(() => {
    const r = this.rows();
    return r.length ? Math.max(...r.map((row) => row.codes.length)) : 0;
  });

  /**
   * Full display rows: every integer from 1…maxRow.
   * Rows missing from the API are shown as empty.
   * Each entry carries `padLeft` ghost-cell count so real seats are centered.
   */
  readonly displayRows = computed(() => {
    const max = this.maxRow();
    const maxSeats = this.maxSeatsPerRow();
    if (max === 0) return [];

    const rowMap = new Map(this.rows().map((r) => [r.row_number, r.codes]));
    const result: { row_number: number; codes: string[]; padLeft: number; isEmpty: boolean }[] = [];

    for (let i = 1; i <= max; i++) {
      const codes = rowMap.get(i) ?? [];
      const isEmpty = codes.length === 0;
      // How many ghost cells to put on the left so this row's seats appear centred
      const padLeft = Math.floor((maxSeats - codes.length) / 2);
      result.push({ row_number: i, codes, padLeft, isEmpty });
    }
    return result;
  });

  /**
   * Row dropdown: 1 to (current max + 10), minimum 10 options.
   * Any row is valid — no restriction to adjacent rows.
   */
  readonly rowOptions = computed(() => {
    const max = Math.max(this.maxRow() + 10, 10);
    const opts: number[] = [];
    for (let i = 1; i <= max; i++) opts.push(i);
    return opts;
  });

  constructor(private seatSvc: SeatService) {}

  ngOnInit(): void {
    this.loadSeats();
  }

  loadSeats(): void {
    this.loading.set(true);
    this.error.set(null);
    this.seatSvc.getSeats(this.venueId, this.sectionId).subscribe({
      next: (data) => {
        this.rows.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load seats.');
        this.loading.set(false);
      },
    });
  }

  /* ── Add Seat ── */
  openAddSeat(): void {
    this.newCode = '';
    this.newRowNumber = this.maxRow() + 1;
    this.addError.set(null);
    this.isAddingOpen.set(true);
  }

  cancelAddSeat(): void {
    this.isAddingOpen.set(false);
    this.addError.set(null);
  }

  confirmAddSeat(): void {
    const code = this.newCode.trim();
    if (!code || !this.newRowNumber) {
      this.addError.set('Code and row are required.');
      return;
    }
    this.savingSeat.set(true);
    this.addError.set(null);
    this.seatSvc.addSeat(this.venueId, this.sectionId, {
      code,
      row_number: this.newRowNumber,
    }).subscribe({
      next: () => {
        this.savingSeat.set(false);
        this.isAddingOpen.set(false);
        this.newCode = '';
        this.newRowNumber = null;
        this.loadSeats();
      },
      error: () => {
        this.savingSeat.set(false);
        this.addError.set('Failed to add seat. Please try again.');
      },
    });
  }

  close(): void {
    this.closed.emit();
  }
}
