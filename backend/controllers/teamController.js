const Team = require('../models/Team');
const User = require('../models/User');
const { v4: uuidv4 } = require('uuid');

exports.createTeam = async (req, res) => {
  try {
    const { name, description } = req.body;

    const team = await Team.create({
      name,
      description,
      owner: req.user._id,
      members: [{ user: req.user._id, role: 'owner' }]
    });

    await team.populate('members.user', 'username email color avatar');
    res.status(201).json({ success: true, team });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create team' });
  }
};

exports.getMyTeams = async (req, res) => {
  try {
    const teams = await Team.find({ 'members.user': req.user._id })
      .populate('members.user', 'username email color avatar')
      .populate('owner', 'username email');
    res.json({ success: true, teams });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch teams' });
  }
};

exports.getTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId)
      .populate('members.user', 'username email color avatar lastSeen')
      .populate('owner', 'username email');

    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    if (!team.isMember(req.user._id)) return res.status(403).json({ success: false, message: 'Access denied' });

    res.json({ success: true, team });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch team' });
  }
};

exports.joinTeamByInvite = async (req, res) => {
  try {
    const { inviteCode } = req.params;

    const team = await Team.findOne({ inviteCode });
    if (!team) return res.status(404).json({ success: false, message: 'Invalid invite link' });

    if (team.inviteExpiry && new Date() > team.inviteExpiry) {
      return res.status(400).json({ success: false, message: 'Invite link has expired' });
    }

    if (team.isMember(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You are already a member' });
    }

    team.members.push({ user: req.user._id, role: 'editor' });
    await team.save();
    await team.populate('members.user', 'username email color avatar');

    res.json({ success: true, message: 'Joined team successfully', team });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to join team' });
  }
};

exports.regenerateInviteCode = async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    
    const role = team.getMemberRole(req.user._id);
    if (role !== 'owner') return res.status(403).json({ success: false, message: 'Only owners can manage invite links' });

    team.inviteCode = uuidv4();
    await team.save();

    res.json({ success: true, inviteCode: team.inviteCode });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to regenerate invite code' });
  }
};

exports.updateMemberRole = async (req, res) => {
  try {
    const { teamId, userId } = req.params;
    const { role } = req.body;

    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    if (team.getMemberRole(req.user._id) !== 'owner') return res.status(403).json({ success: false, message: 'Only owners can change roles' });
    if (userId === team.owner.toString()) return res.status(400).json({ success: false, message: 'Cannot change owner role' });

    const member = team.members.find(m => m.user.toString() === userId);
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

    member.role = role;
    await team.save();
    await team.populate('members.user', 'username email color avatar');

    res.json({ success: true, team });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update member role' });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const { teamId, userId } = req.params;
    const team = await Team.findById(teamId);
    
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });

    const requestorRole = team.getMemberRole(req.user._id);
    const isSelf = req.user._id.toString() === userId;

    if (!isSelf && requestorRole !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only owners can remove members' });
    }
    if (userId === team.owner.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot remove team owner' });
    }

    team.members = team.members.filter(m => m.user.toString() !== userId);
    await team.save();

    res.json({ success: true, message: 'Member removed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to remove member' });
  }
};
