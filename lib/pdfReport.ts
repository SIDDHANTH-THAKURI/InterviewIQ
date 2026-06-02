import { jsPDF } from "jspdf";
import {
  DIFFICULTY_LABELS,
  INTERVIEW_TYPE_LABELS,
  type InterviewConfig,
  type InterviewFeedback,
} from "@/types/interview";

const INK = "#111111";
const MUTED = "#6B6B66";
const ACCENT = "#B45309";

/** Generates and downloads a clean, text-based PDF of the feedback report. */
export function downloadFeedbackPdf(
  feedback: InterviewFeedback,
  config?: InterviewConfig
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;
  const maxW = pageW - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const heading = (text: string) => {
    ensureSpace(40);
    doc.setTextColor(MUTED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(text.toUpperCase(), margin, y);
    y += 8;
    doc.setDrawColor(229, 229, 227);
    doc.line(margin, y, pageW - margin, y);
    y += 18;
  };

  const para = (text: string, size = 11, color = INK, gap = 6) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(color);
    const lines = doc.splitTextToSize(text, maxW);
    for (const line of lines) {
      ensureSpace(size + 4);
      doc.text(line, margin, y);
      y += size + 4;
    }
    y += gap;
  };

  // Title
  doc.setFont("times", "bold");
  doc.setFontSize(30);
  doc.setTextColor(INK);
  doc.text("Interview Report", margin, y);
  y += 30;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  const meta = config
    ? `${INTERVIEW_TYPE_LABELS[config.type]} · ${DIFFICULTY_LABELS[config.difficulty]} · ${config.duration} min`
    : "InterviewIQ";
  doc.text(`${meta}   ·   ${new Date().toLocaleString()}`, margin, y);
  y += 28;

  // Score
  doc.setFont("times", "bold");
  doc.setFontSize(48);
  doc.setTextColor(ACCENT);
  doc.text(feedback.grade, margin, y + 6);
  doc.setFontSize(20);
  doc.setTextColor(INK);
  doc.text(`${feedback.overallScore}/100`, margin + 110, y + 6);
  y += 40;

  heading("Summary");
  para(feedback.overallSummary);

  heading("Dimensions");
  const dims = Object.entries(feedback.dimensions);
  doc.setFontSize(11);
  for (const [k, v] of dims) {
    ensureSpace(20);
    const label = k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
    doc.setTextColor(INK);
    doc.setFont("helvetica", "normal");
    doc.text(label, margin, y);
    // bar
    const barX = margin + 160;
    const barW = maxW - 160;
    doc.setFillColor(235, 235, 233);
    doc.roundedRect(barX, y - 9, barW, 8, 4, 4, "F");
    doc.setFillColor(180, 83, 9);
    doc.roundedRect(barX, y - 9, (barW * (v as number)) / 100, 8, 4, 4, "F");
    doc.setTextColor(MUTED);
    doc.text(String(v), pageW - margin - 18, y);
    y += 20;
  }
  y += 8;

  heading("What to fix");
  feedback.topThreeImprovements.forEach((t, i) => para(`${i + 1}.  ${t}`));

  heading("Strengths");
  feedback.strengths.forEach((t) => para(`•  ${t}`));

  heading("Vision report");
  para(`Eye contact score: ${feedback.visionReport.eyeContactScore}/100`, 11, INK, 2);
  para(feedback.visionReport.bodyLanguageSummary);
  para(feedback.visionReport.presentationNotes);

  heading("Answer-by-answer");
  feedback.answerAnnotations.forEach((a) => {
    para(`Q: ${a.question}`, 11, INK, 2);
    para(`A: ${a.answer}`, 10, MUTED, 2);
    para(`[${a.quality.toUpperCase()}] ${a.annotation}`, 10, ACCENT, 10);
  });

  doc.save("interviewiq-report.pdf");
}
