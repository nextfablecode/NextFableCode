const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'File name is required'],
    trim: true,
    maxlength: [255, 'File name cannot exceed 255 characters']
  },
  path: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['file', 'folder'],
    required: true
  },
  content: {
    type: String,
    default: ''
  },
  language: {
    type: String,
    default: 'plaintext'
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'File',
    default: null
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

fileSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Detect language from file extension
fileSchema.statics.detectLanguage = function(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const langMap = {
    js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    py: 'python', rb: 'ruby', java: 'java', cpp: 'cpp', c: 'c',
    cs: 'csharp', go: 'go', rs: 'rust', php: 'php', swift: 'swift',
    kt: 'kotlin', html: 'html', css: 'css', scss: 'scss', sass: 'sass',
    less: 'less', json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', sh: 'shell', bash: 'shell', sql: 'sql',
    graphql: 'graphql', vue: 'html', svelte: 'html', r: 'r',
    dart: 'dart', lua: 'lua', dockerfile: 'dockerfile'
  };
  return langMap[ext] || 'plaintext';
};

module.exports = mongoose.model('File', fileSchema);
