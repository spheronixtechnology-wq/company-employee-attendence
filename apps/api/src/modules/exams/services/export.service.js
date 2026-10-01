const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, AlignmentType, WidthType, BorderStyle } = require('docx');
const SeatingPlan = require('../models/SeatingPlan');
const InvigilatorDuty = require('../models/InvigilatorDuty');
const ExamRoom = require('../models/ExamRoom');
const Exam = require('../models/Exam');

async function getEnrichedExamData(examId) {
  const exam = await Exam.findById(examId);
  const seats = await SeatingPlan.find({ examId }).lean();
  const duties = await InvigilatorDuty.find({ examId }).populate('examFacultyId').lean();
  const roomDocs = await ExamRoom.find({ examId }).lean();

  const rooms = {};
  for (const r of roomDocs) {
    rooms[r.roomNumber] = { 
      roomNumber: r.roomNumber,
      rows: r.rows,
      columns: r.columns,
      capacity: r.capacity,
      seats: [], 
      invigilators: [] 
    };
  }

  for (const seat of seats) {
    if (rooms[seat.roomNumber]) rooms[seat.roomNumber].seats.push(seat);
  }
  
  for (const duty of duties) {
    if (rooms[duty.roomNumber]) {
      rooms[duty.roomNumber].invigilators.push({
        name: duty.examFacultyId.name,
        department: duty.examFacultyId.department
      });
    }
  }

  return { exam, rooms };
}

