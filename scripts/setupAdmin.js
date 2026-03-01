const mongoose = require('mongoose');
const { hash } = require('bcrypt');
const User = require('../models/User');
const { ROLES } = require('../config/constants');
require('dotenv').config();

const setupAdmin = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URL_ATLAS, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@e-ptw.com' });

    if (existingAdmin) {
      console.log('ℹ️  Admin user already exists');
      console.log(`📧 Email: ${existingAdmin.email}`);
      console.log('👤 Role: ADMIN');
      process.exit(0);
    }

    // Create admin user
    const hashedPassword = await hash('admin123', 12);

    const adminUser = new User({
      name: 'System Administrator',
      email: 'admin@e-ptw.com',
      userId: 147852,
      password: hashedPassword,
      role: ROLES.ADMIN,
      workflowStage: null,
      isActive: true
    });

    await adminUser.save();

    console.log('✅ Temporary admin user created successfully!');
    console.log('=============================================');
    console.log('📧 Login Credentials:');
    console.log(`   Email: admin@e-ptw.com`);
    console.log(`   Password: admin123`);
    console.log('=============================================');
    console.log('⚠️  IMPORTANT: Change the password after first login!');
    console.log('🚀 You can now start the application');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error setting up admin:', error);
    process.exit(1);
  }
};

setupAdmin();