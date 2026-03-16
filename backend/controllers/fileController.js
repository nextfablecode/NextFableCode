const File = require('../models/File');
const Project = require('../models/Project');
const Team = require('../models/Team');

const getProjectAndVerifyAccess = async (projectId, userId, requireEdit = false) => {
  const project = await Project.findById(projectId);
  if (!project) throw { status: 404, message: 'Project not found' };

  const team = await Team.findById(project.team);
  if (!team) throw { status: 404, message: 'Team not found' };
  if (!team.isMember(userId)) throw { status: 403, message: 'Access denied' };
  if (requireEdit && !team.canEdit(userId)) throw { status: 403, message: 'Insufficient permissions' };

  return { project, team };
};

exports.getFileTree = async (req, res) => {
  try {
    const { projectId } = req.params;
    await getProjectAndVerifyAccess(projectId, req.user._id);

    const files = await File.find({ project: projectId })
      .populate('createdBy', 'username')
      .populate('lastModifiedBy', 'username')
      .sort({ type: -1, name: 1 }); // folders first

    // Build tree structure
    const buildTree = (files, parentId = null) => {
      return files
        .filter(f => {
          if (parentId === null) return f.parent === null;
          return f.parent && f.parent.toString() === parentId.toString();
        })
        .map(f => ({
          ...f.toObject(),
          children: f.type === 'folder' ? buildTree(files, f._id) : []
        }));
    };

    res.json({ success: true, files, tree: buildTree(files) });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to fetch files' });
  }
};

exports.getFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.fileId)
      .populate('createdBy', 'username email')
      .populate('lastModifiedBy', 'username email');

    if (!file) return res.status(404).json({ success: false, message: 'File not found' });
    await getProjectAndVerifyAccess(file.project, req.user._id);

    res.json({ success: true, file });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to fetch file' });
  }
};

exports.createFile = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { name, type, parentId, content } = req.body;

    await getProjectAndVerifyAccess(projectId, req.user._id, true);

    // Build path
    let parentPath = '';
    if (parentId) {
      const parent = await File.findById(parentId);
      if (!parent || parent.type !== 'folder') {
        return res.status(400).json({ success: false, message: 'Invalid parent folder' });
      }
      parentPath = parent.path;
    }

    const path = parentPath + '/' + name;

    // Check for duplicate
    const existing = await File.findOne({ project: projectId, path });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A file or folder with this name already exists' });
    }

    const language = type === 'file' ? File.detectLanguage(name) : 'plaintext';

    const file = await File.create({
      name,
      path,
      type,
      content: content || '',
      language,
      parent: parentId || null,
      project: projectId,
      createdBy: req.user._id,
      lastModifiedBy: req.user._id
    });

    await file.populate('createdBy', 'username email');
    res.status(201).json({ success: true, file });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to create file' });
  }
};

exports.updateFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    await getProjectAndVerifyAccess(file.project, req.user._id, true);

    const { content, name } = req.body;
    
    if (content !== undefined) {
      file.content = content;
      file.lastModifiedBy = req.user._id;
    }

    if (name && name !== file.name) {
      const newPath = file.path.replace(file.name, name);
      const existing = await File.findOne({ project: file.project, path: newPath, _id: { $ne: file._id } });
      if (existing) return res.status(400).json({ success: false, message: 'Name already in use' });
      
      if (file.type === 'folder') {
        // Update all children paths
        const children = await File.find({ project: file.project, path: new RegExp('^' + file.path) });
        for (const child of children) {
          child.path = child.path.replace(file.path, newPath);
          await child.save();
        }
      }
      
      file.name = name;
      file.path = newPath;
      if (file.type === 'file') file.language = File.detectLanguage(name);
    }

    await file.save();
    await file.populate('lastModifiedBy', 'username email');

    res.json({ success: true, file });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to update file' });
  }
};

exports.deleteFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    await getProjectAndVerifyAccess(file.project, req.user._id, true);

    if (file.type === 'folder') {
      // Delete all children recursively
      const allFiles = await File.find({ project: file.project });
      const toDelete = [file._id];
      
      const findChildren = (parentId) => {
        allFiles.forEach(f => {
          if (f.parent && f.parent.toString() === parentId.toString()) {
            toDelete.push(f._id);
            if (f.type === 'folder') findChildren(f._id);
          }
        });
      };
      findChildren(file._id);
      await File.deleteMany({ _id: { $in: toDelete } });
    } else {
      await file.deleteOne();
    }

    res.json({ success: true, message: 'Deleted successfully', deletedId: req.params.fileId });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to delete file' });
  }
};

exports.moveFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.fileId);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    await getProjectAndVerifyAccess(file.project, req.user._id, true);

    const { newParentId } = req.body;
    let newParentPath = '';

    if (newParentId) {
      const parent = await File.findById(newParentId);
      if (!parent || parent.type !== 'folder') return res.status(400).json({ success: false, message: 'Invalid destination' });
      newParentPath = parent.path;
    }

    const oldPath = file.path;
    const newPath = newParentPath + '/' + file.name;

    if (file.type === 'folder') {
      const children = await File.find({ project: file.project, path: new RegExp('^' + oldPath + '/') });
      for (const child of children) {
        child.path = child.path.replace(oldPath, newPath);
        await child.save();
      }
    }

    file.path = newPath;
    file.parent = newParentId || null;
    await file.save();

    res.json({ success: true, file });
  } catch (err) {
    res.status(err.status || 500).json({ success: false, message: err.message || 'Failed to move file' });
  }
};
