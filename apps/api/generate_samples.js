const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function createSampleFiles() {
  const publicDir = path.join(__dirname, 'src', 'public', 'templates');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // 1. Students - ONLY ONE ROW
  const workbookStudents = new ExcelJS.Workbook();
  const sheetStudents = workbookStudents.addWorksheet('Students');
  sheetStudents.addRow(['Roll Number', 'Name', 'Branch', 'Year', 'Section']);
  sheetStudents.addRow(['CSE001', 'John Doe', 'CSE', '2', 'A']); // 1 row
  await workbookStudents.xlsx.writeFile(path.join(publicDir, 'sample_students.xlsx'));
  console.log('Created sample_students.xlsx');

  // 2. Rooms - ONLY ONE ROW
  const workbookRooms = new ExcelJS.Workbook();
  const sheetRooms = workbookRooms.addWorksheet('Rooms');
  sheetRooms.addRow(['Room Number', 'Rows', 'Columns', 'Capacity']);
  sheetRooms.addRow(['R101', '5', '4', '20']); // 1 row
  await workbookRooms.xlsx.writeFile(path.join(publicDir, 'sample_rooms.xlsx'));
  console.log('Created sample_rooms.xlsx');

  // 3. Faculty - ONLY ONE ROW
  const workbookFaculty = new ExcelJS.Workbook();
  const sheetFaculty = workbookFaculty.addWorksheet('Faculty');
  // ADDED EMAIL
  sheetFaculty.addRow(['Faculty ID', 'Name', 'Department', 'Email', 'Available']);
  sheetFaculty.addRow(['F001', 'Dr. Smith', 'CSE', 'smith@college.edu', 'Yes']); // 1 row
  await workbookFaculty.xlsx.writeFile(path.join(publicDir, 'sample_faculty.xlsx'));
  console.log('Created sample_faculty.xlsx');
}

createSampleFiles().catch(console.error);
