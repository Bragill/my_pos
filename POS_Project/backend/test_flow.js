const axios = require('axios');

async function testFullFlow() {
  try {
    console.log("1. PIN Login...");
    const loginRes = await axios.post('http://localhost:3001/api/auth/pin-login', {
      pin: '0000'
    });
    const token = loginRes.data.data.token;
    const storeId = loginRes.data.data.stores[0].id;
    console.log(`Login Success. Token: ${token.substring(0, 10)}..., StoreId: ${storeId}`);

    console.log("2. Get Current Store...");
    const storeRes = await axios.get('http://localhost:3001/api/stores/current', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-store-id': storeId
      }
    });
    console.log("Get Store Success:", storeRes.data);

    console.log("3. Fetch Products...");
    const prodRes = await axios.get('http://localhost:3001/api/products', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'x-store-id': storeId
      }
    });
    console.log("Fetch Products Success. Count:", prodRes.data.data.length);

  } catch (err) {
    console.error("Flow Failed:");
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("Error:", err.message);
    }
  }
}

testFullFlow();
