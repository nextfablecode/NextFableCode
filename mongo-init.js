// MongoDB initialization script
db = db.getSiblingDB('collaborative_editor');

// Create indexes for performance
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ username: 1 }, { unique: true });
db.teams.createIndex({ inviteCode: 1 }, { unique: true });
db.teams.createIndex({ 'members.user': 1 });
db.projects.createIndex({ team: 1 });
db.files.createIndex({ project: 1 });
db.files.createIndex({ project: 1, path: 1 }, { unique: true });
db.files.createIndex({ parent: 1 });

print('MongoDB initialized with indexes for collaborative_editor');
