const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['owner', 'editor', 'viewer'], default: 'editor' },
  joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const teamSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Team name is required'],
    trim: true,
    minlength: [2, 'Team name must be at least 2 characters'],
    maxlength: [50, 'Team name cannot exceed 50 characters']
  },
  description: { type: String, trim: true, maxlength: 200 },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [memberSchema],
  inviteCode: {
    type: String,
    default: () => uuidv4(),
    unique: true
  },
  inviteExpiry: { type: Date, default: null },
  avatar: { type: String, default: null },
  color: {
    type: String,
    default: () => {
      const colors = ['#667eea','#f093fb','#4facfe','#43e97b','#fa709a','#fee140','#a18cd1','#fccb90'];
      return colors[Math.floor(Math.random() * colors.length)];
    }
  },
  createdAt: { type: Date, default: Date.now }
});

teamSchema.methods.getMemberRole = function(userId) {
  const member = this.members.find(m => m.user.toString() === userId.toString());
  return member ? member.role : null;
};

teamSchema.methods.isMember = function(userId) {
  return this.members.some(m => m.user.toString() === userId.toString());
};

teamSchema.methods.canEdit = function(userId) {
  const role = this.getMemberRole(userId);
  return role === 'owner' || role === 'editor';
};

module.exports = mongoose.model('Team', teamSchema);
