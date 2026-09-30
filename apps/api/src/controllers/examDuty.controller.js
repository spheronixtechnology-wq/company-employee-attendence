const ExamDuty = require('../models/ExamDuty');
const ExamDutyAssignment = require('../models/ExamDutyAssignment');
const User = require('../models/User');
const { getIO, emitToUser } = require('../socket');
const OfficeLocation = require('../models/OfficeLocation');
const { isWithinGeofence } = require('../utils/haversine');
const { findConflicts } = require('../services/ExamDutyConflictService');
const { createDutyWithAssignments, notifyAssignedStaff } = require('../services/ExamDutyService');



exports.checkConflicts = async (req, res) => {
  try {
    const { userIds, startTime, endTime } = req.body;
    if (!userIds || !Array.isArray(userIds) || !startTime || !endTime) {
      return res.status(400).json({ success: false, message: 'userIds array, startTime, and endTime are required' });
    }

    const conflicts = await findConflicts(userIds, startTime, endTime);

    res.status(200).json({
      success: true,
      data: { conflicts }
    });
  } catch (error) {
    console.error('Error checking exam duty conflicts:', error);
    res.status(500).json({ success: false, message: 'Failed to check conflicts', error: error.message });
  }
};

exports.createExamDuty = async (req, res) => {
  try {
    const {
      examName, examType, subject, course, semester, date, session,
      reportingTime, startTime, endTime, location, instructions,
      assignments // Array of { userId, role, dutyType }
    } = req.body;

    if (!assignments || !assignments.length) {
      return res.status(400).json({ success: false, message: 'Must assign at least one person' });
    }

    const userIds = assignments.map(a => a.userId);

    // Server-side conflict re-validation via shared service
    const conflicts = await findConflicts(userIds, startTime, endTime);
    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Conflict detected during creation. Please resolve conflicts before proceeding.',
        data: { conflicts }
      });
    }

    const dutyData = { examName, examType, subject, course, semester, date, session, reportingTime, startTime, endTime, location, instructions };

    // Create via shared ExamDutyService
    const { duty, assignments: createdAssignments } = await createDutyWithAssignments(dutyData, assignments, req.user._id);

    // Notifications outside of any transaction
    notifyAssignedStaff(duty, createdAssignments);

    res.status(201).json({
      success: true,
      data: { examDuty: duty, assignments: createdAssignments }
    });
  } catch (error) {
    console.error('Error creating exam duty:', error);
    res.status(500).json({ success: false, message: 'Failed to create exam duty', error: error.message });
  }
};

exports.getAvailablePersonnel = async (req, res) => {
  try {
    const personnel = await User.find({
      role: { $in: ['faculty', 'hod'] },
      isActive: true,
      deletedAt: null
    }).select('_id name email role designation teamId').populate('teamId', 'name').lean();
    
    res.status(200).json({
      success: true,
      data: { personnel }
    });
  } catch (error) {
    console.error('Error fetching personnel:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch personnel', error: error.message });
  }
};

// --- Faculty & HOD Routes (Phase 3) ---

exports.getMyDuties = async (req, res) => {
  try {
    const assignments = await ExamDutyAssignment.find({ userId: req.user._id })
      .populate('examDutyId')
      .sort({ assignedAt: -1 });

    res.status(200).json({
      success: true,
      data: { assignments }
    });
  } catch (error) {
    console.error('Error fetching my exam duties:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch your exam duties', error: error.message });
  }
};

exports.respondToAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body; // action: 'ACCEPTED' or 'REJECTED'

    if (!['ACCEPTED', 'REJECTED'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action. Must be ACCEPTED or REJECTED.' });
    }

    if (action === 'REJECTED' && !reason) {
      return res.status(400).json({ success: false, message: 'Reason is required for rejection.' });
    }

    const assignment = await ExamDutyAssignment.findById(id).populate('examDutyId');
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    // Critical authorization check: A user can only respond to their own assignment
    if (assignment.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to respond to this assignment.' });
    }

    if (assignment.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: `Assignment is already ${assignment.status}.` });
    }

    // Update assignment
    assignment.status = action;
    assignment.respondedAt = new Date();
    assignment.responseHistory.push({
      action,
      reason,
      timestamp: new Date()
    });

    await assignment.save();

    // Notify the Principal (duty creator) via socket
    const io = getIO();
    const duty = assignment.examDutyId;
    if (duty && duty.createdBy) {
      io.to(`user_${duty.createdBy}`).emit('exam_duty:assignment_update', {
        assignmentId: assignment._id,
        dutyName: duty.examName,
        userId: req.user._id,
        userName: req.user.name,
        action
      });
    }

    res.status(200).json({
      success: true,
      data: { assignment }
    });
  } catch (error) {
    console.error('Error responding to exam duty:', error);
    res.status(500).json({ success: false, message: 'Failed to respond to assignment', error: error.message });
  }
};

