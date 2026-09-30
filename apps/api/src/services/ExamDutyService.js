/**
 * ExamDutyService
 * Central creation service for ExamDuty + ExamDutyAssignment records.
 * Used by: examDuty.controller.js (manual) and examDutyImport.controller.js (Excel confirm).
 */
const ExamDuty = require('../models/ExamDuty');
const ExamDutyAssignment = require('../models/ExamDutyAssignment');
const { getIo } = require('../socket');

/**
 * Creates one ExamDuty with its ExamDutyAssignments atomically.
 *
 * @param {Object} dutyData      - Fields for ExamDuty (examName, date, location, etc.)
 * @param {Object[]} assignments - [{ userId, role, dutyType }]
 * @param {string} createdBy     - Principal user _id
 * @param {Object} [session]     - Optional Mongoose ClientSession (for transactions)
 * @returns {Promise<{ duty, assignments }>}
 */
const createDutyWithAssignments = async (dutyData, assignments, createdBy, session = null) => {
  const opts = session ? { session } : {};

  const duty = await ExamDuty.create([{
    ...dutyData,
    createdBy,
    status: 'PUBLISHED',
    publishedAt: new Date()
  }], opts);

  const dutyDoc = duty[0]; // create([]) returns array

  const assignmentDocs = assignments.map(a => ({
    examDutyId: dutyDoc._id,
    userId: a.userId,
    role: a.role,
    dutyType: a.dutyType,
    status: 'PENDING'
  }));

  const createdAssignments = await ExamDutyAssignment.insertMany(assignmentDocs, opts);

  return { duty: dutyDoc, assignments: createdAssignments };
};

/**
 * Sends real-time notifications to all assigned users after duty creation.
 * Must be called OUTSIDE any transaction.
 *
 * @param {Object} duty           - Saved ExamDuty document
 * @param {Object[]} assignments  - Saved ExamDutyAssignment documents
 */
const notifyAssignedStaff = (duty, assignments) => {
  const io = getIo();
  for (const assignment of assignments) {
    io.to(`user_${assignment.userId}`).emit('exam_duty:new_assignment', {
      assignmentId: assignment._id,
      examName: duty.examName,
      subject: duty.subject,
      date: duty.date,
      session: duty.session,
      startTime: duty.startTime,
      endTime: duty.endTime,
      location: duty.location,
      dutyType: assignment.dutyType
    });
  }
};

module.exports = { createDutyWithAssignments, notifyAssignedStaff };