exports.generatePDFReport = async (examId, res) => {
  const { exam, rooms } = await getEnrichedExamData(examId);
  
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  const cleanName = exam.name.replace(/[^a-zA-Z0-9]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename=Consolidated_Exam_Allocation_${cleanName}.pdf`);
  doc.pipe(res);

  doc.fontSize(20).text(`Consolidated Exam Allocation: ${exam.name}`, { align: 'center' });
  doc.fontSize(12).text(`Date: ${new Date(exam.date).toLocaleDateString()} | Session: ${exam.session} | Time: ${exam.startTime} - ${exam.endTime}`, { align: 'center' });
  doc.moveDown(2);

  for (const roomNum of Object.keys(rooms)) {
    const room = rooms[roomNum];
    
    // Add page if close to bottom
    if (doc.y > 600) doc.addPage();

    // Calculate branch counts
    const branchCounts = {};
    let filledSeats = 0;
    room.seats.forEach(s => {
      if (!s.isEmptySeat && s.branch) {
        branchCounts[s.branch] = (branchCounts[s.branch] || 0) + 1;
        filledSeats++;
      }
    });

    const invigilatorsText = room.invigilators.length > 0 
      ? room.invigilators.map(inv => `${inv.name} (${inv.department})`).join(', ') 
      : 'None';

    // 2-Column Header
    const topY = doc.y;
    doc.fontSize(10);
    doc.font('Helvetica-Bold').text(`Exam:`, 50, topY).font('Helvetica').text(` ${exam.name}`, 85, topY);
    doc.font('Helvetica-Bold').text(`Date:`, 50, topY + 15).font('Helvetica').text(` ${new Date(exam.date).toLocaleDateString()}`, 85, topY + 15);
    doc.font('Helvetica-Bold').text(`Time:`, 50, topY + 30).font('Helvetica').text(` ${exam.startTime} - ${exam.endTime}`, 85, topY + 30);
    doc.font('Helvetica-Bold').text(`Session:`, 50, topY + 45).font('Helvetica').text(` ${exam.session}`, 95, topY + 45);

    doc.font('Helvetica-Bold').text(`Room:`, 300, topY).font('Helvetica').text(` ${roomNum}`, 340, topY);
    doc.font('Helvetica-Bold').text(`Occupancy:`, 300, topY + 15).font('Helvetica').text(` ${filledSeats} / ${room.capacity}`, 365, topY + 15);
    doc.font('Helvetica-Bold').text(`Invigilators:`, 300, topY + 30).font('Helvetica').text(` ${invigilatorsText}`, 370, topY + 30);

    // Separator line
    doc.moveTo(50, topY + 70).lineTo(550, topY + 70).strokeColor('#cccccc').stroke();

    // Branch Breakdown
    doc.y = topY + 80;
    doc.x = 50;
    doc.font('Helvetica-Bold').text(`Branch Breakdown:`);
    const breakdownStr = Object.entries(branchCounts).map(([b, c]) => `${b}: ${c}`).join(' | ');
    doc.font('Helvetica').text(breakdownStr || 'No students', { continued: false });
    doc.moveDown();

    // Seating Grid
    doc.font('Helvetica-Bold').text(`Seating Grid (Chalkboard at Front):`);
    doc.moveDown(1);
    
    // Group seats by row
    const grid = Array.from({ length: room.rows }, () => Array.from({ length: room.columns }, () => null));
    room.seats.forEach(s => {
      if (s.row < room.rows && s.column < room.columns) grid[s.row][s.column] = s;
    });

    const startX = 50;
    let currentY = doc.y;
    const availableHeight = 730 - currentY; // Keep 20px bottom margin
    const cellWidth = 500 / room.columns;
    const cellHeight = Math.max(60, availableHeight / room.rows); 

    for (let r = 0; r < room.rows; r++) {
      if (currentY + cellHeight > 750) {
        doc.addPage();
        currentY = 50;
      }

      for (let c = 0; c < room.columns; c++) {
        const currentX = startX + (c * cellWidth);
        const seat = grid[r][c];

        // Draw Cell Border
        doc.rect(currentX, currentY, cellWidth, cellHeight).strokeColor('#000000').stroke();

        // Draw Cell Content vertically centered
        const textYOffset = (cellHeight - 40) / 2; // Rough vertical center approximation
        
        if (seat && !seat.isEmptySeat) {
          doc.font('Helvetica-Bold').fontSize(9).text(`${seat.rollNumber} (${seat.branch})`, currentX, currentY + textYOffset, { width: cellWidth, align: 'center' });
          doc.font('Helvetica').fontSize(8).text(`Sign:...................`, currentX, currentY + textYOffset + 25, { width: cellWidth, align: 'center' });
        } else {
          doc.font('Helvetica').fontSize(9).fillColor('#888888').text(`Empty`, currentX, currentY + textYOffset + 10, { width: cellWidth, align: 'center' }).fillColor('#000000');
        }
      }
      currentY += cellHeight;
    }
  }

  doc.end();
};

exports.generateWordReport = async (examId, res) => {
  const { exam, rooms } = await getEnrichedExamData(examId);

  const sections = [];

  for (const roomNum of Object.keys(rooms)) {
    const room = rooms[roomNum];
    
    const branchCounts = {};
    let filledSeats = 0;
    room.seats.forEach(s => {
      if (!s.isEmptySeat && s.branch) {
        branchCounts[s.branch] = (branchCounts[s.branch] || 0) + 1;
        filledSeats++;
      }
    });

    // Group seats into a 2D array for the table
    const grid = Array.from({ length: room.rows }, () => Array.from({ length: room.columns }, () => null));
    room.seats.forEach(s => {
      if (s.row < room.rows && s.column < room.columns) {
        grid[s.row][s.column] = s;
      }
    });

    // Create Table Rows for the 2D Grid
    const tableRows = grid.map(rowSeats => {
      return new TableRow({
        height: { value: Math.floor(10000 / room.rows), rule: require('docx').HeightRule.EXACT },
        children: rowSeats.map(seat => {
          let cellChildren = [];
          if (seat && !seat.isEmptySeat) {
            cellChildren = [
              new Paragraph({ text: `${seat.rollNumber} (${seat.branch})`, alignment: AlignmentType.CENTER, bold: true }),
              new Paragraph({ text: "", spacing: { before: 100, after: 100 } }),
              new Paragraph({ text: "Sign:...................", alignment: AlignmentType.CENTER, size: 16 })
            ];
          } else {
            cellChildren = [new Paragraph({ text: "Empty", alignment: AlignmentType.CENTER, color: "888888" })];
          }
          return new TableCell({
            children: cellChildren,
            width: { size: 100 / room.columns, type: WidthType.PERCENTAGE },
            margins: { top: 200, bottom: 200, left: 100, right: 100 },
            verticalAlign: require('docx').VerticalAlign.CENTER
          });
        })
      });
    });

    const invigilatorsText = room.invigilators.length > 0 
      ? room.invigilators.map(inv => `${inv.name} (${inv.department})`).join(', ') 
      : 'None';

    const headerTable = new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: `Exam: `, bold: true }), new TextRun({ text: exam.name })] }),
                new Paragraph({ children: [new TextRun({ text: `Date: `, bold: true }), new TextRun({ text: new Date(exam.date).toLocaleDateString() })] }),
                new Paragraph({ children: [new TextRun({ text: `Time: `, bold: true }), new TextRun({ text: `${exam.startTime} - ${exam.endTime}` })] }),
                new Paragraph({ children: [new TextRun({ text: `Session: `, bold: true }), new TextRun({ text: exam.session })] })
              ],
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }
            }),
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: `Room: `, bold: true }), new TextRun({ text: roomNum })] }),
                new Paragraph({ children: [new TextRun({ text: `Occupancy: `, bold: true }), new TextRun({ text: `${filledSeats} / ${room.capacity}` })] }),
                new Paragraph({ children: [new TextRun({ text: `Invigilators: `, bold: true }), new TextRun({ text: invigilatorsText })] }),
              ],
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }
            })
          ]
        })
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: "auto" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
      }
    });

    sections.push({
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      children: [
        new Paragraph({ children: [new TextRun({ text: `Consolidated Exam Allocation`, bold: true, size: 32 })], alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
        headerTable,
        new Paragraph({ text: "", spacing: { after: 400 } }), // Spacer
        
        new Paragraph({ children: [new TextRun({ text: `Branch Breakdown:`, bold: true })] }),
        new Paragraph({ text: Object.entries(branchCounts).map(([b, c]) => `${b}: ${c}`).join(' | ') || 'No students', spacing: { after: 400 } }),
        
        new Paragraph({ children: [new TextRun({ text: `Seating Grid (Chalkboard at Front):`, bold: true })], spacing: { after: 200 } }),
        new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE }
        }),
      ],
    });
  }

  const doc = new Document({
    sections: sections,
  });

  const b64string = await Packer.toBase64String(doc);
  const buffer = Buffer.from(b64string, 'base64');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const cleanName = exam.name.replace(/[^a-zA-Z0-9]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename=Consolidated_Exam_Allocation_${cleanName}.docx`);
  res.send(buffer);
};

