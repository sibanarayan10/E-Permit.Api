// Quick SMS Test - Send a test SMS to verify Twilio is working
require('dotenv').config();

// Your verified number from Twilio (ends in 045)
const testPhone = '+917903666845';

async function sendTestSms() {
    console.log('\n=== Sending Test SMS ===\n');

    console.log('Twilio Config:');
    console.log('  Account SID:', process.env.TWILIO_ACCOUNT_SID);
    console.log('  Auth Token:', process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'NOT SET');
    console.log('  From Number:', process.env.TWILIO_PHONE_NUMBER);
    console.log('  To Number:', testPhone);

    try {
        const twilio = require('twilio');
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

        console.log('\nSending SMS...');

        const message = await client.messages.create({
            body: 'Test SMS from E-Permit System. If you receive this, Twilio is working correctly!',
            from: process.env.TWILIO_PHONE_NUMBER,
            to: testPhone
        });

        console.log('\n✅ SMS Sent Successfully!');
        console.log('  Message SID:', message.sid);
        console.log('  Status:', message.status);
        console.log('\nCheck your phone for the SMS!');

    } catch (error) {
        console.log('\n❌ SMS Failed!');
        console.log('  Error Code:', error.code);
        console.log('  Error Message:', error.message);

        if (error.code === 21608) {
            console.log('\n  💡 The receiving number is not verified in Twilio trial.');
        } else if (error.code === 21211) {
            console.log('\n  💡 Invalid phone number format.');
        } else if (error.code === 21606 || error.code === 21212) {
            console.log('\n  💡 The FROM phone number is invalid or not owned by your account.');
        }
    }
}

sendTestSms();
