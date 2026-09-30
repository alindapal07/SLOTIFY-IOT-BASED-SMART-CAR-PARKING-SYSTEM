const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'alindapal07@gmail.com',
    pass: process.env.EMAIL_PASS || 'hfvr dsgo toiw vaoc' // Falls back to existing credentials if not provided in environment
  }
});

// Sends password reset links via email
exports.sendResetLink = async (email, token) => {
  const resetUrl = `http://localhost:5173/login?mode=reset&token=${token}&email=${email}`;
  const mailOptions = {
    from: '"AIPark AI Security" <alindapal07@gmail.com>',
    to: email,
    subject: 'Reset Your Password',
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px;">
        <h2 style="color: #3b82f6;">AIPark Password Reset</h2>
        <p>You requested a password reset. Please click the button below to set a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This link will expire in 1 hour. If you did not request this, please ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #9ca3af;">&copy; 2026 AIPark AI. All rights reserved.</p>
      </div>
    `
  };

  return transporter.sendMail(mailOptions);
};

// Sends verification status update emails to providers
exports.sendProviderStatusEmail = async (email, fullName, status, reason = '', remarks = '') => {
  let subject = '';
  let statusText = '';
  let detailHtml = '';

  switch (status) {
    case 'ACTIVE':
      subject = 'AIPark AI - Provider Account Approved! 🎉';
      statusText = 'Approved & Activated';
      detailHtml = `<p style="color: #10b981; font-weight: bold;">Your provider registration has been verified and approved.</p>
                    <p>You can now log in, list your parking zones, add slots, and start earning on the AIPark platform.</p>`;
      break;
    case 'REJECTED':
      subject = 'AIPark AI - Provider Registration Update';
      statusText = 'Rejected';
      detailHtml = `<p style="color: #ef4444; font-weight: bold;">Unfortunately, your provider registration was not approved at this time.</p>
                    ${reason ? `<p><b>Reason for Rejection:</b> ${reason}</p>` : ''}
                    <p>Please review your details and contact support if you believe this was an error.</p>`;
      break;
    case 'SUSPENDED':
      subject = 'AIPark AI - Provider Account Suspended';
      statusText = 'Suspended';
      detailHtml = `<p style="color: #ef4444; font-weight: bold;">Your provider account has been temporarily suspended.</p>
                    ${reason ? `<p><b>Reason for Suspension:</b> ${reason}</p>` : ''}
                    <p>If you wish to appeal this decision, please reply to this email or contact support.</p>`;
      break;
    case 'UNDER_REVIEW':
      subject = 'AIPark AI - Verification Under Review 🔍';
      statusText = 'Under Review';
      detailHtml = `<p style="color: #f59e0b; font-weight: bold;">Your provider account verification process has started.</p>
                    <p>Our audit team is reviewing your uploaded property deeds, identification documents, and bank details. We will notify you once completed.</p>`;
      break;
    default:
      return; // Do nothing
  }

  if (remarks) {
    detailHtml += `<p style="margin-top: 15px; padding: 10px; background: #f3f4f6; border-radius: 6px; font-style: italic;"><b>Reviewer Remarks:</b> "${remarks}"</p>`;
  }

  const mailOptions = {
    from: '"AIPark AI Verification" <alindapal07@gmail.com>',
    to: email,
    subject,
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px; background-color: #ffffff;">
        <h2 style="color: #3b82f6; margin-bottom: 5px;">AIPark Partner Network</h2>
        <p style="color: #6b7280; font-size: 14px; margin-top: 0;">Account Verification Center</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;" />
        <p>Hello <b>${fullName}</b>,</p>
        <p>The status of your AIPark provider account has changed to: <span style="background: #f3f4f6; padding: 3px 8px; border-radius: 4px; font-weight: bold;">${statusText}</span></p>
        <div style="margin: 20px 0; font-size: 15px; line-height: 1.6; color: #374151;">
          ${detailHtml}
        </div>
        <p style="margin-top: 25px;">Regards,<br/>The AIPark Verification Team</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">&copy; 2026 AIPark AI. All rights reserved.</p>
      </div>
    `
  };

  try {
    return await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Failed to send status email:', err.message);
  }
};

// Sends an email notification when additional documents are requested
exports.sendDocsRequestedEmail = async (email, fullName, remarks) => {
  const mailOptions = {
    from: '"AIPark AI Verification" <alindapal07@gmail.com>',
    to: email,
    subject: 'AIPark AI - Additional Documents Requested',
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px; background-color: #ffffff;">
        <h2 style="color: #f59e0b; margin-bottom: 5px;">Action Required</h2>
        <p style="color: #6b7280; font-size: 14px; margin-top: 0;">Account Verification Center</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;" />
        <p>Hello <b>${fullName}</b>,</p>
        <p>Our team has reviewed your verification documents but needs additional information to proceed.</p>
        <div style="margin: 20px 0; padding: 15px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; color: #b45309; font-size: 14px; line-height: 1.6;">
          <strong>Requested Documents / Instructions:</strong>
          <p style="margin: 8px 0 0 0; font-style: italic;">"${remarks}"</p>
        </div>
        <p>Please log into your provider dashboard and update the requested information or reply directly to this email with the copies.</p>
        <p style="margin-top: 25px;">Regards,<br/>The AIPark Verification Team</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">&copy; 2026 AIPark AI. All rights reserved.</p>
      </div>
    `
  };

  try {
    return await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Failed to send documents requested email:', err.message);
  }
};
