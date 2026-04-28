const bcrypt = require('bcryptjs');

const pin = "0000";
const hash = "$2a$12$Wz2r83UWxWFI73Q4akLpKeMHfTgn.zXzh/u/yOI.bS6Yjn1unOlIK";

console.log("PIN:", pin);
console.log("Hash:", hash);

bcrypt.compare(pin, hash).then(result => {
    console.log("Match:", result);
}).catch(err => {
    console.error("Error:", err);
});
