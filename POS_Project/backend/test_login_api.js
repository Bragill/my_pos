const axios = require('axios');

async function testLogin() {
  try {
    console.log("Testing PIN login with '0000'...");
    const response = await axios.post('http://localhost:3001/api/auth/pin-login', {
      pin: '0000'
    });
    console.log("Login Success:", response.data);
  } catch (err) {
    console.error("Login Failed:");
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error("Error:", err.message);
    }
  }
}

testLogin();
