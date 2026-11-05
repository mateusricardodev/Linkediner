// Entrada usada pela API para exportar: inclui as bibliotecas de PDF e DOCX.
export {
  EXPORT_FORMATS,
  WATERMARK_TEXT,
  toExportModel,
  type ExportFormat,
  type ResumeExportModel,
} from './domain/export-model';
export {
  FREE_PLAN_EXPORT_POLICY,
  ResumeExportService,
  type ExportPolicy,
  type ResumeRenderer,
} from './application/resume-export-service';
export { PdfResumeRenderer } from './infrastructure/pdf-renderer';
export { DocxResumeRenderer } from './infrastructure/docx-renderer';
