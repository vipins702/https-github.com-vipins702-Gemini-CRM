// Native fetch in Node 20+

const API_Base = 'http://localhost:3000/api';

async function run() {
    // 1. Login as Admin
    const loginRes = await fetch(`${API_Base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@flowcrm.com', password: 'Admin@123' })
    });

    if (!loginRes.ok) {
        console.error('Login Failed:', await loginRes.text());
        return;
    }

    const { token } = await loginRes.json();
    console.log('Logged in, token received.');

    // 2. Try to Save a Lead
    const leadData = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        status: 'New',
        score: 10
    };

    const saveRes = await fetch(`${API_Base}/data/lead`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(leadData)
    });

    if (!saveRes.ok) {
        console.error('Save Failed Status:', saveRes.status);
        console.error('Response:', await saveRes.text());
    } else {
        console.log('Save Successful:', await saveRes.json());
    }
}

run();
