import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-home',
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  featureCards = [
    { icon: '🎵', title: 'Live Music',       desc: 'Find concerts and festivals near you.' },
    { icon: '⚽', title: 'Sports',            desc: 'Book seats for your favourite team.' },
    { icon: '🎭', title: 'Theatre & Arts',    desc: 'Immersive performances and exhibitions.' },
    { icon: '🏛️', title: 'Conferences',       desc: 'Industry events and workshops.' },
    { icon: '🎤', title: 'Stand-up Comedy',   desc: 'Laugh out loud with top comedians.' },
    { icon: '🌟', title: 'Special Events',    desc: 'Exclusive and limited-access gatherings.' },
  ];

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
