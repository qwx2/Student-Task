const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User.js");

require("dotenv").config();


const crypto = require("crypto");
const nodemailer = require("nodemailer");

exports.register = async (req, res) => {
    const { firstName, lastName, email, password } = req.body;

    try {
        let user = await User.findOne({ email });
        if (user) return res.status(401).json({ msg: 'User already exists' });

        const hash = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, hash);

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString("hex");

        user = new User({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            verificationToken
        });

        await user.save();
        // Send verification email
        const transporter = nodemailer.createTransport({
            service: "Gmail", // or any email service
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const verificationUrl = `${process.env.BACKEND_URL}/api/auth/verify-email?token=${verificationToken}&email=${email}`;

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Verify Your Email",
            html: `<p>Hi ${firstName},</p>
                   <p>Please verify your email by clicking the link below:</p>
                   <a href="${verificationUrl}">Verify Email</a>`
        });

        res.status(201).json({ msg: "Registration successful. Please check your email to verify your account." });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('register error');
    }
};


exports.login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: 'Invalid credentials' });
        if (!user.verified) return res.status(400).json({ msg: 'Please verify your email first' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
            if (err) throw err;
            res.json({ token, user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email } });
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('login error');
    }
};

exports.me = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ msg: 'User not found' });
        res.json({ user: { id: user.id, firstName: user.firstName, lastName: user.lastName, email: user.email } });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('me error');
    }
};

exports.updateProfile = async (req, res) => {
    const { firstName, lastName, email, password } = req.body;

    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        // Check if email is already taken by another user
        if (email && email !== user.email) {
            const existingUser = await User.findOne({ email });
            if (existingUser) return res.status(400).json({ msg: 'Email already in use' });
        }

        // Update user fields
        if (firstName) user.firstName = firstName;
        if (lastName) user.lastName = lastName;
        if (email) user.email = email;

        // Update password if provided
        if (password) {
            const hash = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, hash);
        }

        await user.save();

        res.json({
            msg: 'Profile updated successfully',
            user: {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Error updating profile' });
    }
};

exports.verifyEmail = async (req, res) => {
  const { token, email } = req.query;

  try {
    const user = await User.findOne({ email, verificationToken: token });
    if (!user) return res.redirect(`${process.env.FRONTEND_URL}/verify-email?status=error`);

    user.verified = true;
    user.verificationToken = undefined;
    await user.save();

    // Redirect to frontend with success query
    res.redirect(`${process.env.FRONTEND_URL}/verify-email?status=success`);
  } catch (err) {
    console.error(err.message);
    res.redirect(`${process.env.FRONTEND_URL}/verify-email?status=error`);
  }
};


exports.forgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const resetToken = crypto.randomBytes(32).toString("hex");
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        const transporter = nodemailer.createTransport({
            service: "Gmail",
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}&email=${email}`;

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Reset Your Password",
            html: `<p>Click the link below to reset your password:</p>
                   <a href="${resetUrl}">Reset Password</a>`
        });

        res.json({ msg: "Password reset link sent to your email" });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('forgot password error');
    }
};


exports.resetPassword = async (req, res) => {
    const { token, email, newPassword } = req.body;

    try {
        const user = await User.findOne({
            email,
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() } // check if token not expired
        });

        if (!user) return res.status(400).json({ msg: 'Invalid or expired token' });

        const hash = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, hash);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ msg: "Password reset successfully" });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('reset password error');
    }
};
