import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  ViewChild,
  ElementRef,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, forkJoin, takeUntil } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import {
  EventService,
  Event as AppEvent,
  DashboardData,
} from '../../../core/services/event.service';
import { EventFormComponent } from '../event-form/event-form.component';

@Component({
  selector: 'app-event-stats',
  standalone: true,
  imports: [CommonModule, EventFormComponent],
  templateUrl: './event-stats.component.html',
  styleUrl: './event-stats.component.scss',
})
export class EventStatsComponent implements OnInit, OnDestroy, AfterViewInit {
  /* ── State ── */
  event = signal<AppEvent | null>(null);
  dashboard = signal<DashboardData | null>(null);
  prediction = signal<number | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  /* ── Modal ── */
  showEditForm = signal(false);

  /* ── Chart refs ── */
  @ViewChild('trendCanvas') trendCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('healthCanvas') healthCanvasRef!: ElementRef<HTMLCanvasElement>;

  private eventId!: number;
  private readonly destroy$ = new Subject<void>();
  private chartsDrawn = false;

  /* ── Computed stats ── */
  readonly percentSold = computed(() => {
    const d = this.dashboard();
    if (!d || d.total_seats === 0) return 0;
    return Math.round((d.booked_seats / d.total_seats) * 100);
  });

  readonly conversionRate = computed(() => {
    const d = this.dashboard();
    if (!d || d.booking_health.total === 0) return 0;
    return Math.round(
      (d.booking_health.CONFIRMED / d.booking_health.total) * 100
    );
  });

  readonly avgRevenuePerTicket = computed(() => {
    const d = this.dashboard();
    if (!d || d.booked_seats === 0) return 0;
    return Math.round(d.total_revenue / d.booked_seats);
  });

  readonly sectionList = computed(() => {
    const d = this.dashboard();
    if (!d) return [];
    return Object.entries(d.section_wise).map(([id, s]) => ({
      id,
      ...s,
      fillPct: s.capacity > 0 ? Math.round((s.sold / s.capacity) * 100) : 0,
    }));
  });

