const DeviceRequest = require('../models/DeviceRequest');
const ApprovalRoutingService = require('./ApprovalRoutingService');
const { createNotification } = require('../services/notification.service');
const { emitToUser } = require('../socket');

class ApprovalWorkflowService {
  /**
   * Initializes a new request by building the snapshot chain, setting the first approver, 
   * and saving it.
   */
  static async startApprovalWorkflow(requester, requestType, requestDocument) {
    const chain = await ApprovalRoutingService.buildApprovalChain(requester, requestType);
    
    if (chain.length === 0) {
      // Escalation / Fallback: No approvers found. 
      // Mark as pending but requires admin intervention.
      requestDocument.status = 'pending';
      requestDocument.approvalChain = [];
      requestDocument.currentSequence = 0;
      await requestDocument.save();
      // Optionally notify admins
      return requestDocument;
    }

    const firstApprover = chain[0];
    
    requestDocument.approvalChain = chain;
    requestDocument.status = 'pending';
    requestDocument.currentApproverId = firstApprover.userId;
    requestDocument.currentApproverRole = firstApprover.role;
    requestDocument.currentSequence = firstApprover.sequence;
    requestDocument.submittedAt = new Date();

    await requestDocument.save();

    await this.notifyApprover(requestDocument, firstApprover, requester);
    return requestDocument;
  }

  static async notifyApprover(requestDocument, approver, requester) {
    const typeLabel = requestDocument.requestType || 'Request';
    const message = `${requester.name} has submitted a new ${typeLabel} that requires your approval.`;
    
    await createNotification({
      userId: approver.userId,
      type: 'approval_required',
      title: 'Approval Required',
      message: message,
      relatedId: requestDocument._id
    });

    emitToUser(approver.userId, 'approval:new', {
      requestId: requestDocument._id,
      requesterName: requester.name,
      message
    });
  }

  /**
   * Progresses the workflow. Atomically transitions the request to the next approver,
   * or finalizes it as APPROVED / REJECTED.
   */
  static async progressApprovalWorkflow(requestId, currentApprover, action, reason) {
    if (action === 'REJECTED' && (!reason || !reason.trim())) {
      throw new Error('Rejection reason is required');
    }

    // Atomically find the request, ensuring the current approver is actually authorized.
    const request = await DeviceRequest.findOne({
      _id: requestId,
      status: 'pending',
      currentApproverId: currentApprover._id
    });

    if (!request) {
      throw new Error('Request is no longer pending or you are not authorized to approve it.');
    }

    // Append history
    request.approvalHistory.push({
      approverId: currentApprover._id,
      role: currentApprover.role,
      action: action,
      reason: reason || null,
      timestamp: new Date()
    });

    if (action === 'REJECTED') {
      request.status = 'rejected';
      request.completedAt = new Date();
      request.decisionNote = reason; // legacy field
      await request.save();
      
      // Notify requester it was rejected
      await this.notifyRequester(request, 'rejected', reason);
      return request;
    }

    // It was approved. Find next approver in chain
    const nextApprover = ApprovalRoutingService.getNextApprover(request.approvalChain, request.currentSequence);

    if (nextApprover) {
      // Transition to next approver
      request.currentApproverId = nextApprover.userId;
      request.currentApproverRole = nextApprover.role;
      request.currentSequence = nextApprover.sequence;
      await request.save();

      // Notify the next approver
      const requester = await require('../models/User').findById(request.userId).select('name');
      await this.notifyApprover(request, nextApprover, requester);
    } else {
      // End of chain. Fully approved.
      request.status = 'approved';
      request.completedAt = new Date();
      request.currentApproverId = null;
      request.currentApproverRole = null;
      await request.save();

      // Notify requester it was fully approved
      await this.notifyRequester(request, 'approved', null);
    }

    return request;
  }

  static async notifyRequester(requestDocument, finalStatus, reason) {
    const typeLabel = requestDocument.requestType || 'Request';
    const message = finalStatus === 'approved' 
      ? `Your ${typeLabel} has been fully approved.`
      : `Your ${typeLabel} was rejected. Reason: ${reason}`;
    
    await createNotification({
      userId: requestDocument.userId,
      type: finalStatus === 'approved' ? 'request_approved' : 'request_rejected',
      title: 'Request ' + (finalStatus === 'approved' ? 'Approved' : 'Rejected'),
      message: message,
      relatedId: requestDocument._id
    });

    emitToUser(requestDocument.userId, 'approval:resolved', {
      requestId: requestDocument._id,
      status: finalStatus,
      reason,
      message
    });
  }
}

module.exports = ApprovalWorkflowService;
