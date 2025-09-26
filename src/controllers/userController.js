const crypto = require('crypto');
const { UserRole } = require('@prisma/client');
const prisma = require('../prismaClient');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const registerUser = async (req, res) => {
  const { fullName, email, password, role, schoolId } = req.body;

  if (!fullName || !email || !password || !role) {
    return res.status(400).json({ message: 'Please provide all required fields.' });
  }
  
  // Validate role
  if (!Object.values(UserRole).includes(role)) {
    return res.status(400).json({ message: 'Invalid user role provided.'});
  }

  const schoolSpecificRoles = [UserRole.school_admin, UserRole.teacher, UserRole.finance, UserRole.canteen_staff, UserRole.bus_supervisor];
  if (schoolSpecificRoles.includes(role) && !schoolId) {
    return res.status(400).json({ message: 'A schoolId is required for this role.' });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
      data: {
        fullName,
        email,
        password_hash: hashedPassword,
        role,
        schoolId: schoolSpecificRoles.includes(role) ? schoolId : null,
      },
    });

    if (role === UserRole.parent) {
      await prisma.notificationPreference.create({ data: { userId: newUser.id } });
    }

    res.status(201).json({
      message: 'User registered successfully!',
      user: { id: newUser.id, fullName: newUser.fullName, email: newUser.email, role: newUser.role },
    });
  } catch (error) {
    if (error.code === 'P2002') { return res.status(409).json({ message: 'Email already exists.' }); }
    if (error.code === 'P2003') { return res.status(404).json({ message: 'The specified school does not exist.' }); }
    console.error(error);
    res.status(500).json({ message: 'Something went wrong on the server.' });
  }
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });

    // داخل دالة loginUser
//...
if (!user || !(await bcrypt.compare(password, user.password_hash))) {
  return res.status(401).json({ message: 'Invalid email or password.' });
}

if (!user.isActive) {
  return res.status(403).json({ message: 'Your account is disabled.' });
}

// --- الجاسوس الأول ---
console.log(`\n🕵️  LOGIN SPY: Generating token for user with ID: ${user.id}\n`);
// --------------------

const token = jwt.sign(
  { userId: user.id, email: user.email, role: user.role, schoolId: user.schoolId },
  process.env.JWT_SECRET,
  { expiresIn: '24h' }
);

    
    res.status(200).json({
      message: 'Logged in successfully!',
      token,
      user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role, schoolId: user.schoolId },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong on the server.' });
  }
};

const getUserProfile = (req, res) => {
  res.status(200).json(req.user);
};
// --- START: NEW PASSWORD RESET FUNCTIONS ---

const forgotPassword = async (req, res) => {
  // Find user by email
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  // Always send a success response to prevent user enumeration attacks
  if (!user) {
      return res.status(200).json({ message: "If a user with that email exists, a password reset link has been sent." });
  }

  // Generate a random, secure reset token
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Hash the token before saving it to the database for security
  const passwordResetToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

  // Set an expiry date for the token (e.g., 10 minutes)
  const passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);

  try {
      await prisma.user.update({
          where: { email },
          data: { passwordResetToken, passwordResetExpires },
      });

      // In a real application, you would send an email here.
      // For now, we will log the token to the console for testing.
      console.log('\n--- PASSWORD RESET ---');
      console.log(`Reset token for ${email}: ${resetToken}`);
      console.log('--------------------\n');

      res.status(200).json({ message: "If a user with that email exists, a password reset link has been sent." });
  } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "An error occurred." });
  }
};

const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
      return res.status(400).json({ message: "Token and new password are required." });
  }

  // Hash the token from the user to match the one in the database
  const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

  // Find the user by the hashed token and check if it has not expired
  const user = await prisma.user.findFirst({
      where: {
          passwordResetToken: hashedToken,
          passwordResetExpires: { gt: new Date() },
      }
  });

  if (!user) {
      return res.status(400).json({ message: "Token is invalid or has expired." });
  }

  // Hash the new password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // Update the user's password and clear the reset token fields
  await prisma.user.update({
      where: { id: user.id },
      data: {
          password_hash: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null,
      },
  });

  res.status(200).json({ message: "Password has been reset successfully." });
};

// --- END: NEW PASSWORD RESET FUNCTIONS ---

// src/controllers/userController.js

/**
 * Registers a new device token for push notifications for the logged-in user.
 * Uses upsert to handle new tokens or update existing ones.
 */
const registerDevice = async (req, res) => {
  const { token } = req.body;
  const userId = req.user.id; // Get user ID from the authenticated token

  if (!token) {
      return res.status(400).json({ message: "Device token is required." });
  }

  try {
      // Use 'upsert':
      // - If a device with this token already exists, it updates the userId.
      // - If it doesn't exist, it creates a new record.
      // This handles cases where a user logs into a device someone else used before.
      await prisma.deviceToken.upsert({
          where: { token: token },
          update: { userId: userId },
          create: { token: token, userId: userId },
      });

      res.status(200).json({ message: "Device registered successfully." });

  } catch (error) {
      console.error("Error registering device:", error);
      res.status(500).json({ message: "Failed to register device." });
  }
};
module.exports = { 
  registerUser, 
  loginUser, 
  getUserProfile, 
  forgotPassword, 
  resetPassword,
  registerDevice // <-- Add the new function here
};