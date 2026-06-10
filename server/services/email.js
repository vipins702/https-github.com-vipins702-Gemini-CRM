
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER || 'ethereal_user', // Generated ethereal user
        pass: process.env.SMTP_PASS || 'ethereal_pass', // Generated ethereal password
    },
});

export async function sendEmail({ to, subject, html, text }) {
    try {
        const info = await transporter.sendMail({
            from: process.env.SMTP_FROM || '"Gemini CRM" <noreply@geminicrm.com>',
            to,
            subject,
            text, // plain text body
            html, // html body
        });
        console.log('Message sent: %s', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
}
