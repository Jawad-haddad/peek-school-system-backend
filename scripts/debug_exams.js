
const loginUrl = 'http://localhost:3000/api/auth/login';
const examsUrl = 'http://localhost:3000/api/school/exams';

async function debugExams() {
    try {
        const loginRes = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@peek.com', password: 'password123' })
        });

        if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
        const { token } = await loginRes.json();

        const examsRes = await fetch(examsUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!examsRes.ok) throw new Error(`Fetch failed: ${examsRes.status}`);

        const exams = await examsRes.json();

        if (Array.isArray(exams) && exams.length > 0) {
            const first = exams[0];
            console.log('Keys:', Object.keys(first));
            console.log('startDate:', first.startDate);
            console.log('Type:', typeof first.startDate);
            // Check if schedules exist
            console.log('Has Schedules:', !!first.schedules);
            if (first.schedules && first.schedules.length > 0) {
                console.log('First Schedule:', first.schedules[0]);
            }
        } else {
            console.log('No exams found.');
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

debugExams();
