import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, AppEntry } from '../app/api.service';
import { SearchService } from '../app/search.service';
import { Header } from '../app/header/header';

@Component({
  imports: [RouterLink, Header],
  selector: 'app-explore',
  styleUrl: './explore.css',
  templateUrl: './explore.html',
})
export class Explore {
  private api = inject(ApiService);
  private search = inject(SearchService);

  protected readonly apps = signal<AppEntry[]>([]);
  protected readonly query = this.search.query;

  protected readonly filteredApps = computed(() => {
    const query = this.query().trim().toLowerCase();
    if (!query) {
      return this.apps();
    }
    return this.apps().filter(
      (app) =>
        app.name.toLowerCase().includes(query) || app.description.toLowerCase().includes(query),
    );
  });

  async ngOnInit(): Promise<void> {
    this.apps.set(await this.api.getApps());
  }
}
