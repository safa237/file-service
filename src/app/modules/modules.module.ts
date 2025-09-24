import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModulesRoutingModule } from './modules-routing.module';
import { ModulesComponent } from './modules.component';
import { SharedModule } from '../shared/shared.module';
import { UploadDropzoneComponent } from '../components/upload-dropzone.component';
import { UploadProgressComponent } from '../components/upload-progress.component';
import { ErrorMessageComponent } from '../components/error-message.component';

@NgModule({
  declarations: [
    ModulesComponent,
    UploadDropzoneComponent,
    UploadProgressComponent,
    ErrorMessageComponent
  ],
  imports: [
    CommonModule,
    ModulesRoutingModule,
    SharedModule
  ]
})
export class ModulesModule { }
