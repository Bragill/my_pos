const axios = require('axios');

async function test() {
  try {
    console.log("Testing Login API...");
    const res = await axios.post('http://localhost:3001/api/auth/login', {
      username: 'admin',
      password: 'admin1234'
    });
    console.log("Login Success:", res.data.success);
  } catch (err) {
    console.error("Login Failed:", err.response?.data || err.message);
  }

  try {
    console.log("\nTesting PIN Login API...");
    const res = await axios.post('http://localhost:3001/api/auth/pin-login', {
      pin: '0000'
    });
    console.log("PIN Login Success:", res.data.success);
  } catch (err) {
    console.error("PIN Login Failed:", err.response?.data || err.message);
  }
}

test();
