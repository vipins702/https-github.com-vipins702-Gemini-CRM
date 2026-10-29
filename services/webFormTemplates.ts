import { WebFormTemplate, FormField } from '../types';

const genId = () => `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const createField = (name: string, label: string, type: FormField['type'], mapTo?: string): FormField => ({
  id: genId(),
  name,
  label,
  type,
  mapTo,
  required: true,
  placeholder: `Enter ${label.toLowerCase()}`,
});

export const PREDEFINED_TEMPLATES: Record<string, WebFormTemplate> = {
  lead_capture: {
    id: 'lead_capture',
    title: 'Lead Capture Form',
    description: 'Simple form to capture new leads',
    fields: [
      createField('firstName', 'First Name', 'text', 'firstName'),
      createField('lastName', 'Last Name', 'text', 'lastName'),
      createField('email', 'Email Address', 'email', 'email'),
      createField('phone', 'Phone Number', 'phone', 'phone'),
      createField('company', 'Company', 'text', 'company'),
      createField('source', 'How did you hear about us?', 'select', 'source'),
    ],
    successMessage: '✅ Thank you! We\'ll be in touch soon.',
    theme: {
      backgroundColor: '#FFFFFF',
      buttonColor: '#4F46E5',
      buttonText: 'Submit',
    },
  },

  demo_request: {
    id: 'demo_request',
    title: 'Request a Demo',
    description: 'Let us show you how our product works',
    fields: [
      createField('firstName', 'First Name', 'text', 'firstName'),
      createField('lastName', 'Last Name', 'text', 'lastName'),
      createField('email', 'Work Email', 'email', 'email'),
      createField('company', 'Company Name', 'text', 'company'),
      createField('industry', 'Industry', 'select', 'industry'),
      createField('employees', 'Company Size', 'select'),
      createField('message', 'Questions or Special Requests', 'textarea'),
    ],
    successMessage: '📅 Demo request received! Check your email for next steps.',
    theme: {
      backgroundColor: '#F8FAFC',
      buttonColor: '#4F46E5',
      buttonText: 'Schedule Demo',
    },
  },

  feedback_survey: {
    id: 'feedback_survey',
    title: 'Customer Feedback Survey',
    description: 'Help us improve by sharing your feedback',
    fields: [
      createField('name', 'Full Name', 'text'),
      createField('email', 'Email', 'email'),
      createField('satisfaction', 'How satisfied are you?', 'select'),
      createField('feedback', 'What can we improve?', 'textarea'),
      createField('contact', 'Can we follow up with you?', 'checkbox'),
    ],
    successMessage: '🙏 Thank you for your feedback!',
    theme: {
      backgroundColor: '#FFFFFF',
      buttonColor: '#10B981',
      buttonText: 'Submit Feedback',
    },
  },

  newsletter_signup: {
    id: 'newsletter_signup',
    title: 'Subscribe to Our Newsletter',
    description: 'Stay updated with the latest news and insights',
    fields: [
      createField('firstName', 'First Name', 'text', 'firstName'),
      createField('email', 'Email Address', 'email', 'email'),
      createField('interest', 'I\'m interested in', 'select'),
      createField('agree', 'I agree to receive emails', 'checkbox'),
    ],
    successMessage: '✉️ Welcome! Check your email to confirm.',
    theme: {
      backgroundColor: '#FFFFFF',
      buttonColor: '#6366F1',
      buttonText: 'Subscribe',
    },
  },

  contact_form: {
    id: 'contact_form',
    title: 'Contact Us',
    description: 'We\'d love to hear from you',
    fields: [
      createField('firstName', 'First Name', 'text', 'firstName'),
      createField('email', 'Email', 'email', 'email'),
      createField('phone', 'Phone', 'phone', 'phone'),
      createField('subject', 'Subject', 'text'),
      createField('message', 'Your Message', 'textarea'),
    ],
    successMessage: '📬 Message sent! We\'ll get back to you soon.',
    theme: {
      backgroundColor: '#FFFFFF',
      buttonColor: '#F97316',
      buttonText: 'Send Message',
    },
  },
};

export const TEMPLATE_OPTIONS = Object.entries(PREDEFINED_TEMPLATES).map(([id, t]) => ({
  id,
  label: t.title,
  description: t.description,
}));