// --- Principal Routes (Phase 4) ---

exports.getAllExamDuties = async (req, res) => {
  try {
    const examDuties = await ExamDuty.find({ createdBy: req.user._id })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: { examDuties }
    });
  } catch (error) {
    console.error('Error fetching exam duties:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch exam duties', error: error.message });
  }
};

exports.getExamDutyDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const examDuty = await ExamDuty.findById(id);
    if (!examDuty) {
      return res.status(404).json({ success: false, message: 'Exam duty not found.' });
    }

    const assignments = await ExamDutyAssignment.find({ examDutyId: id })
      .populate('userId', 'name email role designation teamId')
      .populate({ path: 'userId', populate: { path: 'teamId', select: 'name' } });

    res.status(200).json({
      success: true,
      data: { examDuty, assignments }
    });
  } catch (error) {
    console.error('Error fetching exam duty details:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch exam duty details', error: error.message });
  }
};

exports.reassignDuty = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { newUserId } = req.body;

    const oldAssignment = await ExamDutyAssignment.findById(assignmentId).populate('examDutyId');
    if (!oldAssignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    if (oldAssignment.status !== 'REJECTED') {
      return res.status(400).json({ success: false, message: 'Only rejected assignments can be reassigned.' });
    }

    const duty = oldAssignment.examDutyId;

    // Check conflicts for new user
    const conflicts = await findConflicts([newUserId], duty.startTime, duty.endTime);
    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Conflict detected for the new user.',
        data: { conflicts }
      });
    }

    // Mark old assignment as REASSIGNED
    oldAssignment.status = 'REASSIGNED';
    await oldAssignment.save();

    const newUser = await User.findById(newUserId);

    // Create new assignment
    const newAssignment = await ExamDutyAssignment.create({
      examDutyId: duty._id,
      userId: newUserId,
      role: newUser.role,
      dutyType: oldAssignment.dutyType,
      status: 'PENDING'
    });

    // Notify new user
    const io = getIo();
    io.to(`user_${newUserId}`).emit('exam_duty:new_assignment', {
      assignmentId: newAssignment._id,
      examName: duty.examName,
      date: duty.date
    });

    res.status(201).json({
      success: true,
      data: { assignment: newAssignment }
    });
  } catch (error) {
    console.error('Error reassigning exam duty:', error);
    res.status(500).json({ success: false, message: 'Failed to reassign exam duty', error: error.message });
  }
};

// --- Phase 5: Presence Engine ---
exports.reportForDuty = async (req, res) => {
  try {
    const { id } = req.params; // assignment ID
    const { lat, lng, accuracy } = req.body;

    const assignment = await ExamDutyAssignment.findById(id).populate('examDutyId');
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found.' });
    }

    if (assignment.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to report for this duty.' });
    }

    if (assignment.status !== 'ACCEPTED') {
      return res.status(400).json({ success: false, message: 'You must accept the duty before reporting.' });
    }

    if (assignment.presenceStatus !== 'PENDING') {
      return res.status(400).json({ success: false, message: `You have already ${assignment.presenceStatus} for this duty.` });
    }

    // Geofencing Validation has been disabled for exam duties per requirements


    // Validation passed. Mark as reported.
    assignment.presenceStatus = 'REPORTED';
    assignment.reportedAt = new Date();
    await assignment.save();

    res.status(200).json({
      success: true,
      data: { assignment }
    });
  } catch (error) {
    console.error('Error reporting for exam duty:', error);
    res.status(500).json({ success: false, message: 'Failed to report for duty', error: error.message });
  }
};
