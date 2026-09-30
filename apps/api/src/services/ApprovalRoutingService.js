const User = require('../models/User');
const Team = require('../models/Team');

class ApprovalRoutingService {
  /**
   * Resolves the full approval chain for a specific user and request type.
   * This chain is snapshot and saved into the request document.
   * 
   * @param {Object} requester - The user object making the request
   * @param {String} requestType - (e.g. 'device_registration', 'leave', 'manual_attendance')
   * @returns {Array} Array of approvers: [{ userId, role, sequence }]
   */
  static async buildApprovalChain(requester, requestType) {
    const chain = [];
    let sequence = 1;

    try {
      // 1. Resolve HOD (if requester belongs to a team/department)
      let hodId = null;
      if (requester.teamId) {
        const team = await Team.findById(requester.teamId).lean();
        if (team && team.leadUserId && team.leadUserId.toString() !== requester._id.toString()) {
          hodId = team.leadUserId;
          chain.push({ userId: hodId, role: 'hod', sequence: sequence++ });
        }
      }

      // 2. Resolve Principal
      let principalId = null;
      let userToCheckForPrincipal = hodId ? await User.findById(hodId).lean() : requester;
      
      if (userToCheckForPrincipal && userToCheckForPrincipal.reportingManager && userToCheckForPrincipal.reportingManager.toString() !== requester._id.toString()) {
        principalId = userToCheckForPrincipal.reportingManager;
      } else {
        // Fallback: If reportingManager is not set, find any active principal
        const anyPrincipal = await User.findOne({ role: 'principal', isActive: true }).lean();
        if (anyPrincipal) principalId = anyPrincipal._id;
      }

      if (principalId && principalId.toString() !== requester._id.toString()) {
        chain.push({ userId: principalId, role: 'principal', sequence: sequence++ });
      }

      // 3. Resolve Chairman
      let chairmanId = null;
      let userToCheckForChairman = principalId ? await User.findById(principalId).lean() : userToCheckForPrincipal;
      
      if (userToCheckForChairman && userToCheckForChairman.reportingManager && userToCheckForChairman.reportingManager.toString() !== requester._id.toString()) {
        chairmanId = userToCheckForChairman.reportingManager;
      } else {
        // Fallback: If reportingManager is not set, find any active chairman
        const anyChairman = await User.findOne({ role: 'chairman', isActive: true }).lean();
        if (anyChairman) chairmanId = anyChairman._id;
      }

      if (chairmanId && chairmanId.toString() !== requester._id.toString()) {
        chain.push({ userId: chairmanId, role: 'chairman', sequence: sequence++ });
      }

      // Legacy fallback (Employee -> Manager -> Admin)
      if (chain.length === 0 && requester.role !== 'admin' && requester.role !== 'chairman') {
        if (requester.reportingManager) {
           chain.push({ userId: requester.reportingManager, role: 'manager', sequence: sequence++ });
        }
      }

      return chain;
    } catch (err) {
      console.error('[ApprovalRoutingService] Error building chain:', err);
      return [];
    }
  }

  /**
   * Identifies the next approver in the snapshot chain based on who just approved it.
   */
  static getNextApprover(approvalChain, lastApproverSequence = 0) {
    if (!approvalChain || approvalChain.length === 0) return null;
    const nextApprover = approvalChain.find(a => a.sequence === lastApproverSequence + 1);
    return nextApprover || null;
  }
}

module.exports = ApprovalRoutingService;