exports.generateStudentNoticePDF = async (examId, res) => {
  const { exam, rooms } = await getEnrichedExamData(examId);
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  const cleanName = exam.name.replace(/[^a-zA-Z0-9]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename=Exam_Seating_Allotment_${cleanName}.pdf`);
  doc.pipe(res);

  doc.fontSize(20).text(`Exam Seating Allotment: ${exam.name}`, { align: 'center' });
  doc.fontSize(12).text(`Date: ${new Date(exam.date).toLocaleDateString()} | Session: ${exam.session} | Time: ${exam.startTime} - ${exam.endTime}`, { align: 'center' });
  doc.moveDown(2);

  for (const roomNum of Object.keys(rooms).sort()) {
    const room = rooms[roomNum];
    
    const branchesInRoom = new Set();
    const rollsInRoom = [];

    room.seats.forEach(s => {
      if (!s.isEmptySeat) {
        if (s.branch) branchesInRoom.add(s.branch);
        rollsInRoom.push(s.rollNumber);
      }
    });

    if (rollsInRoom.length === 0) continue;

    if (doc.y > 650) doc.addPage();

    doc.fontSize(14).font('Helvetica-Bold').text(`Room no: `, { continued: true }).font('Helvetica').text(roomNum);
    doc.font('Helvetica-Bold').text(`Branches: `, { continued: true }).font('Helvetica').text(Array.from(branchesInRoom).join(', '));
    doc.font('Helvetica-Bold').text(`Roll numbers: `, { continued: true });
    
    // Using a standard text block will auto-wrap the comma-separated roll numbers.
    doc.font('Helvetica').text(rollsInRoom.join(', '));
    doc.moveDown(1.5);
  }

  doc.end();
};

exports.generateStudentNoticeWord = async (examId, res) => {
  const { exam, rooms } = await getEnrichedExamData(examId);

  const sections = [];
  sections.push(new Paragraph({ children: [new TextRun({ text: `Exam Seating Allotment: ${exam.name}`, bold: true, size: 40 })], alignment: AlignmentType.CENTER }));
  sections.push(new Paragraph({ children: [new TextRun({ text: `Date: ${new Date(exam.date).toLocaleDateString()} | Session: ${exam.session} | Time: ${exam.startTime} - ${exam.endTime}`, size: 24 })], alignment: AlignmentType.CENTER, spacing: { after: 400 } }));

  for (const roomNum of Object.keys(rooms).sort()) {
    const room = rooms[roomNum];
    
    const branchesInRoom = new Set();
    const rollsInRoom = [];

    room.seats.forEach(s => {
      if (!s.isEmptySeat) {
        if (s.branch) branchesInRoom.add(s.branch);
        rollsInRoom.push(s.rollNumber);
      }
    });

    if (rollsInRoom.length === 0) continue;

    sections.push(new Paragraph({
      children: [
        new TextRun({ text: `Room no: `, bold: true, size: 28 }),
        new TextRun({ text: roomNum, size: 28 })
      ]
    }));

    sections.push(new Paragraph({
      children: [
        new TextRun({ text: `Branches: `, bold: true, size: 24 }),
        new TextRun({ text: Array.from(branchesInRoom).join(', '), size: 24 })
      ]
    }));

    sections.push(new Paragraph({
      children: [
        new TextRun({ text: `Roll numbers: `, bold: true, size: 24 }),
        new TextRun({ text: rollsInRoom.join(', '), size: 24 })
      ],
      spacing: { after: 300 }
    }));
  }

  const doc = new Document({
    sections: [{ properties: {}, children: sections }]
  });

  const b64string = await Packer.toBase64String(doc);
  const buffer = Buffer.from(b64string, 'base64');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const cleanName = exam.name.replace(/[^a-zA-Z0-9]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename=Exam_Seating_Allotment_${cleanName}.docx`);
  res.send(buffer);
};

