'use client';

import { useParams } from 'next/navigation';
import { AnalysisReport } from '../../../../components/analysis/analysis-report';
import {
  RESUME_SECTION_HINTS,
  RESUME_SECTION_LABELS,
  resumeFailureMessage,
} from '../../../../lib/resume-analysis';
import type { ResumeAnalysis, ResumeAnalysisSection } from '../../../../lib/types';

export default function ResumeAnalysisPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AnalysisReport<ResumeAnalysisSection, ResumeAnalysis>
      id={id}
      endpoint="/v1/resume-analyses"
      listHref="/analise-curriculo"
      subject="currículo"
      labels={RESUME_SECTION_LABELS}
      hints={RESUME_SECTION_HINTS}
      failureMessage={resumeFailureMessage}
      anotherLabel="Analisar outro currículo"
      defaultOpen="ats"
    />
  );
}
