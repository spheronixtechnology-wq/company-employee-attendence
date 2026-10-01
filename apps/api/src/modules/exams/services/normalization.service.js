// normalization.service.js

exports.normalizeStudents = (students) => {
  return students.map(s => ({
    ...s,
    rollNumber: s.rollNumber ? s.rollNumber.toUpperCase() : '',
    branch: s.branch ? s.branch.toUpperCase() : '',
  })).filter(s => s.rollNumber && s.name && s.branch); // Basic drop of invalid rows
};

exports.normalizeRooms = (rooms) => {
  return rooms.map(r => ({
    ...r,
    roomNumber: r.roomNumber ? r.roomNumber.toUpperCase() : '',
    rows: isNaN(r.rows) ? 0 : r.rows,
    columns: isNaN(r.columns) ? 0 : r.columns,
    capacity: isNaN(r.capacity) ? 0 : r.capacity,
  })).filter(r => r.roomNumber && r.rows > 0 && r.columns > 0 && r.capacity > 0);
};

exports.normalizeFaculty = (faculty) => {
  return faculty.map(f => ({
    ...f,
    facultyId: f.facultyId ? f.facultyId.toUpperCase() : '',
    department: f.department ? f.department.toUpperCase() : '',
  })).filter(f => f.facultyId && f.name);
};
