import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SearchService } from '../search.service';

@Component({
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, FormsModule],
  styleUrl: './header.css',
  templateUrl: './header.html',
})
export class Header {
  protected readonly search = inject(SearchService);
}