  readonly paceStatus = computed<{
    label: string;
    class: string;
    icon: string;
  }>(() => {
    const d = this.dashboard();
    const pred = this.prediction();
    if (!d || pred === null || pred === 0)
      return { label: 'N/A', class: 'pace--neutral', icon: '—' };

    // Linear interpolation: expected at this day = prediction * (days_since_live / estimated_total_days)
    // We approximate total days as days_since_live + days_until_event
    const ev = this.event();
    let totalDays = d.days_since_live;
    if (ev) {
      const eventDate = new Date(ev.event_on);
      const now = new Date();
      const daysUntil = Math.max(
        0,
        Math.ceil(
          (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        )
      );
      totalDays = d.days_since_live + daysUntil;
    }
    const expectedNow =
      totalDays > 0 ? pred * (d.days_since_live / totalDays) : pred;
    const ratio = expectedNow > 0 ? d.booked_seats / expectedNow : 1;

    if (ratio >= 1.15)
      return { label: 'Ahead of Pace', class: 'pace--ahead', icon: '🚀' };
    if (ratio >= 0.85)
      return { label: 'On Track', class: 'pace--ontrack', icon: '✅' };
    return { label: 'Behind Pace', class: 'pace--behind', icon: '⚠️' };
  });

  readonly estimatedSelloutDate = computed<string>(() => {
    const d = this.dashboard();
    if (!d || d.booked_seats === 0 || d.days_since_live === 0) return '—';
    if (d.booked_seats >= d.total_seats) return 'Already sold out!';

    const dailyRate = d.booked_seats / d.days_since_live;
    const remaining = d.total_seats - d.booked_seats;
    const daysToSellout = Math.ceil(remaining / dailyRate);
    const selloutDate = new Date();
    selloutDate.setDate(selloutDate.getDate() + daysToSellout);
    return selloutDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  });

  readonly daysUntilEvent = computed<number>(() => {
    const ev = this.event();
    if (!ev) return 0;
    const eventDate = new Date(ev.event_on);
    const now = new Date();
    return Math.max(
      0,
      Math.ceil(
        (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
    );
  });

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private eventSvc: EventService,
    private authSvc: AuthService
  ) {}

  ngOnInit(): void {
    this.eventId = Number(this.route.snapshot.paramMap.get('eventId'));
    this.loadData();
  }

  ngAfterViewInit(): void {
    // Charts will be drawn after data loads
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      event: this.eventSvc.getById(this.eventId),
      dashboard: this.eventSvc.getDashboard(this.eventId),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ event, dashboard }) => {
          this.event.set(event);
          this.dashboard.set(dashboard.data);
          this.loading.set(false);

          // Now fetch prediction using dashboard data
          this.eventSvc
            .predictTicketSale(
              dashboard.data.days_since_live,
              dashboard.data.total_seats
            )
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (res) => {
                this.prediction.set(res.data.prediction);
                // Draw charts after all data is loaded
                setTimeout(() => this.drawCharts(), 100);
              },
              error: () => {
                this.prediction.set(null);
                setTimeout(() => this.drawCharts(), 100);
              },
            });
        },
        error: (err) => {
          this.error.set(err?.message ?? 'Failed to load dashboard data.');
          this.loading.set(false);
        },
      });
  }

  /* ── Chart Drawing ── */
  private drawCharts(): void {
    if (this.chartsDrawn) return;
    this.chartsDrawn = true;
    this.drawTrendChart();
    this.drawHealthChart();
  }

  private drawTrendChart(): void {
    const canvas = this.trendCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const d = this.dashboard();
    if (!d) return;

    // Setup canvas for high-DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    const pad = { top: 30, right: 20, bottom: 50, left: 55 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;

    // Build cumulative actual data
    const rawDays = d.days_booked_since_live;
    const dayKeys = Object.keys(rawDays)
      .map(Number)
      .sort((a, b) => a - b);
    const maxDay = Math.max(d.days_since_live, ...dayKeys);

    const actualPoints: { x: number; y: number }[] = [];
    let cumulative = 0;
    // Start from day 0
    actualPoints.push({ x: 0, y: 0 });
    for (let day = 1; day <= maxDay; day++) {
      if (rawDays[String(day)]) {
        cumulative += rawDays[String(day)];
      }
      actualPoints.push({ x: day, y: cumulative });
    }

    // Predicted line (linear from 0 to prediction at maxDay)
    const pred = this.prediction() ?? cumulative;
    const maxY = Math.max(d.total_seats, pred, cumulative, 1);

    // Scale helpers
    const xScale = (day: number) =>
      pad.left + (day / Math.max(maxDay, 1)) * chartW;
    const yScale = (val: number) =>
      pad.top + chartH - (val / maxY) * chartH;

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (i / gridLines) * chartH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();

      // Y labels
      const val = Math.round(maxY * (1 - i / gridLines));
      ctx.fillStyle = 'rgba(160,168,192,0.7)';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(val), pad.left - 10, y + 4);
    }

    // X axis labels
    ctx.fillStyle = 'rgba(160,168,192,0.7)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    const xLabelStep = Math.max(1, Math.floor(maxDay / 6));
    for (let day = 0; day <= maxDay; day += xLabelStep) {
      ctx.fillText(`Day ${day}`, xScale(day), H - pad.bottom + 25);
    }

    // Axis labels
    ctx.save();
    ctx.fillStyle = 'rgba(160,168,192,0.5)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Days Since Live', W / 2, H - 5);
    ctx.translate(14, pad.top + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Tickets Sold', 0, 0);
    ctx.restore();

    // Predicted line (dashed)
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(126,184,247,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xScale(0), yScale(0));
    ctx.lineTo(xScale(maxDay), yScale(pred));
    ctx.stroke();
    ctx.setLineDash([]);

    // Predicted area fill
    ctx.fillStyle = 'rgba(126,184,247,0.06)';
    ctx.beginPath();
    ctx.moveTo(xScale(0), yScale(0));
    ctx.lineTo(xScale(maxDay), yScale(pred));
    ctx.lineTo(xScale(maxDay), yScale(0));
    ctx.closePath();
    ctx.fill();

    // Actual line
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
    gradient.addColorStop(0, 'rgba(233,69,96,0.9)');
    gradient.addColorStop(1, 'rgba(233,69,96,0.4)');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < actualPoints.length; i++) {
      const px = xScale(actualPoints[i].x);
      const py = yScale(actualPoints[i].y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Actual area fill
    const areaGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
    areaGrad.addColorStop(0, 'rgba(233,69,96,0.2)');
    areaGrad.addColorStop(1, 'rgba(233,69,96,0.02)');
    ctx.fillStyle = areaGrad;
    ctx.beginPath();
    for (let i = 0; i < actualPoints.length; i++) {
      const px = xScale(actualPoints[i].x);
      const py = yScale(actualPoints[i].y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.lineTo(xScale(actualPoints[actualPoints.length - 1].x), yScale(0));
    ctx.lineTo(xScale(0), yScale(0));
    ctx.closePath();
    ctx.fill();

    // Data points on actual line
    for (const pt of actualPoints) {
      ctx.beginPath();
      ctx.arc(xScale(pt.x), yScale(pt.y), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#e94560';
      ctx.fill();
      ctx.strokeStyle = 'rgba(13,13,13,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Legend
    const legendY = 14;
    ctx.font = '600 11px Inter, sans-serif';

    // Actual legend
    ctx.fillStyle = '#e94560';
    ctx.fillRect(pad.left, legendY - 5, 16, 3);
    ctx.fillStyle = 'rgba(240,240,240,0.8)';
    ctx.textAlign = 'left';
    ctx.fillText('Actual Sales', pad.left + 22, legendY);

    // Predicted legend
    const predLegendX = pad.left + 110;
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(126,184,247,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(predLegendX, legendY - 3);
    ctx.lineTo(predLegendX + 16, legendY - 3);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(240,240,240,0.8)';
    ctx.fillText('Predicted', predLegendX + 22, legendY);
  }

  private drawHealthChart(): void {
    const canvas = this.healthCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const d = this.dashboard();
    if (!d) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;

    const health = d.booking_health;
    const total = health.total || 1;
    const segments = [
      { label: 'Confirmed', value: health.CONFIRMED, color: '#4ade80' },
      { label: 'Pending', value: health.PENDING, color: '#fbbf24' },
      { label: 'Cancelled', value: health.CANCELLED, color: '#f87171' },
      { label: 'Expired', value: health.EXPIRED, color: '#a78bfa' },
    ];

    const cx = W / 2;
    const cy = H / 2;
    const outerR = Math.min(W, H) / 2 - 10;
    const innerR = outerR * 0.62;

    let startAngle = -Math.PI / 2;
    for (const seg of segments) {
      const sweep = (seg.value / total) * Math.PI * 2;
      if (seg.value === 0) continue;

      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, startAngle + sweep);
      ctx.arc(cx, cy, innerR, startAngle + sweep, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();

      // Gap between segments
      ctx.strokeStyle = 'rgba(26,26,46,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();

      startAngle += sweep;
    }

    // Center text
    ctx.fillStyle = 'rgba(240,240,240,0.9)';
    ctx.font = '700 24px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(total), cx, cy - 6);
    ctx.fillStyle = 'rgba(160,168,192,0.7)';
    ctx.font = '500 11px Inter, sans-serif';
    ctx.fillText('Total', cx, cy + 14);
  }

  /* ── Actions ── */
  goBack(): void {
    this.router.navigate(['/home']);
  }

  openEdit(): void {
    this.showEditForm.set(true);
  }

  closeEdit(): void {
    this.showEditForm.set(false);
  }

  onEditSaved(): void {
    this.showEditForm.set(false);
    this.router.navigate(['/home']);
  }

  /* ── Helpers ── */
  formatCurrency(value: number | string): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return '₹' + num.toLocaleString('en-IN');
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  tierLabel(tier: number): string {
    switch (tier) {
      case 1:
        return 'VIP';
      case 2:
        return 'Premium';
      case 3:
        return 'Regular';
      default:
        return `Tier ${tier}`;
    }
  }

  tierClass(tier: number): string {
    switch (tier) {
      case 1:
        return 'tier--vip';
      case 2:
        return 'tier--premium';
      default:
        return 'tier--regular';
    }
  }

  healthColor(status: string): string {
    switch (status) {
      case 'CONFIRMED':
        return '#4ade80';
      case 'PENDING':
        return '#fbbf24';
      case 'CANCELLED':
        return '#f87171';
      case 'EXPIRED':
        return '#a78bfa';
      default:
        return '#606880';
    }
  }

  healthPct(val: number): number {
    const d = this.dashboard();
    if (!d || d.booking_health.total === 0) return 0;
    return Math.round((val / d.booking_health.total) * 100);
  }
}
