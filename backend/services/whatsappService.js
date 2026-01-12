// services/whatsappService.js

const axios = require('axios');
const crypto = require('crypto');

class WhatsAppService {
  constructor() {
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    this.apiVersion = process.env.WHATSAPP_API_VERSION || 'v22.0';
    this.appSecret = process.env.WHATSAPP_APP_SECRET;

    this.baseURL = this.phoneNumberId
      ? `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`
      : null;

    this.collegePhone = process.env.COLLEGE_CONTACT_PHONE || '+91-1234567890';
    this.collegeName = process.env.COLLEGE_NAME || 'MLA ACADEMY';
  }

  formatPhoneNumber(phone) {
    if (!phone) return null;
    let cleaned = phone.replace(/\D/g, '');
    if (!cleaned.startsWith('91') && cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
    if (cleaned.length < 10 || cleaned.length > 15) {
      console.warn(`⚠️ Invalid phone number length: ${cleaned}`);
      return null;
    }
    return cleaned;
  }

  async sendTextMessage(to, message) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error('Invalid phone number');

      if (!this.phoneNumberId || !this.accessToken || !this.baseURL) {
        throw new Error('WhatsApp API credentials not configured');
      }

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      };

      console.log(`📤 Sending WhatsApp message to ${formattedPhone}...`);

      const response = await axios.post(this.baseURL, payload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      console.log(`✅ WhatsApp message sent to ${formattedPhone}`);

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id,
        phone: formattedPhone,
      };
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      console.error('❌ WhatsApp send error:', {
        phone: to,
        error: errorMessage,
        details: error.response?.data,
      });

      return {
        success: false,
        error: errorMessage,
        phone: to,
      };
    }
  }

  async sendTemplateMessage(to, templateName, languageCode = 'en', components = []) {
    try {
      const formattedPhone = this.formatPhoneNumber(to);
      if (!formattedPhone) throw new Error('Invalid phone number');

      if (!this.phoneNumberId || !this.accessToken || !this.baseURL) {
        throw new Error('WhatsApp API credentials not configured');
      }

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components,
        },
      };

      console.log(`📤 Sending WhatsApp template "${templateName}" to ${formattedPhone}...`);

      const response = await axios.post(this.baseURL, payload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      console.log(`✅ WhatsApp template sent to ${formattedPhone}`);

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id,
        phone: formattedPhone,
      };
    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      console.error('❌ WhatsApp template send error:', {
        phone: to,
        template: templateName,
        error: errorMessage,
        details: error.response?.data,
      });

      return {
        success: false,
        error: errorMessage,
        phone: to,
      };
    }
  }

  async sendBulkMessages(recipients, message, delayMs = 1000) {
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new Error('Recipients must be a non-empty array');
    }

    console.log(`📨 Starting bulk send to ${recipients.length} recipients...`);

    const results = [];
    for (let i = 0; i < recipients.length; i++) {
      const result = await this.sendTextMessage(recipients[i], message);
      results.push(result);

      if (i < recipients.length - 1) {
        await this.delay(delayMs);
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Bulk send complete: ${successCount}/${recipients.length} successful`);

    return results;
  }

  generateAttendanceMessage(studentName, date = null) {
    const attendanceDate = date || new Date().toLocaleDateString('en-IN');
    return `🎓 ${this.collegeName}

Hi ${studentName}, ✅

Your attendance for **${attendanceDate}** has been marked successfully!

Thank you for attending today.

*This is an automated message*`;
  }

  generateAbsenceMessage(studentName, date = null) {
    const absenceDate = date || new Date().toLocaleDateString('en-IN');
    return `⚠️ ${this.collegeName}

Hi ${studentName},

You were **absent** on **${absenceDate}**.

If you have a valid reason, please contact the office.

*This is an automated message*`;
  }

  generateAttendanceSummaryMessage(studentName, attendedDays, totalDays, percentage) {
    return `📊 ${this.collegeName}

Hi ${studentName},

Your attendance summary:

📅 Days Attended: ${attendedDays}/${totalDays}
📈 Percentage: ${percentage}%

Keep up the good work!

*This is an automated message*`;
  }

  verifyWebhookSignature(signature, body) {
    try {
      if (!this.appSecret) {
        console.error('❌ WHATSAPP_APP_SECRET not configured');
        return false;
      }
      const expectedSignature =
        'sha256=' +
        crypto.createHmac('sha256', this.appSecret).update(body).digest('hex');
      return signature === expectedSignature;
    } catch (error) {
      console.error('❌ Error verifying webhook signature:', error);
      return false;
    }
  }

  checkConfiguration() {
    return {
      configured: !!(this.phoneNumberId && this.accessToken),
      phoneNumberId: !!this.phoneNumberId,
      accessToken: !!this.accessToken,
      appSecret: !!this.appSecret,
      apiVersion: this.apiVersion,
      collegeName: this.collegeName,
      collegePhone: this.collegePhone,
    };
  }

  async sendTestMessage(testPhone) {
    const message = `🎓 ${this.collegeName} - WhatsApp Integration Test

This is a test message to verify your WhatsApp integration is working correctly.

✅ If you receive this message, the integration is successful!

Configuration:
• API Version: ${this.apiVersion}
• Phone Number ID: ${this.phoneNumberId ? 'Configured' : 'Not configured'}
• Access Token: ${this.accessToken ? 'Configured' : 'Not configured'}

Sent at: ${new Date().toLocaleString('en-IN')}`;
    return this.sendTextMessage(testPhone, message);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new WhatsAppService();
