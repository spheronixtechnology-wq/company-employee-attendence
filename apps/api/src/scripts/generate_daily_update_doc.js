const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, BorderStyle, WidthType,
  AlignmentType, ShadingType
} = require('docx');

async function generateReport() {
  const doc = new Document({
    creator: 'Spheronix Engineering Team',
    title: 'Spheronix System Updates & Engineering Changelog',
    description: 'Comprehensive report of all architecture, UI/UX, and backend fixes deployed on September 12, 2026.',
    sections: [{
      properties: {
        page: {
          margin: { top: 1200, bottom: 1200, left: 1400, right: 1400 },
        },
      },
      children: [
        // Title
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: 'SPHERONIX ATTENDANCE SYSTEM',
              bold: true,
              size: 32,
              color: '1E3A8A',
              font: 'Calibri',
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [
            new TextRun({
              text: 'Engineering Changelog & System Updates Report',
              bold: true,
              size: 24,
              color: '475569',
              font: 'Calibri',
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [
            new TextRun({
              text: 'Date: September 12, 2026  |  Environment: Production / Staging  |  Status: Verified & Deployed',
              italics: true,
              size: 18,
              color: '64748B',
              font: 'Calibri',
            }),
          ],
        }),

        // Executive Summary
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 150 },
          children: [
            new TextRun({ text: '1. Executive Summary', bold: true, size: 26, color: '1E3A8A' })
          ]
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: 'On September 12, 2026, major reliability, security, and user-experience upgrades were rolled out across the Spheronix Attendance ecosystem (Backend API, Manager Portal, Admin Portal, and Employee Mobile Web App). All updates have been verified, automated builds have succeeded with zero errors, and all changes have been committed and synchronized to the GitHub repository.',
              size: 21,
              font: 'Calibri',
            }),
          ],
        }),

        // Table of key components updated
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  shading: { fill: '1E3A8A', type: ShadingType.CLEAR },
                  children: [new Paragraph({ children: [new TextRun({ text: 'Module / Area', bold: true, color: 'FFFFFF', size: 20 })] })],
                }),
                new TableCell({
                  shading: { fill: '1E3A8A', type: ShadingType.CLEAR },
                  children: [new Paragraph({ children: [new TextRun({ text: 'Core Update Description', bold: true, color: 'FFFFFF', size: 20 })] })],
                }),
                new TableCell({
                  shading: { fill: '1E3A8A', type: ShadingType.CLEAR },
                  children: [new Paragraph({ children: [new TextRun({ text: 'Status', bold: true, color: 'FFFFFF', size: 20 })] })],
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Manager Device Requests', bold: true, size: 19 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Upfront data visibility (zero-click cards), real-time tab counts, instant search filter, and smart empty states.', size: 19 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Completed ✅', color: '059669', bold: true, size: 19 })] })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Attendance Check-In Recovery', bold: true, size: 19 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Fixed E11000 duplicate key crash by updating existing stubs/rejected records in-place to Present.', size: 19 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Completed ✅', color: '059669', bold: true, size: 19 })] })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Biometric WebAuthn Passkeys', bold: true, size: 19 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Activated credentials and linked active devices; verified fingerprint assertion validation pipeline.', size: 19 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Completed ✅', color: '059669', bold: true, size: 19 })] })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Document Preview Modal', bold: true, size: 19 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Expanded to full 92vh height in Manager and Admin portals for crisp full-screen PDF/Office reading.', size: 19 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Completed ✅', color: '059669', bold: true, size: 19 })] })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Employee Creation & Profile', bold: true, size: 19 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Ported 3-step creation modal and 360-degree profile view to Admin portal with role management.', size: 19 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Completed ✅', color: '059669', bold: true, size: 19 })] })] }),
              ],
            }),
          ],
        }),

        // Section 2: Manager Portal Device & Location Requests Redesign
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 150 },
          children: [
            new TextRun({ text: '2. Manager Portal: Device & Location Requests Redesign', bold: true, size: 26, color: '1E3A8A' })
          ]
        }),
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: 'Challenge Addressed: ', bold: true, size: 21 }),
            new TextRun({ text: 'Managers previously experienced a confusing "nothing data until clicked" interface. Essential device information and action buttons were hidden behind collapsed accordions. Furthermore, upon approving a pending request, the list refetched pending status, displaying an empty blank card with no indication that the record existed in the Approved tab.', size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 100 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'Zero-Click Transparency: ', bold: true, size: 21 }),
            new TextRun({ text: 'Device models (e.g., V2502 · Android 16.0.0), employee details, and reason callouts are now immediately visible upfront on every card without requiring clicks.', size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 100 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'Direct Approval Actions: ', bold: true, size: 21 }),
            new TextRun({ text: 'For pending requests, the Approve and Reject buttons and optional decision note input are rendered directly on the card for 1-click action.', size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 100 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'Live Status Tab Badges: ', bold: true, size: 21 }),
            new TextRun({ text: 'Tabs now display live counts: All (20) | Pending (0) | Approved (19) | Rejected (1), with an alert badge whenever pending requests exist.', size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 100 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'Smart Empty States: ', bold: true, size: 21 }),
            new TextRun({ text: 'When the pending list is empty, an "All Caught Up! 🎉" banner is displayed along with 1-click CTA buttons ("View Approved Requests" and "View All Requests") so managers never face dead ends.', size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 150 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'Real-Time Search: ', bold: true, size: 21 }),
            new TextRun({ text: 'Added an instant search bar allowing managers to search requests by employee name, email, device model, IP address, or reason.', size: 21 }),
          ],
        }),

        // Section 3: Attendance Check-In In-Place Recovery
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 150 },
          children: [
            new TextRun({ text: '3. Attendance In-Place Updating & Duplicate Key Resolution', bold: true, size: 26, color: '1E3A8A' })
          ]
        }),
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: 'Problem Solved: ', bold: true, size: 21 }),
            new TextRun({ text: 'If an employee attempted attendance and failed earlier in the day (due to wrong fingerprint, being outside GPS boundary, or on unauthorized Wi-Fi), a database stub or daily record could exist. Retrying subsequently crashed with an E11000 duplicate key error.', size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: 'Architectural Solution: ', bold: true, size: 21 }),
            new TextRun({ text: 'Updated initiateCheckin in employee.controller.js to detect existing records for today. If present, the existing document is updated in-place (status: "present", checkInTime: now, checkInMethod: activeMethod, checkInIp: clientIp) rather than invoking new Attendance().save().', size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 150 },
          children: [
            new TextRun({ text: 'Guaranteed Behavior: ', bold: true, size: 21 }),
            new TextRun({ text: 'Employees who mistakenly fail first can immediately retry using the correct biometric credential, valid office GPS, or office Wi-Fi, and their attendance seamlessly transitions to Present with real-time manager updates.', size: 21 }),
          ],
        }),

        // Section 4: Biometric Credential Activation & MFA
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 150 },
          children: [
            new TextRun({ text: '4. Biometric WebAuthn Passkey Pipeline Verification', bold: true, size: 26, color: '1E3A8A' })
          ]
        }),
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: 'Key Achievements: ', bold: true, size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 100 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'Activated biometric passkey credentials in MongoDB for employee jaggu (mcm@gmail.com).', size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 100 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'Cleared duplicate device enrollment stubs and linked the active hardware profile (V2502 Android 16.0.0).', size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 150 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'Verified WebAuthn assertion challenge generation and signature verification pipeline.', size: 21 }),
          ],
        }),

        // Section 5: Document Preview & Work Uploads
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 150 },
          children: [
            new TextRun({ text: '5. Document Preview Modal & Manager Work Log Uploads', bold: true, size: 26, color: '1E3A8A' })
          ]
        }),
        new Paragraph({
          spacing: { after: 100 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'Expanded DocumentPreviewModal in Admin and Manager portals to 92vh height, ensuring full-screen document readability for PDF, Word, Excel, and Text files.', size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 100 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'Fixed manager daily work sheet uploads to convert memory buffers into self-contained Base64 data URLs, preserving all document metadata.', size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 150 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'Ensured daily log text fields (task title, project name, blockers) remain visible alongside document attachments.', size: 21 }),
          ],
        }),

        // Section 6: Permanent Architecture Invariants
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 150 },
          children: [
            new TextRun({ text: '6. Permanent Architecture Invariants', bold: true, size: 26, color: '1E3A8A' })
          ]
        }),
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: 'The following core principles are permanent architectural commitments:', bold: true, size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 100 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'Strict Security Validation: ', bold: true, size: 21 }),
            new TextRun({ text: 'Biometric passkeys, GPS office radius boundaries, and Office IP matches cannot be bypassed.', size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 100 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'In-Place Attendance Resilience: ', bold: true, size: 21 }),
            new TextRun({ text: 'A rejected check-in will always successfully transition to Present upon satisfying the rules.', size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 150 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'Check-In Preservation: ', bold: true, size: 21 }),
            new TextRun({ text: 'Once an employee is marked Present, changing system attendance rules (e.g. Wi-Fi to Biometric) will never wipe or invalidate their check-in.', size: 21 }),
          ],
        }),

        // Section 7: Verification & Git Sync
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 150 },
          children: [
            new TextRun({ text: '7. Verification & GitHub Synchronization', bold: true, size: 26, color: '1E3A8A' })
          ]
        }),
        new Paragraph({
          spacing: { after: 100 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'Manager App Build: ', bold: true, size: 21 }),
            new TextRun({ text: 'Built successfully via vite build in 15.88s with 0 errors.', size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 100 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'API Backend Health: ', bold: true, size: 21 }),
            new TextRun({ text: 'Verified HTTP 200 on port 5000 with real-time socket connections active.', size: 21 }),
          ],
        }),
        new Paragraph({
          spacing: { after: 150 },
          bullet: { level: 0 },
          children: [
            new TextRun({ text: 'GitHub Sync: ', bold: true, size: 21 }),
            new TextRun({ text: 'Committed under ad3bbd9 and pushed to main at https://github.com/Spheronix-Hackathon/Employee-Dashboard.git.', size: 21 }),
          ],
        }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.resolve(__dirname, '../../../../Spheronix_Daily_Engineering_Updates_2026-09-12.docx');
  fs.writeFileSync(outputPath, buffer);
  console.log('Document created successfully at:', outputPath);
}

generateReport().catch(err => {
  console.error('Error creating document:', err);
  process.exit(1);
});
