import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { NewApp } from './new-app';

describe('NewApp', () => {
  let component: NewApp;
  let fixture: ComponentFixture<NewApp>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewApp],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();

    fixture = TestBed.createComponent(NewApp);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
