// validation.service.js

exports.validatePreFlight = (exam, students, rooms, faculty) => {
  const violations = [];

  // Check Total Capacity >= Total Students
  const totalCapacity = rooms.reduce((sum, r) => sum + r.capacity, 0);
  if (totalCapacity < students.length) {
    violations.push(`Insufficient total capacity. Required: ${students.length}, Available: ${totalCapacity}`);
  }

  // Check duplicate roll numbers
  const rollNumbers = new Set();
  for (const s of students) {
    if (rollNumbers.has(s.rollNumber)) {
      violations.push(`Duplicate roll number found: ${s.rollNumber}`);
    }
    rollNumbers.add(s.rollNumber);
  }
  
  // Check duplicate rooms
  const roomNumbers = new Set();
  for (const r of rooms) {
    if (roomNumbers.has(r.roomNumber)) {
      violations.push(`Duplicate room number found: ${r.roomNumber}`);
    }
    roomNumbers.add(r.roomNumber);
    if (r.capacity !== r.rows * r.columns) {
       violations.push(`Room ${r.roomNumber} capacity (${r.capacity}) does not equal rows x columns (${r.rows * r.columns})`);
    }
  }

  // Check duplicate faculty
  const facultyIds = new Set();
  for (const f of faculty) {
    if (facultyIds.has(f.facultyId)) {
      violations.push(`Duplicate faculty ID found: ${f.facultyId}`);
    }
    facultyIds.add(f.facultyId);
  }

  return { isValid: violations.length === 0, violations };
};
