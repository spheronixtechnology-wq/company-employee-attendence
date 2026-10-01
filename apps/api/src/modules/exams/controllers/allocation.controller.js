const Exam = require('../models/Exam');
const ExamStudent = require('../models/ExamStudent');
const ExamRoom = require('../models/ExamRoom');
const ExamFaculty = require('../models/ExamFaculty');

const { parseStudentsExcel, parseRoomsExcel, parseFacultyExcel } = require('../services/excelImport.service');
const { normalizeStudents, normalizeRooms, normalizeFaculty } = require('../services/normalization.service');
const { validatePreFlight } = require('../services/validation.service');
const { allocateRooms } = require('../services/roomAllocation.service');
const { generateSeatingGrid } = require('../services/seatingAllocation.service');
const { allocateInvigilators } = require('../services/invigilatorAllocation.service');

exports.createExam = async (req, res) => {
  try {
    const exam = new Exam(req.body);
    await exam.save();
    res.status(201).json({ success: true, data: exam });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.getExams = async (req, res) => {
  try {
    const exams = await Exam.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: exams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    res.status(200).json({ success: true, data: exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteExam = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = await Exam.findById(id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    
    // Delete all associated records
    await ExamStudent.deleteMany({ examId: id });
    await ExamRoom.deleteMany({ examId: id });
    await ExamFaculty.deleteMany({ examId: id });
    const SeatingPlan = require('../models/SeatingPlan');
    const InvigilatorDuty = require('../models/InvigilatorDuty');
    await SeatingPlan.deleteMany({ examId: id });
    await InvigilatorDuty.deleteMany({ examId: id });
    
    // Finally delete exam
    await Exam.findByIdAndDelete(id);
    
    res.status(200).json({ success: true, message: 'Exam deleted successfully' });
  } catch (error) {
    console.error('Delete Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete exam' });
  }
};

exports.getPreview = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    
    // In a real implementation, we'd query the latest generation from SeatingPlan and InvigilatorDuty
    // For now, returning basic stats.
    res.status(200).json({ success: true, data: { status: exam.status, examName: exam.name } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Follows the 14-step pipeline
exports.uploadData = async (req, res) => {
  try {
    const { id } = req.params;
    const exam = await Exam.findById(id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    if (exam.status === 'PUBLISHED') {
      return res.status(400).json({ success: false, message: 'Cannot upload data to published exams' });
    }

    if (!req.files || !req.files['students'] || !req.files['rooms'] || !req.files['faculty']) {
      return res.status(400).json({ success: false, message: 'Missing one or more required Excel files (students, rooms, faculty)' });
    }

    // Step 1: Import
    const rawStudents = await parseStudentsExcel(req.files['students'][0].buffer);
    const rawRooms = await parseRoomsExcel(req.files['rooms'][0].buffer);
    const rawFaculty = await parseFacultyExcel(req.files['faculty'][0].buffer);

    // Step 2: Normalize
    const students = normalizeStudents(rawStudents);
    const rooms = normalizeRooms(rawRooms);
    const faculty = normalizeFaculty(rawFaculty);

    // Step 3: Pre-flight Validate
    const preFlight = validatePreFlight(exam, students, rooms, faculty);
    if (!preFlight.isValid) {
      return res.status(400).json({ success: false, message: 'Validation failed', violations: preFlight.violations });
    }

    // Validation passed, save to DB
    // Clear existing data for this exam first
    await ExamStudent.deleteMany({ examId: id });
    await ExamRoom.deleteMany({ examId: id });
    await ExamFaculty.deleteMany({ examId: id });

    // Insert normalized data
    await ExamStudent.insertMany(students.map(s => ({ ...s, examId: id })));
    await ExamRoom.insertMany(rooms.map(r => ({ ...r, examId: id })));
    await ExamFaculty.insertMany(faculty.map(f => ({ ...f, examId: id })));

    // Update Exam status and metadata
    exam.status = 'VALIDATED';
    exam.uploads = {
      students: { fileName: req.files['students'][0].originalname, fileSize: req.files['students'][0].size },
      rooms: { fileName: req.files['rooms'][0].originalname, fileSize: req.files['rooms'][0].size },
      faculty: { fileName: req.files['faculty'][0].originalname, fileSize: req.files['faculty'][0].size }
    };
    await exam.save();

    return res.status(200).json({ success: true, message: 'Files uploaded and validated successfully', data: { students: students.length, rooms: rooms.length, faculty: faculty.length } });
  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

exports.generatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { invigilatorsPerRoom = 1 } = req.body;
    
    const exam = await Exam.findById(id);

    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    if (exam.status !== 'VALIDATED' && exam.status !== 'GENERATED') {
      return res.status(400).json({ success: false, message: 'Exam must be in VALIDATED or GENERATED status' });
    }

    // Save the config to exam rules
    exam.rules.invigilatorsPerRoom = invigilatorsPerRoom;
    await exam.save();

    const students = await ExamStudent.find({ examId: id });
    const rooms = await ExamRoom.find({ examId: id });
    const faculty = await ExamFaculty.find({ examId: id });

    // Step 4 & 5: Room Allocation & Validation
    const roomResult = allocateRooms(students, rooms, exam.rules);
    if (!roomResult.isValid) {
      return res.status(400).json({ success: false, message: 'Room allocation failed', violations: roomResult.violations });
    }

    // Step 6 & 7: Seating Solver & Validation
    const seatingPlans = [];
    const seatingViolations = [];
    
    // Determine the next generation ID
    const latestPlan = await require('../models/SeatingPlan').findOne({ examId: id }).sort({ generationId: -1 });
    const generationId = latestPlan ? latestPlan.generationId + 1 : 1;

    for (const room of rooms) {
      const allocatedStudents = roomResult.allocations[room.roomNumber] || [];
      const seatingResult = generateSeatingGrid(room, allocatedStudents);
      
      if (!seatingResult.isValid) {
        seatingViolations.push(...seatingResult.violations);
      } else {
        // Flatten grid into SeatingPlan objects
        const grid = seatingResult.grid;
        for (let r = 0; r < grid.length; r++) {
          for (let c = 0; c < grid[r].length; c++) {
            const seat = grid[r][c];
            if (seat) {
              seatingPlans.push({
                examId: id,
                generationId,
                examRoomId: room._id,
                roomNumber: room.roomNumber,
                examStudentId: seat.isEmptySeat ? null : seat._id,
                rollNumber: seat.isEmptySeat ? null : seat.rollNumber,
                branch: seat.isEmptySeat ? null : seat.branch,
                row: seat.row,
                column: seat.column,
                seatIdentifier: seat.seatIdentifier,
                isEmptySeat: seat.isEmptySeat || false
              });
            }
          }
        }
      }
    }

    if (seatingViolations.length > 0) {
      return res.status(400).json({ success: false, message: 'Seating allocation failed', violations: seatingViolations });
    }

    // Step 8 & 9: Faculty Allocation & Validation
    const invigilatorResult = allocateInvigilators(rooms, faculty, exam.session, exam.rules);
    if (!invigilatorResult.isValid) {
      return res.status(400).json({ success: false, message: 'Invigilator allocation failed', violations: invigilatorResult.violations });
    }

    const invigilatorDuties = [];
    for (const room of rooms) {
      const assignedFaculty = invigilatorResult.assignments[room.roomNumber] || [];
      for (const f of assignedFaculty) {
        invigilatorDuties.push({
          examId: id,
          generationId,
          examFacultyId: f._id,
          facultyId: f.facultyId,
          examRoomId: room._id,
          roomNumber: room.roomNumber,
          status: 'DRAFT'
        });
      }
    }

    // Step 10 & 11: Create generation/version in DB
    const SeatingPlan = require('../models/SeatingPlan');
    const InvigilatorDuty = require('../models/InvigilatorDuty');
    
    await SeatingPlan.insertMany(seatingPlans);
    await InvigilatorDuty.insertMany(invigilatorDuties);

    exam.status = 'GENERATED';
    await exam.save();
    
    return res.status(200).json({ 
      success: true, 
      message: 'Plan generated successfully',
      data: { generationId, seats: seatingPlans.length, duties: invigilatorDuties.length }
    });
  } catch (error) {
    console.error('Generation Error:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

exports.getPreview = async (req, res) => {
  try {
    const { id } = req.params;
    const SeatingPlan = require('../models/SeatingPlan');
    const InvigilatorDuty = require('../models/InvigilatorDuty');
    const ExamRoom = require('../models/ExamRoom');
    
    // Group seats by room
    const seats = await SeatingPlan.find({ examId: id }).lean();
    const duties = await InvigilatorDuty.find({ examId: id }).populate('examFacultyId').lean();
    const roomDocs = await ExamRoom.find({ examId: id }).lean();

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
          facultyId: duty.examFacultyId.facultyId,
          department: duty.examFacultyId.department
        });
      }
    }

    return res.status(200).json({ success: true, data: rooms });
  } catch (error) {
    console.error('Preview Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch preview' });
  }
};

exports.publishPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const Exam = require('../models/Exam');
    const InvigilatorDuty = require('../models/InvigilatorDuty');
    
    await InvigilatorDuty.updateMany({ examId: id }, { $set: { status: 'ACTIVE' } });
    await Exam.findByIdAndUpdate(id, { status: 'PUBLISHED' });
    
    res.status(200).json({ success: true, message: 'Plan published successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to publish' });
  }
};

const exportService = require('../services/export.service');

exports.exportPdf = async (req, res) => {
  try {
    await exportService.generatePDFReport(req.params.id, res);
  } catch (error) {
    console.error('PDF Export Error:', error);
    res.status(500).send('Failed to generate PDF');
  }
};

exports.exportWord = async (req, res) => {
  try {
    await exportService.generateWordReport(req.params.id, res);
  } catch (error) {
    console.error('Word Export Error:', error);
    res.status(500).send('Failed to generate Word Document');
  }
};

exports.exportStudentsPdf = async (req, res) => {
  try {
    await exportService.generateStudentNoticePDF(req.params.id, res);
  } catch (error) {
    console.error('Student PDF Export Error:', error);
    res.status(500).send('Failed to generate Student PDF');
  }
};

exports.exportStudentsWord = async (req, res) => {
  try {
    await exportService.generateStudentNoticeWord(req.params.id, res);
  } catch (error) {
    console.error('Student Word Export Error:', error);
    res.status(500).send('Failed to generate Student Word Document');
  }
};

exports.exportFacultyPdf = async (req, res) => {
  try {
    await exportService.generateFacultyDutyPDF(req.params.id, res);
  } catch (error) {
    console.error('Faculty PDF Export Error:', error);
    res.status(500).send('Failed to generate Faculty PDF');
  }
};

exports.exportFacultyWord = async (req, res) => {
  try {
    await exportService.generateFacultyDutyWord(req.params.id, res);
  } catch (error) {
    console.error('Faculty Word Export Error:', error);
    res.status(500).send('Failed to generate Faculty Word Document');
  }
};
