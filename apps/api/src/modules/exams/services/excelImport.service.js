const ExcelJS = require('exceljs');

const parseExcelBuffer = async (buffer, mappingFunction) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0]; // Assuming data is in the first sheet
  const results = [];

  
  if (!worksheet) return results;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header row
    const data = mappingFunction(row);
    if (data) results.push(data);
  });

  return results;
};

exports.parseStudentsExcel = async (buffer) => {
  return parseExcelBuffer(buffer, (row) => ({
    rollNumber: row.getCell(1).text?.trim(),
    name: row.getCell(2).text?.trim(),
    branch: row.getCell(3).text?.trim(),
    year: row.getCell(4).text?.trim(),
    section: row.getCell(5).text?.trim(),
  }));
};

exports.parseRoomsExcel = async (buffer) => {
  return parseExcelBuffer(buffer, (row) => ({
    roomNumber: row.getCell(1).text?.trim(),
    rows: parseInt(row.getCell(2).text, 10),
    columns: parseInt(row.getCell(3).text, 10),
    capacity: parseInt(row.getCell(4).text, 10),
  }));
};

exports.parseFacultyExcel = async (buffer) => {
  return parseExcelBuffer(buffer, (row) => ({
    facultyId: row.getCell(1).text?.trim(),
    name: row.getCell(2).text?.trim(),
    department: row.getCell(3).text?.trim(),
    email: row.getCell(4).text?.trim(),
    available: row.getCell(5).text?.trim()?.toLowerCase() === 'yes',
  }));
};
