// lib/generateTranscriptDocx.js
// Generates a .docx transcript file IN THE BROWSER and triggers download.
// Uses docx library (already installed with @livekit packages or add separately).
//
// Install if not present: npm install docx
//
// Usage:
//   import { downloadTranscriptDocx } from "../lib/generateTranscriptDocx";
//   downloadTranscriptDocx(transcript, meetTitle, meetDate);

import {
    Document, Packer, Paragraph, TextRun,
    AlignmentType, BorderStyle, HeadingLevel,
    WidthType, Table, TableRow, TableCell, ShadingType,
} from "docx";

/**
 * @param {Array}  transcript  - [{ name, text, time }]
 * @param {string} meetTitle   - Meeting title
 * @param {string} meetDate    - e.g. "March 31, 2026"
 */
export async function downloadTranscriptDocx(transcript, meetTitle, meetDate) {
    const now = new Date();
    const dateStr = meetDate || now.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
    const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

    // ── Header section ────────────────────────────────────────────────────────
    const headerParagraphs = [
        new Paragraph({
            children: [
                new TextRun({ text: "MEETING TRANSCRIPT", bold: true, size: 36, font: "Arial", color: "1A73E8" }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
        }),
        new Paragraph({
            children: [
                new TextRun({ text: meetTitle || "CoWork Meeting", bold: true, size: 28, font: "Arial", color: "202124" }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
        }),
        new Paragraph({
            children: [
                new TextRun({ text: `Date: ${dateStr}  |  Generated at: ${timeStr}`, size: 20, font: "Arial", color: "5F6368" }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
        }),
        // Horizontal rule (border on bottom of paragraph)
        new Paragraph({
            border: {
                bottom: { style: BorderStyle.SINGLE, size: 6, color: "1A73E8", space: 1 },
            },
            spacing: { after: 280 },
        }),
        new Paragraph({
            children: [
                new TextRun({ text: `Total Entries: ${transcript.length}`, size: 18, font: "Arial", color: "9AA0A6", italics: true }),
            ],
            alignment: AlignmentType.RIGHT,
            spacing: { after: 320 },
        }),
    ];

    // ── Transcript lines ──────────────────────────────────────────────────────
    // Group consecutive lines by the same speaker
    const transcriptParagraphs = [];

    transcript.forEach((line, index) => {
        // Alternate background using index (light blue for even, white for odd)
        const isEven = index % 2 === 0;

        // Speaker name line
        transcriptParagraphs.push(
            new Paragraph({
                children: [
                    new TextRun({
                        text: line.name,
                        bold: true,
                        size: 22,
                        font: "Arial",
                        color: "1A73E8",
                    }),
                    new TextRun({
                        text: `  ${line.time || ""}`,
                        size: 18,
                        font: "Arial",
                        color: "9AA0A6",
                    }),
                ],
                spacing: { before: index === 0 ? 0 : 240, after: 60 },
                indent: { left: 360 },
            })
        );

        // Speech text line
        transcriptParagraphs.push(
            new Paragraph({
                children: [
                    new TextRun({
                        text: line.text,
                        size: 22,
                        font: "Arial",
                        color: "202124",
                    }),
                ],
                spacing: { after: 80 },
                indent: { left: 720 },
                border: {
                    left: { style: BorderStyle.SINGLE, size: 12, color: isEven ? "1A73E8" : "34A853", space: 10 },
                },
            })
        );
    });

    // ── Footer line ───────────────────────────────────────────────────────────
    const footerParagraphs = [
        new Paragraph({
            border: {
                top: { style: BorderStyle.SINGLE, size: 4, color: "E8EAED", space: 1 },
            },
            spacing: { before: 480, after: 80 },
        }),
        new Paragraph({
            children: [
                new TextRun({
                    text: `This transcript was auto-generated during the CoWork meeting on ${dateStr}. ` +
                        `Voice recognition powered by Google Speech API (Hindi + English).`,
                    size: 16,
                    font: "Arial",
                    color: "9AA0A6",
                    italics: true,
                }),
            ],
            alignment: AlignmentType.CENTER,
        }),
    ];

    // ── Build document ────────────────────────────────────────────────────────
    const doc = new Document({
        styles: {
            default: {
                document: { run: { font: "Arial", size: 22 } },
            },
        },
        sections: [{
            properties: {
                page: {
                    size: { width: 12240, height: 15840 },
                    margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
                },
            },
            children: [
                ...headerParagraphs,
                ...transcriptParagraphs,
                ...footerParagraphs,
            ],
        }],
    });

    // ── Pack to buffer and trigger download ───────────────────────────────────
    const buffer = await Packer.toBuffer(doc);
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const url = URL.createObjectURL(blob);

    const filename = `Meeting_Transcript_${(meetTitle || "CoWork").replace(/\s+/g, "_")}_${dateStr.replace(/\s+/g, "_").replace(/,/g, "")}.docx`;

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}