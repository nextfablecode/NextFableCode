const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const teamController = require('../controllers/teamController');
const projectController = require('../controllers/projectController');
const fileController = require('../controllers/fileController');
const { authMiddleware } = require('../middleware/auth');
const { validateRegister, validateLogin } = require('../middleware/validation');

// Auth routes
router.post('/auth/register', validateRegister, authController.register);
router.post('/auth/login', validateLogin, authController.login);
router.post('/auth/logout', authMiddleware, authController.logout);
router.get('/auth/me', authMiddleware, authController.getMe);
router.put('/auth/profile', authMiddleware, authController.updateProfile);

// Team routes
router.post('/teams', authMiddleware, teamController.createTeam);
router.get('/teams', authMiddleware, teamController.getMyTeams);
router.get('/teams/:teamId', authMiddleware, teamController.getTeam);
router.post('/teams/join/:inviteCode', authMiddleware, teamController.joinTeamByInvite);
router.post('/teams/:teamId/invite/regenerate', authMiddleware, teamController.regenerateInviteCode);
router.put('/teams/:teamId/members/:userId/role', authMiddleware, teamController.updateMemberRole);
router.delete('/teams/:teamId/members/:userId', authMiddleware, teamController.removeMember);

// Project routes
router.post('/teams/:teamId/projects', authMiddleware, projectController.createProject);
router.get('/teams/:teamId/projects', authMiddleware, projectController.getProjects);
router.get('/projects/:projectId', authMiddleware, projectController.getProject);
router.delete('/projects/:projectId', authMiddleware, projectController.deleteProject);

// File routes
router.get('/projects/:projectId/files', authMiddleware, fileController.getFileTree);
router.get('/files/:fileId', authMiddleware, fileController.getFile);
router.post('/projects/:projectId/files', authMiddleware, fileController.createFile);
router.put('/files/:fileId', authMiddleware, fileController.updateFile);
router.delete('/files/:fileId', authMiddleware, fileController.deleteFile);
router.put('/files/:fileId/move', authMiddleware, fileController.moveFile);

module.exports = router;
