import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, AppEntry } from '../app/api.service';

@Component({
  imports: [RouterLink],
  selector: 'app-explore',
  styleUrl: './explore.css',
  templateUrl: './explore.html',
})
export class Explore {
  private api = inject(ApiService);
  protected readonly apps = signal<AppEntry[]>([]);

  async ngOnInit(): Promise<void> {
    this.apps.set(await this.api.getApps());
  }
}
