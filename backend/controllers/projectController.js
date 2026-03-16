const Project = require('../models/Project');
const File = require('../models/File');
const Team = require('../models/Team');

exports.createProject = async (req, res) => {
  try {
    const { name, description, language } = req.body;
    const { teamId } = req.params;

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    if (!team.canEdit(req.user._id)) return res.status(403).json({ success: false, message: 'Insufficient permissions' });

    const project = await Project.create({
      name, description, language, team: teamId, createdBy: req.user._id
    });

    // Create initial README
    await File.create({
      name: 'README.md',
      path: '/README.md',
      type: 'file',
      content: `# ${name}\n\n${description || 'A collaborative project'}\n`,
      language: 'markdown',
      project: project._id,
      createdBy: req.user._id
    });

    res.status(201).json({ success: true, project });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create project' });
  }
};

exports.getProjects = async (req, res) => {
  try {
    const { teamId } = req.params;

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
    if (!team.isMember(req.user._id)) return res.status(403).json({ success: false, message: 'Access denied' });

    const projects = await Project.find({ team: teamId, isArchived: false })
      .populate('createdBy', 'username email')
      .sort('-updatedAt');

    res.json({ success: true, projects });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch projects' });
  }
};

exports.getProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId)
      .populate('createdBy', 'username email')
      .populate('team', 'name members');

    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    const team = await Team.findById(project.team);
    if (!team.isMember(req.user._id)) return res.status(403).json({ success: false, message: 'Access denied' });

    res.json({ success: true, project });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch project' });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    const team = await Team.findById(project.team);
    if (team.getMemberRole(req.user._id) !== 'owner') {
      return res.status(403).json({ success: false, message: 'Only owners can delete projects' });
    }

    await File.deleteMany({ project: project._id });
    await project.deleteOne();

    res.json({ success: true, message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete project' });
  }
};
