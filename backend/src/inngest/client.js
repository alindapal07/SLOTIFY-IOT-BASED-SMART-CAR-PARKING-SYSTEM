const { Inngest } = require('inngest');
const { sendResetLink } = require('../services/emailService');

// Create a client to send and receive events
const inngest = new Inngest({ 
  id: "ai-parking-v2",
  eventKey: process.env.INNGEST_EVENT_KEY || "signkey-prod-194777899ea943758e92efdf0782b5474492f1fff1420ccc8e88f9e68c9ae6e8"
});

// Define the function triggered by 'auth.send_reset' event to mail password reset links
const sendResetEmail = inngest.createFunction(
  { id: "send-reset-email" },
  { event: "auth.send_reset" },
  async ({ event, step }) => {
    const { email, token } = event.data;
    
    await step.run("send-reset-link-email", async () => {
      return await sendResetLink(email, token);
    });

    return { success: true, email };
  }
);

module.exports = { inngest, functions: [sendResetEmail] };
