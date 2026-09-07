const mongoose = require('mongoose');

const managerPermissionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // A manager should only have one permission record
    },
    permissions: {
      canApproveLeaves: {
        type: Boolean,
        default: true,
      },
      canEditAttendance: {
        type: Boolean,
        default: false,
      },
      canAddPerformanceNotes: {
        type: Boolean,
        default: true,
      },
      canViewTeamReports: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ManagerPermission', managerPermissionSchema);
