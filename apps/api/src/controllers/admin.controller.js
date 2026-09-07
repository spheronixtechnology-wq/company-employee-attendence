// D:\Employee Dashboard\attendance-system\apps\api\src\controllers\admin.controller.js

const { success, badRequest } = require('../utils/response');
const User = require('../models/User');
const Team = require('../models/Team');
const OfficeLocation = require('../models/OfficeLocation');

const getStatus = (req, res) => {
  return success(res, 'Admin portal backend is active');
};

const getDashboard = async (req, res) => {
  try {
    const totalEmployees = await User.countDocuments({ role: 'employee' });
    
    // Mocking the rest for now since many models might still be missing
    return success(res, 'Dashboard data retrieved', {
      activeAttendanceMethod: 'qr_code',
      totalEmployees,
      checkedInToday: 12,
      absentToday: 2,
      onLeaveToday: 1,
      pendingLeaveRequests: 3,
      pendingManualAttendanceRequests: 0,
      pendingDeviceApprovals: 5,
      missingDailyLogs: 4
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Dashboard fetch failed', error: err.message });
  }
};

const getEmployees = async (req, res) => {
  try {
    const { search, role } = req.query;
    const query = {};
    
    // Filter by role if specified, otherwise return all employees and managers
    if (role) {
      query.role = role;
    } else {
      query.role = { $in: ['employee', 'manager'] };
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const employees = await User.find(query).populate('teamId', 'name');
    
    return success(res, 'Employees fetched successfully', { employees: employees.map(e => e.toSafeObject()) });
  } catch (error) {
    console.error('Error fetching employees:', error);
    return badRequest(res, 'Failed to fetch employees');
  }
};

const getTeams = async (req, res) => {
  try {
    const teams = await Team.find().populate('leadUserId', 'name email');
    return success(res, 'Teams fetched successfully', { teams });
  } catch (error) {
    console.error('Error fetching teams:', error);
    return badRequest(res, 'Failed to fetch teams');
  }
};

const createTeam = async (req, res) => {
  try {
    const { name, description, leadUserId } = req.body;
    if (!name) return badRequest(res, 'Team name is required.');

    const existing = await Team.findOne({ name });
    if (existing) return badRequest(res, 'A team with this name already exists.');

    const team = new Team({ name, description: description || null, leadUserId: leadUserId || null });
    await team.save();
    return success(res, 'Team created successfully', { team });
  } catch (error) {
    console.error('Error creating team:', error);
    return badRequest(res, 'Failed to create team');
  }
};

const createUser = async (req, res) => {
  try {
    const { name, email, password, role, teamId, designation, phone } = req.body;
    
    if (!name || !email || !password) {
      return badRequest(res, 'Name, email and password are required.');
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return badRequest(res, 'User with this email already exists.');
    }
    
    const user = new User({
      name,
      email,
      passwordHash: password,
      role: role || 'employee',
      teamId: teamId && teamId.trim() !== '' ? teamId : null,
      designation: designation || null,
      phone: phone || null
    });
    
    await user.save();

    // If manager is assigned to a team, keep Team.leadUserId in sync
    if (user.role === 'manager' && user.teamId) {
      await Team.findByIdAndUpdate(user.teamId, { leadUserId: user._id });
    }

    return success(res, 'User created successfully', { user: user.toSafeObject() });
  } catch (error) {
    console.error('Error creating user:', error);
    return badRequest(res, error.message || 'Failed to create user');
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, teamId, designation, phone, isActive } = req.body;

    const user = await User.findById(id).select('+passwordHash');
    if (!user) return badRequest(res, 'User not found.');

    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (role !== undefined) user.role = role;
    if (teamId !== undefined) user.teamId = teamId && teamId.trim() !== '' ? teamId : null;
    if (designation !== undefined) user.designation = designation || null;
    if (phone !== undefined) user.phone = phone || null;
    if (isActive !== undefined) user.isActive = isActive;
    if (password && password.trim() !== '') user.passwordHash = password;

    await user.save();

    // If manager is assigned to a team, keep Team.leadUserId in sync
    if (user.role === 'manager' && user.teamId) {
      await Team.findByIdAndUpdate(user.teamId, { leadUserId: user._id });
    }

    return success(res, 'User updated successfully', { user: user.toSafeObject() });
  } catch (error) {
    console.error('Error updating user:', error);
    return badRequest(res, error.message || 'Failed to update user');
  }
};

const updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, leadUserId, isActive } = req.body;

    const team = await Team.findById(id);
    if (!team) return badRequest(res, 'Team not found.');

    if (name !== undefined) team.name = name;
    if (description !== undefined) team.description = description;
    if (leadUserId !== undefined) {
      team.leadUserId = leadUserId && leadUserId.trim() !== '' ? leadUserId : null;
      if (team.leadUserId) {
        await User.findByIdAndUpdate(team.leadUserId, { teamId: team._id });
      }
    }
    if (isActive !== undefined) team.isActive = isActive;

    await team.save();
    return success(res, 'Team updated successfully', { team });
  } catch (error) {
    console.error('Error updating team:', error);
    return badRequest(res, error.message || 'Failed to update team');
  }
};

const getOfficeLocations = async (req, res) => {
  try {
    const locations = await OfficeLocation.find().sort({ createdAt: -1 });
    return success(res, 'Office locations fetched', { locations });
  } catch (error) {
    console.error('Error fetching office locations:', error);
    return badRequest(res, 'Failed to fetch office locations');
  }
};

const createOfficeLocation = async (req, res) => {
  try {
    const { officeName, latitude, longitude, radiusMeters, status } = req.body;
    
    if (!officeName || latitude == null || longitude == null || radiusMeters == null) {
      return badRequest(res, 'Name, latitude, longitude, and radius are required.');
    }

    const newLocation = new OfficeLocation({
      officeName,
      latitude,
      longitude,
      radiusMeters,
      status: status || 'active',
      createdBy: req.user._id
    });

    await newLocation.save();
    return success(res, 'Office location created', { location: newLocation });
  } catch (error) {
    console.error('Error creating office location:', error);
    return badRequest(res, error.message || 'Failed to create office location');
  }
};

const updateOfficeLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const { officeName, latitude, longitude, radiusMeters, status } = req.body;
    
    const location = await OfficeLocation.findById(id);
    if (!location) return badRequest(res, 'Office location not found');

    if (officeName !== undefined) location.officeName = officeName;
    if (latitude !== undefined) location.latitude = latitude;
    if (longitude !== undefined) location.longitude = longitude;
    if (radiusMeters !== undefined) location.radiusMeters = radiusMeters;
    if (status !== undefined) location.status = status;
    location.updatedBy = req.user._id;

    await location.save();
    return success(res, 'Office location updated', { location });
  } catch (error) {
    console.error('Error updating office location:', error);
    return badRequest(res, error.message || 'Failed to update office location');
  }
};

const deleteOfficeLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const location = await OfficeLocation.findByIdAndDelete(id);
    if (!location) return badRequest(res, 'Office location not found');
    
    return success(res, 'Office location deleted', { location });
  } catch (error) {
    console.error('Error deleting office location:', error);
    return badRequest(res, 'Failed to delete office location');
  }
};

module.exports = { 
  getStatus, 
  getDashboard, 
  getEmployees, 
  getTeams,
  createTeam,
  updateTeam,
  createUser,
  updateUser,
  getOfficeLocations,
  createOfficeLocation,
  updateOfficeLocation,
  deleteOfficeLocation
};
