import { Routes } from '@angular/router';
import { Explore } from '../explore/explore';
import { NewApp } from '../new-app/new-app';

export const routes: Routes = [
  { path: '', component: Explore },
  { path: 'newApp', component: NewApp },
];