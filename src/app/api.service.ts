import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AppEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  iconUrl: string;
  apkUrl: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  getApps(): Promise<AppEntry[]> {
    return firstValueFrom(this.http.get<AppEntry[]>('/api/apps'));
  }

  createApp(data: FormData): Promise<AppEntry> {
    return firstValueFrom(this.http.post<AppEntry>('/api/apps', data));
  }
}