exports.generateFacultyDutyPDF = async (examId, res) => {
  const { exam, rooms } = await getEnrichedExamData(examId);
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  const cleanName = exam.name.replace(/[^a-zA-Z0-9]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename=Faculty_Duty_Allocation_${cleanName}.pdf`);
  doc.pipe(res);

  doc.fontSize(20).text(`Faculty Duty Allocation: ${exam.name}`, { align: 'center' });
  doc.fontSize(12).text(`Date: ${new Date(exam.date).toLocaleDateString()} | Session: ${exam.session} | Time: ${exam.startTime} - ${exam.endTime}`, { align: 'center' });
  doc.moveDown(2);

  for (const roomNum of Object.keys(rooms).sort()) {
    const room = rooms[roomNum];
    
    if (doc.y > 700) doc.addPage();

    const facultyStr = room.invigilators.length > 0 
      ? room.invigilators.map(inv => `${inv.name} (${inv.department})`).join(', ')
      : 'None Assigned';

    doc.fontSize(14).font('Helvetica-Bold').text(`Room ${roomNum}: `, { continued: true }).font('Helvetica').text(facultyStr);
    doc.moveDown(0.5);
  }

  doc.end();
};

exports.generateFacultyDutyWord = async (examId, res) => {
  const { exam, rooms } = await getEnrichedExamData(examId);

  const sections = [];
  sections.push(new Paragraph({ children: [new TextRun({ text: `Faculty Duty Allocation: ${exam.name}`, bold: true, size: 40 })], alignment: AlignmentType.CENTER }));
  sections.push(new Paragraph({ children: [new TextRun({ text: `Date: ${new Date(exam.date).toLocaleDateString()} | Session: ${exam.session} | Time: ${exam.startTime} - ${exam.endTime}`, size: 24 })], alignment: AlignmentType.CENTER, spacing: { after: 400 } }));

  for (const roomNum of Object.keys(rooms).sort()) {
    const room = rooms[roomNum];
    
    const facultyStr = room.invigilators.length > 0 
      ? room.invigilators.map(inv => `${inv.name} (${inv.department})`).join(', ')
      : 'None Assigned';

    sections.push(new Paragraph({
      children: [
        new TextRun({ text: `Room ${roomNum}: `, bold: true, size: 28 }),
        new TextRun({ text: facultyStr, size: 28 })
      ],
      spacing: { after: 120 }
    }));
  }

  const doc = new Document({
    sections: [{ properties: {}, children: sections }]
  });

  const b64string = await Packer.toBase64String(doc);
  const buffer = Buffer.from(b64string, 'base64');

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const cleanName = exam.name.replace(/[^a-zA-Z0-9]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename=Faculty_Duty_Allocation_${cleanName}.docx`);
  res.send(buffer);
};
