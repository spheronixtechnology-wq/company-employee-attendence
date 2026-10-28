const apiKey = 'shk_live_62a55941ff1f0571_feea5a1486a29321beea81f772a5ae87f7309d88b6827f27ed5a45bf98f59663';
const baseUrl = 'http://localhost:5000/api/integrations/v1';

async function testKey() {
  const currentWatermark = new Date().toISOString();

  const endpoints = [
    { name: 'Ping / Identity', url: `${baseUrl}/ping` },
    { name: 'Employees Feed', url: `${baseUrl}/employees?watermark=${currentWatermark}&limit=2` },
    { name: 'Daily Attendance Feed', url: `${baseUrl}/attendance?watermark=${currentWatermark}&limit=2` },
    { name: 'Attendance Events Feed', url: `${baseUrl}/attendance-events?watermark=${currentWatermark}&limit=2` },
  ];

  for (const ep of endpoints) {
    console.log(`\n======================================================================`);
    console.log(`👉 Testing: ${ep.name}`);
    console.log(`GET ${ep.url}`);
    console.log(`Authorization: Bearer ${apiKey}`);
    console.log(`----------------------------------------------------------------------`);

    const res = await fetch(ep.url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    console.log(`HTTP Status: ${res.status}`);
    console.log(`Response:\n`, JSON.stringify(data, null, 2));
  }
}

testKey().catch(console.error);
